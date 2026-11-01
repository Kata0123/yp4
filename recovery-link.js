
import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'
import rateLimit from 'express-rate-limit'

// Создаёт маршруты восстановления доступа по ссылке.
export default function createRecoveryLinkRouter(pool) {
    const router = Router()

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 5,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
            error: 'Слишком много попыток. Попробуйте позже.'
        }
    })

    router.use(limiter)

    // Создаёт ошибку валидации с HTTP-статусом 400.
    function invalid(message) {
        const error = new Error(message)
        error.status = 400
        throw error
    }

    // Проверяет адрес электронной почты.
    function validateEmail(value) {
        if (
            typeof value !== 'string' ||
            value.length > 254 ||
            !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:ru|com)$/i.test(value.trim())
        ) {
            invalid('Введите корректный email')
        }

        return value.trim().toLowerCase()
    }

    // Проверяет формат полного имени пользователя.
    function validateName(value) {
        if (typeof value !== 'string') {
            invalid('Введите полное ФИО')
        }

        const name = value.trim()

        if (name.length < 5 || name.length > 120) {
            invalid('Некорректная длина ФИО')
        }

        const parts = name.split(' ')

        if (parts.length < 3 || parts.some(part => !part)) {
            invalid('ФИО должно содержать минимум три слова')
        }

        const russian = /^[А-ЯЁа-яё -]+$/.test(name)
        const english = /^[A-Za-z -]+$/.test(name)

        if (!russian && !english) {
            invalid('Используйте русские или английские буквы')
        }

        const pattern = russian
            ? /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)*$/
            : /^[A-Z][a-z]+(?:-[A-Z][a-z]+)*$/

        if (!parts.every(part => pattern.test(part))) {
            invalid('Каждое слово должно начинаться с заглавной буквы')
        }

        return name
    }

    // Проверяет новый пароль по требованиям приложения.
    function validatePassword(value) {
        if (
            typeof value !== 'string' ||
            value.length < 8 ||
            value.length > 72
        ) {
            invalid('Пароль должен содержать от 8 до 72 символов')
        }

        if (!/^[A-Z][\x21-\x7E]{7,71}$/.test(value)) {
            invalid('Пароль должен начинаться с заглавной английской буквы')
        }

        if (!/\d/.test(value)) {
            invalid('Пароль должен содержать хотя бы одну цифру')
        }

        return value
    }

    // Проверяет формат токена восстановления.
    function validateToken(value) {
        if (
            typeof value !== 'string' ||
            !/^[a-f0-9]{64}$/i.test(value)
        ) {
            invalid('Ссылка восстановления недействительна')
        }

        return value
    }

    // Вычисляет хеш токена для безопасного хранения в базе данных.
    function hashToken(value) {
        return crypto
            .createHash('sha256')
            .update(value)
            .digest('hex')
    }

    // Отправляет ссылку восстановления на электронную почту пользователя.
    async function sendEmail(email, link) {
        if (!process.env.SMTP_HOST) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Для восстановления требуется настроить SMTP')
            }

            console.log(`Ссылка восстановления для ${email}: ${link}`)
            return
        }

        const port = Number(process.env.SMTP_PORT || 587)

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        })

        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: 'Восстановление пароля — ДомСервис',
            text: `Для изменения пароля откройте ссылку:\n${link}\n\nСсылка действует 30 минут.`
        })
    }

    // Формирует временную ссылку восстановления для пользователя.
    router.post('/link', async (req, res) => {
        const email = validateEmail(req.body?.email)
        const fullName = validateName(req.body?.fullName)

        const message =
            'Если ФИО и email совпадают, ссылка восстановления отправлена.'

        const result = await pool.query(
            `SELECT u.id, u.email
             FROM users u
             WHERE LOWER(u.email) = $1
               AND LOWER(BTRIM(u.full_name)) = LOWER($2)`,
            [email, fullName]
        )

        if (!result.rowCount) {
            return res.json({ message })
        }

        const user = result.rows[0]

        const token = crypto.randomBytes(32).toString('hex')
        const tokenHash = hashToken(token)

        const link = new URL(
            '/',
            process.env.APP_ORIGIN || 'http://localhost:5173'
        )

        link.searchParams.set('reset', token)

        const client = await pool.connect()

        try {
            await client.query('BEGIN')

            await client.query(
                'SELECT id FROM users WHERE id = $1 FOR UPDATE',
                [user.id]
            )

            await client.query(
                'DELETE FROM password_resets WHERE user_id = $1',
                [user.id]
            )

            await client.query(
                `INSERT INTO password_resets
                     (user_id, token_hash, expires_at)
                 VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
                [user.id, tokenHash]
            )

            await client.query('COMMIT')
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }

        await sendEmail(user.email, link.toString())

        res.json({ message })
    })

    // Проверяет токен восстановления и обновляет пароль пользователя.
    router.post('/complete', async (req, res) => {
        const token = validateToken(req.body?.token)
        const email = validateEmail(req.body?.email)
        const fullName = validateName(req.body?.fullName)
        const password = validatePassword(req.body?.password)

        if (req.body?.confirmPassword !== password) {
            invalid('Пароли не совпадают')
        }

        const client = await pool.connect()

        try {
            await client.query('BEGIN')

            const result = await client.query(
                `SELECT u.id, u.password_hash
                 FROM password_resets pr
                          JOIN users u ON u.id = pr.user_id
                 WHERE pr.token_hash = $1
                   AND pr.expires_at > NOW()
                   AND LOWER(u.email) = $2
                   AND LOWER(BTRIM(u.full_name)) = LOWER($3)
                     FOR UPDATE OF pr`,
                [hashToken(token), email, fullName]
            )

            if (!result.rowCount) {
                invalid(
                    'Ссылка недействительна, срок её действия истёк или данные не совпадают'
                )
            }

            const user = result.rows[0]

            const samePassword = await bcrypt.compare(
                password,
                user.password_hash
            )

            if (samePassword) {
                invalid('Новый пароль должен отличаться от предыдущего')
            }

            const passwordHash = await bcrypt.hash(password, 12)

            await client.query(
                `UPDATE users
                 SET password_hash = $1,
                     session_version = session_version + 1
                 WHERE id = $2`,
                [passwordHash, user.id]
            )

            await client.query(
                'DELETE FROM password_resets WHERE user_id = $1',
                [user.id]
            )

            await client.query('COMMIT')

            res.clearCookie('session', {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/'
            })

            res.json({
                message: 'Пароль успешно изменён. Войдите с новым паролем.'
            })
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }
    })

    return router
}

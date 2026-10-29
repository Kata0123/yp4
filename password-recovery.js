import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'
import rateLimit from 'express-rate-limit'

export default function createPasswordRecoveryRouter(pool) {
    const router = Router()

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
            error: 'Слишком много запросов. Попробуйте позже.'
        }
    })

    router.use(limiter)

    const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:ru|com)$/i

    function validateEmail(value) {
        if (
            typeof value !== 'string' ||
            value.length > 254 ||
            !emailPattern.test(value.trim())
        ) {
            throw Object.assign(
                new Error('Введите корректный email'),
                { status: 400 }
            )
        }

        return value.trim().toLowerCase()
    }

    function validateName(value) {
        if (
            typeof value !== 'string' ||
            value.trim().length < 5 ||
            value.trim().length > 120
        ) {
            throw Object.assign(
                new Error('Введите полное ФИО'),
                { status: 400 }
            )
        }

        return value.trim().replace(/\s+/g, ' ')
    }

    function validatePassword(value) {
        if (
            typeof value !== 'string' ||
            value.length < 8 ||
            value.length > 72 ||
            !/^[\x21-\x7E]+$/.test(value) ||
            !/[A-Za-z]/.test(value) ||
            !/[0-9]/.test(value)
        ) {
            throw Object.assign(
                new Error('Пароль: 8–72 символа, английские буквы, цифры и спецсимволы'),
                { status: 400 }
            )
        }

        return value
    }

    function codeHash(userId, code) {
        return crypto
            .createHmac('sha256', process.env.JWT_SECRET)
            .update(`${userId}:${code}`)
            .digest('hex')
    }

    async function sendCode(email, code) {
        if (!process.env.SMTP_HOST) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Почтовый сервер не настроен')
            }

            console.log(`Код восстановления для ${email}: ${code}`)
            return
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        })

        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: 'Восстановление пароля — ДомСервис',
            text: `Ваш код восстановления: ${code}\nКод действует 10 минут.`
        })
    }

    router.post('/request', async (req, res) => {
        const email = validateEmail(req.body?.email)
        const fullName = validateName(req.body?.fullName)

        const message = 'Если данные совпадают, код подтверждения отправлен на почту.'

        const result = await pool.query(
            `SELECT id, email
       FROM users
       WHERE LOWER(email) = $1
         AND LOWER(BTRIM(full_name)) = LOWER($2)`,
            [email, fullName]
        )

        const user = result.rows[0]

        if (!user) {
            return res.json({ message })
        }

        const existing = await pool.query(
            `SELECT created_at
       FROM recovery_challenges
       WHERE user_id = $1`,
            [user.id]
        )

        if (
            existing.rowCount &&
            Date.now() - new Date(existing.rows[0].created_at).getTime() < 60000
        ) {
            return res.json({ message })
        }

        const code = String(
            crypto.randomInt(0, 1000000)
        ).padStart(6, '0')

        const hash = codeHash(user.id, code)

        await pool.query(
            `INSERT INTO recovery_challenges
       (user_id, code_hash, attempts, expires_at, created_at)
       VALUES ($1, $2, 0, NOW() + INTERVAL '10 minutes', NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         code_hash = EXCLUDED.code_hash,
         attempts = 0,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`,
            [user.id, hash]
        )

        await sendCode(email, code)

        res.json({ message })
    })

    router.post('/confirm', async (req, res) => {
        const email = validateEmail(req.body?.email)
        const fullName = validateName(req.body?.fullName)
        const code = req.body?.code
        const password = validatePassword(req.body?.password)

        if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
            return res.status(400).json({
                error: 'Введите шестизначный код'
            })
        }

        const client = await pool.connect()

        try {
            await client.query('BEGIN')

            const result = await client.query(
                `SELECT
           u.id,
           u.password_hash,
           rc.code_hash,
           rc.attempts,
           rc.expires_at
         FROM users u
         JOIN recovery_challenges rc ON rc.user_id = u.id
         WHERE LOWER(u.email) = $1
           AND LOWER(BTRIM(u.full_name)) = LOWER($2)
         FOR UPDATE OF rc`,
                [email, fullName]
            )

            const record = result.rows[0]

            if (
                !record ||
                record.attempts >= 5 ||
                new Date(record.expires_at).getTime() <= Date.now()
            ) {
                await client.query('ROLLBACK')

                return res.status(400).json({
                    error: 'Неверный или просроченный код восстановления'
                })
            }

            const expectedHash = Buffer.from(record.code_hash, 'hex')
            const actualHash = Buffer.from(codeHash(record.id, code), 'hex')

            if (!crypto.timingSafeEqual(expectedHash, actualHash)) {
                await client.query(
                    `UPDATE recovery_challenges
           SET attempts = attempts + 1
           WHERE user_id = $1`,
                    [record.id]
                )

                await client.query('COMMIT')

                return res.status(400).json({
                    error: 'Неверный код подтверждения'
                })
            }

            if (await bcrypt.compare(password, record.password_hash)) {
                await client.query('ROLLBACK')

                return res.status(400).json({
                    error: 'Новый пароль должен отличаться от старого'
                })
            }

            const passwordHash = await bcrypt.hash(password, 12)

            await client.query(
                `UPDATE users
         SET password_hash = $1,
             session_version = session_version + 1
         WHERE id = $2`,
                [passwordHash, record.id]
            )

            await client.query(
                'DELETE FROM recovery_challenges WHERE user_id = $1',
                [record.id]
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
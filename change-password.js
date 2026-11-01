
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'

// Создаёт API изменения пароля пользователя.
export default function createChangePasswordRouter(pool) {
    const router = Router()

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
            error: 'Слишком много попыток. Попробуйте позже.'
        }
    })

    router.use(limiter)

    // Обрабатывает POST-запрос к /change-password.
    router.post('/change-password', async (req, res) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Для изменения пароля необходимо войти в аккаунт'
            })
        }

        const {
            fullName,
            email,
            password,
            confirmPassword
        } = req.body || {}

        if (
            typeof fullName !== 'string' ||
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            typeof confirmPassword !== 'string'
        ) {
            return res.status(400).json({
                error: 'Заполните все поля'
            })
        }

        const normalizedName = fullName.trim()
        const normalizedEmail = email.trim().toLowerCase()

        if (
            normalizedName.length < 5 ||
            normalizedName.length > 120 ||
            normalizedEmail.length > 254
        ) {
            return res.status(400).json({
                error: 'Некорректные ФИО или email'
            })
        }

        if (
            password.length < 8 ||
            password.length > 72 ||
            !/^[A-Z][\x21-\x7E]{7,71}$/.test(password) ||
            !/\d/.test(password)
        ) {
            return res.status(400).json({
                error: 'Пароль должен начинаться с заглавной английской буквы, содержать от 8 до 72 символов и хотя бы одну цифру'
            })
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                error: 'Пароли не совпадают'
            })
        }

        const client = await pool.connect()

        try {
            await client.query('BEGIN')

            const result = await client.query(
                `SELECT
                     id,
                     full_name,
                     email,
                     password_hash
                 FROM users
                 WHERE id = $1
                     FOR UPDATE`,
                [req.user.id]
            )

            const user = result.rows[0]

            if (!user) {
                await client.query('ROLLBACK')

                return res.status(404).json({
                    error: 'Пользователь не найден'
                })
            }

            if (
                user.full_name.toLowerCase() !== normalizedName.toLowerCase() ||
                user.email.toLowerCase() !== normalizedEmail
            ) {
                await client.query('ROLLBACK')

                return res.status(400).json({
                    error: 'ФИО или email не совпадают с данными вашего аккаунта'
                })
            }

            const samePassword = await bcrypt.compare(
                password,
                user.password_hash
            )

            if (samePassword) {
                await client.query('ROLLBACK')

                return res.status(400).json({
                    error: 'Новый пароль должен отличаться от предыдущего'
                })
            }

            const passwordHash = await bcrypt.hash(password, 12)

            await client.query(
                `UPDATE users
                 SET password_hash = $1,
                     session_version = session_version + 1
                 WHERE id = $2`,
                [passwordHash, user.id]
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
            try {
                await client.query('ROLLBACK')
            } catch {}

            console.error('Ошибка изменения пароля:', error)

            res.status(500).json({
                error: 'Не удалось изменить пароль'
            })
        } finally {
            client.release()
        }
    })

    return router
}

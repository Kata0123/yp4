import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'

export default function createPasswordRequestsRouter(pool) {
    const router = Router()

    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 5,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
            error: 'Слишком много запросов. Попробуйте позже.'
        }
    })

    const safe = handler => (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next)
    }

    function requireAdmin(req, res, next) {
        if (!req.user) {
            return res.status(401).json({
                error: 'Необходимо войти в аккаунт'
            })
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Доступ только для администратора'
            })
        }

        next()
    }

    function validateName(value) {
        if (typeof value !== 'string') {
            throw Object.assign(new Error('Укажите ФИО'), { status: 400 })
        }

        const name = value.trim()

        if (name.length < 5 || name.length > 120) {
            throw Object.assign(new Error('Некорректное ФИО'), { status: 400 })
        }

        const russian = /^[А-ЯЁа-яё -]+$/.test(name)
        const english = /^[A-Za-z -]+$/.test(name)

        const pattern = russian
            ? /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)*$/
            : english
                ? /^[A-Z][a-z]+(?:-[A-Z][a-z]+)*$/
                : null

        if (
            !pattern ||
            name.split(' ').length < 3 ||
            !name.split(' ').every(word => pattern.test(word))
        ) {
            throw Object.assign(new Error('Некорректное ФИО'), { status: 400 })
        }

        return name
    }

    function validateEmail(value) {
        if (
            typeof value !== 'string' ||
            value.length > 254 ||
            !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:ru|com)$/i.test(value.trim())
        ) {
            throw Object.assign(new Error('Некорректный email'), { status: 400 })
        }

        return value.trim().toLowerCase()
    }

    function validatePassword(value) {
        if (
            typeof value !== 'string' ||
            value.length < 8 ||
            value.length > 72 ||
            !/^[A-Z][\x21-\x7E]{7,71}$/.test(value) ||
            !/\d/.test(value)
        ) {
            throw Object.assign(
                new Error('Пароль должен начинаться с заглавной английской буквы, содержать 8–72 символа и цифру'),
                { status: 400 }
            )
        }

        return value
    }

    router.post('/', limiter, safe(async (req, res) => {
        const fullName = validateName(req.body?.fullName)
        const email = validateEmail(req.body?.email)
        const password = validatePassword(req.body?.password)

        if (password !== req.body?.confirmPassword) {
            return res.status(400).json({
                error: 'Пароли не совпадают'
            })
        }

        const message = 'Если данные аккаунта совпадают, запрос передан администратору.'

        const userResult = await pool.query(
            `SELECT id, password_hash
       FROM users
       WHERE LOWER(email) = $1
         AND LOWER(BTRIM(full_name)) = LOWER($2)`,
            [email, fullName]
        )

        if (!userResult.rowCount) {
            return res.json({ message })
        }

        const user = userResult.rows[0]

        if (await bcrypt.compare(password, user.password_hash)) {
            return res.status(400).json({
                error: 'Новый пароль должен отличаться от предыдущего'
            })
        }

        const passwordHash = await bcrypt.hash(password, 12)

        const result = await pool.query(
            `INSERT INTO password_change_requests
       (user_id, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id) WHERE status = 'pending'
       DO NOTHING
       RETURNING code`,
            [user.id, passwordHash]
        )

        res.json({
            message: result.rowCount
                ? message
                : 'Запрос для этого аккаунта уже ожидает рассмотрения.'
        })
    }))

    router.get('/admin', requireAdmin, safe(async (req, res) => {
        const result = await pool.query(
            `SELECT
         r.code,
         r.status,
         r.created_at,
         r.processed_at,
         u.code AS user_code,
         u.full_name,
         u.email
       FROM password_change_requests r
       JOIN users u ON u.id = r.user_id
       ORDER BY
         CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
         r.created_at DESC
       LIMIT 200`
        )

        res.json({ items: result.rows })
    }))

    router.patch('/admin/:code/:action', requireAdmin, safe(async (req, res) => {
        const { code, action } = req.params

        if (!/^[0-9a-f-]{36}$/i.test(code)) {
            return res.status(400).json({
                error: 'Некорректный код запроса'
            })
        }

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                error: 'Неизвестное действие'
            })
        }

        const client = await pool.connect()

        try {
            await client.query('BEGIN')

            const result = await client.query(
                `SELECT
           r.id,
           r.user_id,
           r.password_hash,
           r.status
         FROM password_change_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.code = $1
         FOR UPDATE OF r`,
                [code]
            )

            if (!result.rowCount) {
                await client.query('ROLLBACK')

                return res.status(404).json({
                    error: 'Запрос не найден'
                })
            }

            const request = result.rows[0]

            if (request.status !== 'pending') {
                await client.query('ROLLBACK')

                return res.status(409).json({
                    error: 'Запрос уже обработан'
                })
            }

            if (action === 'approve') {
                await client.query(
                    `UPDATE users
           SET password_hash = $1,
               session_version = session_version + 1
           WHERE id = $2`,
                    [request.password_hash, request.user_id]
                )
            }

            await client.query(
                `UPDATE password_change_requests
         SET status = $1,
             processed_at = NOW(),
             password_hash = ''
         WHERE id = $2`,
                [
                    action === 'approve' ? 'approved' : 'rejected',
                    request.id
                ]
            )

            await client.query('COMMIT')

            res.json({
                message: action === 'approve'
                    ? 'Новый пароль сохранён.'
                    : 'Запрос отклонён'
            })
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }
    }))

    return router
}
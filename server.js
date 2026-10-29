import createPasswordRequestsRouter from './password-requests.js'
import createChangePasswordRouter from './change-password.js'
import createPasswordRecoveryRouter from './password-recovery.js'
import 'dotenv/config'
import createRecoveryLinkRouter from './recovery-link.js'
import passwordPolicy from './password-policy.js'
import express from 'express'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'
import nodemailer from 'nodemailer'
import rateLimit from 'express-rate-limit'
import crypto from 'node:crypto'

const { Pool } = pg

const pool = new Pool()
const app = express()

const PORT = Number(process.env.PORT || 4000)
const JWT_SECRET = process.env.JWT_SECRET
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:5173'
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Helsinki'

const IMAGES = ['1.png', '2.png', '3.png', '4.png', '5.png']
const STATUSES = ['new', 'confirmed', 'completed', 'cancelled']

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('Укажите JWT_SECRET длиной не менее 32 символов')
}

if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
    throw new Error('Для production необходимо настроить SMTP')
}

app.use(express.json({ limit: '50kb' }))
app.use(cookieParser())

const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
}

class HttpError extends Error {
    constructor(status, message) {
        super(message)
        this.status = status
    }
}

function fail(status, message) {
    throw new HttpError(status, message)
}

function field(value, name, min = 1, max = 2000) {
    if (typeof value !== 'string') {
        fail(400, `Поле «${name}» должно быть текстом`)
    }

    const result = value.trim()

    if (result.length < min || result.length > max) {
        fail(400, `Поле «${name}»: допустимая длина ${min}–${max}`)
    }

    return result
}

function emailField(value) {
    const email = field(value, 'Email', 5, 254).toLowerCase()

    const pattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:ru|com)$/i

    if (!pattern.test(email)) {
        fail(400, 'Email должен заканчиваться на .ru или .com')
    }

    return email
}

function phoneField(value) {
    const phone = field(value, 'Телефон', 11, 11)

    if (!/^7\d{10}$/.test(phone)) {
        fail(400, 'Телефон должен содержать 11 цифр и начинаться с 7')
    }

    return phone
}

function nameField(value) {
    const name = field(value, 'ФИО', 5, 120)
    const words = name.split(' ')

    if (words.length < 3 || words.some(word => !word)) {
        fail(400, 'ФИО должно содержать минимум три слова')
    }

    const russian = /^[А-ЯЁа-яё -]+$/.test(name)
    const english = /^[A-Za-z -]+$/.test(name)

    if (!russian && !english) {
        fail(400, 'Используйте только русские или только английские буквы')
    }

    const pattern = russian
        ? /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)*$/
        : /^[A-Z][a-z]+(?:-[A-Z][a-z]+)*$/

    if (!words.every(word => pattern.test(word))) {
        fail(
            400,
            'Каждое слово и часть после дефиса должны начинаться с заглавной буквы'
        )
    }

    return name
}

function passwordField(value) {
    if (
        typeof value !== 'string' ||
        value.length < 8 ||
        value.length > 72
    ) {
        fail(400, 'Пароль должен содержать от 8 до 72 символов')
    }

    if (
        !/^[\x21-\x7E]+$/.test(value) ||
        !/[A-Za-z]/.test(value) ||
        !/\d/.test(value)
    ) {
        fail(400, 'Пароль должен содержать английские буквы и цифры')
    }

    return value
}

function uuidField(value) {
    if (
        typeof value !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ) {
        fail(400, 'Некорректный код записи')
    }

    return value
}

function optionalUuid(value) {
    if (value === null || value === undefined || value === '') {
        return null
    }

    return uuidField(value)
}

function intField(value, name, min, max) {
    const number = Number(value)

    if (
        value === '' ||
        value === null ||
        value === undefined ||
        typeof value === 'boolean' ||
        !Number.isInteger(number) ||
        number < min ||
        number > max
    ) {
        fail(400, `Некорректное значение поля «${name}»`)
    }

    return number
}

function priceField(value) {
    const raw = String(value)

    if (
        !/^\d{1,6}(\.\d{1,2})?$/.test(raw) ||
        Number(raw) <= 0
    ) {
        fail(400, 'Цена должна быть положительным числом')
    }

    return Number(raw)
}

function boolField(value) {
    if (typeof value !== 'boolean') {
        fail(400, 'Некорректное значение активности услуги')
    }

    return value
}

function imageField(value) {
    if (value === null || value === undefined || value === '') {
        return null
    }

    if (typeof value !== 'string' || !IMAGES.includes(value)) {
        fail(400, 'Выберите изображение от 1.png до 5.png')
    }

    return value
}

function today() {
    return new Date().toLocaleDateString('sv-SE', {
        timeZone: APP_TIMEZONE
    })
}

function dateField(value, allowPast = false) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        fail(400, 'Введите корректную дату')
    }

    const date = new Date(`${value}T00:00:00Z`)

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value ||
        value < '2000-01-01' ||
        value > '2100-12-31'
    ) {
        fail(400, 'Такой даты не существует')
    }

    if (!allowPast && value < today()) {
        fail(400, 'Дата не может быть раньше сегодняшней')
    }

    return value
}

function addressField(value) {
    const address = field(value, 'Адрес', 10, 250)
    const parts = address.split(',').map(part => part.trim())

    if (
        parts.length < 3 ||
        parts.length > 5 ||
        parts.some(part => !part)
    ) {
        fail(400, 'Укажите город, улицу и номер дома через запятую')
    }

    const city = parts[0]
        .replace(/^(?:г\.?|город)\s+/i, '')
        .trim()

    const street = parts[1]
        .replace(
            /^(?:ул\.?|улица|проспект|пр-т|переулок|пер\.?|бульвар|шоссе|наб\.?|набережная)\s+/i,
            ''
        )
        .trim()

    const house = parts[2]
        .replace(/^(?:д\.?|дом)\s*/i, '')
        .trim()

    if (!/^[А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z\s-]*$/.test(city)) {
        fail(400, 'Укажите корректный город')
    }

    if (!/^[А-ЯЁа-яёA-Za-z0-9][А-ЯЁа-яёA-Za-z0-9\s.-]*$/.test(street)) {
        fail(400, 'Укажите корректную улицу')
    }

    if (
        !/^\d{1,5}[А-ЯЁа-яёA-Za-z]?(?:\/\d{1,5}[А-ЯЁа-яёA-Za-z]?)?$/.test(house)
    ) {
        fail(400, 'Укажите номер дома')
    }

    if (
        parts.slice(3).some(part =>
            part.length > 80 ||
            !/^[А-ЯЁа-яёA-Za-z0-9\s./-]+$/.test(part)
        )
    ) {
        fail(400, 'Некорректные дополнительные сведения об адресе')
    }

    return address
}

function commentField(value) {
    return field(value ?? '', 'Комментарий', 0, 1000)
}

function statusField(value) {
    if (!STATUSES.includes(value)) {
        fail(400, 'Некорректный статус заказа')
    }

    return value
}

function safeUser(user) {
    return {
        code: user.code,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        default_address: user.default_address,
        role: user.role
    }
}

function setSession(res, user) {
    const token = jwt.sign(
        {
            sub: String(user.id),
            version: user.session_version
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    )

    res.cookie('session', token, cookieOptions)
}

function clearSession(res) {
    const { maxAge, ...options } = cookieOptions
    res.clearCookie('session', options)
}

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        error: 'Слишком много попыток. Попробуйте позже.'
    }
})

app.use(async (req, res, next) => {
    req.user = null

    const token = req.cookies.session

    if (!token) {
        return next()
    }

    try {
        const data = jwt.verify(token, JWT_SECRET)

        const result = await pool.query(
            `SELECT id, code, full_name, email, phone,
                    default_address, role, session_version
             FROM users
             WHERE id = $1`,
            [data.sub]
        )

        const user = result.rows[0]

        if (user && user.session_version === data.version) {
            req.user = user
        } else {
            clearSession(res)
        }
    } catch (error) {
        if (
            error.name === 'JsonWebTokenError' ||
            error.name === 'TokenExpiredError'
        ) {
            clearSession(res)
        } else {
            return next(error)
        }
    }

    next()
})

function requireAuth(req, res, next) {
    if (!req.user) {
        return next(new HttpError(401, 'Необходимо войти в аккаунт'))
    }

    next()
}

function requireAdmin(req, res, next) {
    if (!req.user) {
        return next(new HttpError(401, 'Необходимо войти в аккаунт'))
    }

    if (req.user.role !== 'admin') {
        return next(new HttpError(403, 'Недостаточно прав'))
    }

    next()
}

function serviceData(body) {
    return {
        categoryCode: optionalUuid(body.categoryCode),
        title: field(body.title, 'Название', 2, 120),
        description: field(body.description, 'Описание', 5, 2000),
        duration: intField(body.durationMinutes, 'Длительность', 1, 10080),
        price: priceField(body.price),
        active: boolField(body.active),
        imageName: imageField(body.imageName)
    }
}

function cartCodes(value) {
    const parts = String(value).split(':')

    if (parts.length !== 2) {
        fail(400, 'Некорректный код корзины')
    }

    return parts.map(uuidField)
}

app.use('/api/auth/recovery', createPasswordRecoveryRouter(pool))

app.use(passwordPolicy)
app.use('/api/auth/recovery', createRecoveryLinkRouter(pool))

app.use('/api/auth', createChangePasswordRouter(pool))

app.use('/api/password-requests', createPasswordRequestsRouter(pool))

app.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
})

app.get('/api/auth/me', (req, res) => {
    res.json({
        user: req.user ? safeUser(req.user) : null
    })
})

app.post('/api/auth/register', authLimiter, async (req, res) => {
    const fullName = nameField(req.body.fullName)
    const email = emailField(req.body.email)
    const phone = phoneField(req.body.phone)
    const password = passwordField(req.body.password)
    const hash = await bcrypt.hash(password, 12)

    const result = await pool.query(
        `INSERT INTO users
             (full_name, email, phone, password_hash)
         VALUES ($1, $2, $3, $4)
             RETURNING id, code, full_name, email, phone,
               default_address, role, session_version`,
        [fullName, email, phone, hash]
    )

    const user = result.rows[0]

    setSession(res, user)
    res.status(201).json({ user: safeUser(user) })
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = field(req.body.email, 'Email', 5, 254).toLowerCase()
    const password = field(req.body.password, 'Пароль', 1, 200)

    const result = await pool.query(
        `SELECT id, code, full_name, email, phone,
                default_address, role, session_version, password_hash
         FROM users
         WHERE LOWER(email) = $1`,
        [email]
    )

    const user = result.rows[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        fail(401, 'Неверный email или пароль')
    }

    setSession(res, user)
    res.json({ user: safeUser(user) })
})

app.post('/api/auth/logout', (req, res) => {
    clearSession(res)
    res.json({ message: 'Вы вышли из аккаунта' })
})

app.post('/api/auth/forgot', authLimiter, async (req, res) => {
    const email = emailField(req.body.email)

    const result = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = $1',
        [email]
    )

    const user = result.rows[0]

    if (user) {
        const token = crypto.randomBytes(32).toString('hex')
        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex')

        await pool.query(
            'DELETE FROM password_resets WHERE user_id = $1',
            [user.id]
        )

        await pool.query(
            `INSERT INTO password_resets
                 (user_id, token_hash, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
            [user.id, tokenHash]
        )

        const link = `${APP_ORIGIN}/?reset=${encodeURIComponent(token)}`

        if (process.env.SMTP_HOST) {
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
                text: `Для восстановления откройте ссылку:\n${link}\nСсылка действует 30 минут.`
            })
        } else {
            console.log(`Ссылка восстановления для ${email}: ${link}`)
        }
    }

    res.json({
        message: 'Если такой email зарегистрирован, инструкция по восстановлению подготовлена.'
    })
})

app.post('/api/auth/reset', authLimiter, async (req, res) => {
    const token = field(req.body.token, 'Токен', 64, 64)
    const password = passwordField(req.body.password)
    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')

    const passwordHash = await bcrypt.hash(password, 12)
    const client = await pool.connect()

    try {
        await client.query('BEGIN')

        const result = await client.query(
            `SELECT pr.user_id
             FROM password_resets pr
                      JOIN users u ON u.id = pr.user_id
             WHERE pr.token_hash = $1
               AND pr.expires_at > NOW()
                 FOR UPDATE OF pr`,
            [tokenHash]
        )

        if (!result.rowCount) {
            fail(400, 'Ссылка недействительна или срок её действия истёк')
        }

        const userId = result.rows[0].user_id

        await client.query(
            `UPDATE users
             SET password_hash = $1,
                 session_version = session_version + 1
             WHERE id = $2`,
            [passwordHash, userId]
        )

        await client.query(
            'DELETE FROM password_resets WHERE user_id = $1',
            [userId]
        )

        await client.query('COMMIT')

        clearSession(res)

        res.json({
            message: 'Пароль изменён. Теперь войдите в аккаунт.'
        })
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }
})

app.put('/api/profile', requireAuth, async (req, res) => {
    const fullName = nameField(req.body.fullName)
    const email = emailField(req.body.email)
    const phone = phoneField(req.body.phone)
    const address = field(req.body.defaultAddress ?? '', 'Адрес', 0, 250)

    const result = await pool.query(
        `UPDATE users
         SET full_name = $1,
             email = $2,
             phone = $3,
             default_address = $4
         WHERE id = $5
             RETURNING id, code, full_name, email, phone,
               default_address, role, session_version`,
        [fullName, email, phone, address, req.user.id]
    )

    res.json({ user: safeUser(result.rows[0]) })
})

app.put('/api/profile/password', requireAuth, async (req, res) => {
    const currentPassword = field(
        req.body.currentPassword,
        'Текущий пароль',
        1,
        200
    )

    const newPassword = passwordField(req.body.newPassword)

    const result = await pool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user.id]
    )

    if (!result.rowCount) {
        fail(404, 'Пользователь не найден')
    }

    const correct = await bcrypt.compare(
        currentPassword,
        result.rows[0].password_hash
    )

    if (!correct) {
        fail(400, 'Текущий пароль указан неверно')
    }

    if (currentPassword === newPassword) {
        fail(400, 'Новый пароль должен отличаться от текущего')
    }

    const hash = await bcrypt.hash(newPassword, 12)

    const updated = await pool.query(
        `UPDATE users
         SET password_hash = $1,
             session_version = session_version + 1
         WHERE id = $2
             RETURNING id, session_version`,
        [hash, req.user.id]
    )

    setSession(res, updated.rows[0])

    res.json({ message: 'Пароль успешно изменён' })
})

app.get('/api/categories', async (req, res) => {
    const result = await pool.query(
        `SELECT code, name, description
         FROM categories
         ORDER BY name`
    )

    res.json({ categories: result.rows })
})

app.get('/api/services', async (req, res) => {
    const conditions = ['s.active = TRUE']
    const values = []

    if (req.query.categoryCode === 'none') {
        conditions.push('s.category_id IS NULL')
    } else if (req.query.categoryCode) {
        values.push(uuidField(req.query.categoryCode))
        conditions.push(`c.code = $${values.length}`)
    }

    if (
        req.query.minPrice !== undefined &&
        req.query.minPrice !== ''
    ) {
        const price = Number(req.query.minPrice)

        if (
            !Number.isFinite(price) ||
            price < 0 ||
            price > 999999
        ) {
            fail(400, 'Некорректная минимальная цена')
        }

        values.push(price)
        conditions.push(`s.price >= $${values.length}`)
    }

    if (
        req.query.maxPrice !== undefined &&
        req.query.maxPrice !== ''
    ) {
        const price = Number(req.query.maxPrice)

        if (
            !Number.isFinite(price) ||
            price < 0 ||
            price > 999999
        ) {
            fail(400, 'Некорректная максимальная цена')
        }

        values.push(price)
        conditions.push(`s.price <= $${values.length}`)
    }

    if (req.query.q) {
        values.push(`%${field(req.query.q, 'Поиск', 1, 100)}%`)

        conditions.push(
            `(s.title ILIKE $${values.length} OR s.description ILIKE $${values.length})`
        )
    }

    const result = await pool.query(
        `SELECT
             s.code,
             s.title,
             s.description,
             s.duration_minutes,
             s.price,
             s.active,
             s.image_name,
             c.code AS category_code,
             COALESCE(c.name, 'Нет категории') AS category_name,
             COUNT(r.code)::int AS review_count,
             COALESCE(
                     ROUND(AVG(r.rating)::numeric, 1),
                     0
             ) AS average_rating
         FROM services s
                  LEFT JOIN categories c ON c.id = s.category_id
                  LEFT JOIN reviews r ON r.service_id = s.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY s.id, c.id
         ORDER BY s.title`,
        values
    )

    res.json({ services: result.rows })
})

app.get('/api/services/:code/reviews', async (req, res) => {
    const code = uuidField(req.params.code)

    const result = await pool.query(
        `SELECT r.code, r.rating, r.comment, r.created_at,
                u.code AS author_code,
                u.full_name AS author_name
         FROM reviews r
                  JOIN users u ON u.id = r.user_id
                  JOIN services s ON s.id = r.service_id
         WHERE s.code = $1
         ORDER BY r.created_at DESC`,
        [code]
    )

    res.json({ reviews: result.rows })
})

app.post('/api/services/:code/reviews', requireAuth, async (req, res) => {
    const code = uuidField(req.params.code)
    const rating = intField(req.body.rating, 'Оценка', 1, 5)
    const comment = field(req.body.comment, 'Отзыв', 3, 1000)

    const result = await pool.query(
        `INSERT INTO reviews
             (user_id, service_id, rating, comment)
         SELECT $1, s.id, $3, $4
         FROM services s
         WHERE s.code = $2 AND s.active = TRUE
             ON CONFLICT (user_id, service_id)
     DO UPDATE SET
            rating = EXCLUDED.rating,
                         comment = EXCLUDED.comment,
                         created_at = NOW()
                         RETURNING code`,
        [req.user.id, code, rating, comment]
    )

    if (!result.rowCount) {
        fail(404, 'Услуга не найдена')
    }

    res.status(201).json({ message: 'Отзыв сохранён' })
})

app.delete('/api/reviews/:code', requireAuth, async (req, res) => {
    const code = uuidField(req.params.code)

    const result = await pool.query(
        `DELETE FROM reviews
         WHERE code = $1 AND user_id = $2
             RETURNING code`,
        [code, req.user.id]
    )

    if (!result.rowCount) {
        fail(404, 'Отзыв не найден')
    }

    res.json({ message: 'Отзыв удалён' })
})

app.get('/api/cart', requireAuth, async (req, res) => {
    const result = await pool.query(
        `SELECT
             s.code AS service_code,
             s.title,
             s.price,
             s.active,
             s.image_name,
             ci.quantity,
             COALESCE(c.name, 'Нет категории') AS category_name,
             (s.price * ci.quantity) AS subtotal
         FROM cart_items ci
                  JOIN users u ON u.id = ci.user_id
                  JOIN services s ON s.id = ci.service_id
                  LEFT JOIN categories c ON c.id = s.category_id
         WHERE u.id = $1
         ORDER BY s.title`,
        [req.user.id]
    )

    const total = result.rows.reduce(
        (sum, item) => sum + Number(item.subtotal),
        0
    )

    res.json({
        items: result.rows,
        total: Number(total.toFixed(2))
    })
})

app.post('/api/cart', requireAuth, async (req, res) => {
    const code = uuidField(req.body.serviceCode)
    const quantity = intField(
        req.body.quantity ?? 1,
        'Количество',
        1,
        99
    )

    const result = await pool.query(
        `INSERT INTO cart_items (user_id, service_id, quantity)
         SELECT $1, s.id, $3
         FROM services s
         WHERE s.code = $2 AND s.active = TRUE
             ON CONFLICT (user_id, service_id)
     DO UPDATE SET
            quantity = LEAST(
                         cart_items.quantity + EXCLUDED.quantity,
                         99
                         )
                         RETURNING quantity`,
        [req.user.id, code, quantity]
    )

    if (!result.rowCount) {
        fail(404, 'Услуга не найдена')
    }

    res.status(201).json({
        message: 'Услуга добавлена в корзину'
    })
})

app.patch('/api/cart/:code', requireAuth, async (req, res) => {
    const code = uuidField(req.params.code)
    const quantity = intField(req.body.quantity, 'Количество', 1, 99)

    const result = await pool.query(
        `UPDATE cart_items ci
         SET quantity = $1
             FROM services s
         WHERE ci.service_id = s.id
           AND s.code = $2
           AND ci.user_id = $3
             RETURNING ci.quantity`,
        [quantity, code, req.user.id]
    )

    if (!result.rowCount) {
        fail(404, 'Позиция корзины не найдена')
    }

    res.json({ message: 'Количество изменено' })
})

app.delete('/api/cart/:code', requireAuth, async (req, res) => {
    const code = uuidField(req.params.code)

    const result = await pool.query(
        `DELETE FROM cart_items ci
            USING services s
         WHERE ci.service_id = s.id
           AND s.code = $1
           AND ci.user_id = $2
             RETURNING ci.quantity`,
        [code, req.user.id]
    )

    if (!result.rowCount) {
        fail(404, 'Позиция корзины не найдена')
    }

    res.json({ message: 'Услуга удалена из корзины' })
})

const ordersSelect = `
    SELECT
        o.code,
        u.code AS user_code,
        u.full_name AS customer_name,
        o.address,
        o.comment,
        TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
        o.status,
        o.total,
        o.created_at,
        COALESCE(
                JSON_AGG(
                        JSON_BUILD_OBJECT(
                                'title', oi.title_snapshot,
                                'price', oi.price_snapshot,
                                'quantity', oi.quantity,
                                'duration', oi.duration_snapshot
                        )
                            ORDER BY oi.id
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::json
        ) AS items
    FROM orders o
             JOIN users u ON u.id = o.user_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
`

app.get('/api/orders', requireAuth, async (req, res) => {
    const result = await pool.query(
        `${ordersSelect}
     WHERE o.user_id = $1
     GROUP BY o.id, u.id
     ORDER BY o.created_at DESC`,
        [req.user.id]
    )

    res.json({ orders: result.rows })
})

app.post('/api/orders', requireAuth, async (req, res) => {
    const address = addressField(req.body.address)
    const deliveryDate = dateField(req.body.deliveryDate)
    const comment = commentField(req.body.comment)

    const client = await pool.connect()

    try {
        await client.query('BEGIN')

        await client.query(
            'SELECT id FROM users WHERE id = $1 FOR UPDATE',
            [req.user.id]
        )

        const cart = await client.query(
            `SELECT
                 s.id,
                 s.title,
                 s.price,
                 s.duration_minutes,
                 s.active,
                 ci.quantity
             FROM cart_items ci
                      JOIN services s ON s.id = ci.service_id
             WHERE ci.user_id = $1
             ORDER BY s.id
                 FOR UPDATE OF ci, s`,
            [req.user.id]
        )

        if (!cart.rowCount) {
            fail(400, 'Корзина пуста')
        }

        if (cart.rows.some(item => !item.active)) {
            fail(409, 'В корзине есть недоступные услуги')
        }

        const total = cart.rows.reduce(
            (sum, item) =>
                sum + Number(item.price) * Number(item.quantity),
            0
        )

        const order = await client.query(
            `INSERT INTO orders
                 (user_id, address, delivery_date, comment, total)
             VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, code`,
            [
                req.user.id,
                address,
                deliveryDate,
                comment,
                total.toFixed(2)
            ]
        )

        for (const item of cart.rows) {
            await client.query(
                `INSERT INTO order_items
                 (order_id, service_id, title_snapshot,
                  duration_snapshot, price_snapshot, quantity)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    order.rows[0].id,
                    item.id,
                    item.title,
                    item.duration_minutes,
                    item.price,
                    item.quantity
                ]
            )
        }

        await client.query(
            'DELETE FROM cart_items WHERE user_id = $1',
            [req.user.id]
        )

        await client.query('COMMIT')

        res.status(201).json({
            message: 'Заказ успешно оформлен',
            code: order.rows[0].code
        })
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }
})

app.patch('/api/orders/:code/cancel', requireAuth, async (req, res) => {
    const code = uuidField(req.params.code)

    const result = await pool.query(
        `UPDATE orders o
         SET status = 'cancelled'
             FROM users u
         WHERE o.user_id = u.id
           AND u.id = $1
           AND o.code = $2
           AND o.status IN ('new', 'confirmed')
             RETURNING o.code, o.status`,
        [req.user.id, code]
    )

    if (result.rowCount) {
        return res.json({
            message: 'Заказ отменён',
            order: result.rows[0]
        })
    }

    const existing = await pool.query(
        `SELECT o.status
         FROM orders o
                  JOIN users u ON u.id = o.user_id
         WHERE u.id = $1 AND o.code = $2`,
        [req.user.id, code]
    )

    if (!existing.rowCount) {
        fail(404, 'Заказ не найден')
    }

    fail(409, 'Этот заказ уже нельзя отменить')
})

const adminQueries = {
    categories: `
        SELECT code, name, description
        FROM categories
        ORDER BY name
    `,
    services: `
        SELECT
            s.code,
            s.title,
            s.description,
            s.duration_minutes,
            s.price,
            s.active,
            s.image_name,
            c.code AS category_code,
            COALESCE(c.name, 'Нет категории') AS category_name
        FROM services s
                 LEFT JOIN categories c ON c.id = s.category_id
        ORDER BY s.title
    `,
    users: `
        SELECT
            code,
            full_name,
            email,
            phone,
            default_address,
            role,
            created_at
        FROM users
        ORDER BY created_at DESC
    `,
    reviews: `
        SELECT
            r.code,
            r.rating,
            r.comment,
            r.created_at,
            u.code AS user_code,
            u.full_name AS user_name,
            s.code AS service_code,
            s.title AS service_title
        FROM reviews r
                 JOIN users u ON u.id = r.user_id
                 JOIN services s ON s.id = r.service_id
        ORDER BY r.created_at DESC
    `,
    carts: `
        SELECT
            u.code::text || ':' || s.code::text AS code,
            u.code AS user_code,
            u.full_name AS user_name,
            s.code AS service_code,
            s.title AS service_title,
            ci.quantity
        FROM cart_items ci
                 JOIN users u ON u.id = ci.user_id
                 JOIN services s ON s.id = ci.service_id
        ORDER BY u.full_name, s.title
    `,
    orders: `
    ${ordersSelect}
    GROUP BY o.id, u.id
    ORDER BY o.created_at DESC
  `
}

function adminResource(value) {
    if (!Object.hasOwn(adminQueries, value)) {
        fail(404, 'Неизвестный раздел администрирования')
    }

    return value
}

app.get('/api/admin/:resource', requireAdmin, async (req, res) => {
    const resource = adminResource(req.params.resource)
    const result = await pool.query(adminQueries[resource])

    res.json({ items: result.rows })
})

app.post('/api/admin/:resource', requireAdmin, async (req, res) => {
    const resource = adminResource(req.params.resource)
    const body = req.body

    let result

    if (resource === 'categories') {
        const name = field(body.name, 'Категория', 2, 80)
        const description = field(
            body.description ?? '',
            'Описание',
            0,
            500
        )

        result = await pool.query(
            `INSERT INTO categories (name, description)
             VALUES ($1, $2)
                 RETURNING code`,
            [name, description]
        )
    }

    if (resource === 'services') {
        const data = serviceData(body)

        if (data.categoryCode) {
            const category = await pool.query(
                'SELECT code FROM categories WHERE code = $1',
                [data.categoryCode]
            )

            if (!category.rowCount) {
                fail(404, 'Категория не найдена')
            }
        }

        result = await pool.query(
            `INSERT INTO services
             (category_id, title, description,
              duration_minutes, price, active, image_name)
             SELECT
                 (
                     SELECT c.id
                     FROM categories c
                     WHERE c.code = $1
                 ),
                 $2, $3, $4, $5, $6, $7
                     RETURNING code`,
            [
                data.categoryCode,
                data.title,
                data.description,
                data.duration,
                data.price,
                data.active,
                data.imageName
            ]
        )
    }

    if (resource === 'users') {
        const fullName = nameField(body.fullName)
        const email = emailField(body.email)
        const phone = phoneField(body.phone)
        const address = field(
            body.defaultAddress ?? '',
            'Адрес',
            0,
            250
        )

        const hash = await bcrypt.hash(
            passwordField(body.password),
            12
        )

        result = await pool.query(
            `INSERT INTO users
                 (full_name, email, phone, default_address, password_hash)
             VALUES ($1, $2, $3, $4, $5)
                 RETURNING code`,
            [fullName, email, phone, address, hash]
        )
    }

    if (resource === 'reviews') {
        const userCode = uuidField(body.userCode)
        const serviceCode = uuidField(body.serviceCode)
        const rating = intField(body.rating, 'Оценка', 1, 5)
        const comment = field(body.comment, 'Отзыв', 3, 1000)

        result = await pool.query(
            `INSERT INTO reviews
                 (user_id, service_id, rating, comment)
             SELECT u.id, s.id, $3, $4
             FROM users u
                      CROSS JOIN services s
             WHERE u.code = $1 AND s.code = $2
                 RETURNING code`,
            [userCode, serviceCode, rating, comment]
        )
    }

    if (resource === 'carts') {
        const userCode = uuidField(body.userCode)
        const serviceCode = uuidField(body.serviceCode)
        const quantity = intField(body.quantity, 'Количество', 1, 99)

        result = await pool.query(
            `INSERT INTO cart_items
                 (user_id, service_id, quantity)
             SELECT u.id, s.id, $3
             FROM users u
                      CROSS JOIN services s
             WHERE u.code = $1 AND s.code = $2
                 ON CONFLICT (user_id, service_id)
       DO UPDATE SET quantity = EXCLUDED.quantity
                               RETURNING quantity`,
            [userCode, serviceCode, quantity]
        )
    }

    if (resource === 'orders') {
        const userCode = uuidField(body.userCode)
        const serviceCode = uuidField(body.serviceCode)
        const quantity = intField(body.quantity, 'Количество', 1, 99)
        const address = addressField(body.address)
        const deliveryDate = dateField(body.deliveryDate)
        const comment = commentField(body.comment)

        const client = await pool.connect()

        try {
            await client.query('BEGIN')

            const details = await client.query(
                `SELECT
                     u.id AS user_id,
                     s.id AS service_id,
                     s.title,
                     s.price,
                     s.duration_minutes,
                     s.active
                 FROM users u
                          CROSS JOIN services s
                 WHERE u.code = $1 AND s.code = $2
                     FOR UPDATE OF s`,
                [userCode, serviceCode]
            )

            if (!details.rowCount) {
                fail(404, 'Пользователь или услуга не найдены')
            }

            const item = details.rows[0]

            if (!item.active) {
                fail(400, 'Нельзя заказать недоступную услугу')
            }

            const total = (
                Number(item.price) * quantity
            ).toFixed(2)

            const order = await client.query(
                `INSERT INTO orders
                     (user_id, address, delivery_date, comment, total)
                 VALUES ($1, $2, $3, $4, $5)
                     RETURNING id, code`,
                [
                    item.user_id,
                    address,
                    deliveryDate,
                    comment,
                    total
                ]
            )

            await client.query(
                `INSERT INTO order_items
                 (order_id, service_id, title_snapshot,
                  duration_snapshot, price_snapshot, quantity)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    order.rows[0].id,
                    item.service_id,
                    item.title,
                    item.duration_minutes,
                    item.price,
                    quantity
                ]
            )

            await client.query('COMMIT')

            return res.status(201).json({
                message: 'Заказ создан',
                code: order.rows[0].code
            })
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }
    }

    if (!result?.rowCount) {
        fail(404, 'Связанные записи не найдены')
    }

    res.status(201).json({
        message: 'Запись создана'
    })
})

app.put('/api/admin/:resource/:code', requireAdmin, async (req, res) => {
    const resource = adminResource(req.params.resource)
    const body = req.body

    const code = resource === 'carts'
        ? req.params.code
        : uuidField(req.params.code)

    let result

    if (resource === 'categories') {
        const name = field(body.name, 'Категория', 2, 80)
        const description = field(
            body.description ?? '',
            'Описание',
            0,
            500
        )

        result = await pool.query(
            `UPDATE categories
             SET name = $1, description = $2
             WHERE code = $3
                 RETURNING code`,
            [name, description, code]
        )
    }

    if (resource === 'services') {
        const data = serviceData(body)

        if (data.categoryCode) {
            const category = await pool.query(
                'SELECT code FROM categories WHERE code = $1',
                [data.categoryCode]
            )

            if (!category.rowCount) {
                fail(404, 'Категория не найдена')
            }
        }

        result = await pool.query(
            `UPDATE services s
             SET
                 category_id = (
                     SELECT c.id
                     FROM categories c
                     WHERE c.code = $1
                 ),
                 title = $2,
                 description = $3,
                 duration_minutes = $4,
                 price = $5,
                 active = $6,
                 image_name = $7
             WHERE s.code = $8
                 RETURNING s.code`,
            [
                data.categoryCode,
                data.title,
                data.description,
                data.duration,
                data.price,
                data.active,
                data.imageName,
                code
            ]
        )
    }

    if (resource === 'users') {
        const fullName = nameField(body.fullName)
        const email = emailField(body.email)
        const phone = phoneField(body.phone)
        const address = field(
            body.defaultAddress ?? '',
            'Адрес',
            0,
            250
        )

        const hash = body.password
            ? await bcrypt.hash(passwordField(body.password), 12)
            : null

        result = await pool.query(
            `UPDATE users
             SET full_name = $1,
                 email = $2,
                 phone = $3,
                 default_address = $4,
                 password_hash = COALESCE($5, password_hash),
                 session_version = session_version +
                                   CASE WHEN $5::text IS NULL THEN 0 ELSE 1 END
             WHERE code = $6
                 RETURNING code`,
            [fullName, email, phone, address, hash, code]
        )
    }

    if (resource === 'reviews') {
        const rating = intField(body.rating, 'Оценка', 1, 5)
        const comment = field(body.comment, 'Отзыв', 3, 1000)

        result = await pool.query(
            `UPDATE reviews
             SET rating = $1,
                 comment = $2
             WHERE code = $3
                 RETURNING code`,
            [rating, comment, code]
        )
    }

    if (resource === 'carts') {
        const [userCode, serviceCode] = cartCodes(code)
        const quantity = intField(
            body.quantity,
            'Количество',
            1,
            99
        )

        result = await pool.query(
            `UPDATE cart_items ci
             SET quantity = $3
                 FROM users u, services s
             WHERE ci.user_id = u.id
               AND ci.service_id = s.id
               AND u.code = $1
               AND s.code = $2
                 RETURNING ci.quantity`,
            [userCode, serviceCode, quantity]
        )
    }

    if (resource === 'orders') {
        const previous = await pool.query(
            `SELECT
                 TO_CHAR(delivery_date, 'YYYY-MM-DD') AS delivery_date
             FROM orders
             WHERE code = $1`,
            [code]
        )

        if (!previous.rowCount) {
            fail(404, 'Заказ не найден')
        }

        const address = addressField(body.address)

        const deliveryDate = dateField(
            body.deliveryDate,
            body.deliveryDate === previous.rows[0].delivery_date
        )

        const status = statusField(body.status)
        const comment = commentField(body.comment)

        result = await pool.query(
            `UPDATE orders
             SET address = $1,
                 delivery_date = $2,
                 status = $3,
                 comment = $4
             WHERE code = $5
                 RETURNING code`,
            [address, deliveryDate, status, comment, code]
        )
    }

    if (!result?.rowCount) {
        fail(404, 'Запись не найдена')
    }

    res.json({ message: 'Изменения сохранены' })
})

app.delete('/api/admin/:resource/:code', requireAdmin, async (req, res) => {
    const resource = adminResource(req.params.resource)

    const code = resource === 'carts'
        ? req.params.code
        : uuidField(req.params.code)

    let result

    if (resource === 'carts') {
        const [userCode, serviceCode] = cartCodes(code)

        result = await pool.query(
            `DELETE FROM cart_items ci
                USING users u, services s
             WHERE ci.user_id = u.id
               AND ci.service_id = s.id
               AND u.code = $1
               AND s.code = $2
                 RETURNING ci.quantity`,
            [userCode, serviceCode]
        )
    } else {
        if (resource === 'users' && req.user.code === code) {
            fail(400, 'Нельзя удалить собственную учётную запись администратора')
        }

        const table = {
            categories: 'categories',
            services: 'services',
            users: 'users',
            reviews: 'reviews',
            orders: 'orders'
        }[resource]

        result = await pool.query(
            `DELETE FROM ${table}
             WHERE code = $1
                 RETURNING code`,
            [code]
        )
    }

    if (!result.rowCount) {
        fail(404, 'Запись не найдена')
    }

    res.json({
        message: resource === 'categories'
            ? 'Категория удалена, товары остались без категории'
            : 'Запись удалена'
    })
})

app.use((req, res) => {
    res.status(404).json({
        error: 'API-маршрут не найден'
    })
})

app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
        return res.status(error.status).json({
            error: error.message
        })
    }

    if (error.code === '23505') {
        return res.status(409).json({
            error: 'Такая запись уже существует'
        })
    }

    if (error.code === '23503') {
        return res.status(409).json({
            error: 'Нельзя удалить запись, пока она используется другими данными'
        })
    }

    if (
        error.code === '23514' ||
        error.code === '22P02' ||
        error.code === '23502'
    ) {
        return res.status(400).json({
            error: 'Данные не прошли проверку'
        })
    }

    if (error.status === 400 || error.status === 413) {
        return res.status(error.status).json({
            error: 'Некорректный формат запроса'
        })
    }

    console.error(error)

    res.status(500).json({
        error: 'Внутренняя ошибка сервера'
    })
})

app.listen(PORT, () => {
    console.log(`Backend: http://localhost:${PORT}`)
})
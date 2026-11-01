import { Router } from 'express'

export default function createCatalogRouter(pool) {
    const router = Router()

    function httpError(status, message) {
        const error = new Error(message)
        error.status = status
        return error
    }

    function requireAdmin(req, res, next) {
        if (!req.user) {
            return next(httpError(401, 'Необходимо войти в аккаунт'))
        }

        if (req.user.role !== 'admin') {
            return next(httpError(403, 'Недостаточно прав'))
        }

        next()
    }

    function text(value, name, min, max) {
        if (typeof value !== 'string') {
            throw httpError(400, `Некорректное поле «${name}»`)
        }

        const result = value.trim()

        if (result.length < min || result.length > max) {
            throw httpError(400, `Некорректная длина поля «${name}»`)
        }

        return result
    }

    function uuid(value) {
        if (
            typeof value !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ) {
            throw httpError(400, 'Некорректный код записи')
        }

        return value
    }

    function imageName(value) {
        if (value === null || value === '' || value === undefined) {
            return null
        }

        if (!['1.png', '2.png', '3.png', '4.png', '5.png'].includes(value)) {
            throw httpError(400, 'Выберите допустимое изображение')
        }

        return value
    }

    function serviceData(body) {
        const duration = Number(body.durationMinutes)
        const price = Number(body.price)

        if (
            !Number.isInteger(duration) ||
            duration < 1 ||
            duration > 10080
        ) {
            throw httpError(400, 'Некорректная длительность услуги')
        }

        if (
            !/^\d{1,6}(\.\d{1,2})?$/.test(String(body.price)) ||
            !Number.isFinite(price) ||
            price <= 0
        ) {
            throw httpError(400, 'Некорректная цена')
        }

        if (typeof body.active !== 'boolean') {
            throw httpError(400, 'Некорректная активность услуги')
        }

        return {
            categoryCode: body.categoryCode
                ? uuid(body.categoryCode)
                : null,
            title: text(body.title, 'Название', 2, 120),
            description: text(body.description, 'Описание', 5, 2000),
            duration,
            price,
            active: body.active,
            image: imageName(body.imageName)
        }
    }

    router.get('/api/categories', async (req, res) => {
        const result = await pool.query(
            `SELECT code, name, description
       FROM categories
       ORDER BY name`
        )

        res.json({ categories: result.rows })
    })

    router.get('/api/services', async (req, res) => {
        const conditions = ['s.active = TRUE']
        const values = []

        if (req.query.categoryCode === 'none') {
            conditions.push('s.category_id IS NULL')
        } else if (req.query.categoryCode) {
            values.push(uuid(req.query.categoryCode))
            conditions.push(`c.code = $${values.length}`)
        }

        for (const [queryName, operator] of [
            ['minPrice', '>='],
            ['maxPrice', '<=']
        ]) {
            if (
                req.query[queryName] !== undefined &&
                req.query[queryName] !== ''
            ) {
                const price = Number(req.query[queryName])

                if (
                    !Number.isFinite(price) ||
                    price < 0 ||
                    price > 999999
                ) {
                    throw httpError(400, 'Некорректная цена фильтра')
                }

                values.push(price)
                conditions.push(`s.price ${operator} $${values.length}`)
            }
        }

        if (req.query.q) {
            values.push(`%${text(req.query.q, 'Поиск', 1, 100)}%`)
            conditions.push(
                `(s.title ILIKE $${values.length} OR s.description ILIKE $${values.length})`
            )
        }

        const result = await pool.query(
            `SELECT s.code, s.title, s.description,
              s.duration_minutes, s.price, s.active,
              s.image_name,
              c.code AS category_code,
              COALESCE(c.name, 'Нет категории') AS category_name,
              COUNT(r.code)::int AS review_count,
              COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS average_rating
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

    router.get('/api/admin/categories', requireAdmin, async (req, res) => {
        const result = await pool.query(
            `SELECT code, name, description
       FROM categories
       ORDER BY name`
        )

        res.json({ items: result.rows })
    })

    router.post('/api/admin/categories', requireAdmin, async (req, res) => {
        const name = text(req.body.name, 'Категория', 2, 80)
        const description = text(
            req.body.description ?? '',
            'Описание',
            0,
            500
        )

        const result = await pool.query(
            `INSERT INTO categories (name, description)
       VALUES ($1, $2)
       RETURNING code`,
            [name, description]
        )

        res.status(201).json({
            message: 'Категория создана',
            code: result.rows[0].code
        })
    })

    router.put('/api/admin/categories/:code', requireAdmin, async (req, res) => {
        const code = uuid(req.params.code)
        const name = text(req.body.name, 'Категория', 2, 80)
        const description = text(
            req.body.description ?? '',
            'Описание',
            0,
            500
        )

        const result = await pool.query(
            `UPDATE categories
       SET name = $1, description = $2
       WHERE code = $3
       RETURNING code`,
            [name, description, code]
        )

        if (!result.rowCount) {
            throw httpError(404, 'Категория не найдена')
        }

        res.json({ message: 'Категория изменена' })
    })

    router.delete('/api/admin/categories/:code', requireAdmin, async (req, res) => {
        const code = uuid(req.params.code)

        const result = await pool.query(
            `DELETE FROM categories
       WHERE code = $1
       RETURNING code`,
            [code]
        )

        if (!result.rowCount) {
            throw httpError(404, 'Категория не найдена')
        }

        res.json({
            message: 'Категория удалена. Товары сохранены без категории.'
        })
    })

    router.get('/api/admin/services', requireAdmin, async (req, res) => {
        const result = await pool.query(
            `SELECT s.code, s.title, s.description,
              s.duration_minutes, s.price, s.active,
              s.image_name,
              c.code AS category_code,
              COALESCE(c.name, 'Нет категории') AS category_name
       FROM services s
       LEFT JOIN categories c ON c.id = s.category_id
       ORDER BY s.title`
        )

        res.json({ items: result.rows })
    })

    router.post('/api/admin/services', requireAdmin, async (req, res) => {
        const data = serviceData(req.body)

        const result = await pool.query(
            `INSERT INTO services
       (category_id, title, description,
        duration_minutes, price, active, image_name)
       SELECT c.id, $2, $3, $4, $5, $6, $7
       FROM (SELECT 1) AS root
       LEFT JOIN categories c ON c.code = $1
       RETURNING code`,
            [
                data.categoryCode,
                data.title,
                data.description,
                data.duration,
                data.price,
                data.active,
                data.image
            ]
        )

        res.status(201).json({
            message: 'Услуга добавлена',
            code: result.rows[0].code
        })
    })

    router.put('/api/admin/services/:code', requireAdmin, async (req, res) => {
        const code = uuid(req.params.code)
        const data = serviceData(req.body)

        const result = await pool.query(
            `UPDATE services s
       SET category_id = (
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
                data.image,
                code
            ]
        )

        if (!result.rowCount) {
            throw httpError(404, 'Услуга не найдена')
        }

        res.json({ message: 'Услуга изменена' })
    })

    router.delete('/api/admin/services/:code', requireAdmin, async (req, res) => {
        const code = uuid(req.params.code)

        const result = await pool.query(
            `DELETE FROM services
       WHERE code = $1
       RETURNING code`,
            [code]
        )

        if (!result.rowCount) {
            throw httpError(404, 'Услуга не найдена')
        }

        res.json({ message: 'Услуга удалена' })
    })

    return router
}
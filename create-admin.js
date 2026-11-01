
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool()

// Выполняет обработку main.
async function main() {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
    const password = process.env.ADMIN_PASSWORD || ''

    const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:ru|com)$/i

    if (!emailPattern.test(email)) {
        throw new Error('ADMIN_EMAIL должен заканчиваться на .ru или .com')
    }

    if (
        password.length < 8 ||
        password.length > 72 ||
        !/^[\x21-\x7E]+$/.test(password) ||
        !/[A-Za-z]/.test(password) ||
        !/\d/.test(password)
    ) {
        throw new Error(
            'ADMIN_PASSWORD: 8–72 символа, английские буквы, цифры и спецсимволы'
        )
    }

    const exists = await pool.query(
        'SELECT code FROM users WHERE LOWER(email) = $1',
        [email]
    )

    if (exists.rowCount) {
        throw new Error('Пользователь с таким email уже существует')
    }

    const hash = await bcrypt.hash(password, 12)

    await pool.query(
        `INSERT INTO users
             (full_name, email, password_hash, phone, role)
         VALUES ($1, $2, $3, $4, 'admin')`,
        [
            'Иванов Иван Иванович',
            email,
            hash,
            '79990000000'
        ]
    )

    console.log(`Администратор создан: ${email}`)
}

main()
    .catch(error => {
        console.error(error.message)
        process.exitCode = 1
    })
    .finally(() => pool.end())

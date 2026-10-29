import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.join(directory, 'server.js')
const backupPath = path.join(directory, 'server.before-change-password.js')

const importLine = "import createChangePasswordRouter from './change-password.js'"
const mountLine = "app.use('/api/auth', createChangePasswordRouter(pool))"
const anchor = "app.get('/api/health'"

let source = fs.readFileSync(serverPath, 'utf8')

if (
    source.includes(importLine) &&
    source.includes(mountLine)
) {
    console.log('Изменение пароля уже подключено')
    process.exit(0)
}

if (
    source.includes(importLine) ||
    source.includes(mountLine)
) {
    throw new Error('Обнаружено неполное подключение')
}

if (!source.includes(anchor)) {
    throw new Error('Не найден маршрут /api/health')
}

fs.copyFileSync(serverPath, backupPath)

source = `${importLine}\n${source}`

source = source.replace(
    anchor,
    `${mountLine}\n\n${anchor}`
)

fs.writeFileSync(serverPath, source, 'utf8')

console.log('Маршрут изменения пароля подключён')
console.log('Создана резервная копия server.js')
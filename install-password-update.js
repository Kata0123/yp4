import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))

const serverPath = path.join(directory, 'server.js')
const backupPath = path.join(directory, 'server.before-password-update.js')

const recoveryImport =
    "import createRecoveryLinkRouter from './recovery-link.js'"

const policyImport =
    "import passwordPolicy from './password-policy.js'"

const policyMount = 'app.use(passwordPolicy)'

const recoveryMount =
    "app.use('/api/auth/recovery', createRecoveryLinkRouter(pool))"

const anchor = "app.get('/api/health'"

let source = fs.readFileSync(serverPath, 'utf8')

if (!source.includes(anchor)) {
    throw new Error('Не найден маршрут /api/health')
}

if (
    source.includes(recoveryImport) &&
    source.includes(policyImport) &&
    source.includes(policyMount) &&
    source.includes(recoveryMount)
) {
    console.log('Обновление уже установлено')
    process.exit(0)
}

if (
    source.includes(recoveryImport) ||
    source.includes(policyImport) ||
    source.includes(policyMount) ||
    source.includes(recoveryMount)
) {
    throw new Error('Обнаружено неполное обновление server.js')
}

fs.copyFileSync(serverPath, backupPath)

source = source.replace(
    anchor,
    `${policyMount}\n${recoveryMount}\n\n${anchor}`
)

source = source.replace(
    /^import 'dotenv\/config'/m,
    `import 'dotenv/config'\n${recoveryImport}\n${policyImport}`
)

fs.writeFileSync(serverPath, source, 'utf8')

console.log('Восстановление через ссылку подключено')
console.log('Правила новых паролей подключены')
console.log('Резервная копия: server.before-password-update.js')
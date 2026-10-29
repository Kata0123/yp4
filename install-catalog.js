import fs from 'node:fs'
import path from 'node:path'

const directory = path.dirname(new URL(import.meta.url).pathname)
const serverPath = path.resolve(directory, 'server.js')
const backupPath = path.resolve(directory, 'server.before-catalog.js')

let source = fs.readFileSync(serverPath, 'utf8')

const importLine = "import createCatalogRouter from './catalog-routes.js'"
const mountLine = 'app.use(createCatalogRouter(pool))'

const anchor = "app.get('/api/health'"

if (!source.includes(anchor)) {
    throw new Error('Не удалось найти место подключения маршрутов в server.js')
}

if (!source.includes('createCatalogRouter')) {
    fs.copyFileSync(serverPath, backupPath)

    source = `${importLine}\n${source}`

    source = source.replace(
        anchor,
        `${mountLine}\n\n${anchor}`
    )

    fs.writeFileSync(serverPath, source, 'utf8')

    console.log('Маршруты каталога подключены')
    console.log('Резервная копия: server.before-catalog.js')
} else {
    console.log('Маршруты уже подключены')
}
export async function api(path, options = {}) {
    let response

    try {
        response = await fetch(`/api${path}`, {
            method: options.method || 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: options.body === undefined
                ? undefined
                : JSON.stringify(options.body)
        })
    } catch {
        throw new Error('Не удалось подключиться к серверу')
    }

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
        throw new Error(data.error || `Ошибка сервера: ${response.status}`)
    }

    return data
}

export function money(value) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB'
    }).format(Number(value) || 0)
}

export function localToday() {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
}
export const PHONE_PATTERN = /^7\d{10}$/

export const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:ru|com)$/i

export const PASSWORD_PATTERN = /^[A-Z][\x21-\x7E]{7,71}$/

export function validateName(value) {
    if (typeof value !== 'string') {
        return 'Введите полное имя'
    }

    const name = value.trim()

    if (name.length < 5 || name.length > 120) {
        return 'ФИО должно содержать от 5 до 120 символов'
    }

    if (/\d/.test(name)) {
        return 'В ФИО нельзя использовать цифры'
    }

    const parts = name.split(/\s+/)

    if (parts.length < 3) {
        return 'Введите минимум три слова: фамилию, имя и отчество'
    }

    if (name.includes('  ') || /\s/.test(name.replace(/ /g, ''))) {
        return 'Используйте один пробел между словами'
    }

    const russian = /^[А-ЯЁа-яё -]+$/.test(name)
    const english = /^[A-Za-z -]+$/.test(name)

    if (!russian && !english) {
        return 'Используйте только русские или только английские буквы'
    }

    const pattern = russian
        ? /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)*$/
        : /^[A-Z][a-z]+(?:-[A-Z][a-z]+)*$/

    if (!parts.every(part => pattern.test(part))) {
        return 'Каждое слово и часть после дефиса должны начинаться с заглавной буквы'
    }

    return ''
}

export function validatePhone(value) {
    return PHONE_PATTERN.test(value)
        ? ''
        : 'Телефон должен содержать ровно 11 цифр и начинаться с 7'
}

export function validateEmail(value) {
    if (
        typeof value !== 'string' ||
        value.length > 254 ||
        !EMAIL_PATTERN.test(value.trim())
    ) {
        return 'Введите email с символом @ и окончанием .ru или .com'
    }

    return ''
}

export function validatePassword(value) {
    if (typeof value !== 'string') {
        return 'Введите пароль'
    }

    if (value.length < 8 || value.length > 72) {
        return 'Пароль должен содержать от 8 до 72 символов'
    }

    if (!/^[A-Z]/.test(value)) {
        return 'Пароль должен начинаться с заглавной английской буквы'
    }

    if (!PASSWORD_PATTERN.test(value)) {
        return 'Используйте только английские буквы, цифры и спецсимволы без пробелов'
    }

    if (!/\d/.test(value)) {
        return 'Добавьте хотя бы одну цифру'
    }

    return ''
}

export function normalizePhone(value) {
    const digits = String(value).replace(/\D/g, '')

    if (!digits) {
        return '7'
    }

    if (digits.startsWith('7')) {
        return digits.slice(0, 11)
    }

    return `7${digits.slice(0, 10)}`
}

export function validateAddress(value) {
    if (typeof value !== 'string') {
        return 'Введите адрес'
    }

    const address = value.trim()

    if (address.length < 10 || address.length > 250) {
        return 'Адрес должен содержать от 10 до 250 символов'
    }

    const parts = address.split(',').map(part => part.trim())

    if (
        parts.length < 3 ||
        parts.length > 5 ||
        parts.some(part => !part)
    ) {
        return 'Укажите город, улицу и номер дома через запятую'
    }

    const city = parts[0]
        .replace(/^(?:г\.?|город)\s+/i, '')
        .trim()

    const street = parts[1]
        .replace(/^(?:ул\.?|улица|проспект|пр-т|переулок|пер\.?|бульвар|шоссе|наб\.?|набережная)\s+/i, '')
        .trim()

    const house = parts[2]
        .replace(/^(?:д\.?|дом)\s*/i, '')
        .trim()

    if (!/^[А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z\s-]*$/.test(city)) {
        return 'Укажите корректное название города'
    }

    if (!/^[А-ЯЁа-яёA-Za-z0-9][А-ЯЁа-яёA-Za-z0-9\s.-]*$/.test(street)) {
        return 'Укажите корректное название улицы'
    }

    if (!/^\d{1,5}[А-ЯЁа-яёA-Za-z]?(?:\/\d{1,5}[А-ЯЁа-яёA-Za-z]?)?$/.test(house)) {
        return 'Укажите номер дома, например 15, 15А или 15/2'
    }

    for (const extra of parts.slice(3)) {
        if (
            extra.length > 80 ||
            !/^[А-ЯЁа-яёA-Za-z0-9\s./-]+$/.test(extra)
        ) {
            return 'Проверьте дополнительные сведения об адресе'
        }
    }

    return ''
}
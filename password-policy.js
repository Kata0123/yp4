
// Выполняет обработку password policy.
export default function passwordPolicy(req, res, next) {
    const protectedRoutes = [
        ['POST', '/api/auth/register', 'password'],
        ['POST', '/api/auth/reset', 'password'],
        ['POST', '/api/auth/recovery/confirm', 'password'],
        ['PUT', '/api/profile/password', 'newPassword']
    ]

    const route = protectedRoutes.find(
        ([method, path]) =>
            req.method === method && req.path === path
    )

    if (!route) {
        return next()
    }

    const value = req.body?.[route[2]]

    if (typeof value !== 'string') {
        return res.status(400).json({
            error: 'Введите пароль'
        })
    }

    if (value.length < 8 || value.length > 72) {
        return res.status(400).json({
            error: 'Пароль должен содержать от 8 до 72 символов'
        })
    }

    if (!/^[A-Z]/.test(value)) {
        return res.status(400).json({
            error: 'Пароль должен начинаться с заглавной английской буквы'
        })
    }

    if (!/^[\x21-\x7E]+$/.test(value)) {
        return res.status(400).json({
            error: 'Разрешены только английские буквы, цифры и спецсимволы без пробелов'
        })
    }

    if (!/\d/.test(value)) {
        return res.status(400).json({
            error: 'Пароль должен содержать хотя бы одну цифру'
        })
    }

    next()
}

import { useEffect, useState } from 'react'
import { api } from '../api/api.js'
import {
    validateName,
    validatePhone,
    validateEmail,
    validatePassword,
    normalizePhone
} from '../utils/validation.js'

const initialForm = {
    fullName: '',
    email: '',
    phone: '7',
    password: '',
    confirmPassword: ''
}

export default function AuthPage({
                                     mode,
                                     token,
                                     onMode,
                                     onSuccess,
                                     onNotice
                                 }) {
    const [form, setForm] = useState(initialForm)
    const [errors, setErrors] = useState({})
    const [touched, setTouched] = useState({})
    const [busy, setBusy] = useState(false)
    const [serverError, setServerError] = useState('')
    const [message, setMessage] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    useEffect(() => {
        setForm({ ...initialForm })
        setErrors({})
        setTouched({})
        setServerError('')
        setMessage('')
        setShowPassword(false)
    }, [mode])

    function checkField(key, value, current = form) {
        if (key === 'fullName') return validateName(value)
        if (key === 'email') return validateEmail(value)
        if (key === 'phone') return validatePhone(value)

        if (key === 'password') {
            return mode === 'login'
                ? (value ? '' : 'Введите пароль')
                : validatePassword(value)
        }

        if (key === 'confirmPassword') {
            if (!value) return 'Повторите пароль'
            if (value !== current.password) return 'Пароли не совпадают'
        }

        return ''
    }

    function change(key, value) {
        let next = value

        if (key === 'fullName') {
            next = value
                .replace(/[^А-ЯЁа-яёA-Za-z\s-]/g, '')
                .replace(/ {2,}/g, ' ')
                .slice(0, 120)
        }

        if (key === 'phone') {
            next = normalizePhone(value)
        }

        if (key === 'email') {
            next = value.replace(/\s/g, '').slice(0, 254)
        }

        if (key === 'password' || key === 'confirmPassword') {
            next = value.slice(0, mode === 'login' ? 200 : 72)
        }

        const updated = {
            ...form,
            [key]: next
        }

        setForm(updated)
        setServerError('')

        if (touched[key]) {
            setErrors(previous => ({
                ...previous,
                [key]: checkField(key, next, updated)
            }))
        }

        if (key === 'password' && touched.confirmPassword) {
            setErrors(previous => ({
                ...previous,
                confirmPassword: checkField(
                    'confirmPassword',
                    updated.confirmPassword,
                    updated
                )
            }))
        }
    }

    function blur(key) {
        setTouched(previous => ({
            ...previous,
            [key]: true
        }))

        setErrors(previous => ({
            ...previous,
            [key]: checkField(key, form[key])
        }))
    }

    function validateForm() {
        const fields = mode === 'register'
            ? ['fullName', 'phone', 'email', 'password', 'confirmPassword']
            : mode === 'login'
                ? ['email', 'password']
                : mode === 'forgot'
                    ? ['fullName', 'email', 'password', 'confirmPassword']
                    : ['password', 'confirmPassword']

        const found = {}

        for (const key of fields) {
            const issue = checkField(key, form[key])

            if (issue) {
                found[key] = issue
            }
        }

        setErrors(found)
        setTouched(Object.fromEntries(fields.map(key => [key, true])))

        return Object.keys(found).length === 0
    }

    async function submit(event) {
        event.preventDefault()
        setServerError('')
        setMessage('')

        if (!validateForm()) return

        setBusy(true)

        try {
            if (mode === 'login') {
                const data = await api('/auth/login', {
                    method: 'POST',
                    body: {
                        email: form.email.toLowerCase(),
                        password: form.password
                    }
                })

                onSuccess(data.user)
            }

            if (mode === 'register') {
                const data = await api('/auth/register', {
                    method: 'POST',
                    body: {
                        fullName: form.fullName.trim(),
                        email: form.email.toLowerCase(),
                        phone: form.phone,
                        password: form.password
                    }
                })

                onSuccess(data.user)
            }

            if (mode === 'forgot') {
                const data = await api('/password-requests', {
                    method: 'POST',
                    body: {
                        fullName: form.fullName.trim(),
                        email: form.email.toLowerCase(),
                        password: form.password,
                        confirmPassword: form.confirmPassword
                    }
                })

                setMessage(data.message)

                setForm({
                    ...initialForm
                })

                setErrors({})
                setTouched({})
            }

            if (mode === 'reset') {
                if (!token) {
                    throw new Error('Ссылка восстановления отсутствует')
                }

                const data = await api('/auth/reset', {
                    method: 'POST',
                    body: {
                        token,
                        password: form.password
                    }
                })

                window.history.replaceState({}, '', window.location.pathname)
                onMode('login')
                onNotice(data.message)
            }
        } catch (error) {
            setServerError(error.message)
        } finally {
            setBusy(false)
        }
    }

    function renderError(key) {
        return touched[key] && errors[key] ? (
            <span className="field-error" role="alert">
        {errors[key]}
      </span>
        ) : null
    }

    function inputClass(key) {
        return touched[key] && errors[key] ? 'input-error' : ''
    }

    const titles = {
        login: 'Вход в аккаунт',
        register: 'Создать аккаунт',
        forgot: 'Восстановление пароля',
        reset: 'Новый пароль'
    }

    return (
        <section className="auth-page">
            <div className="auth-card">
                <div className="eyebrow">
                    ДОМСЕРВИС / АККАУНТ
                </div>

                <h1>{titles[mode]}</h1>

                <p className="muted">
                    {mode === 'forgot'
                        ? 'Введите данные аккаунта и новый пароль. Администратор рассмотрит запрос.'
                        : mode === 'register'
                            ? 'Зарегистрируйтесь, чтобы заказывать услуги.'
                            : mode === 'login'
                                ? 'Войдите, чтобы управлять заказами.'
                                : 'Придумайте новый пароль.'}
                </p>

                <form className="form-stack" onSubmit={submit} noValidate>
                    {['register', 'forgot'].includes(mode) && (
                        <label>
                            Полное ФИО

                            <input
                                required
                                maxLength={120}
                                autoComplete="name"
                                placeholder="Иванов Иван Иванович"
                                value={form.fullName}
                                onChange={e => change('fullName', e.target.value)}
                                onBlur={() => blur('fullName')}
                                className={inputClass('fullName')}
                            />

                            {renderError('fullName')}
                        </label>
                    )}

                    {mode === 'register' && (
                        <label>
                            Телефон

                            <input
                                required
                                type="tel"
                                inputMode="numeric"
                                maxLength={11}
                                value={form.phone}
                                onChange={e => change('phone', e.target.value)}
                                onBlur={() => blur('phone')}
                                className={inputClass('phone')}
                            />

                            {renderError('phone')}
                        </label>
                    )}

                    {mode !== 'reset' && (
                        <label>
                            Email

                            <input
                                required
                                type="email"
                                maxLength={254}
                                autoComplete="email"
                                placeholder="example@mail.ru"
                                value={form.email}
                                onChange={e => change('email', e.target.value)}
                                onBlur={() => blur('email')}
                                className={inputClass('email')}
                            />

                            {renderError('email')}
                        </label>
                    )}

                    {['login', 'register', 'forgot', 'reset'].includes(mode) && (
                        <label>
                            {['forgot', 'reset'].includes(mode) ? 'Новый пароль' : 'Пароль'}

                            <input
                                required
                                type={showPassword ? 'text' : 'password'}
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                maxLength={mode === 'login' ? 200 : 72}
                                placeholder="Введите пароль"
                                value={form.password}
                                onChange={e => change('password', e.target.value)}
                                onBlur={() => blur('password')}
                                className={inputClass('password')}
                            />

                            {renderError('password')}

                            {mode !== 'login' && (
                                <span className="field-hint">
                  От 8 до 72 символов. Начинается с заглавной английской
                  буквы и содержит хотя бы одну цифру.
                </span>
                            )}
                        </label>
                    )}

                    {['register', 'forgot', 'reset'].includes(mode) && (
                        <label>
                            Подтверждение пароля

                            <input
                                required
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                maxLength={72}
                                placeholder="Повторите новый пароль"
                                value={form.confirmPassword}
                                onChange={e => change('confirmPassword', e.target.value)}
                                onBlur={() => blur('confirmPassword')}
                                className={inputClass('confirmPassword')}
                            />

                            {renderError('confirmPassword')}
                        </label>
                    )}

                    {mode !== 'forgot' || !message ? (
                        <label style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10
                        }}>
                            <input
                                type="checkbox"
                                checked={showPassword}
                                onChange={e => setShowPassword(e.target.checked)}
                                style={{ width: 'auto' }}
                            />

                            Показать пароль
                        </label>
                    ) : null}

                    {serverError && (
                        <div className="alert alert-error" role="alert">
                            {serverError}
                        </div>
                    )}

                    {message && (
                        <div className="alert alert-success">
                            {message}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="button button-primary button-wide"
                        disabled={busy}
                    >
                        {busy
                            ? 'Подождите...'
                            : mode === 'login'
                                ? 'Войти'
                                : mode === 'register'
                                    ? 'Зарегистрироваться'
                                    : mode === 'forgot'
                                        ? 'Отправить запрос'
                                        : 'Изменить пароль'}
                    </button>
                </form>

                <div className="auth-links">
                    {mode === 'login' && (
                        <>
                            <button
                                type="button"
                                className="text-button"
                                onClick={() => onMode('register')}
                            >
                                Нет аккаунта? Регистрация
                            </button>

                            <button
                                type="button"
                                className="text-button"
                                onClick={() => onMode('forgot')}
                            >
                                Забыли пароль?
                            </button>
                        </>
                    )}

                    {mode !== 'login' && (
                        <button
                            type="button"
                            className="text-button"
                            onClick={() => onMode('login')}
                        >
                            Вернуться ко входу
                        </button>
                    )}

                    <button
                        type="button"
                        className="text-button"
                        onClick={() => onMode('catalog')}
                    >
                        Вернуться в каталог
                    </button>
                </div>
            </div>
        </section>
    )
}
import { useEffect, useState } from 'react'
import { api } from '../api/api.js'
import {
    validateName,
    validatePhone,
    validateEmail,
    validatePassword,
    normalizePhone
} from '../utils/validation.js'

export default function ProfilePage({ user, onUpdate }) {
    const [profile, setProfile] = useState({
        fullName: '',
        email: '',
        phone: '',
        defaultAddress: ''
    })

    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    })

    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    useEffect(() => {
        if (!user) return

        setProfile({
            fullName: user.full_name || '',
            email: user.email || '',
            phone: user.phone || '',
            defaultAddress: user.default_address || ''
        })
    }, [user])

    function changeProfile(key, value) {
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

        setProfile(previous => ({
            ...previous,
            [key]: next
        }))

        setError('')
    }

    function changePassword(key, value) {
        setPasswords(previous => ({
            ...previous,
            [key]: value.slice(
                0,
                key === 'currentPassword' ? 200 : 72
            )
        }))

        setError('')
    }

    async function saveProfile(event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        setMessage('')

        try {
            const checks = [
                validateName(profile.fullName),
                validatePhone(profile.phone),
                validateEmail(profile.email)
            ]

            for (const issue of checks) {
                if (issue) {
                    throw new Error(issue)
                }
            }

            if (profile.defaultAddress.length > 250) {
                throw new Error('Адрес не может превышать 250 символов')
            }

            const data = await api('/profile', {
                method: 'PUT',
                body: {
                    fullName: profile.fullName.trim(),
                    email: profile.email.toLowerCase(),
                    phone: profile.phone,
                    defaultAddress: profile.defaultAddress.trim()
                }
            })

            onUpdate(data.user)
            setMessage('Личная информация успешно сохранена')
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    async function savePassword(event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        setMessage('')

        try {
            if (!passwords.currentPassword) {
                throw new Error('Введите текущий пароль')
            }

            const issue = validatePassword(passwords.newPassword)

            if (issue) {
                throw new Error(issue)
            }

            if (passwords.newPassword !== passwords.confirmPassword) {
                throw new Error('Новые пароли не совпадают')
            }

            if (passwords.currentPassword === passwords.newPassword) {
                throw new Error('Новый пароль должен отличаться от текущего')
            }

            const data = await api('/profile/password', {
                method: 'PUT',
                body: {
                    currentPassword: passwords.currentPassword,
                    newPassword: passwords.newPassword
                }
            })

            setPasswords({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            })

            setMessage(data.message)
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="page-section">
            <div className="section-heading">
                <div>
                    <div className="eyebrow">
                        ЛИЧНЫЙ КАБИНЕТ
                    </div>

                    <h1>Мой профиль</h1>

                    <p className="muted">
                        Управляйте личной информацией и безопасностью аккаунта.
                    </p>
                </div>

                <span className="role-chip">
          {user?.role === 'admin'
              ? 'Администратор'
              : 'Пользователь'}
        </span>
            </div>

            {error && (
                <div className="alert alert-error" role="alert">
                    {error}
                </div>
            )}

            {message && (
                <div className="alert alert-success">
                    {message}
                </div>
            )}

            <div className="profile-grid">
                <div className="panel">
                    <h2>Личная информация</h2>

                    <form
                        className="form-stack"
                        onSubmit={saveProfile}
                        noValidate
                    >
                        <label>
                            ФИО

                            <input
                                required
                                maxLength={120}
                                autoComplete="name"
                                value={profile.fullName}
                                onChange={e => changeProfile(
                                    'fullName',
                                    e.target.value
                                )}
                            />

                            <span className="field-hint">
                Минимум три слова с заглавной буквы, цифры запрещены.
              </span>
                        </label>

                        <label>
                            Email

                            <input
                                required
                                type="email"
                                maxLength={254}
                                autoComplete="email"
                                value={profile.email}
                                onChange={e => changeProfile(
                                    'email',
                                    e.target.value
                                )}
                            />

                            <span className="field-hint">
                Адрес должен заканчиваться на .ru или .com.
              </span>
                        </label>

                        <label>
                            Телефон

                            <input
                                required
                                type="tel"
                                inputMode="numeric"
                                maxLength={11}
                                autoComplete="tel"
                                value={profile.phone}
                                onChange={e => changeProfile(
                                    'phone',
                                    e.target.value
                                )}
                            />

                            <span className="field-hint">
                Ровно 11 цифр, начиная с 7.
              </span>
                        </label>

                        <label>
                            Адрес по умолчанию

                            <textarea
                                rows={3}
                                maxLength={250}
                                value={profile.defaultAddress}
                                onChange={e => changeProfile(
                                    'defaultAddress',
                                    e.target.value
                                )}
                            />
                        </label>

                        <button
                            className="button button-primary"
                            disabled={busy}
                        >
                            {busy
                                ? 'Сохранение...'
                                : 'Сохранить изменения'}
                        </button>
                    </form>
                </div>

                <div className="panel">
                    <h2>Изменение пароля</h2>

                    <form
                        className="form-stack"
                        onSubmit={savePassword}
                        noValidate
                    >
                        <label>
                            Текущий пароль

                            <input
                                required
                                type="password"
                                autoComplete="current-password"
                                value={passwords.currentPassword}
                                onChange={e => changePassword(
                                    'currentPassword',
                                    e.target.value
                                )}
                            />
                        </label>

                        <label>
                            Новый пароль

                            <input
                                required
                                type="password"
                                minLength={8}
                                maxLength={72}
                                autoComplete="new-password"
                                value={passwords.newPassword}
                                onChange={e => changePassword(
                                    'newPassword',
                                    e.target.value
                                )}
                            />
                        </label>

                        <label>
                            Повторите новый пароль

                            <input
                                required
                                type="password"
                                minLength={8}
                                maxLength={72}
                                autoComplete="new-password"
                                value={passwords.confirmPassword}
                                onChange={e => changePassword(
                                    'confirmPassword',
                                    e.target.value
                                )}
                            />
                        </label>

                        <p className="muted small">
                            От 8 до 72 символов: английские буквы,
                            цифры и спецсимволы.
                        </p>

                        <button
                            className="button button-primary"
                            disabled={busy}
                        >
                            {busy
                                ? 'Сохранение...'
                                : 'Изменить пароль'}
                        </button>
                    </form>
                </div>
            </div>
        </section>
    )
}
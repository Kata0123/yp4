import { useEffect, useState } from 'react'
import { api, money, localToday } from '../api/api.js'
import PasswordRequestsPanel from './PasswordRequestsPanel.jsx'

const NAMES = {
    categories: 'Категории',
    services: 'Услуги',
    users: 'Пользователи',
    reviews: 'Отзывы',
    carts: 'Корзины',
    orders: 'Заказы',
    passwordRequests: 'Смена паролей'
}

const STATUSES = {
    new: 'Новый',
    confirmed: 'Подтверждён',
    completed: 'Выполнен',
    cancelled: 'Отменён'
}

const IMAGES = ['1.png', '2.png', '3.png', '4.png', '5.png']

const FIELDS = {
    categories: [
        { key: 'name', label: 'Название', required: true, minLength: 2, maxLength: 80 },
        { key: 'description', label: 'Описание', type: 'textarea', maxLength: 500 }
    ],
    services: [
        { key: 'categoryCode', label: 'Категория', type: 'select', source: 'categories' },
        { key: 'title', label: 'Название услуги', required: true, minLength: 2, maxLength: 120 },
        { key: 'description', label: 'Описание', type: 'textarea', required: true, minLength: 5, maxLength: 2000 },
        { key: 'durationMinutes', label: 'Длительность', type: 'number', min: 1, max: 10080, required: true },
        { key: 'price', label: 'Цена', type: 'number', min: 0.01, max: 999999, step: 0.01, required: true },
        { key: 'active', label: 'Доступна', type: 'checkbox' },
        { key: 'imageName', label: 'Изображение', type: 'images' }
    ],
    users: [
        { key: 'fullName', label: 'ФИО', required: true, maxLength: 120 },
        { key: 'email', label: 'Email', type: 'email', required: true, maxLength: 254 },
        { key: 'phone', label: 'Телефон', type: 'tel', required: true, maxLength: 11 },
        { key: 'defaultAddress', label: 'Адрес', type: 'textarea', maxLength: 250 },
        { key: 'password', label: 'Пароль', type: 'password', maxLength: 72 }
    ],
    reviews: [
        { key: 'userCode', label: 'Пользователь', type: 'select', source: 'users', required: true, onlyCreate: true },
        { key: 'serviceCode', label: 'Услуга', type: 'select', source: 'services', required: true, onlyCreate: true },
        { key: 'rating', label: 'Оценка', type: 'number', min: 1, max: 5, required: true },
        { key: 'comment', label: 'Текст отзыва', type: 'textarea', required: true, minLength: 3, maxLength: 1000 }
    ],
    carts: [
        { key: 'userCode', label: 'Пользователь', type: 'select', source: 'users', required: true, onlyCreate: true },
        { key: 'serviceCode', label: 'Услуга', type: 'select', source: 'services', required: true, onlyCreate: true },
        { key: 'quantity', label: 'Количество', type: 'number', min: 1, max: 99, required: true }
    ],
    orders: [
        { key: 'userCode', label: 'Пользователь', type: 'select', source: 'users', required: true, onlyCreate: true },
        { key: 'serviceCode', label: 'Услуга', type: 'select', source: 'services', required: true, onlyCreate: true },
        { key: 'quantity', label: 'Количество', type: 'number', min: 1, max: 99, required: true, onlyCreate: true },
        { key: 'address', label: 'Адрес', type: 'textarea', required: true, maxLength: 250 },
        { key: 'deliveryDate', label: 'Дата', type: 'date', required: true },
        { key: 'comment', label: 'Комментарий', type: 'textarea', maxLength: 1000 },
        { key: 'status', label: 'Статус', type: 'select', source: 'statuses', required: true, onlyEdit: true }
    ]
}

function draftFrom(item = {}) {
    return {
        name: item.name || '',
        description: item.description || '',
        categoryCode: item.category_code || '',
        title: item.title || '',
        durationMinutes: item.duration_minutes ?? '',
        price: item.price ?? '',
        active: item.active ?? true,
        imageName: item.image_name || '',
        fullName: item.full_name || '',
        email: item.email || '',
        phone: item.phone || '',
        defaultAddress: item.default_address || '',
        password: '',
        userCode: item.user_code || '',
        serviceCode: item.service_code || '',
        rating: item.rating ?? 5,
        comment: item.comment || '',
        quantity: item.quantity ?? 1,
        address: item.address || '',
        deliveryDate: item.delivery_date || localToday(),
        status: item.status || 'new'
    }
}

function titleOf(section, item) {
    if (section === 'categories') return item.name
    if (section === 'services') return item.title
    if (section === 'users') return item.full_name
    if (section === 'reviews') return item.user_name
    if (section === 'carts') return item.user_name
    return `Заказ ${item.code?.slice(0, 8).toUpperCase()}`
}

function detailsOf(section, item) {
    if (section === 'categories') return item.description || 'Категория'
    if (section === 'services') {
        return `${item.category_name || 'Нет категории'} · ${money(item.price)} · ${item.duration_minutes} мин.`
    }
    if (section === 'users') return `${item.email} · ${item.phone} · ${item.role}`
    if (section === 'reviews') return `${item.service_title} · ${item.rating}/5 · ${item.comment}`
    if (section === 'carts') return `${item.service_title} · ${item.quantity} шт.`
    return `${item.customer_name} · ${STATUSES[item.status] || item.status} · ${money(item.total)}`
}

export default function AdminPage({ onUpdated }) {
    const [section, setSection] = useState('services')
    const [data, setData] = useState({})
    const [editor, setEditor] = useState(null)
    const [draft, setDraft] = useState(draftFrom())
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    async function loadAll() {
        setLoading(true)

        const sections = Object.keys(FIELDS)

        try {
            const results = await Promise.allSettled(
                sections.map(key => api(`/admin/${key}`))
            )

            const next = {}
            const failed = []

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    next[sections[index]] = Array.isArray(result.value.items)
                        ? result.value.items
                        : []
                } else {
                    failed.push(`${NAMES[sections[index]]}: ${result.reason.message}`)
                }
            })

            setData(previous => ({ ...previous, ...next }))
            setError(failed.join('; '))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAll()
    }, [])

    function create() {
        setDraft(draftFrom())
        setEditor({ mode: 'create' })
        setError('')
        setMessage('')
    }

    function edit(item) {
        setDraft(draftFrom(item))
        setEditor({ mode: 'edit', code: item.code })
        setError('')
        setMessage('')
    }

    function change(key, value) {
        setDraft(previous => ({
            ...previous,
            [key]: value
        }))
    }

    function optionsFor(source) {
        if (source === 'statuses') {
            return Object.entries(STATUSES).map(([code, name]) => ({ code, name }))
        }

        return (data[source] || []).map(item => ({
            code: item.code,
            name: source === 'users'
                ? `${item.full_name} (${item.email})`
                : source === 'services'
                    ? item.title
                    : item.name
        }))
    }

    async function save(event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        setMessage('')

        try {
            if (section === 'users' && editor.mode === 'create' && !draft.password) {
                throw new Error('Укажите пароль пользователя')
            }

            const url = editor.mode === 'create'
                ? `/admin/${section}`
                : `/admin/${section}/${encodeURIComponent(editor.code)}`

            await api(url, {
                method: editor.mode === 'create' ? 'POST' : 'PUT',
                body: draft
            })

            await loadAll()
            await onUpdated()

            setEditor(null)
            setMessage('Изменения сохранены')
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    async function remove(item) {
        const question = section === 'categories'
            ? `Удалить категорию «${item.name}»? Услуги останутся без категории.`
            : `Удалить «${titleOf(section, item)}»?`

        if (!window.confirm(question)) return

        setBusy(true)
        setError('')
        setMessage('')

        try {
            await api(
                `/admin/${section}/${encodeURIComponent(item.code)}`,
                { method: 'DELETE' }
            )

            await loadAll()
            await onUpdated()

            setEditor(null)
            setMessage('Запись удалена')
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    function fieldControl(field) {
        if (field.type === 'checkbox') {
            return (
                <span className="checkbox-label">
          <input
              type="checkbox"
              checked={Boolean(draft[field.key])}
              onChange={e => change(field.key, e.target.checked)}
          />
                    {field.label}
        </span>
            )
        }

        if (field.type === 'images') {
            return (
                <>
                    <span>{field.label}</span>

                    <div className="product-image-picker">
                        {IMAGES.map(name => (
                            <label
                                key={name}
                                className={
                                    draft.imageName === name
                                        ? 'product-image-option selected'
                                        : 'product-image-option'
                                }
                            >
                                <img src={`/images/${name}`} alt={name} />

                                <input
                                    type="radio"
                                    name="productImage"
                                    checked={draft.imageName === name}
                                    onChange={() => change('imageName', name)}
                                />

                                {name}
                            </label>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="text-button"
                        onClick={() => change('imageName', '')}
                    >
                        Без изображения
                    </button>
                </>
            )
        }

        if (field.type === 'textarea') {
            return (
                <>
                    <span>{field.label}</span>
                    <textarea
                        rows={3}
                        required={field.required}
                        maxLength={field.maxLength}
                        minLength={field.minLength}
                        value={draft[field.key]}
                        onChange={e => change(field.key, e.target.value)}
                    />
                </>
            )
        }

        if (field.type === 'select') {
            return (
                <>
                    <span>{field.label}</span>

                    <select
                        required={field.required}
                        value={draft[field.key]}
                        onChange={e => change(field.key, e.target.value)}
                    >
                        <option value="">
                            {field.key === 'categoryCode'
                                ? 'Нет категории'
                                : 'Выберите значение'}
                        </option>

                        {optionsFor(field.source).map(option => (
                            <option key={option.code} value={option.code}>
                                {option.name}
                            </option>
                        ))}
                    </select>
                </>
            )
        }

        return (
            <>
                <span>{field.label}</span>

                <input
                    type={field.type || 'text'}
                    required={
                        field.key === 'password'
                            ? editor.mode === 'create'
                            : field.required
                    }
                    min={
                        field.type === 'date'
                            ? editor.mode === 'create' ? localToday() : undefined
                            : field.min
                    }
                    max={
                        field.type === 'date'
                            ? '2100-12-31'
                            : field.type === 'number' ? field.max : undefined
                    }
                    step={field.type === 'number' ? field.step || 1 : undefined}
                    minLength={field.key === 'password' ? 8 : field.minLength}
                    maxLength={field.maxLength}
                    value={draft[field.key]}
                    onChange={e => change(field.key, e.target.value)}
                />
            </>
        )
    }

    const rows = Array.isArray(data[section]) ? data[section] : []

    return (
        <section className="page-section">
            <div className="section-heading">
                <div>
                    <div className="eyebrow">ПАНЕЛЬ УПРАВЛЕНИЯ</div>
                    <h1>Администрирование</h1>
                    <p className="muted">
                        Управление данными сайта и запросами пользователей.
                    </p>
                </div>

                <span className="role-chip">ADMIN</span>
            </div>

            <div className="admin-tabs">
                {Object.entries(NAMES).map(([key, name]) => (
                    <button
                        type="button"
                        key={key}
                        className={section === key ? 'admin-tab active' : 'admin-tab'}
                        onClick={() => {
                            setSection(key)
                            setEditor(null)
                            setError('')
                            setMessage('')
                        }}
                    >
                        {name}
                        {key !== 'passwordRequests' && (
                            <span>{data[key]?.length ?? 0}</span>
                        )}
                    </button>
                ))}
            </div>

            {section === 'passwordRequests' ? (
                <PasswordRequestsPanel />
            ) : (
                <>
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

                    <div className="panel">
                        <div className="section-heading compact">
                            <h2>{NAMES[section]}</h2>

                            <div className="row-actions">
                                <button
                                    type="button"
                                    className="button button-ghost"
                                    disabled={loading || busy}
                                    onClick={loadAll}
                                >
                                    Обновить
                                </button>

                                <button
                                    type="button"
                                    className="button button-primary"
                                    disabled={busy}
                                    onClick={create}
                                >
                                    + Добавить
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <p className="muted">Загрузка данных...</p>
                        ) : rows.length === 0 ? (
                            <p className="muted">Записей пока нет.</p>
                        ) : (
                            <div className="admin-list">
                                {rows.map(item => (
                                    <div className="admin-record" key={item.code}>
                                        {section === 'services' && item.image_name && (
                                            <img
                                                src={`/images/${item.image_name}`}
                                                alt={item.title}
                                                style={{
                                                    width: 80,
                                                    height: 65,
                                                    objectFit: 'cover',
                                                    borderRadius: 10
                                                }}
                                            />
                                        )}

                                        <div className="grow">
                                            <strong>{titleOf(section, item)}</strong>
                                            <p>{detailsOf(section, item)}</p>
                                        </div>

                                        <div className="row-actions">
                                            <button
                                                type="button"
                                                className="button button-ghost"
                                                disabled={busy}
                                                onClick={() => edit(item)}
                                            >
                                                Изменить
                                            </button>

                                            <button
                                                type="button"
                                                className="button button-danger"
                                                disabled={busy}
                                                onClick={() => remove(item)}
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {editor && (
                        <div className="panel admin-editor">
                            <div className="section-heading compact">
                                <h2>
                                    {editor.mode === 'create' ? 'Добавление' : 'Редактирование'}
                                </h2>

                                <button
                                    type="button"
                                    className="button button-ghost"
                                    onClick={() => setEditor(null)}
                                >
                                    Закрыть
                                </button>
                            </div>

                            <form className="admin-form" onSubmit={save}>
                                {FIELDS[section]
                                    .filter(field =>
                                        editor.mode === 'create'
                                            ? !field.onlyEdit
                                            : !field.onlyCreate
                                    )
                                    .map(field => (
                                        <label
                                            key={field.key}
                                            className={
                                                ['textarea', 'images'].includes(field.type)
                                                    ? 'admin-wide'
                                                    : ''
                                            }
                                        >
                                            {fieldControl(field)}
                                        </label>
                                    ))}

                                <div className="admin-wide row-actions">
                                    <button
                                        type="submit"
                                        className="button button-primary"
                                        disabled={busy}
                                    >
                                        {busy ? 'Сохранение...' : 'Сохранить'}
                                    </button>

                                    <button
                                        type="button"
                                        className="button button-ghost"
                                        disabled={busy}
                                        onClick={() => setEditor(null)}
                                    >
                                        Отмена
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </>
            )}
        </section>
    )
}
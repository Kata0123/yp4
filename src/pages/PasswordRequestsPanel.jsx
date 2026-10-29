import { useEffect, useState } from 'react'
import { api } from '../api/api.js'

const statusNames = {
    pending: 'Ожидает решения',
    approved: 'Подтверждён',
    rejected: 'Отклонён'
}

export default function PasswordRequestsPanel() {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    async function load() {
        setLoading(true)
        setError('')

        try {
            const data = await api('/password-requests/admin')

            setItems(Array.isArray(data.items) ? data.items : [])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    async function processRequest(request, action) {
        const title = action === 'approve'
            ? 'Подтвердить изменение пароля'
            : 'Отклонить запрос'

        if (!window.confirm(`${title} для ${request.full_name}?`)) {
            return
        }

        setBusy(true)
        setError('')
        setMessage('')

        try {
            const data = await api(
                `/password-requests/admin/${request.code}/${action}`,
                { method: 'PATCH' }
            )

            setMessage(data.message)
            await load()
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="panel">
            <div className="section-heading compact">
                <div>
                    <h2>Запросы на смену пароля</h2>
                    <p className="muted">
                        Подтверждайте запросы только после проверки личности заявителя.
                    </p>
                </div>

                <button
                    type="button"
                    className="button button-ghost"
                    disabled={loading || busy}
                    onClick={load}
                >
                    Обновить
                </button>
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

            {loading ? (
                <p className="muted">Загрузка запросов...</p>
            ) : items.length === 0 ? (
                <p className="muted">Запросов пока нет.</p>
            ) : (
                <div className="admin-list">
                    {items.map(request => (
                        <article className="admin-record" key={request.code}>
                            <div className="grow">
                                <strong>{request.full_name}</strong>

                                <p>{request.email}</p>

                                <p className="muted">
                                    {new Date(request.created_at).toLocaleString('ru-RU')}
                                </p>

                                <span className={`status status-${request.status}`}>
                  {statusNames[request.status] || request.status}
                </span>
                            </div>

                            {request.status === 'pending' && (
                                <div className="row-actions">
                                    <button
                                        type="button"
                                        className="button button-primary"
                                        disabled={busy}
                                        onClick={() => processRequest(request, 'approve')}
                                    >
                                        Подтвердить
                                    </button>

                                    <button
                                        type="button"
                                        className="button button-danger"
                                        disabled={busy}
                                        onClick={() => processRequest(request, 'reject')}
                                    >
                                        Отклонить
                                    </button>
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            )}
        </section>
    )
}
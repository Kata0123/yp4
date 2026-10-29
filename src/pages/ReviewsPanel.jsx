import { useEffect, useState } from 'react'
import { api } from '../api/api.js'

export default function ReviewsPanel({
                                         service,
                                         user,
                                         onClose,
                                         onLogin,
                                         onUpdated
                                     }) {
    const [reviews, setReviews] = useState([])
    const [rating, setRating] = useState(5)
    const [comment, setComment] = useState('')
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    async function loadReviews() {
        const data = await api(`/services/${service.code}/reviews`)
        setReviews(Array.isArray(data.reviews) ? data.reviews : [])
    }

    useEffect(() => {
        let active = true

        api(`/services/${service.code}/reviews`)
            .then(data => {
                if (active) {
                    setReviews(Array.isArray(data.reviews) ? data.reviews : [])
                }
            })
            .catch(err => {
                if (active) setError(err.message)
            })
            .finally(() => {
                if (active) setLoading(false)
            })

        return () => {
            active = false
        }
    }, [service.code])

    async function submit(event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        setMessage('')

        try {
            await api(`/services/${service.code}/reviews`, {
                method: 'POST',
                body: {
                    rating: Number(rating),
                    comment
                }
            })

            setComment('')
            await loadReviews()
            await onUpdated()
            setMessage('Отзыв сохранён')
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    async function remove(code) {
        if (!window.confirm('Удалить ваш отзыв?')) return

        setBusy(true)
        setError('')
        setMessage('')

        try {
            await api(`/reviews/${code}`, {
                method: 'DELETE'
            })

            await loadReviews()
            await onUpdated()
            setMessage('Отзыв удалён')
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="panel reviews-panel">
            <div className="section-heading">
                <div>
                    <div className="eyebrow">МНЕНИЯ КЛИЕНТОВ</div>
                    <h2>Отзывы: {service.title}</h2>
                </div>

                <button
                    className="button button-ghost"
                    onClick={onClose}
                >
                    Закрыть
                </button>
            </div>

            {error && (
                <div className="alert alert-error">{error}</div>
            )}

            {message && (
                <div className="alert alert-success">{message}</div>
            )}

            {user ? (
                <form className="review-form" onSubmit={submit}>
                    <label>
                        Оценка
                        <select
                            value={rating}
                            onChange={e => setRating(Number(e.target.value))}
                        >
                            {[5, 4, 3, 2, 1].map(value => (
                                <option key={value} value={value}>
                                    {value} из 5
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="grow">
                        Ваш отзыв
                        <textarea
                            required
                            minLength={3}
                            maxLength={1000}
                            rows={3}
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Расскажите о качестве услуги"
                        />
                    </label>

                    <button
                        className="button button-primary"
                        disabled={busy}
                    >
                        {busy ? 'Сохранение...' : 'Сохранить отзыв'}
                    </button>
                </form>
            ) : (
                <div className="empty-inline">
                    Чтобы оставить отзыв, необходимо{' '}
                    <button className="text-button" onClick={onLogin}>
                        войти в аккаунт
                    </button>.
                </div>
            )}

            {loading ? (
                <p className="muted">Загрузка отзывов...</p>
            ) : reviews.length === 0 ? (
                <p className="muted">Пока нет отзывов.</p>
            ) : (
                <div className="review-list">
                    {reviews.map(review => (
                        <div className="review" key={review.code}>
                            <div className="review-heading">
                                <strong>{review.author_name}</strong>
                                <span className="stars">
                  {'★'.repeat(review.rating)}
                                    {'☆'.repeat(5 - review.rating)}
                </span>
                            </div>

                            <p>{review.comment}</p>

                            <div className="review-bottom">
                <span>
                  {new Date(review.created_at).toLocaleDateString('ru-RU')}
                </span>

                                {user?.code === review.author_code && (
                                    <button
                                        className="text-button danger"
                                        disabled={busy}
                                        onClick={() => remove(review.code)}
                                    >
                                        Удалить
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}
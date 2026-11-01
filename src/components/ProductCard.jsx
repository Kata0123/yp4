import { useState } from 'react'
import { money } from '../api/api.js'

// Показывает информацию об услуге, изображение, рейтинг и действия.
export default function ProductCard({
                                        service,
                                        onAdd,
                                        onReviews,
                                        busy
                                    }) {
    const [imageError, setImageError] = useState(false)

    const rating = Number(service.average_rating || 0)
    const category = service.category_name || 'Нет категории'

    const imageUrl = service.image_name
        ? `/images/${service.image_name}`
        : null

    return (
        <article className="service-card">
            <div className="service-card-top">
                <span className="category-chip">
                    {category}
                </span>

                <span className="service-rating">
                    ★ {rating > 0 ? rating.toFixed(1) : '—'}
                </span>
            </div>

            <div className="service-image">
                {imageUrl && !imageError ? (
                    <img
                        src={imageUrl}
                        alt={service.title}
                        loading="lazy"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className="service-image-placeholder">
                        <span>⌂</span>
                        <small>Нет изображения</small>
                    </div>
                )}
            </div>

            <h3>{service.title}</h3>

            <p className="service-description">
                {service.description}
            </p>

            <div className="service-duration">
                <span>◷</span>
                <span>{service.duration_minutes} мин.</span>
            </div>

            <div className="service-footer">
                <strong>{money(service.price)}</strong>

                <button
                    type="button"
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => onAdd(service)}
                >
                    В корзину
                </button>
            </div>

            <button
                type="button"
                className="text-button reviews-link"
                onClick={() => onReviews(service)}
            >
                Отзывы ({service.review_count || 0})
            </button>
        </article>
    )
}
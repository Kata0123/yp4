import { money } from './api/api.js'

export default function ProductCard({ service, onAdd, onReviews, busy }) {
    return (
        <article className="service-card">
            <div className="service-card-top">
                <span className="category-chip">{service.category_name}</span>
                <span className="service-rating">
          ★ {Number(service.average_rating) > 0
                    ? Number(service.average_rating).toFixed(1)
                    : '—'}
        </span>
            </div>

            <div className="service-symbol">
                {service.category_name === 'Уборка'
                    ? '✦'
                    : service.category_name === 'Ремонт'
                        ? '⚙'
                        : service.category_name === 'Химчистка'
                            ? '◈'
                            : '⌂'}
            </div>

            <h3>{service.title}</h3>
            <p className="service-description">{service.description}</p>

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
                Отзывы ({service.review_count})
            </button>
        </article>
    )
}
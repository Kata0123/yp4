import { useState } from 'react'
import ProductCard from '../components/ProductCard.jsx'
import ReviewsPanel from './ReviewsPanel.jsx'

const emptyFilters = {
    q: '',
    categoryCode: '',
    minPrice: '',
    maxPrice: ''
}

export default function CatalogPage({
                                        user,
                                        services = [],
                                        categories = [],
                                        loading,
                                        busy,
                                        onFilter,
                                        onAdd,
                                        onLogin,
                                        onReviewsUpdated
                                    }) {
    const [filters, setFilters] = useState(emptyFilters)
    const [selectedService, setSelectedService] = useState(null)
    const [error, setError] = useState('')

    function change(key, value) {
        setFilters(previous => ({
            ...previous,
            [key]: value
        }))

        setError('')
    }

    function validatePrices() {
        const hasMin = filters.minPrice !== ''
        const hasMax = filters.maxPrice !== ''

        const min = hasMin ? Number(filters.minPrice) : null
        const max = hasMax ? Number(filters.maxPrice) : null

        if (
            hasMin &&
            (!Number.isFinite(min) || min < 0 || min > 999999)
        ) {
            return 'Минимальная цена должна быть от 0 до 999999'
        }

        if (
            hasMax &&
            (!Number.isFinite(max) || max < 0 || max > 999999)
        ) {
            return 'Максимальная цена должна быть от 0 до 999999'
        }

        if (
            hasMin &&
            hasMax &&
            min > max
        ) {
            return 'Минимальная цена не может превышать максимальную'
        }

        return ''
    }

    async function submit(event) {
        event.preventDefault()
        setError('')

        const priceError = validatePrices()

        if (priceError) {
            setError(priceError)
            return
        }

        const query = {
            q: filters.q.trim(),
            categoryCode: filters.categoryCode,
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice
        }

        try {
            await onFilter(query)
        } catch (err) {
            setError(err.message)
        }
    }

    async function reset() {
        const next = { ...emptyFilters }

        setFilters(next)
        setError('')

        try {
            await onFilter(next)
        } catch (err) {
            setError(err.message)
        }
    }

    const serviceList = Array.isArray(services)
        ? services
        : []

    const categoryList = Array.isArray(categories)
        ? categories
        : []

    return (
        <section id="catalog" className="page-section">
            <div className="section-heading">
                <div>
                    <div className="eyebrow">
                        ЧТО МЫ ПРЕДЛАГАЕМ
                    </div>

                    <h1>Каталог услуг</h1>

                    <p className="muted">
                        Найдите то, что нужно именно вашему дому.
                    </p>
                </div>

                <span className="results-count">
          {serviceList.length} услуг
        </span>
            </div>

            <form
                className="filters"
                onSubmit={submit}
            >
                <label className="filter-search">
                    Поиск

                    <input
                        type="search"
                        maxLength={100}
                        placeholder="Название услуги..."
                        value={filters.q}
                        onChange={e => change('q', e.target.value)}
                    />
                </label>

                <label>
                    Категория

                    <select
                        value={filters.categoryCode}
                        onChange={e => change('categoryCode', e.target.value)}
                    >
                        <option value="">
                            Все категории
                        </option>

                        {categoryList.map(category => (
                            <option
                                key={category.code}
                                value={category.code}
                            >
                                {category.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    Цена от

                    <input
                        type="number"
                        min="0"
                        max="999999"
                        step="0.01"
                        placeholder="0"
                        value={filters.minPrice}
                        onChange={e => change('minPrice', e.target.value)}
                    />
                </label>

                <label>
                    Цена до

                    <input
                        type="number"
                        min="0"
                        max="999999"
                        step="0.01"
                        placeholder="Любая"
                        value={filters.maxPrice}
                        onChange={e => change('maxPrice', e.target.value)}
                    />
                </label>

                <button
                    type="submit"
                    className="button button-primary"
                    disabled={loading}
                >
                    {loading ? 'Поиск...' : 'Найти'}
                </button>

                <button
                    type="button"
                    className="button button-ghost"
                    disabled={loading}
                    onClick={reset}
                >
                    Сбросить
                </button>
            </form>

            {error && (
                <div
                    className="alert alert-error"
                    role="alert"
                >
                    {error}
                </div>
            )}

            {loading ? (
                <div className="panel">
                    Загрузка каталога...
                </div>
            ) : serviceList.length === 0 ? (
                <div className="panel empty-state">
                    <h2>Услуги не найдены</h2>

                    <p>
                        Попробуйте выбрать другую категорию
                        или изменить параметры поиска.
                    </p>
                </div>
            ) : (
                <div className="services-grid">
                    {serviceList.map(service => (
                        <ProductCard
                            key={service.code}
                            service={service}
                            busy={busy}
                            onAdd={onAdd}
                            onReviews={setSelectedService}
                        />
                    ))}
                </div>
            )}

            {selectedService && (
                <ReviewsPanel
                    key={selectedService.code}
                    service={selectedService}
                    user={user}
                    onClose={() => setSelectedService(null)}
                    onLogin={onLogin}
                    onUpdated={onReviewsUpdated}
                />
            )}
        </section>
    )
}
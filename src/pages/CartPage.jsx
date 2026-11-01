import { useEffect, useState } from 'react'
import { money, localToday } from '../api/api.js'
import { validateAddress } from '../utils/validation.js'

// Показывает корзину и проверяет адрес и дату перед оформлением заказа.
export default function CartPage({
                                     cart,
                                     user,
                                     loading,
                                     busy,
                                     onQuantity,
                                     onRemove,
                                     onCheckout
                                 }) {
    const items = Array.isArray(cart?.items) ? cart.items : []
    const total = Number(cart?.total || 0)

    const [address, setAddress] = useState('')
    const [deliveryDate, setDeliveryDate] = useState(localToday())
    const [comment, setComment] = useState('')
    const [errors, setErrors] = useState({})
    const [touched, setTouched] = useState({})

    // Подставляет адрес пользователя при загрузке или обновлении профиля.
    useEffect(() => {
        setAddress(user?.default_address || '')
        setErrors({})
        setTouched({})
    }, [user?.code, user?.default_address])

    // Обновляет адрес и проверяет его после изменения.
    function changeAddress(value) {
        const next = value.slice(0, 250)

        setAddress(next)

        if (touched.address) {
            setErrors(previous => ({
                ...previous,
                address: validateAddress(next)
            }))
        }
    }

    // Проверяет корректность даты и запрет выбора прошедшего дня.
    function validateDate(value) {
        if (!value) {
            return 'Укажите дату оказания услуги'
        }

        const date = new Date(`${value}T00:00:00Z`)

        if (
            Number.isNaN(date.getTime()) ||
            date.toISOString().slice(0, 10) !== value
        ) {
            return 'Введите корректную дату'
        }

        if (value < localToday()) {
            return 'Дата оказания услуги не может быть в прошлом'
        }

        if (value > '2100-12-31') {
            return 'Указана слишком далёкая дата'
        }

        return ''
    }

    // Обновляет дату выполнения услуги и проверяет допустимость значения.
    function changeDate(value) {
        setDeliveryDate(value)

        if (touched.deliveryDate) {
            setErrors(previous => ({
                ...previous,
                deliveryDate: validateDate(value)
            }))
        }
    }

    // Обновляет комментарий к заказу с ограничением длины.
    function changeComment(value) {
        setComment(value.slice(0, 1000))
    }

    // Проверяет поля заказа и передаёт данные на оформление.
    function submit(event) {
        event.preventDefault()

        const nextErrors = {
            address: validateAddress(address),
            deliveryDate: validateDate(deliveryDate)
        }

        setErrors(nextErrors)
        setTouched({
            address: true,
            deliveryDate: true
        })

        if (nextErrors.address || nextErrors.deliveryDate) {
            return
        }

        if (items.some(item => !item.active)) {
            return
        }

        onCheckout(address.trim(), deliveryDate, comment.trim())
    }

    return (
        <section className="page-section">
            <div className="section-heading">
                <div>
                    <div className="eyebrow">
                        ВАШ ВЫБОР
                    </div>

                    <h1>Корзина</h1>

                    <p className="muted">
                        Выбранные услуги сохраняются в вашем аккаунте.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="panel">
                    Загрузка корзины...
                </div>
            ) : items.length === 0 ? (
                <div className="panel empty-state">
                    <div className="empty-icon">⌑</div>
                    <h2>Корзина пока пуста</h2>
                    <p>Добавьте услуги из каталога.</p>
                </div>
            ) : (
                <div className="checkout-grid">
                    <div className="panel">
                        <h2>Выбранные услуги</h2>

                        <div className="cart-list">
                            {items.map(item => (
                                <div
                                    className="cart-item"
                                    key={item.service_code}
                                >
                                    <div className="grow">
                                        <span className="category-chip">
                                            {item.category_name}
                                        </span>

                                        <h3>{item.title}</h3>

                                        <p className="muted">
                                            {money(item.price)} за услугу
                                        </p>

                                        {!item.active && (
                                            <p className="danger">
                                                Услуга временно недоступна
                                            </p>
                                        )}
                                    </div>

                                    <div className="quantity">
                                        <button
                                            type="button"
                                            disabled={busy || item.quantity <= 1}
                                            onClick={() => onQuantity(
                                                item.service_code,
                                                item.quantity - 1
                                            )}
                                        >
                                            −
                                        </button>

                                        <strong>{item.quantity}</strong>

                                        <button
                                            type="button"
                                            disabled={busy || item.quantity >= 99}
                                            onClick={() => onQuantity(
                                                item.service_code,
                                                item.quantity + 1
                                            )}
                                        >
                                            +
                                        </button>
                                    </div>

                                    <div className="cart-price">
                                        <strong>
                                            {money(item.subtotal)}
                                        </strong>

                                        <button
                                            type="button"
                                            className="text-button danger"
                                            disabled={busy}
                                            onClick={() => onRemove(item.service_code)}
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="panel checkout-card">
                        <h2>Оформление заказа</h2>

                        <form
                            className="form-stack"
                            onSubmit={submit}
                            noValidate
                        >
                            <label>
                                Адрес оказания услуги

                                <textarea
                                    required
                                    minLength={10}
                                    maxLength={250}
                                    rows={3}
                                    value={address}
                                    onChange={e => changeAddress(e.target.value)}
                                    onBlur={() => {
                                        setTouched(previous => ({
                                            ...previous,
                                            address: true
                                        }))

                                        setErrors(previous => ({
                                            ...previous,
                                            address: validateAddress(address)
                                        }))
                                    }}
                                    placeholder="Москва, улица Ленина, дом 15, квартира 24"
                                    className={
                                        touched.address && errors.address
                                            ? 'input-error'
                                            : ''
                                    }
                                />

                                {touched.address && errors.address && (
                                    <span className="field-error" role="alert">
                                        {errors.address}
                                    </span>
                                )}

                                <span className="field-hint">
                                    Укажите город, улицу и номер дома через запятую.
                                </span>
                            </label>

                            <label>
                                Дата оказания услуги

                                <input
                                    required
                                    type="date"
                                    min={localToday()}
                                    max="2100-12-31"
                                    value={deliveryDate}
                                    onChange={e => changeDate(e.target.value)}
                                    onBlur={() => {
                                        setTouched(previous => ({
                                            ...previous,
                                            deliveryDate: true
                                        }))

                                        setErrors(previous => ({
                                            ...previous,
                                            deliveryDate: validateDate(deliveryDate)
                                        }))
                                    }}
                                    className={
                                        touched.deliveryDate && errors.deliveryDate
                                            ? 'input-error'
                                            : ''
                                    }
                                />

                                {touched.deliveryDate && errors.deliveryDate && (
                                    <span className="field-error" role="alert">
                                        {errors.deliveryDate}
                                    </span>
                                )}
                            </label>

                            <label>
                                Комментарий к заказу

                                <textarea
                                    rows={4}
                                    maxLength={1000}
                                    value={comment}
                                    onChange={e => changeComment(e.target.value)}
                                    placeholder="Например: позвоните за час, домофон не работает, вход со двора..."
                                />

                                <span className="field-hint">
                                    Необязательно. Можно написать любую дополнительную информацию.
                                    {` ${comment.length}/1000`}
                                </span>
                            </label>

                            <div className="order-total">
                                <span>Итого</span>
                                <strong>{money(total)}</strong>
                            </div>

                            <button
                                type="submit"
                                className="button button-primary button-wide"
                                disabled={
                                    busy ||
                                    items.some(item => !item.active)
                                }
                            >
                                {busy
                                    ? 'Оформление...'
                                    : 'Оформить заказ'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </section>
    )
}
import { money } from '../api/api.js'

const statusNames = {
    new: 'Новый',
    confirmed: 'Подтверждён',
    completed: 'Выполнен',
    cancelled: 'Отменён'
}

export default function OrdersPage({
                                       orders = [],
                                       loading,
                                       busy,
                                       onCancel
                                   }) {
    const list = Array.isArray(orders) ? orders : []

    return (
        <section className="page-section">
            <div className="section-heading">
                <div>
                    <div className="eyebrow">
                        ИСТОРИЯ ПОКУПОК
                    </div>

                    <h1>Мои заказы</h1>

                    <p className="muted">
                        Здесь отображаются все оформленные заказы.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="panel">
                    Загрузка заказов...
                </div>
            ) : list.length === 0 ? (
                <div className="panel empty-state">
                    <h2>Заказов пока нет</h2>
                    <p>После оформления заказа он появится здесь.</p>
                </div>
            ) : (
                <div className="orders-list">
                    {list.map(order => {
                        const canCancel = ['new', 'confirmed'].includes(order.status)

                        const items = Array.isArray(order.items)
                            ? order.items
                            : []

                        return (
                            <article
                                className="panel order-card"
                                key={order.code}
                            >
                                <div className="order-heading">
                                    <div>
                                        <h2>
                                            Заказ от{' '}
                                            {new Date(order.created_at).toLocaleDateString('ru-RU')}
                                        </h2>

                                        <span className="muted">
                      Номер: {order.code?.slice(0, 8).toUpperCase()}
                    </span>
                                    </div>

                                    <span className={`status status-${order.status}`}>
                    {statusNames[order.status] || order.status}
                  </span>
                                </div>

                                <div className="order-details">
                                    <p>
                                        <strong>Адрес:</strong> {order.address}
                                    </p>

                                    <p>
                                        <strong>Дата:</strong> {order.delivery_date}
                                    </p>

                                    {order.comment && (
                                        <p>
                                            <strong>Комментарий:</strong>{' '}
                                            <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {order.comment}
                      </span>
                                        </p>
                                    )}
                                </div>

                                <div className="order-items">
                                    {items.map((item, index) => (
                                        <div key={`${order.code}-${index}`}>
                      <span>
                        {item.title} × {item.quantity}
                      </span>

                                            <strong>
                                                {money(
                                                    Number(item.price) * Number(item.quantity)
                                                )}
                                            </strong>
                                        </div>
                                    ))}
                                </div>

                                <div className="order-total">
                                    <span>Сумма заказа</span>
                                    <strong>{money(order.total)}</strong>
                                </div>

                                {canCancel && (
                                    <div style={{ marginTop: '18px' }}>
                                        <button
                                            type="button"
                                            className="button button-danger"
                                            disabled={busy}
                                            onClick={() => onCancel(order.code)}
                                        >
                                            {busy ? 'Подождите...' : 'Отменить заказ'}
                                        </button>
                                    </div>
                                )}

                                {order.status === 'cancelled' && (
                                    <p className="muted" style={{ marginTop: '15px', marginBottom: 0 }}>
                                        Этот заказ был отменён.
                                    </p>
                                )}
                            </article>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
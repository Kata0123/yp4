// Отображает навигацию, сведения о пользователе, корзину и переключатель темы.
export default function Header({
                                   user,
                                   cart,
                                   view,
                                   navigate,
                                   logout,
                                   busy,
                                   theme,
                                   onToggleTheme
                               }) {
    const items = Array.isArray(cart?.items) ? cart.items : []

    const count = items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
    )

    return (
        <header className="site-header">
            <div className="container header-inner">
                <button
                    type="button"
                    className="brand"
                    onClick={() => navigate('catalog')}
                >
                    <span className="brand-mark">⌂</span>

                    <span>
                        <strong>ДомСервис</strong>
                        <small>Услуги для вашего дома</small>
                    </span>
                </button>

                <nav className="main-nav">
                    <button
                        className={view === 'catalog' ? 'nav-active' : ''}
                        onClick={() => navigate('catalog')}
                    >
                        Каталог
                    </button>

                    {user && (
                        <>
                            <button
                                className={view === 'cart' ? 'nav-active' : ''}
                                onClick={() => navigate('cart')}
                            >
                                Корзина

                                {count > 0 && (
                                    <span className="nav-count">
                                        {count}
                                    </span>
                                )}
                            </button>

                            <button
                                className={view === 'orders' ? 'nav-active' : ''}
                                onClick={() => navigate('orders')}
                            >
                                Заказы
                            </button>

                            <button
                                className={view === 'profile' ? 'nav-active' : ''}
                                onClick={() => navigate('profile')}
                            >
                                Профиль
                            </button>

                            {user.role === 'admin' && (
                                <button
                                    className={view === 'admin' ? 'nav-active' : ''}
                                    onClick={() => navigate('admin')}
                                >
                                    Админ
                                </button>
                            )}
                        </>
                    )}
                </nav>

                <div className="header-actions">
                    <button
                        type="button"
                        className="button button-ghost theme-switch"
                        onClick={onToggleTheme}
                        title={
                            theme === 'dark'
                                ? 'Включить светлую тему'
                                : 'Включить тёмную тему'
                        }
                        aria-label={
                            theme === 'dark'
                                ? 'Включить светлую тему'
                                : 'Включить тёмную тему'
                        }
                    >
                        {theme === 'dark' ? '☀' : '☾'}
                    </button>

                    {user ? (
                        <>
                            <span className="user-greeting">
                                {user.full_name?.split(' ')[0] || 'Пользователь'}
                            </span>

                            <button
                                className="button button-ghost"
                                onClick={logout}
                                disabled={busy}
                            >
                                Выйти
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className="button button-ghost"
                                onClick={() => navigate('login')}
                            >
                                Войти
                            </button>

                            <button
                                className="button button-primary"
                                onClick={() => navigate('register')}
                            >
                                Регистрация
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}

import { useCallback, useEffect, useState } from 'react'
import { api } from './api/api.js'

import Header from './components/Header.jsx'
import CatalogPage from './pages/CatalogPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import CartPage from './pages/CartPage.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import AdminPage from './pages/AdminPage.jsx'

const EMPTY_CART = {
  items: [],
  total: 0
}

const EMPTY_FILTERS = {
  q: '',
  categoryCode: '',
  minPrice: '',
  maxPrice: ''
}

// Получает сохранённую тему оформления; по умолчанию использует светлую.
function getInitialTheme() {
  try {
    return localStorage.getItem('domservice_theme') === 'dark'
        ? 'dark'
        : 'light'
  } catch {
    return 'light'
  }
}

// Управляет состоянием приложения, навигацией, авторизацией и обменом данными с сервером.
export default function App() {
  const resetToken = new URLSearchParams(
      window.location.search
  ).get('reset')

  const [view, setView] = useState(
      resetToken ? 'reset' : 'catalog'
  )

  const [theme, setTheme] = useState(getInitialTheme)
  const [user, setUser] = useState(null)
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [cart, setCart] = useState(EMPTY_CART)
  const [orders, setOrders] = useState([])
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const [booting, setBooting] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [cartLoading, setCartLoading] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    try {
      localStorage.setItem('domservice_theme', theme)
    } catch {
      return
    }
  }, [theme])

  // Переключает светлую и тёмную темы интерфейса.
  function toggleTheme() {
    setTheme(previous =>
        previous === 'dark' ? 'light' : 'dark'
    )
  }

  const showError = useCallback(error => {
    setNotice({
      type: 'error',
      text: error?.message || 'Произошла неизвестная ошибка'
    })
  }, [])

  // Загружает список категорий и услуг с учётом заданных фильтров.
  const refreshCatalog = useCallback(async (currentFilters = EMPTY_FILTERS) => {
    setCatalogLoading(true)

    try {
      const query = new URLSearchParams()

      for (const [key, value] of Object.entries(currentFilters)) {
        if (value !== '' && value !== null && value !== undefined) {
          query.set(key, value)
        }
      }

      const suffix = query.size > 0
          ? `?${query.toString()}`
          : ''

      const [categoryData, serviceData] = await Promise.all([
        api('/categories'),
        api(`/services${suffix}`)
      ])

      setCategories(
          Array.isArray(categoryData.categories)
              ? categoryData.categories
              : []
      )

      setServices(
          Array.isArray(serviceData.services)
              ? serviceData.services
              : []
      )
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  // Обновляет содержимое корзины авторизованного пользователя через API.
  const refreshCart = useCallback(async () => {
    const data = await api('/cart')

    setCart({
      items: Array.isArray(data.items) ? data.items : [],
      total: Number(data.total || 0)
    })
  }, [])

  // Получает историю заказов текущего пользователя.
  const refreshOrders = useCallback(async () => {
    const data = await api('/orders')

    setOrders(
        Array.isArray(data.orders) ? data.orders : []
    )
  }, [])

  useEffect(() => {
    let active = true

    // Проверяет текущую сессию и загружает необходимые данные при запуске.
    async function initialize() {
      try {
        const [authData, categoryData, serviceData] = await Promise.all([
          api('/auth/me'),
          api('/categories'),
          api('/services')
        ])

        if (!active) return

        setUser(authData.user || null)

        setCategories(
            Array.isArray(categoryData.categories)
                ? categoryData.categories
                : []
        )

        setServices(
            Array.isArray(serviceData.services)
                ? serviceData.services
                : []
        )
      } catch (error) {
        if (active) showError(error)
      } finally {
        if (active) setBooting(false)
      }
    }

    initialize()

    return () => {
      active = false
    }
  }, [showError])

  useEffect(() => {
    let active = true

    if (!user) {
      setCart(EMPTY_CART)
      setOrders([])
      setCartLoading(false)
      return
    }

    setCartLoading(true)

    api('/cart')
        .then(data => {
          if (!active) return

          setCart({
            items: Array.isArray(data.items) ? data.items : [],
            total: Number(data.total || 0)
          })
        })
        .catch(error => {
          if (active) showError(error)
        })
        .finally(() => {
          if (active) setCartLoading(false)
        })

    return () => {
      active = false
    }
  }, [user?.code, showError])

  useEffect(() => {
    let active = true

    if (!user || view !== 'orders') {
      return
    }

    setOrdersLoading(true)

    api('/orders')
        .then(data => {
          if (active) {
            setOrders(
                Array.isArray(data.orders) ? data.orders : []
            )
          }
        })
        .catch(error => {
          if (active) showError(error)
        })
        .finally(() => {
          if (active) setOrdersLoading(false)
        })

    return () => {
      active = false
    }
  }, [view, user?.code, showError])

  // Выполняет асинхронное действие с общим управлением загрузкой и ошибками.
  async function run(action) {
    setBusy(true)
    setNotice(null)

    try {
      await action()
    } catch (error) {
      showError(error)
    } finally {
      setBusy(false)
    }
  }

  // Переключает раздел приложения с учётом доступа пользователя.
  function navigate(page) {
    const privatePages = ['cart', 'orders', 'profile']

    if (privatePages.includes(page) && !user) {
      setView('login')
      setNotice({
        type: 'error',
        text: 'Сначала войдите в аккаунт'
      })
      return
    }

    if (page === 'admin' && user?.role !== 'admin') {
      setNotice({
        type: 'error',
        text: 'Доступ разрешён только администратору'
      })
      return
    }

    setView(page)
    setNotice(null)

    if (page === 'catalog') {
      refreshCatalog(filters).catch(showError)
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // Применяет параметры поиска и фильтрации к каталогу.
  async function filterCatalog(newFilters) {
    await refreshCatalog(newFilters)
    setFilters(newFilters)
  }

  // Добавляет выбранную услугу в корзину через серверный API.
  async function addToCart(service) {
    if (!user) {
      navigate('login')
      return
    }

    await run(async () => {
      await api('/cart', {
        method: 'POST',
        body: {
          serviceCode: service.code,
          quantity: 1
        }
      })

      await refreshCart()

      setNotice({
        type: 'success',
        text: `Услуга «${service.title}» добавлена в корзину`
      })
    })
  }

  // Изменяет количество выбранной услуги в корзине.
  async function changeQuantity(code, quantity) {
    if (quantity < 1 || quantity > 99) return

    await run(async () => {
      await api(`/cart/${code}`, {
        method: 'PATCH',
        body: { quantity }
      })

      await refreshCart()
    })
  }

  // Удаляет услугу из корзины пользователя.
  async function removeFromCart(code) {
    await run(async () => {
      await api(`/cart/${code}`, {
        method: 'DELETE'
      })

      await refreshCart()

      setNotice({
        type: 'success',
        text: 'Услуга удалена из корзины'
      })
    })
  }

  // Оформляет заказ и обновляет корзину и историю заказов.
  async function checkout(address, deliveryDate, comment) {
    await run(async () => {
      await api('/orders', {
        method: 'POST',
        body: {
          address,
          deliveryDate,
          comment
        }
      })

      await refreshCart()
      await refreshOrders()
      setView('orders')

      setNotice({
        type: 'success',
        text: 'Заказ успешно оформлен'
      })
    })
  }

  // Отправляет запрос на отмену выбранного заказа.
  async function cancelOrder(code) {
    if (!window.confirm('Вы действительно хотите отменить этот заказ?')) {
      return
    }

    await run(async () => {
      await api(`/orders/${code}/cancel`, {
        method: 'PATCH'
      })

      await refreshOrders()

      setNotice({
        type: 'success',
        text: 'Заказ отменён'
      })
    })
  }

  // Завершает сессию и сбрасывает пользовательские данные в интерфейсе.
  async function logout() {
    await run(async () => {
      await api('/auth/logout', {
        method: 'POST'
      })

      setUser(null)
      setCart(EMPTY_CART)
      setOrders([])
      setView('catalog')

      setNotice({
        type: 'success',
        text: 'Вы вышли из аккаунта'
      })
    })
  }

  // Обновляет данные пользователя после успешной авторизации.
  function loginSuccess(loggedUser) {
    setUser(loggedUser)
    setView('catalog')

    setNotice({
      type: 'success',
      text: `Добро пожаловать, ${loggedUser.full_name}!`
    })
  }

  // Перезагружает данные после изменений в административной панели.
  async function adminUpdated() {
    await refreshCatalog(filters)

    if (user) {
      await refreshCart()
      await refreshOrders()
    }
  }

  if (booting) {
    return (
        <div className="boot-screen">
          <div className="brand-mark">⌂</div>
          <h2>ДомСервис</h2>
          <p>Загрузка приложения...</p>
        </div>
    )
  }

  return (
      <div className="app-shell">
        <Header
            user={user}
            cart={cart}
            view={view}
            navigate={navigate}
            logout={logout}
            busy={busy}
            theme={theme}
            onToggleTheme={toggleTheme}
        />

        <main className="container main-content">
          {notice && (
              <div className={`alert alert-${notice.type} global-notice`}>
                <span>{notice.text}</span>

                <button
                    type="button"
                    onClick={() => setNotice(null)}
                >
                  ×
                </button>
              </div>
          )}

          {view === 'catalog' && (
              <CatalogPage
                  user={user}
                  services={services}
                  categories={categories}
                  loading={catalogLoading}
                  busy={busy}
                  onFilter={filterCatalog}
                  onAdd={addToCart}
                  onLogin={() => navigate('login')}
                  onReviewsUpdated={() => refreshCatalog(filters)}
              />
          )}

          {['login', 'register', 'forgot', 'reset'].includes(view) && (
              <AuthPage
                  mode={view}
                  token={resetToken}
                  onMode={navigate}
                  onSuccess={loginSuccess}
                  onNotice={text => setNotice({
                    type: 'success',
                    text
                  })}
              />
          )}

          {view === 'cart' && user && (
              <CartPage
                  cart={cart}
                  user={user}
                  loading={cartLoading}
                  busy={busy}
                  onQuantity={changeQuantity}
                  onRemove={removeFromCart}
                  onCheckout={checkout}
              />
          )}

          {view === 'orders' && user && (
              <OrdersPage
                  orders={orders}
                  loading={ordersLoading}
                  busy={busy}
                  onCancel={cancelOrder}
              />
          )}

          {view === 'profile' && user && (
              <ProfilePage
                  user={user}
                  onUpdate={setUser}
              />
          )}

          {view === 'admin' && user?.role === 'admin' && (
              <AdminPage
                  onUpdated={adminUpdated}
              />
          )}
        </main>
      </div>
  )
}

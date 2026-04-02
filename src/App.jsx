import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import AccountPage from './pages/AccountPage.jsx'
import CreatePage from './pages/CreatePage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const REFRESH_INTERVAL_MS = 10 * 60 * 1000

function normalizeBaseUrl(url) {
  const trimmed = url.trim()

  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `http://${trimmed}`
}

function getIsLoggedIn() {
  try {
    return (
      window.localStorage.getItem('isAuthenticated') === 'true' ||
      Boolean(window.localStorage.getItem('authToken'))
    )
  } catch {
    return false
  }
}

function clearAuthState() {
  window.localStorage.removeItem('isAuthenticated')
  window.localStorage.removeItem('authToken')
  window.localStorage.removeItem('refreshToken')
}

function App() {
  const navigate = useNavigate()
  const isLoggedIn = getIsLoggedIn()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const logoutEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/auth/logout'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/auth/logout`
  }, [])

  const refreshEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/auth/refresh'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/auth/refresh`
  }, [])

  useEffect(() => {
    if (!isLoggedIn) {
      return undefined
    }

    let isActive = true

    const refreshSession = async () => {
      try {
        const response = await fetch(refreshEndpoint, {
          method: 'POST',
          credentials: 'include',
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok || payload?.success === false) {
          // Do not force local logout from background refresh attempts.
          // Users should only be logged out via explicit logout action.
          return
        }

        window.localStorage.setItem('isAuthenticated', 'true')
      } catch {
        if (!isActive) {
          return
        }

        // Network or parsing errors should not force a logout.
      }
    }

    refreshSession()
    const intervalId = window.setInterval(refreshSession, REFRESH_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [isLoggedIn, navigate, refreshEndpoint])

  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      await fetch(logoutEndpoint, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Continue with local cleanup even if logout request fails.
    } finally {
      clearAuthState()
      setIsLoggingOut(false)
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        {isLoggedIn ? (
          <div className="auth-actions">
            <button
              type="button"
              className="auth-logout-button"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
            <NavLink to="/account" className="auth-account-button" aria-label="Account">
              <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                <path d="M12 12.2a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Zm0 2.1c-4.4 0-8 2.5-8 5.6v1.1h16v-1.1c0-3.1-3.6-5.6-8-5.6Z" />
              </svg>
            </NavLink>
          </div>
        ) : (
          <p className="brand">Clove</p>
        )}
        <nav className="topnav" aria-label="Main navigation">
          {isLoggedIn ? (
            <>
              <NavLink to="/create">Create</NavLink>
              <NavLink to="/" end>
                Home
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </nav>
      </header>

      <main className="page-wrap">
        <Routes>
          <Route
            path="/"
            element={isLoggedIn ? <HomePage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/login"
            element={isLoggedIn ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route
            path="/register"
            element={isLoggedIn ? <Navigate to="/" replace /> : <RegisterPage />}
          />
          <Route
            path="/account"
            element={isLoggedIn ? <AccountPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/create"
            element={isLoggedIn ? <CreatePage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="*"
            element={<Navigate to={isLoggedIn ? '/' : '/login'} replace />}
          />
        </Routes>
      </main>
    </div>
  )
}

export default App

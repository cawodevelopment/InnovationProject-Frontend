import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toUserSafeErrorMessage } from '../utils/userSafeError'

const initialForm = {
  email: '',
  password: '',
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

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

function validateForm(values) {
  const errors = {}

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Invalid email address'
  }

  if (!values.password) {
    errors.password = 'Password is required'
  }

  return errors
}

function LoginPage() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiResult, setApiResult] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const loginEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/auth/login'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/auth/login`
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }))

    setErrors((previous) => ({
      ...previous,
      [name]: '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = validateForm(formData)
    setErrors(nextErrors)
    setApiResult(null)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(loginEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
        }),
      })

      const payload = await response.json()

      if (!response.ok || payload?.success === false) {
        setApiResult({
          type: 'error',
          message: toUserSafeErrorMessage(payload?.error?.message, 'Invalid email or password'),
        })
        return
      }

      window.localStorage.setItem('isAuthenticated', 'true')

      setApiResult({
        type: 'success',
        message: 'User logged in successfully',
      })

      navigate('/')
    } catch {
      setApiResult({
        type: 'error',
        message: 'Could not connect to the backend. Check your API base URL.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-card register-page">
      <p className="eyebrow">Welcome back</p>
      <h1>Login</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">
            Email address <span className="required-mark" aria-hidden="true">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            autoComplete="email"
          />
          {errors.email ? <p className="error-text">{errors.email}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="password">
            Password <span className="required-mark" aria-hidden="true">*</span>
          </label>
          <div className="password-input-wrap">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((previous) => !previous)}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                  <path d="M3 5.3 4.3 4 20 19.7 18.7 21l-2.9-2.9a11.9 11.9 0 0 1-3.8.6C7 18.7 3 12 3 12s1.5-2.6 4.2-4.6L3 5.3Zm9 10.4a3.7 3.7 0 0 0 1.8-.5l-1.1-1.1a2.2 2.2 0 0 1-2.8-2.8L8.8 10a3.7 3.7 0 0 0 3.2 5.7Zm0-10.4c5 0 9 6.7 9 6.7a15.5 15.5 0 0 1-3.5 3.8l-1.1-1.1A13.8 13.8 0 0 0 19 12a13.8 13.8 0 0 0-7-4.7c-.9.2-1.7.4-2.5.8L8.1 6.7c1.2-.6 2.5-1 3.9-1Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                  <path d="M12 5.3c5 0 9 6.7 9 6.7s-4 6.7-9 6.7-9-6.7-9-6.7 4-6.7 9-6.7Zm0 11a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Zm0-2a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Z" />
                </svg>
              )}
            </button>
          </div>
          {errors.password ? <p className="error-text">{errors.password}</p> : null}
        </div>

        <button type="submit" className="submit-btn" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Login'}
        </button>
      </form>

      {apiResult ? (
        <p className={apiResult.type === 'success' ? 'success-banner' : 'error-banner'}>
          {apiResult.message}
        </p>
      ) : null}

      <p className="muted auth-switch-link">
        Need an account? <Link to="/register">Register here</Link>
      </p>
    </section>
  )
}

export default LoginPage

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

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

function getStatusLabel(status) {
  return String(status).toUpperCase() === 'PUBLISHED' ? 'Recipe' : status
}

function toNumber(value, options = {}) {
  if (value === '' || value === null || value === undefined) {
    return undefined
  }

  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return undefined
  }

  if (options.integer && !Number.isInteger(parsedValue)) {
    return undefined
  }

  if (typeof options.min === 'number' && parsedValue < options.min) {
    return undefined
  }

  if (typeof options.max === 'number' && parsedValue > options.max) {
    return undefined
  }

  return parsedValue
}

function normalizeFilters(safeFilters) {
  const normalized = {
    difficulty: safeFilters.difficulty ? String(safeFilters.difficulty).trim() : undefined,
    minPrepTimeInMinutes: toNumber(safeFilters.minPrepTimeInMinutes, { min: 0, integer: true }),
    maxPrepTimeInMinutes: toNumber(safeFilters.maxPrepTimeInMinutes, { min: 0, integer: true }),
    minCookingTimeInMinutes: toNumber(safeFilters.minCookingTimeInMinutes, { min: 0, integer: true }),
    maxCookingTimeInMinutes: toNumber(safeFilters.maxCookingTimeInMinutes, { min: 0, integer: true }),
    minServings: toNumber(safeFilters.minServings, { min: 1, integer: true }),
    maxServings: toNumber(safeFilters.maxServings, { min: 1, integer: true }),
    minRating: toNumber(safeFilters.minRating, { min: 0, max: 5, integer: true }),
    maxRating: toNumber(safeFilters.maxRating, { min: 0, max: 5, integer: true }),
  }

  return normalized
}

function HomePage() {
  const [recipes, setRecipes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [safeFilters, setSafeFilters] = useState({
    difficulty: '',
    minPrepTimeInMinutes: '',
    maxPrepTimeInMinutes: '',
    minCookingTimeInMinutes: '',
    maxCookingTimeInMinutes: '',
    minServings: '',
    maxServings: '',
    minRating: '',
    maxRating: '',
  })

  const recipesEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/recipes'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes`
  }, [])

  const normalizedFilters = useMemo(() => normalizeFilters(safeFilters), [safeFilters])

  const filtersQueryString = useMemo(() => {
    const queryParams = new URLSearchParams()

    Object.entries(normalizedFilters).forEach(([key, value]) => {
      if (value === undefined) {
        return
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          queryParams.set(key, value.join(','))
        }

        return
      }

      queryParams.set(key, String(value))
    })

    return queryParams.toString()
  }, [normalizedFilters])

  const handleFilterChange = (fieldName) => (event) => {
    setSafeFilters((previous) => ({
      ...previous,
      [fieldName]: event.target.value,
    }))
  }

  useEffect(() => {
    let isActive = true

    const loadRecipes = async () => {
      setIsLoading(true)
      setErrorMessage('')

      const requestUrl = filtersQueryString
        ? `${recipesEndpoint}?${filtersQueryString}`
        : recipesEndpoint

      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          credentials: 'include',
        })

        const payload = await response.json().catch(() => null)

        if (!isActive) {
          return
        }

        if (!response.ok || payload?.success === false) {
          setErrorMessage(payload?.message ?? payload?.error?.message ?? 'Failed to load recipes')
          return
        }

        setRecipes(Array.isArray(payload?.data) ? payload.data : [])
      } catch {
        if (!isActive) {
          return
        }

        setErrorMessage('Failed to load recipes')
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    loadRecipes()

    return () => {
      isActive = false
    }
  }, [filtersQueryString, recipesEndpoint])

  return (
    <section className="home-recipes-page">
      <p className="eyebrow">Home</p>
      <h1>Your recipes</h1>
      <p className="muted">Click any card to view full recipe details.</p>

      <div className="home-filters-bar">
        <div className="home-filters-grid" role="group" aria-label="Recipe filters">
          <select className="home-filter-input home-filter-select" value={safeFilters.difficulty} onChange={handleFilterChange('difficulty')} aria-label="Difficulty">
            <option value="">Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <div className="home-filter-range" aria-label="Prep time range in minutes">
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Prep min" value={safeFilters.minPrepTimeInMinutes} onChange={handleFilterChange('minPrepTimeInMinutes')} />
            <span className="home-filter-range-separator">-</span>
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Max" value={safeFilters.maxPrepTimeInMinutes} onChange={handleFilterChange('maxPrepTimeInMinutes')} />
          </div>
          <div className="home-filter-range" aria-label="Cooking time range in minutes">
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Cook min" value={safeFilters.minCookingTimeInMinutes} onChange={handleFilterChange('minCookingTimeInMinutes')} />
            <span className="home-filter-range-separator">-</span>
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Max" value={safeFilters.maxCookingTimeInMinutes} onChange={handleFilterChange('maxCookingTimeInMinutes')} />
          </div>
          <div className="home-filter-range" aria-label="Servings range">
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Servings min" value={safeFilters.minServings} onChange={handleFilterChange('minServings')} />
            <span className="home-filter-range-separator">-</span>
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Max" value={safeFilters.maxServings} onChange={handleFilterChange('maxServings')} />
          </div>
          <div className="home-filter-range" aria-label="Rating range">
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Rating min" value={safeFilters.minRating} onChange={handleFilterChange('minRating')} />
            <span className="home-filter-range-separator">-</span>
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Max" value={safeFilters.maxRating} onChange={handleFilterChange('maxRating')} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="home-recipes-skeleton-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="home-recipe-skeleton-card">
              <div className="skeleton-line skeleton-status" />
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-title skeleton-title-short" />
              <div className="skeleton-line skeleton-meta" />
              <div className="skeleton-line skeleton-meta skeleton-meta-short" />
            </div>
          ))}
        </div>
      ) : null}

      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

      {!isLoading && !errorMessage ? (
        recipes.length > 0 ? (
          <div className="home-recipes-grid">
            {recipes.map((recipe) => (
              <Link key={recipe.id} to={`/recipes/${recipe.id}`} className="home-recipe-card">
                <p className="home-recipe-status">{getStatusLabel(recipe.status)}</p>
                <h2>{recipe.title}</h2>
                <p className="home-recipe-meta">{recipe.difficulty}</p>
                <p className="home-recipe-meta">
                  {recipe.prepTimeInMinutes + recipe.cookingTimeInMinutes} min total
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="home-recipes-empty">No recipes yet. Create one from the Create page.</div>
        )
      ) : null}
    </section>
  )
}

export default HomePage

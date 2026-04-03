import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

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

function formatList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'None'
  }

  return items.join(', ')
}

function splitCsv(value) {
  if (!value) {
    return undefined
  }

  const items = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : undefined
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
    dietaryPreferences: splitCsv(safeFilters.dietaryPreferences),
    excludeAllergens: splitCsv(safeFilters.excludeAllergens),
  }

  return normalized
}

function RecipeDetailSkeleton() {
  return (
    <div className="recipe-results recipe-results-loading">
      <article className="recipe-card recipe-detail-skeleton">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-title skeleton-title-short" />

        <div className="recipe-highlights recipe-highlights-skeleton">
          <div className="recipe-box">
            <div className="skeleton-line recipe-skeleton-label" />
            <div className="skeleton-line recipe-skeleton-value" />
            <div className="skeleton-line recipe-skeleton-meta" />
          </div>
          <div className="recipe-box">
            <div className="skeleton-line recipe-skeleton-label" />
            <div className="skeleton-line recipe-skeleton-value" />
            <div className="skeleton-line recipe-skeleton-meta recipe-skeleton-meta-short" />
          </div>
          <div className="recipe-box">
            <div className="skeleton-line recipe-skeleton-label" />
            <div className="skeleton-line recipe-skeleton-value" />
            <div className="skeleton-line recipe-skeleton-meta" />
          </div>
          <div className="recipe-box">
            <div className="skeleton-line recipe-skeleton-label" />
            <div className="skeleton-line recipe-skeleton-value" />
            <div className="skeleton-line recipe-skeleton-meta" />
          </div>
        </div>

        <div className="recipe-stats recipe-stats-skeleton">
          <span className="skeleton-line recipe-skeleton-stat" />
          <span className="skeleton-line recipe-skeleton-stat" />
          <span className="skeleton-line recipe-skeleton-stat recipe-skeleton-stat-short" />
        </div>

        <div className="recipe-section recipe-section-skeleton">
          <div className="skeleton-line recipe-skeleton-section-title" />
          <div className="skeleton-line recipe-skeleton-list-line" />
          <div className="skeleton-line recipe-skeleton-list-line" />
          <div className="skeleton-line recipe-skeleton-list-line recipe-skeleton-list-line-short" />
        </div>

        <div className="recipe-section recipe-section-skeleton">
          <div className="skeleton-line recipe-skeleton-section-title recipe-skeleton-section-title-wide" />
          <div className="skeleton-line recipe-skeleton-list-line" />
          <div className="skeleton-line recipe-skeleton-list-line" />
          <div className="skeleton-line recipe-skeleton-list-line" />
          <div className="skeleton-line recipe-skeleton-list-line recipe-skeleton-list-line-short" />
        </div>
      </article>
    </div>
  )
}

function DraftRefinePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { recipeId } = useParams()
  const [recipe, setRecipe] = useState(null)
  const [recipesSnapshot, setRecipesSnapshot] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [refinedRecipe, setRefinedRecipe] = useState(null)
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
    dietaryPreferences: '',
    excludeAllergens: '',
  })

  const recipesEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/recipes'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes`
  }, [])

  useEffect(() => {
    let isActive = true

    const incomingRecipes = Array.isArray(location.state?.recipes) ? location.state.recipes : []
    const incomingRecipe =
      location.state?.recipe && location.state.recipe.id === recipeId ? location.state.recipe : null

    const loadRecipe = async () => {
      if (incomingRecipe) {
        setRecipe(incomingRecipe)
        setRecipesSnapshot(incomingRecipes)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await fetch(recipesEndpoint, {
          method: 'GET',
          credentials: 'include',
        })

        const payload = await response.json().catch(() => null)

        if (!isActive) {
          return
        }

        if (!response.ok || payload?.success === false) {
          setErrorMessage(payload?.message ?? payload?.error?.message ?? 'Failed to load recipe')
          return
        }

        const recipeList = Array.isArray(payload?.data) ? payload.data : []
        const selectedRecipe = recipeList.find((item) => item.id === recipeId)

        if (!selectedRecipe) {
          setErrorMessage('Recipe not found')
          return
        }

        setRecipe(selectedRecipe)
        setRecipesSnapshot(recipeList)
      } catch {
        if (!isActive) {
          return
        }

        setErrorMessage('Failed to load recipe')
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    if (!recipeId) {
      setErrorMessage('Recipe not found')
      setIsLoading(false)
      return () => {
        isActive = false
      }
    }

    loadRecipe()

    return () => {
      isActive = false
    }
  }, [location.state, recipeId, recipesEndpoint])

  const handlePromptKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const handleFilterChange = (fieldName) => (event) => {
    setSafeFilters((previous) => ({
      ...previous,
      [fieldName]: event.target.value,
    }))
  }

  const handleBack = () => {
    const currentRecipe = refinedRecipe ?? recipe
    const baseRecipes = recipesSnapshot.length > 0 ? recipesSnapshot : currentRecipe ? [currentRecipe] : []

    const nextRecipes = baseRecipes.some((item) => item.id === recipeId)
      ? baseRecipes.map((item) => (item.id === recipeId ? { ...item, ...currentRecipe } : item))
      : currentRecipe
        ? [...baseRecipes, currentRecipe]
        : baseRecipes

    navigate('/create', {
      state: {
        recipes: nextRecipes,
      },
    })
  }

  const handleRefine = (event) => {
    event.preventDefault()

    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt) {
      setErrorMessage('Please enter a refine prompt')
      return
    }

    setIsRefining(true)
    setErrorMessage('')
    setRefinedRecipe(null)
    const normalized = normalizeFilters(safeFilters)

    const refineEndpoint = `${recipesEndpoint.replace(/\/$/, '')}/${encodeURIComponent(recipeId)}/refine`

    fetch(refineEndpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ prompt: trimmedPrompt, filters: normalized }),
    })
      .then((response) => response.json().catch(() => null))
      .then((payload) => {
        if (!payload || payload?.success === false) {
          setErrorMessage(payload?.message ?? payload?.error?.message ?? 'Failed to refine recipe')
          setIsRefining(false)
          return
        }

        const nextRecipe = payload.data || payload

        setRefinedRecipe(nextRecipe)
        setRecipesSnapshot((previous) =>
          previous.map((item) => (item.id === recipeId ? { ...item, ...nextRecipe } : item)),
        )
        setPrompt('')
        setIsRefining(false)
      })
      .catch(() => {
        setErrorMessage('Failed to refine recipe')
        setIsRefining(false)
      })
      .finally(() => {
        setIsRefining(false)
      })
  }

  const renderRecipeCard = (recipeData) => (
    <div className="recipe-results">
      <article className="recipe-card">
        <div className="recipe-header">
          <div>
            <h2>{recipeData.title}</h2>
          </div>
        </div>

        <div className="recipe-highlights">
          <div className="recipe-box">
            <h3>Difficulty</h3>
            <p className="recipe-box-value">{recipeData.difficulty}</p>
            <p className="muted compact">Rating: {recipeData.ratingOutOf5}/5</p>
          </div>

          <div className="recipe-box">
            <h3>Allergen notices</h3>
            <p className="recipe-box-value">{formatList(recipeData.allergenNotices)}</p>
          </div>

          <div className="recipe-box">
            <h3>Dietary restrictions</h3>
            <p className="recipe-box-value">{formatList(recipeData.dietaryRestrictions)}</p>
          </div>

          <div className="recipe-box">
            <h3>Nutrition info</h3>
            <p className="recipe-box-value">{recipeData.nutritionInfo?.caloriesKcal ?? 'N/A'} kcal</p>
            <p className="muted compact">
              Protein: {recipeData.nutritionInfo?.proteinG ?? 'N/A'}g · Carbs: {recipeData.nutritionInfo?.carbsG ?? 'N/A'}g · Fat:{' '}
              {recipeData.nutritionInfo?.fatG ?? 'N/A'}g
            </p>
          </div>
        </div>

        <div className="recipe-stats">
          <span>Prep: {recipeData.prepTimeInMinutes} min</span>
          <span>Cook: {recipeData.cookingTimeInMinutes} min</span>
          <span>Servings: {recipeData.servings}</span>
        </div>

        <div className="recipe-section">
          <h3>Ingredients</h3>
          <ul>
            {Array.isArray(recipeData.ingredients)
              ? recipeData.ingredients.map((item) => <li key={item}>{item}</li>)
              : null}
          </ul>
        </div>

        <div className="recipe-section">
          <h3>Instructions</h3>
          <ol>
            {Array.isArray(recipeData.instructions)
              ? recipeData.instructions.map((item) => <li key={item}>{item}</li>)
              : null}
          </ol>
        </div>
      </article>
    </div>
  )

  return (
    <section className="page-card create-page refine-page">
      <p className="eyebrow">Refine</p>
      <button type="button" className="refine-back-button" onClick={handleBack}>
        Back to generate recipes
      </button>

      <div className="refine-filters-row">
        <input
          className="refine-filter-input"
          type="text"
          placeholder="Difficulty"
          aria-label="Difficulty"
          value={safeFilters.difficulty}
          onChange={handleFilterChange('difficulty')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="0"
          step="1"
          placeholder="Min Prep"
          aria-label="Minimum prep time in minutes"
          value={safeFilters.minPrepTimeInMinutes}
          onChange={handleFilterChange('minPrepTimeInMinutes')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="0"
          step="1"
          placeholder="Max Prep"
          aria-label="Maximum prep time in minutes"
          value={safeFilters.maxPrepTimeInMinutes}
          onChange={handleFilterChange('maxPrepTimeInMinutes')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="0"
          step="1"
          placeholder="Min Cook"
          aria-label="Minimum cooking time in minutes"
          value={safeFilters.minCookingTimeInMinutes}
          onChange={handleFilterChange('minCookingTimeInMinutes')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="0"
          step="1"
          placeholder="Max Cook"
          aria-label="Maximum cooking time in minutes"
          value={safeFilters.maxCookingTimeInMinutes}
          onChange={handleFilterChange('maxCookingTimeInMinutes')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="1"
          step="1"
          placeholder="Min Servings"
          aria-label="Minimum servings"
          value={safeFilters.minServings}
          onChange={handleFilterChange('minServings')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="1"
          step="1"
          placeholder="Max Servings"
          aria-label="Maximum servings"
          value={safeFilters.maxServings}
          onChange={handleFilterChange('maxServings')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="0"
          max="5"
          step="1"
          placeholder="Min Rating"
          aria-label="Minimum rating"
          value={safeFilters.minRating}
          onChange={handleFilterChange('minRating')}
        />
        <input
          className="refine-filter-input"
          type="number"
          min="0"
          max="5"
          step="1"
          placeholder="Max Rating"
          aria-label="Maximum rating"
          value={safeFilters.maxRating}
          onChange={handleFilterChange('maxRating')}
        />
        <input
          className="refine-filter-input"
          type="text"
          placeholder="Dietary (csv)"
          aria-label="Dietary preferences as comma-separated values"
          value={safeFilters.dietaryPreferences}
          onChange={handleFilterChange('dietaryPreferences')}
        />
        <input
          className="refine-filter-input"
          type="text"
          placeholder="Exclude allergens (csv)"
          aria-label="Exclude allergens as comma-separated values"
          value={safeFilters.excludeAllergens}
          onChange={handleFilterChange('excludeAllergens')}
        />
      </div>

      <div className="recipe-results-anchor">
        {isLoading ? <RecipeDetailSkeleton /> : null}
        {!isLoading && !errorMessage && recipe ? renderRecipeCard(recipe) : null}
        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
      </div>

      {isRefining ? <RecipeDetailSkeleton /> : null}

      {refinedRecipe && !isRefining ? renderRecipeCard(refinedRecipe) : null}

      <form className="chat-composer" onSubmit={handleRefine} disabled={isRefining}>
        <label className="sr-only" htmlFor="refineDraftPrompt">
          Refine prompt
        </label>
        <div className="chat-composer-inner">
          <textarea
            id="refineDraftPrompt"
            className="chat-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Message Clove to refine this draft..."
            rows={1}
            onKeyDown={handlePromptKeyDown}
            disabled={isRefining}
          />
          <button type="submit" className="chat-send" aria-label="Send refine prompt" disabled={isRefining}>
            {isRefining ? '...' : '➤'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default DraftRefinePage

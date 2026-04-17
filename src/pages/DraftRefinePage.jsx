import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toUserSafeErrorMessage } from '../utils/userSafeError'

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

function DraftRefinePage({ voicePromptRequest = null, voicePromptLiveText = '' }) {
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
  const lastVoicePromptRequestId = useRef('')

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
          setErrorMessage(
            toUserSafeErrorMessage(
              payload?.message ?? payload?.error?.message,
              'We could not load this recipe right now. Please try again in a moment.',
            ),
          )
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

        setErrorMessage('We could not load this recipe right now. Please try again in a moment.')
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

  const handleBack = () => {
    const draftRecipes = recipesSnapshot
      .map((item) => (item.id === recipeId && refinedRecipe ? { ...item, ...refinedRecipe } : item))
      .filter((item) => String(item?.status ?? '').toUpperCase() === 'DRAFT')

    navigate('/create', {
      state: {
        showDrafts: true,
        draftRecipes,
        preferFreshDrafts: Boolean(refinedRecipe),
      },
    })
  }

  const submitRefinePrompt = (rawPrompt) => {
    const trimmedPrompt = String(rawPrompt ?? '').trim()

    if (!trimmedPrompt) {
      setErrorMessage('Please enter a refine prompt')
      return false
    }

    setIsRefining(true)
    setErrorMessage('')
    setRefinedRecipe(null)

    const baseRecipeEndpoint = `${recipesEndpoint.replace(/\/$/, '')}/${encodeURIComponent(recipeId)}`

    fetch(baseRecipeEndpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ prompt: trimmedPrompt }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        return { ok: response.ok, payload }
      })
      .then(({ ok, payload }) => {
        if (!ok || !payload || payload?.success === false) {
          setErrorMessage(
            toUserSafeErrorMessage(
              payload?.message ?? payload?.error?.message,
              'We could not refine this recipe right now. Please try again in a moment.',
            ),
          )
          setIsRefining(false)
          return false
        }

        const nextRecipe = payload.data || payload

        setRefinedRecipe(nextRecipe)
        setRecipesSnapshot((previous) =>
          previous.map((item) => (item.id === recipeId ? { ...item, ...nextRecipe } : item)),
        )
        setPrompt('')
        setIsRefining(false)
        return true
      })
      .catch(() => {
        setErrorMessage('We could not refine this recipe right now. Please try again in a moment.')
        setIsRefining(false)
        return false
      })
      .finally(() => {
        setIsRefining(false)
      })

    return true
  }

  const handleRefine = (event) => {
    event.preventDefault()
    submitRefinePrompt(prompt)
  }

  useEffect(() => {
    const requestId = String(voicePromptRequest?.id ?? '')
    const requestText = String(voicePromptRequest?.text ?? '').trim()

    if (!requestId || !requestText || isRefining) {
      return
    }

    if (lastVoicePromptRequestId.current === requestId) {
      return
    }

    lastVoicePromptRequestId.current = requestId
    setPrompt(requestText)
    submitRefinePrompt(requestText)
  }, [voicePromptRequest, isRefining])

  useEffect(() => {
    if (isRefining) {
      return
    }

    if (typeof voicePromptLiveText !== 'string') {
      return
    }

    setPrompt(voicePromptLiveText)
  }, [voicePromptLiveText, isRefining])

  const activeRecipe = refinedRecipe ?? recipe

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

      <div className={`recipe-results-anchor${isRefining ? ' refine-results-anchor-loading' : ''}`}>
        {isLoading ? <RecipeDetailSkeleton /> : null}
        {isRefining ? (
          <div className="create-loading" aria-live="polite" aria-busy="true">
            <div className="create-loading-spinner" aria-hidden="true" />
            <p className="create-loading-title">Refining recipe</p>
            <p className="create-loading-text">This may take a moment.</p>
          </div>
        ) : null}
        {!isLoading && !isRefining && !errorMessage && activeRecipe ? renderRecipeCard(activeRecipe) : null}
        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
      </div>
      {refinedRecipe && !isRefining ? <p className="success-banner">Recipe refined successfully.</p> : null}

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

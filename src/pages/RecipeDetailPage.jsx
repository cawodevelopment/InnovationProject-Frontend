import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

function RecipeDetailPage() {
  const navigate = useNavigate()
  const { recipeId } = useParams()
  const [recipe, setRecipe] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const recipesEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/recipes'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes`
  }, [])

  const recipeDetailEndpoint = useMemo(() => {
    if (!recipeId) {
      return ''
    }

    return `${recipesEndpoint.replace(/\/$/, '')}/${encodeURIComponent(recipeId)}`
  }, [recipeId, recipesEndpoint])

  useEffect(() => {
    let isActive = true

    const loadRecipe = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await fetch(recipeDetailEndpoint, {
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

        const directRecipe = payload?.data && !Array.isArray(payload.data) ? payload.data : null

        if (directRecipe) {
          setRecipe(directRecipe)
          return
        }

        const recipeList = Array.isArray(payload?.data) ? payload.data : []
        const selectedRecipe = recipeList.find((item) => String(item?.id) === String(recipeId))

        if (!selectedRecipe) {
          setErrorMessage('Recipe not found')
          return
        }

        setRecipe(selectedRecipe)
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
  }, [recipeDetailEndpoint, recipeId])

  const handleDeleteRecipe = async () => {
    if (!recipeId || isDeleting) {
      return
    }

    setIsDeleting(true)
    setErrorMessage('')

    const deleteEndpoint = `${recipesEndpoint.replace(/\/$/, '')}/${encodeURIComponent(recipeId)}`

    try {
      const response = await fetch(deleteEndpoint, {
        method: 'DELETE',
        credentials: 'include',
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.success === false) {
        setErrorMessage(
          toUserSafeErrorMessage(
            payload?.message ?? payload?.error?.message,
            'We could not delete this recipe right now. Please try again in a moment.',
          ),
        )
        setIsDeleting(false)
        return
      }

      navigate('/', { replace: true })
    } catch {
      setErrorMessage('We could not delete this recipe right now. Please try again in a moment.')
      setIsDeleting(false)
    }
  }

  return (
    <section className="page-card create-page recipe-detail-page">
      <p className="eyebrow">Recipe</p>
      <h1>Recipe details</h1>

      <div className="recipe-results-anchor">
        {isLoading ? (
          <div className="recipe-results recipe-results-loading" aria-hidden="true">
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
        ) : null}
        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

        {!isLoading && !errorMessage && recipe ? (
          <div className="recipe-results">
            <article className="recipe-card">
              <div className="recipe-header">
                <div>
                  <h2>{recipe.title}</h2>
                </div>
              </div>

              <div className="recipe-highlights">
                <div className="recipe-box">
                  <h3>Difficulty</h3>
                  <p className="recipe-box-value">{recipe.difficulty}</p>
                  <p className="muted compact">Rating: {recipe.ratingOutOf5}/5</p>
                </div>

                <div className="recipe-box">
                  <h3>Allergen notices</h3>
                  <p className="recipe-box-value">{formatList(recipe.allergenNotices)}</p>
                </div>

                <div className="recipe-box">
                  <h3>Dietary restrictions</h3>
                  <p className="recipe-box-value">{formatList(recipe.dietaryRestrictions)}</p>
                </div>

                <div className="recipe-box">
                  <h3>Nutrition info</h3>
                  <p className="recipe-box-value">{recipe.nutritionInfo?.caloriesKcal ?? 'N/A'} kcal</p>
                  <p className="muted compact">
                    Protein: {recipe.nutritionInfo?.proteinG ?? 'N/A'}g · Carbs: {recipe.nutritionInfo?.carbsG ?? 'N/A'}g · Fat:{' '}
                    {recipe.nutritionInfo?.fatG ?? 'N/A'}g
                  </p>
                </div>
              </div>

              <div className="recipe-stats">
                <span>Prep: {recipe.prepTimeInMinutes} min</span>
                <span>Cook: {recipe.cookingTimeInMinutes} min</span>
                <span>Servings: {recipe.servings}</span>
              </div>

              <div className="recipe-section">
                <h3>Ingredients</h3>
                <ul>
                  {Array.isArray(recipe.ingredients)
                    ? recipe.ingredients.map((item) => <li key={item}>{item}</li>)
                    : null}
                </ul>
              </div>

              <div className="recipe-section">
                <h3>Instructions</h3>
                <ol>
                  {Array.isArray(recipe.instructions)
                    ? recipe.instructions.map((item) => <li key={item}>{item}</li>)
                    : null}
                </ol>
              </div>

              <div className="recipe-actions">
                <button
                  type="button"
                  className="recipe-action-button recipe-action-delete"
                  onClick={handleDeleteRecipe}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete recipe'}
                </button>
                <button
                  type="button"
                  className="recipe-action-button recipe-action-refine"
                  onClick={() => navigate(`/recipes/${encodeURIComponent(recipeId)}/refine`)}
                >
                  Refine it
                </button>
              </div>
            </article>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default RecipeDetailPage

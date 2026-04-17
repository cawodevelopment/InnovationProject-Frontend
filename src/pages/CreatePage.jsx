import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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

function extractDraftList(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items
  }

  return []
}

function keepDraftOrderById(nextDrafts, orderedDrafts) {
  if (!Array.isArray(nextDrafts) || nextDrafts.length === 0) {
    return []
  }

  if (!Array.isArray(orderedDrafts) || orderedDrafts.length === 0) {
    return nextDrafts
  }

  const orderById = new Map()

  orderedDrafts.forEach((item, index) => {
    const id = String(item?.id ?? '')

    if (!id || orderById.has(id)) {
      return
    }

    orderById.set(id, index)
  })

  if (orderById.size === 0) {
    return nextDrafts
  }

  const ordered = []
  const unordered = []

  nextDrafts.forEach((item) => {
    const id = String(item?.id ?? '')

    if (id && orderById.has(id)) {
      ordered.push(item)
      return
    }

    unordered.push(item)
  })

  ordered.sort((a, b) => {
    const aIndex = orderById.get(String(a?.id ?? '')) ?? Number.MAX_SAFE_INTEGER
    const bIndex = orderById.get(String(b?.id ?? '')) ?? Number.MAX_SAFE_INTEGER
    return aIndex - bIndex
  })

  return [...ordered, ...unordered]
}

function DraftRecipeSkeletonList() {
  return (
    <div className="recipe-results recipe-results-loading" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <article className="recipe-card recipe-detail-skeleton" key={index}>
          <div className="recipe-header">
            <div>
              <div className="skeleton-line skeleton-status" />
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-title skeleton-title-short" />
            </div>
          </div>

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

          <div className="recipe-actions recipe-actions-skeleton">
            <span className="skeleton-line recipe-skeleton-action" />
            <span className="skeleton-line recipe-skeleton-action" />
          </div>
        </article>
      ))}
    </div>
  )
}

function CreatePage({
  onRecipesChange,
  voicePromptRequest = null,
  voicePromptLiveText = '',
  voiceSavedDraftId = '',
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false)
  const [publishingRecipeIds, setPublishingRecipeIds] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [recipes, setRecipes] = useState([])
  const lastVoicePromptRequestId = useRef('')
  const latestGenerateRequestId = useRef(0)

  useEffect(() => {
    setPrompt('')
    setErrorMessage('')
    setRecipes([])
    setPublishingRecipeIds([])
    setIsLoadingDrafts(false)
  }, [])

  useEffect(() => {
    onRecipesChange?.(recipes)
  }, [onRecipesChange, recipes])

  const recipesEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/recipes'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes`
  }, [])

  const draftsEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/recipes/drafts'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes/drafts`
  }, [])

  useEffect(() => {
    if (!location.state?.showDrafts) {
      return
    }

    let isActive = true
    const incomingDraftRecipes = Array.isArray(location.state?.draftRecipes)
      ? location.state.draftRecipes
      : []
    const preferFreshDrafts = Boolean(location.state?.preferFreshDrafts)
    const draftOrderReference = incomingDraftRecipes.length > 0 ? incomingDraftRecipes : recipes

    if (!preferFreshDrafts && incomingDraftRecipes.length > 0) {
      setRecipes(incomingDraftRecipes)
      setIsLoadingDrafts(false)
    } else {
      if (preferFreshDrafts) {
        setRecipes([])
      }
      setIsLoadingDrafts(true)
    }

    const loadDrafts = async () => {
      setErrorMessage('')

      try {
        const response = await fetch(draftsEndpoint, {
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
              'We could not load drafts right now. Please try again in a moment.',
            ),
          )
          return
        }

        setRecipes(keepDraftOrderById(extractDraftList(payload), draftOrderReference))
      } catch {
        if (!isActive) {
          return
        }

        setErrorMessage('We could not load drafts right now. Please try again in a moment.')
      } finally {
        if (isActive) {
          setIsLoadingDrafts(false)
        }
      }
    }

    loadDrafts()

    return () => {
      isActive = false
    }
  }, [location.state, draftsEndpoint])

  const submitGeneratePrompt = async (rawPrompt) => {
    const trimmedPrompt = String(rawPrompt ?? '').trim()

    if (!trimmedPrompt) {
      setErrorMessage('Please enter a prompt')
      return false
    }

    const requestId = latestGenerateRequestId.current + 1
    latestGenerateRequestId.current = requestId

    setIsGenerating(true)
    setErrorMessage('')
    setPrompt('')
    setRecipes([])

    try {
      const response = await fetch(recipesEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ prompt: trimmedPrompt }),
      })

      const payload = await response.json().catch(() => null)

      console.log('Recipe generation response:', { status: response.status, payload, payloadType: typeof payload })

      if (!response.ok || payload?.success === false) {
        if (latestGenerateRequestId.current !== requestId) {
          return false
        }

        setErrorMessage(
          toUserSafeErrorMessage(
            payload?.message ?? payload?.error?.message,
            'We could not generate recipes right now. Please try again in a moment.',
          ),
        )
        return false
      }

      if (!Array.isArray(payload?.data)) {
        if (latestGenerateRequestId.current !== requestId) {
          return false
        }

        console.error('Unexpected generation response:', {
          hasData: !!payload?.data,
          dataType: typeof payload?.data,
          payload,
        })
        setErrorMessage('We could not generate recipes right now. Please try again in a moment.')
        return false
      }

      if (latestGenerateRequestId.current !== requestId) {
        return false
      }

      setRecipes(payload.data)
      return true
    } catch (error) {
      if (latestGenerateRequestId.current !== requestId) {
        return false
      }

      console.error('Recipe generation error:', error)
      setErrorMessage('We could not generate recipes right now. Please try again in a moment.')
      return false
    } finally {
      if (latestGenerateRequestId.current === requestId) {
        setIsGenerating(false)
      }
    }
  }

  const handleGenerate = async (event) => {
    event.preventDefault()
    await submitGeneratePrompt(prompt)
  }

  useEffect(() => {
    const requestId = String(voicePromptRequest?.id ?? '')
    const requestText = String(voicePromptRequest?.text ?? '').trim()

    if (!requestId || !requestText || isGenerating) {
      return
    }

    if (lastVoicePromptRequestId.current === requestId) {
      return
    }

    lastVoicePromptRequestId.current = requestId
    setPrompt(requestText)
    setRecipes([])
    void submitGeneratePrompt(requestText)
  }, [voicePromptRequest, isGenerating])

  useEffect(() => {
    if (isGenerating) {
      return
    }

    if (typeof voicePromptLiveText !== 'string') {
      return
    }

    setPrompt(voicePromptLiveText)
  }, [voicePromptLiveText, isGenerating])

  useEffect(() => {
    const savedId = String(voiceSavedDraftId ?? '').trim()

    if (!savedId) {
      return
    }

    setRecipes((previous) => previous.filter((recipe) => String(recipe?.id ?? '') !== savedId))
    setPublishingRecipeIds((previous) => previous.filter((id) => String(id) !== savedId))
  }, [voiceSavedDraftId])

  const handlePromptKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const handlePublishRecipe = async (recipeId) => {
    if (!recipeId || publishingRecipeIds.includes(recipeId)) {
      console.warn('Publish recipe: missing or duplicate ID', { recipeId, publishingRecipeIds })
      return
    }

    setPublishingRecipeIds((previous) => [...previous, recipeId])
    setErrorMessage('')

    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)
    const publishEndpoint = normalizedBaseUrl
      ? `${normalizedBaseUrl.replace(/\/$/, '')}/recipes/${encodeURIComponent(recipeId)}/publish`
      : `/recipes/${encodeURIComponent(recipeId)}/publish`

    console.log('Publishing recipe:', { recipeId, normalizedBaseUrl, publishEndpoint })

    try {
      const response = await fetch(publishEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      })

      console.log('Publish response status:', response.status)

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        // If response failed and we don't have JSON, capture the raw text
        let errorMsg = `Failed to publish recipe (${response.status})`

        if (payload?.message || payload?.error?.message) {
          errorMsg = toUserSafeErrorMessage(
            payload.message ?? payload.error.message,
            'We could not publish this recipe right now. Please try again in a moment.',
          )
        }

        console.error('Publish recipe error:', {
          status: response.status,
          payload,
          responseOk: response.ok,
        })
        setErrorMessage(errorMsg)
        return
      }

      if (payload?.success === false) {
        const errorMsg = toUserSafeErrorMessage(
          payload?.message ?? payload?.error?.message,
          'We could not publish this recipe right now. Please try again in a moment.',
        )
        console.error('Publish recipe error:', { status: response.status, payload })
        setErrorMessage(errorMsg)
        return
      }

      if (!payload) {
        console.warn('Publish recipe received empty response:', {
          status: response.status,
          headers: response.headers,
        })
        setErrorMessage('Backend returned no response data')
        return
      }

      console.log('Recipe published successfully')
      setRecipes((previous) => previous.filter((recipe) => recipe.id !== recipeId))
    } catch (error) {
      console.error('Publish recipe network error:', error)
      setErrorMessage('Failed to connect. Check the backend is running and your connection is stable.')
    } finally {
      setPublishingRecipeIds((previous) => previous.filter((id) => id !== recipeId))
    }
  }

  return (
    <section className="page-card create-page create-generate-page">
      <p className="eyebrow">Create</p>
      <h1>Generate recipes</h1>
      <p className="muted">
        Write a prompt below.
      </p>

      <div className="recipe-results-anchor">
        {isGenerating ? (
          <div className="create-loading" aria-live="polite" aria-busy="true">
            <div className="create-loading-spinner" aria-hidden="true" />
            <p className="create-loading-title">Generating recipe drafts</p>
            <p className="create-loading-text">This may take a moment.</p>
          </div>
        ) : isLoadingDrafts ? (
          <DraftRecipeSkeletonList />
        ) : recipes.length > 0 ? (
          <div className="recipe-results">
            {recipes.map((recipe) => {
              const isPublished = String(recipe.status).toUpperCase() === 'PUBLISHED'
              const isPublishing = publishingRecipeIds.includes(recipe.id)

              return (
                <article className="recipe-card" key={recipe.id}>
                <div className="recipe-header">
                  <div>
                    <p className="recipe-status">{recipe.status}</p>
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
                    <p className="recipe-box-value">
                      {recipe.nutritionInfo?.caloriesKcal ?? 'N/A'} kcal
                    </p>
                    <p className="muted compact">
                      Protein: {recipe.nutritionInfo?.proteinG ?? 'N/A'}g · Carbs:{' '}
                      {recipe.nutritionInfo?.carbsG ?? 'N/A'}g · Fat: {recipe.nutritionInfo?.fatG ?? 'N/A'}g
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
                    {Array.isArray(recipe.ingredients) ? (
                      recipe.ingredients.map((item) => <li key={item}>{item}</li>)
                    ) : null}
                  </ul>
                </div>

                <div className="recipe-section">
                  <h3>Instructions</h3>
                  <ol>
                    {Array.isArray(recipe.instructions) ? (
                      recipe.instructions.map((item) => <li key={item}>{item}</li>)
                    ) : null}
                  </ol>
                </div>

                <div className="recipe-actions">
                  <button
                    type="button"
                    className="recipe-action-button"
                    onClick={() => handlePublishRecipe(recipe.id)}
                    disabled={isPublished || isPublishing}
                  >
                    {isPublished ? 'Published' : isPublishing ? 'Saving...' : 'Save recipe'}
                  </button>
                  <button
                    type="button"
                    className="recipe-action-button recipe-action-refine"
                    onClick={() =>
                      navigate(`/drafts/${encodeURIComponent(recipe.id)}/refine`, {
                        state: {
                          recipe,
                          recipes,
                        },
                      })
                    }
                  >
                    Refine it
                  </button>
                </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="create-placeholder" aria-hidden="true">
            <div className="create-placeholder-icon">🍳</div>
            <p className="create-placeholder-text">Your recipes will appear here</p>
          </div>
        )}
      </div>

      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}


      <form className="chat-composer" onSubmit={handleGenerate}>
        <label className="sr-only" htmlFor="recipePrompt">
          Recipe prompt
        </label>
        <div className="chat-composer-inner">
          <textarea
            id="recipePrompt"
            className="chat-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Message Clove to create a recipe..."
            rows={1}
            onKeyDown={handlePromptKeyDown}
          />
          <button type="submit" className="chat-send" disabled={isGenerating} aria-label="Send prompt">
            {isGenerating ? '...' : '➤'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default CreatePage

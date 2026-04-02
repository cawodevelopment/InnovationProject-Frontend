import { useMemo, useState } from 'react'

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

function CreatePage() {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [recipes, setRecipes] = useState([])

  const recipesEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/recipes'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes`
  }, [])

  const handleGenerate = async (event) => {
    event.preventDefault()

    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt) {
      setErrorMessage('Please enter a prompt')
      return
    }

    setIsGenerating(true)
    setErrorMessage('')
    setPrompt('')

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

      if (!response.ok || payload?.success === false) {
        setErrorMessage(payload?.message ?? payload?.error?.message ?? 'Failed to generate recipes')
        return
      }

      setRecipes(Array.isArray(payload?.data) ? payload.data : [])
    } catch {
      setErrorMessage('Failed to generate recipes')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePromptKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <section className="page-card create-page">
      <p className="eyebrow">Create</p>
      <h1>Generate recipes</h1>
      <p className="muted">
        Write a prompt below and the app will request recipe drafts from the backend.
      </p>

      <div className="recipe-results-anchor">
        {isGenerating ? (
          <div className="create-loading" aria-live="polite" aria-busy="true">
            <div className="create-loading-spinner" aria-hidden="true" />
            <p className="create-loading-title">Generating recipe drafts</p>
            <p className="create-loading-text">This can take a moment while the backend processes your prompt.</p>
          </div>
        ) : recipes.length > 0 ? (
          <div className="recipe-results">
            {recipes.map((recipe) => (
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
                  <button type="button" className="recipe-action-button">
                    Save recipe
                  </button>
                  <button type="button" className="recipe-action-button">
                    Refine it
                  </button>
                </div>
              </article>
            ))}
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

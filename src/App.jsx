import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import AccountPage from './pages/AccountPage.jsx'
import CreatePage from './pages/CreatePage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DraftRefinePage from './pages/DraftRefinePage.jsx'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.jsx'
import RefineRecipePage from './pages/RefineRecipePage.jsx'
import RecipeDetailPage from './pages/RecipeDetailPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import AIAssistant from './components/AIAssistant.jsx'

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

function getRecipeIdFromPath(path) {
  const match = path.match(/^\/recipes\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isLoggedIn = getIsLoggedIn()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [homeSearchValue, setHomeSearchValue] = useState('')
  const [homeRecipes, setHomeRecipes] = useState([])
  const [createRecipes, setCreateRecipes] = useState([])
  const [createVoicePromptRequest, setCreateVoicePromptRequest] = useState(null)
  const [createVoicePromptLiveText, setCreateVoicePromptLiveText] = useState('')
  const [recipeRefineVoicePromptRequest, setRecipeRefineVoicePromptRequest] = useState(null)
  const [recipeRefineVoicePromptLiveText, setRecipeRefineVoicePromptLiveText] = useState('')
  const [draftRefineVoicePromptRequest, setDraftRefineVoicePromptRequest] = useState(null)
  const [draftRefineVoicePromptLiveText, setDraftRefineVoicePromptLiveText] = useState('')
  const [createViewResetToken, setCreateViewResetToken] = useState(0)
  const [voiceSavedDraftId, setVoiceSavedDraftId] = useState('')
  const isPrivacyPolicyRoute = location.pathname === '/privacy-policy'
  const isHomeRoute = location.pathname === '/'

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

        if (response.status === 401 || response.status === 403) {
          clearAuthState()
          navigate('/login', { replace: true })
          return
        }

        if (!response.ok) {
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSession()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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

  const handleDeleteRecipeViaVoice = async () => {
    const recipeId = getRecipeIdFromPath(location.pathname)

    if (!recipeId) {
      return
    }

    const recipesEndpoint = (() => {
      const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

      if (!normalizedBaseUrl) {
        return '/recipes'
      }

      return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes`
    })()

    const deleteEndpoint = `${recipesEndpoint.replace(/\/$/, '')}/${encodeURIComponent(recipeId)}`

    try {
      const response = await fetch(deleteEndpoint, {
        method: 'DELETE',
        credentials: 'include',
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.success === false) {
        return
      }

      navigate('/', { replace: true })
    } catch {
      // Delete failed silently on voice command
    }
  }

  const handleRefineRecipeViaVoice = () => {
    const recipeId = getRecipeIdFromPath(location.pathname)

    if (!recipeId) {
      return
    }

    navigate(`/recipes/${encodeURIComponent(recipeId)}/refine`)
  }

  const handleRefineDraftViaVoice = (draftRecipe) => {
    const draftId = draftRecipe?.id

    if (!draftId) {
      return
    }

    navigate(`/drafts/${encodeURIComponent(draftId)}/refine`, {
      state: {
        recipe: draftRecipe,
        recipes: createRecipes,
      },
    })
  }

  const handleSaveDraftViaVoice = async (draftRecipe) => {
    const draftId = draftRecipe?.id

    if (!draftId) {
      return false
    }

    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)
    const publishEndpoint = normalizedBaseUrl
      ? `${normalizedBaseUrl.replace(/\/$/, '')}/recipes/${encodeURIComponent(draftId)}/publish`
      : `/recipes/${encodeURIComponent(draftId)}/publish`

    try {
      const response = await fetch(publishEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.success === false) {
        return false
      }

      setCreateRecipes((previous) => previous.filter((recipe) => recipe.id !== draftId))
      setVoiceSavedDraftId(String(draftId))
      return true
    } catch {
      return false
    }
  }

  const handleCreatePromptViaVoice = (promptText) => {
    const trimmedPrompt = String(promptText ?? '').trim()

    if (!trimmedPrompt) {
      return
    }

    setCreateVoicePromptLiveText('')

    setCreateVoicePromptRequest({
      id: `${Date.now()}-${Math.random()}`,
      text: trimmedPrompt,
    })
  }

  const handleCreatePromptLiveViaVoice = (promptText) => {
    setCreateVoicePromptLiveText(String(promptText ?? ''))
  }

  const handleRefineRecipePromptViaVoice = (promptText) => {
    const trimmedPrompt = String(promptText ?? '').trim()

    if (!trimmedPrompt) {
      return
    }

    setRecipeRefineVoicePromptLiveText('')
    setRecipeRefineVoicePromptRequest({
      id: `${Date.now()}-${Math.random()}`,
      text: trimmedPrompt,
    })
  }

  const handleRefineRecipePromptLiveViaVoice = (promptText) => {
    setRecipeRefineVoicePromptLiveText(String(promptText ?? ''))
  }

  const handleRefineDraftPromptViaVoice = (promptText) => {
    const trimmedPrompt = String(promptText ?? '').trim()

    if (!trimmedPrompt) {
      return
    }

    setDraftRefineVoicePromptLiveText('')
    setDraftRefineVoicePromptRequest({
      id: `${Date.now()}-${Math.random()}`,
      text: trimmedPrompt,
    })
  }

  const handleRefineDraftPromptLiveViaVoice = (promptText) => {
    setDraftRefineVoicePromptLiveText(String(promptText ?? ''))
  }

  const handleResetCreateView = () => {
    setCreateRecipes([])
    setCreateVoicePromptRequest(null)
    setCreateVoicePromptLiveText('')
    setVoiceSavedDraftId('')
    setCreateViewResetToken((previous) => previous + 1)
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
              <NavLink to="/create" onClick={handleResetCreateView}>Create</NavLink>
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

      {isLoggedIn && isHomeRoute ? (
        <div className="home-search-strip">
          <div className="home-search-panel" aria-label="Recipe name search">
            <input
              type="text"
              value={homeSearchValue}
              onChange={(event) => setHomeSearchValue(event.target.value)}
              placeholder="Search recipe name"
            />
          </div>
        </div>
      ) : null}

      <main className="page-wrap">
        <Routes>
          <Route
            path="/"
            element={
              isLoggedIn ? (
                <HomePage
                  searchValue={homeSearchValue}
                  onSearchValueChange={setHomeSearchValue}
                  onRecipesChange={setHomeRecipes}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
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
            element={
              isLoggedIn ? (
                <CreatePage
                  key={createViewResetToken}
                  onRecipesChange={setCreateRecipes}
                  voicePromptRequest={createVoicePromptRequest}
                  voicePromptLiveText={createVoicePromptLiveText}
                  voiceSavedDraftId={voiceSavedDraftId}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/recipes/:recipeId"
            element={isLoggedIn ? <RecipeDetailPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/recipes/:recipeId/refine"
            element={
              isLoggedIn ? (
                <RefineRecipePage
                  voicePromptRequest={recipeRefineVoicePromptRequest}
                  voicePromptLiveText={recipeRefineVoicePromptLiveText}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/drafts/:recipeId/refine"
            element={
              isLoggedIn ? (
                <DraftRefinePage
                  voicePromptRequest={draftRefineVoicePromptRequest}
                  voicePromptLiveText={draftRefineVoicePromptLiveText}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route
            path="*"
            element={<Navigate to={isLoggedIn ? '/' : '/login'} replace />}
          />
        </Routes>
      </main>

      {!isPrivacyPolicyRoute ? (
        <footer className="app-footer">
          <Link to="/privacy-policy" className="app-footer-link">
            Privacy Policy
          </Link>
        </footer>
      ) : null}

      <AIAssistant
        currentPath={location.pathname}
        homeRecipes={homeRecipes}
        createDrafts={createRecipes}
        onDeleteRecipe={handleDeleteRecipeViaVoice}
        onRefineRecipe={handleRefineRecipeViaVoice}
        onRefineDraft={handleRefineDraftViaVoice}
        onSaveDraft={handleSaveDraftViaVoice}
        onRefineRecipePrompt={handleRefineRecipePromptViaVoice}
        onRefineRecipePromptLive={handleRefineRecipePromptLiveViaVoice}
        onRefineDraftPrompt={handleRefineDraftPromptViaVoice}
        onRefineDraftPromptLive={handleRefineDraftPromptLiveViaVoice}
        onCreateVoicePrompt={handleCreatePromptViaVoice}
        onCreateVoicePromptLive={handleCreatePromptLiveViaVoice}
        onResetCreateView={handleResetCreateView}
      />
    </div>
  )
}

export default App

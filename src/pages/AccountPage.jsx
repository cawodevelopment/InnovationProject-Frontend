import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toUserSafeErrorMessage } from '../utils/userSafeError'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const MAX_DROPDOWN_RESULTS = 8

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

function extractListFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items
  }

  if (Array.isArray(payload?.data?.dietaryPreferences)) {
    return payload.data.dietaryPreferences
  }

  if (Array.isArray(payload?.data?.allergens)) {
    return payload.data.allergens
  }

  return []
}

function getOptionLabel(item) {
  if (typeof item === 'string') {
    return item
  }

  return item?.name ?? ''
}

function getOptionId(item, label) {
  if (typeof item === 'string') {
    return item
  }

  return item?.id ?? label
}

function normalizeOptions(list) {
  const seen = new Set()

  return list
    .map((item) => {
      const label = String(getOptionLabel(item)).trim()

      if (!label) {
        return null
      }

      const id = String(getOptionId(item, label))
      const key = `${id}::${label.toLowerCase()}`

      if (seen.has(key)) {
        return null
      }

      seen.add(key)
      return { id, label }
    })
    .filter(Boolean)
}

function normalizeUserTagList(list) {
  return normalizeOptions(Array.isArray(list) ? list : [])
}

function matchByRegex(options, query) {
  const trimmed = query.trim()

  if (!trimmed) {
    return options.slice(0, MAX_DROPDOWN_RESULTS)
  }

  try {
    const regex = new RegExp(trimmed, 'i')
    return options
      .filter((option) => regex.test(option.label))
      .slice(0, MAX_DROPDOWN_RESULTS)
  } catch {
    return []
  }
}

function sameOption(a, b) {
  return a.id === b.id || a.label.trim().toLowerCase() === b.label.trim().toLowerCase()
}

function buildTagPayloadCandidates(idKey, option) {
  const valueById = String(option.id)
  const valueByLabel = String(option.label)
  const keyWithoutId = idKey.endsWith('Id') ? idKey.slice(0, -2) : idKey

  return [
    { key: `${idKey}:id`, body: { [idKey]: valueById } },
    { key: `${idKey}:label`, body: { [idKey]: valueByLabel } },
    { key: `${keyWithoutId}:id`, body: { [keyWithoutId]: valueById } },
    { key: `${keyWithoutId}:label`, body: { [keyWithoutId]: valueByLabel } },
    { key: 'id:id', body: { id: valueById } },
    { key: 'name:label', body: { name: valueByLabel } },
    { key: 'label:label', body: { label: valueByLabel } },
  ]
}

function AccountPage() {
  const navigate = useNavigate()
  const payloadPreferenceRef = useRef({})
  const [profile, setProfile] = useState(null)
  const [profileForm, setProfileForm] = useState({ firstname: '', lastname: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [availableDietaryOptions, setAvailableDietaryOptions] = useState([])
  const [availableAllergenOptions, setAvailableAllergenOptions] = useState([])
  const [selectedDietary, setSelectedDietary] = useState([])
  const [selectedAllergens, setSelectedAllergens] = useState([])
  const [dietaryQuery, setDietaryQuery] = useState('')
  const [allergenQuery, setAllergenQuery] = useState('')
  const [dietaryError, setDietaryError] = useState('')
  const [allergenError, setAllergenError] = useState('')

  const meEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/users/me'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/users/me`
  }, [])

  const deleteEndpoint = meEndpoint
  const updateEndpoint = meEndpoint

  const dietaryOptionsEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/diet/dietary-preferences'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/diet/dietary-preferences`
  }, [])

  const allergenOptionsEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/diet/allergens'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/diet/allergens`
  }, [])

  const userDietaryEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/users/me/dietary-preferences'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/users/me/dietary-preferences`
  }, [])

  const userAllergensEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/users/me/allergens'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/users/me/allergens`
  }, [])

  const clearAuthState = () => {
    window.localStorage.removeItem('isAuthenticated')
    window.localStorage.removeItem('authToken')
    window.localStorage.removeItem('refreshToken')
  }

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        const response = await fetch(meEndpoint, {
          method: 'GET',
          credentials: 'include',
        })

        const payload = await response.json()

        if (!response.ok || payload?.status === 'error') {
          if (response.status === 401 || response.status === 403) {
            navigate('/login', { replace: true })
            return
          }

          throw new Error(
            toUserSafeErrorMessage(
              payload?.message,
              'We could not load your account information right now. Please try again in a moment.',
            ),
          )
        }

        if (!isMounted) {
          return
        }

        setProfile(payload?.data ?? null)
        setProfileForm({
          firstname: payload?.data?.firstname ?? '',
          lastname: payload?.data?.lastname ?? '',
        })
        setSelectedDietary(normalizeUserTagList(payload?.data?.dietaryPreferences ?? []))
        setSelectedAllergens(normalizeUserTagList(payload?.data?.allergens ?? []))
      } catch (loadError) {
        if (!isMounted) {
          return
        }

        setErrorMessage(
          loadError instanceof Error
            ? toUserSafeErrorMessage(
                loadError.message,
                'We could not load your account information right now. Please try again in a moment.',
              )
            : 'We could not load your account information right now. Please try again in a moment.',
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [meEndpoint, navigate])

  useEffect(() => {
    let isMounted = true

    const loadReferenceOptions = async () => {
      try {
        const [dietaryResponse, allergenResponse] = await Promise.all([
          fetch(dietaryOptionsEndpoint, { credentials: 'include' }),
          fetch(allergenOptionsEndpoint, { credentials: 'include' }),
        ])

        const dietaryPayload = await dietaryResponse.json().catch(() => null)
        const allergenPayload = await allergenResponse.json().catch(() => null)

        if (!isMounted) {
          return
        }

        if (dietaryResponse.ok) {
          const normalized = normalizeOptions(extractListFromPayload(dietaryPayload))
          setAvailableDietaryOptions(normalized)
          setSelectedDietary((previous) =>
            previous.map(
              (item) => normalized.find((candidate) => sameOption(candidate, item)) ?? item,
            ),
          )
        }

        if (allergenResponse.ok) {
          const normalized = normalizeOptions(extractListFromPayload(allergenPayload))
          setAvailableAllergenOptions(normalized)
          setSelectedAllergens((previous) =>
            previous.map(
              (item) => normalized.find((candidate) => sameOption(candidate, item)) ?? item,
            ),
          )
        }
      } catch {
        // Keep account page usable even if reference lists fail to load.
      }
    }

    loadReferenceOptions()

    return () => {
      isMounted = false
    }
  }, [allergenOptionsEndpoint, dietaryOptionsEndpoint])

  const remainingDietaryOptions = availableDietaryOptions.filter(
    (option) => {
      return !selectedDietary.some((selected) => sameOption(selected, option))
    },
  )

  const remainingAllergenOptions = availableAllergenOptions.filter(
    (option) => {
      return !selectedAllergens.some((selected) => sameOption(selected, option))
    },
  )

  const filteredDietaryOptions = matchByRegex(remainingDietaryOptions, dietaryQuery)
  const filteredAllergenOptions = matchByRegex(remainingAllergenOptions, allergenQuery)

  const updateTagSelection = async ({ endpoint, idKey, option, method }) => {
    try {
      const payloadCandidates = buildTagPayloadCandidates(idKey, option)
      const preferenceKey = `${method}:${endpoint}:${idKey}`
      const preferredCandidateKey = payloadPreferenceRef.current[preferenceKey]
      const orderedCandidates = preferredCandidateKey
        ? [
            ...payloadCandidates.filter((candidate) => candidate.key === preferredCandidateKey),
            ...payloadCandidates.filter((candidate) => candidate.key !== preferredCandidateKey),
          ]
        : payloadCandidates
      let lastErrorMessage = 'Update failed'

      for (const candidate of orderedCandidates) {
        const response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(candidate.body),
        })

        const payload = await response.json().catch(() => null)

        if (response.ok && payload?.success !== false && payload?.status !== 'error') {
          payloadPreferenceRef.current[preferenceKey] = candidate.key
          return { success: true }
        }

        if (response.status === 401 || response.status === 403) {
          clearAuthState()
          navigate('/login', { replace: true })
          return { success: false, unauthorized: true }
        }

        lastErrorMessage = toUserSafeErrorMessage(
          payload?.error?.message ?? payload?.message,
          'We could not update your preferences right now. Please try again in a moment.',
        )

        // Retry alternate payload shapes only for validation-style failures.
        if (response.status !== 400 && response.status !== 422) {
          break
        }
      }

      return { success: false, message: lastErrorMessage }
    } catch {
      return {
        success: false,
        message: 'We could not update your preferences right now. Please try again in a moment.',
      }
    }
  }

  const handleAddDietary = (option) => {
    if (selectedDietary.some((item) => sameOption(item, option))) {
      return
    }

    setDietaryError('')
    setSelectedDietary((previous) => [...previous, option])
    setDietaryQuery('')
  }

  const handleRemoveDietary = (option) => {
    setDietaryError('')
    setSelectedDietary((previous) => previous.filter((item) => !sameOption(item, option)))
  }

  const handleAddAllergen = (option) => {
    if (selectedAllergens.some((item) => sameOption(item, option))) {
      return
    }

    setAllergenError('')
    setSelectedAllergens((previous) => [...previous, option])
    setAllergenQuery('')
  }

  const handleRemoveAllergen = (option) => {
    setAllergenError('')
    setSelectedAllergens((previous) => previous.filter((item) => !sameOption(item, option)))
  }

  const handleProfileChange = (event) => {
    const { name, value } = event.target

    setProfileForm((previous) => ({
      ...previous,
      [name]: value,
    }))

    setSaveError('')
  }

  const handleSaveProfile = async (event) => {
    event.preventDefault()

    const nextFirstName = profileForm.firstname.trim()
    const nextLastName = profileForm.lastname.trim()
    const currentFirstName = (profile?.firstname ?? '').trim()
    const currentLastName = (profile?.lastname ?? '').trim()
    const currentDietary = normalizeUserTagList(profile?.dietaryPreferences ?? [])
    const currentAllergens = normalizeUserTagList(profile?.allergens ?? [])
    const dietaryToAdd = selectedDietary.filter(
      (option) => !currentDietary.some((currentOption) => sameOption(currentOption, option)),
    )
    const dietaryToRemove = currentDietary.filter(
      (option) => !selectedDietary.some((selectedOption) => sameOption(selectedOption, option)),
    )
    const allergensToAdd = selectedAllergens.filter(
      (option) => !currentAllergens.some((currentOption) => sameOption(currentOption, option)),
    )
    const allergensToRemove = currentAllergens.filter(
      (option) => !selectedAllergens.some((selectedOption) => sameOption(selectedOption, option)),
    )
    const hasNameChanges = nextFirstName !== currentFirstName || nextLastName !== currentLastName
    const hasDietaryChanges = dietaryToAdd.length > 0 || dietaryToRemove.length > 0
    const hasAllergenChanges = allergensToAdd.length > 0 || allergensToRemove.length > 0

    if (!hasNameChanges && !hasDietaryChanges && !hasAllergenChanges) {
      navigate('/', { replace: true })
      return
    }

    if (!nextFirstName) {
      setSaveError('First name is required')
      return
    }

    if (!nextLastName) {
      setSaveError('Last name is required')
      return
    }

    setIsSaving(true)
    setSaveError('')
    setDietaryError('')
    setAllergenError('')

    try {
      let nextProfile = profile

      if (hasNameChanges) {
        const response = await fetch(updateEndpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            firstname: nextFirstName,
            lastname: nextLastName,
          }),
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok || payload?.success === false || payload?.status === 'error') {
          if (response.status === 401 || response.status === 403) {
            navigate('/login', { replace: true })
            return
          }

          setSaveError(
            toUserSafeErrorMessage(
              payload?.message ?? payload?.error?.message,
              'We could not update your account right now. Please try again in a moment.',
            ),
          )
          return
        }

        nextProfile = payload?.data ?? {
          ...profile,
          firstname: nextFirstName,
          lastname: nextLastName,
        }
      }

      for (const option of dietaryToAdd) {
        const result = await updateTagSelection({
          endpoint: userDietaryEndpoint,
          idKey: 'dietaryPreferenceId',
          option,
          method: 'POST',
        })

        if (!result.success) {
          if (result.unauthorized) {
            return
          }

          setDietaryError(result.message)
          return
        }
      }

      for (const option of dietaryToRemove) {
        const result = await updateTagSelection({
          endpoint: userDietaryEndpoint,
          idKey: 'dietaryPreferenceId',
          option,
          method: 'DELETE',
        })

        if (!result.success) {
          if (result.unauthorized) {
            return
          }

          setDietaryError(result.message)
          return
        }
      }

      for (const option of allergensToAdd) {
        const result = await updateTagSelection({
          endpoint: userAllergensEndpoint,
          idKey: 'allergenId',
          option,
          method: 'POST',
        })

        if (!result.success) {
          if (result.unauthorized) {
            return
          }

          setAllergenError(result.message)
          return
        }
      }

      for (const option of allergensToRemove) {
        const result = await updateTagSelection({
          endpoint: userAllergensEndpoint,
          idKey: 'allergenId',
          option,
          method: 'DELETE',
        })

        if (!result.success) {
          if (result.unauthorized) {
            return
          }

          setAllergenError(result.message)
          return
        }
      }

      nextProfile = {
        ...(nextProfile ?? {}),
        dietaryPreferences: selectedDietary,
        allergens: selectedAllergens,
      }

      setProfile(nextProfile)
      setProfileForm({
        firstname: nextProfile.firstname ?? '',
        lastname: nextProfile.lastname ?? '',
      })
      navigate('/', { replace: true })
    } catch {
      setSaveError('We could not update your account right now. Please try again in a moment.')
    } finally {
      setIsSaving(false)
    }
  }

  const openDeletePopup = () => {
    setDeletePassword('')
    setDeleteError('')
    setIsDeleteOpen(true)
  }

  const closeDeletePopup = () => {
    if (isDeleting) {
      return
    }

    setIsDeleteOpen(false)
    setDeletePassword('')
    setDeleteError('')
  }

  const handleDeleteAccount = async (event) => {
    event.preventDefault()

    if (!deletePassword) {
      setDeleteError('Password is required')
      return
    }

    setIsDeleting(true)
    setDeleteError('')

    try {
      const response = await fetch(deleteEndpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ password: deletePassword }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.success === false) {
        const message =
          response.status === 401 || response.status === 403
            ? 'Incorrect password'
            : response.status === 404
              ? toUserSafeErrorMessage(payload?.message ?? payload?.error?.message, 'User not found')
              : toUserSafeErrorMessage(
                  payload?.error?.message ?? payload?.message,
                  'We could not delete your account right now. Please try again in a moment.',
                )

        setDeleteError(message)

        if (response.status === 404) {
          clearAuthState()
          navigate('/login', { replace: true })
        }

        setIsDeleting(false)
        return
      }

      clearAuthState()
      navigate('/login', { replace: true })
    } catch {
      setDeleteError('We could not delete your account right now. Please try again in a moment.')
      setIsDeleting(false)
    }
  }

  return (
    <section className="page-card home-hero">
      <p className="eyebrow">Account</p>
      <h1>Your account</h1>

      {isLoading ? (
        <div className="account-skeleton" aria-hidden="true">
          <div className="account-skeleton-grid">
            <div className="account-skeleton-block">
              <div className="skeleton-line account-skeleton-label" />
              <div className="skeleton-line account-skeleton-input" />
            </div>
            <div className="account-skeleton-block">
              <div className="skeleton-line account-skeleton-label" />
              <div className="skeleton-line account-skeleton-input" />
            </div>
          </div>

          <div className="account-skeleton-block account-skeleton-wide">
            <div className="skeleton-line account-skeleton-label" />
            <div className="skeleton-line account-skeleton-input" />
          </div>

          <div className="account-skeleton-block account-skeleton-wide">
            <div className="skeleton-line account-skeleton-label" />
            <div className="skeleton-line account-skeleton-input" />
            <div className="account-skeleton-pills">
              <div className="skeleton-line account-skeleton-pill" />
              <div className="skeleton-line account-skeleton-pill" />
              <div className="skeleton-line account-skeleton-pill" />
            </div>
          </div>

          <div className="account-skeleton-block account-skeleton-wide">
            <div className="skeleton-line account-skeleton-label" />
            <div className="skeleton-line account-skeleton-input" />
            <div className="account-skeleton-pills">
              <div className="skeleton-line account-skeleton-pill" />
              <div className="skeleton-line account-skeleton-pill" />
            </div>
          </div>

          <div className="account-skeleton-actions">
            <div className="skeleton-line account-skeleton-button" />
            <div className="skeleton-line account-skeleton-button" />
          </div>
        </div>
      ) : errorMessage ? (
        <p className="error-banner">{errorMessage}</p>
      ) : profile ? (
        <form className="account-form" onSubmit={handleSaveProfile}>
          <div className="account-grid">
            <div className="account-field account-field-flat">
              <label className="account-label" htmlFor="firstname">
                First name <span className="required-mark" aria-hidden="true">*</span>
              </label>
              <input
                id="firstname"
                name="firstname"
                value={profileForm.firstname}
                onChange={handleProfileChange}
              />
            </div>
            <div className="account-field account-field-flat">
              <label className="account-label" htmlFor="lastname">
                Last name <span className="required-mark" aria-hidden="true">*</span>
              </label>
              <input
                id="lastname"
                name="lastname"
                value={profileForm.lastname}
                onChange={handleProfileChange}
              />
            </div>
            <div className="account-field account-field-wide account-field-flat">
              <label className="account-label" htmlFor="email">
                Email
              </label>
              <input id="email" value={profile.email ?? ''} readOnly disabled className="locked-input" />
            </div>
            <div className="account-field account-field-wide account-field-flat">
              <span className="account-label">Dietary preferences</span>
              <div className="tag-selector">
                <div className="tag-search">
                  <input
                    className="tag-input"
                    value={dietaryQuery}
                    onChange={(event) => setDietaryQuery(event.target.value)}
                    placeholder="Search dietary preferences"
                    disabled={isSaving}
                  />

                  {dietaryQuery.trim() ? (
                    <ul className="tag-dropdown">
                      {filteredDietaryOptions.length > 0 ? (
                        filteredDietaryOptions.map((option) => (
                          <li key={`dietary-option-${option.id}-${option.label}`}>
                            <button
                              type="button"
                              className="tag-option"
                              onClick={() => handleAddDietary(option)}
                            >
                              {option.label}
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="tag-empty">No matching options</li>
                      )}
                    </ul>
                  ) : null}
                </div>

                <div className="tag-list">
                  {selectedDietary.map((item) => (
                    <span className="tag-pill" key={`dietary-${item.id}-${item.label}`}>
                      {item.label}
                      <button
                        type="button"
                        className="tag-remove"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => handleRemoveDietary(item)}
                        disabled={isSaving}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              {dietaryError ? <p className="error-text selector-feedback">{dietaryError}</p> : null}
            </div>
            <div className="account-field account-field-wide account-field-flat">
              <span className="account-label">Allergens</span>
              <div className="tag-selector">
                <div className="tag-search">
                  <input
                    className="tag-input"
                    value={allergenQuery}
                    onChange={(event) => setAllergenQuery(event.target.value)}
                    placeholder="Search allergens"
                    disabled={isSaving}
                  />

                  {allergenQuery.trim() ? (
                    <ul className="tag-dropdown">
                      {filteredAllergenOptions.length > 0 ? (
                        filteredAllergenOptions.map((option) => (
                          <li key={`allergen-option-${option.id}-${option.label}`}>
                            <button
                              type="button"
                              className="tag-option"
                              onClick={() => handleAddAllergen(option)}
                            >
                              {option.label}
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="tag-empty">No matching options</li>
                      )}
                    </ul>
                  ) : null}
                </div>

                <div className="tag-list">
                  {selectedAllergens.map((item) => (
                    <span className="tag-pill" key={`allergen-${item.id}-${item.label}`}>
                      {item.label}
                      <button
                        type="button"
                        className="tag-remove"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => handleRemoveAllergen(item)}
                        disabled={isSaving}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              {allergenError ? <p className="error-text selector-feedback">{allergenError}</p> : null}
            </div>
          </div>

          {saveError ? <p className="error-text account-feedback">{saveError}</p> : null}

          <div className="account-actions-row">
            <button
              type="button"
              className="secondary-button delete-account-button"
              onClick={openDeletePopup}
            >
              Delete account
            </button>

            <button
              type="submit"
              className="submit-btn account-save-button"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : null}

      {isDeleteOpen ? (
        <div className="delete-modal-backdrop" role="presentation" onClick={closeDeletePopup}>
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Danger zone</p>
            <h2 id="delete-account-title">Confirm account deletion</h2>
            <p className="muted">
              Enter your password to permanently delete your account.
            </p>

            <form className="delete-form" onSubmit={handleDeleteAccount}>
              <div className="field">
                <label htmlFor="deletePassword">
                  Password <span className="required-mark" aria-hidden="true">*</span>
                </label>
                <input
                  id="deletePassword"
                  name="deletePassword"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {deleteError ? <p className="error-text">{deleteError}</p> : null}

              <div className="delete-actions">
                <button type="button" className="secondary-button" onClick={closeDeletePopup} disabled={isDeleting}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn delete-submit-btn" disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default AccountPage

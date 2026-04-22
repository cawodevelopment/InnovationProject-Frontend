import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toUserSafeErrorMessage } from '../utils/userSafeError'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const MAX_DROPDOWN_RESULTS = 8
const RECIPES_PER_PAGE = 8

function normalizeDifficultyValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (normalized === 'easy') {
    return 'Easy'
  }

  if (normalized === 'medium') {
    return 'Medium'
  }

  if (normalized === 'hard') {
    return 'Hard'
  }

  return ''
}

function normalizeMinutesValue(value) {
  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return ''
  }

  return String(parsedValue)
}

function normalizeServingsValue(value) {
  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return ''
  }

  return String(parsedValue)
}

function normalizeRatingValue(value) {
  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue > 5) {
    return ''
  }

  return String(parsedValue)
}

function normalizeTagValue(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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

function sameOption(a, b) {
  return a.id === b.id || a.label.trim().toLowerCase() === b.label.trim().toLowerCase()
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

function toPositiveInteger(value) {
  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return null
  }

  return parsedValue
}

function getCurrentPageFromSearchParams(searchParams) {
  return toPositiveInteger(searchParams.get('page')) ?? 1
}

function getTotalPagesFromPayload(payload) {
  const paginationSources = [payload?.pagination, payload?.data?.pagination, payload, payload?.data]

  for (const source of paginationSources) {
    const totalPages = toPositiveInteger(source?.totalPages)

    if (totalPages) {
      return totalPages
    }

    const totalItems = source?.totalItems ?? source?.totalCount ?? source?.count
    const totalItemsNumber = Number(totalItems)

    if (Number.isFinite(totalItemsNumber) && totalItemsNumber >= 0) {
      return Math.max(1, Math.ceil(totalItemsNumber / RECIPES_PER_PAGE))
    }
  }

  return null
}

function normalizeFilters(safeFilters, selectedDietary, selectedAllergens) {
  const normalized = {
    difficulty: safeFilters.difficulty ? String(safeFilters.difficulty).trim() : undefined,
    minTotalTimeInMinutes: toNumber(safeFilters.minTotalTimeInMinutes, { min: 0, integer: true }),
    maxTotalTimeInMinutes: toNumber(safeFilters.maxTotalTimeInMinutes, { min: 0, integer: true }),
    minServings: toNumber(safeFilters.minServings, { min: 1, integer: true }),
    maxServings: toNumber(safeFilters.maxServings, { min: 1, integer: true }),
    minRating: toNumber(safeFilters.minRating, { min: 0, max: 5, integer: true }),
    maxRating: toNumber(safeFilters.maxRating, { min: 0, max: 5, integer: true }),
    dietaryPreferences: selectedDietary.length > 0 ? selectedDietary.map((option) => option.label) : undefined,
    excludeAllergens: selectedAllergens.length > 0 ? selectedAllergens.map((option) => option.label) : undefined,
  }

  return normalized
}

function getSelectionSignature(list) {
  return list
    .map((item) => `${String(item.label).trim().toLowerCase()}::${String(item.id)}`)
    .sort()
    .join('|')
}

function splitCsvParam(value) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toTagOptions(list) {
  return list.map((label) => ({ id: label, label }))
}

function getSafeFiltersFromSearchParams(searchParams) {
  return {
    difficulty: searchParams.get('difficulty') ?? '',
    minTotalTimeInMinutes: searchParams.get('minTotalTimeInMinutes') ?? '',
    maxTotalTimeInMinutes: searchParams.get('maxTotalTimeInMinutes') ?? '',
    minServings: searchParams.get('minServings') ?? '',
    maxServings: searchParams.get('maxServings') ?? '',
    minRating: searchParams.get('minRating') ?? '',
    maxRating: searchParams.get('maxRating') ?? '',
  }
}

function getSearchNameFromParams(searchParams) {
  return String(searchParams.get('name') ?? searchParams.get('search') ?? searchParams.get('query') ?? '').trim()
}

function buildFilterSearchParams(previousParams, name, normalizedFilters, page) {
  const nextParams = new URLSearchParams(previousParams)
  const filterKeys = [
    'name',
    'search',
    'query',
    'difficulty',
    'minTotalTimeInMinutes',
    'maxTotalTimeInMinutes',
    'minServings',
    'maxServings',
    'minRating',
    'maxRating',
    'dietaryPreferences',
    'excludeAllergens',
    'minPrepTimeInMinutes',
    'maxPrepTimeInMinutes',
    'minCookingTimeInMinutes',
    'maxCookingTimeInMinutes',
    'page',
  ]

  filterKeys.forEach((key) => nextParams.delete(key))

  if (name) {
    nextParams.set('name', name)
  }

  Object.entries(normalizedFilters).forEach(([key, value]) => {
    if (value === undefined) {
      return
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        nextParams.set(key, value.join(','))
      }

      return
    }

    nextParams.set(key, String(value))
  })

  nextParams.set('page', String(page))

  return nextParams
}

function setSearchParamsIfChanged(searchParams, setSearchParams, nextParams) {
  if (nextParams.toString() === searchParams.toString()) {
    return
  }

  setSearchParams(nextParams, { replace: true })
}

function HomePage({
  searchValue = '',
  onSearchValueChange,
  onRecipesChange,
  voiceDifficultyRequest,
  voiceTimeRequest,
  voiceDietaryRequest,
  voiceAllergenRequest,
  voiceServingsRequest,
  voiceRatingRequest,
  voiceApplyFiltersToken = 0,
  voiceClearFiltersToken = 0,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const hasInitializedFiltersRef = useRef(false)
  const [recipes, setRecipes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [availableDietaryOptions, setAvailableDietaryOptions] = useState([])
  const [availableAllergenOptions, setAvailableAllergenOptions] = useState([])
  const [selectedDietary, setSelectedDietary] = useState([])
  const [selectedAllergens, setSelectedAllergens] = useState([])
  const [appliedSelectedDietary, setAppliedSelectedDietary] = useState([])
  const [appliedSelectedAllergens, setAppliedSelectedAllergens] = useState([])
  const [dietaryQuery, setDietaryQuery] = useState('')
  const [allergenQuery, setAllergenQuery] = useState('')
  const [debouncedSearchValue, setDebouncedSearchValue] = useState('')
  const [safeFilters, setSafeFilters] = useState({
    difficulty: '',
    minTotalTimeInMinutes: '',
    maxTotalTimeInMinutes: '',
    minServings: '',
    maxServings: '',
    minRating: '',
    maxRating: '',
  })
  const [appliedSafeFilters, setAppliedSafeFilters] = useState({
    difficulty: '',
    minTotalTimeInMinutes: '',
    maxTotalTimeInMinutes: '',
    minServings: '',
    maxServings: '',
    minRating: '',
    maxRating: '',
  })
  const [currentPage, setCurrentPage] = useState(() => getCurrentPageFromSearchParams(searchParams))
  const [totalPages, setTotalPages] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)

  const recipesEndpoint = useMemo(() => {
    const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl)

    if (!normalizedBaseUrl) {
      return '/recipes'
    }

    return `${normalizedBaseUrl.replace(/\/$/, '')}/recipes`
  }, [])

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

  const normalizedFilters = useMemo(
    () => normalizeFilters(appliedSafeFilters, appliedSelectedDietary, appliedSelectedAllergens),
    [appliedSafeFilters, appliedSelectedDietary, appliedSelectedAllergens],
  )

  const hasPendingFilterChanges = useMemo(() => {
    const sameSafeFilters =
      safeFilters.difficulty === appliedSafeFilters.difficulty &&
      safeFilters.minTotalTimeInMinutes === appliedSafeFilters.minTotalTimeInMinutes &&
      safeFilters.maxTotalTimeInMinutes === appliedSafeFilters.maxTotalTimeInMinutes &&
      safeFilters.minServings === appliedSafeFilters.minServings &&
      safeFilters.maxServings === appliedSafeFilters.maxServings &&
      safeFilters.minRating === appliedSafeFilters.minRating &&
      safeFilters.maxRating === appliedSafeFilters.maxRating

    if (!sameSafeFilters) {
      return true
    }

    return (
      getSelectionSignature(selectedDietary) !== getSelectionSignature(appliedSelectedDietary) ||
      getSelectionSignature(selectedAllergens) !== getSelectionSignature(appliedSelectedAllergens)
    )
  }, [
    safeFilters,
    appliedSafeFilters,
    selectedDietary,
    appliedSelectedDietary,
    selectedAllergens,
    appliedSelectedAllergens,
  ])

  const remainingDietaryOptions = availableDietaryOptions.filter(
    (option) => !selectedDietary.some((selected) => sameOption(selected, option)),
  )

  const remainingAllergenOptions = availableAllergenOptions.filter(
    (option) => !selectedAllergens.some((selected) => sameOption(selected, option)),
  )

  const filteredDietaryOptions = matchByRegex(remainingDietaryOptions, dietaryQuery)
  const filteredAllergenOptions = matchByRegex(remainingAllergenOptions, allergenQuery)

  const appliedCoreFilterChips = useMemo(() => {
    const chips = []

    const minTotal = appliedSafeFilters.minTotalTimeInMinutes.trim()
    const maxTotal = appliedSafeFilters.maxTotalTimeInMinutes.trim()

    if (minTotal || maxTotal) {
      chips.push({ key: 'total-time', label: `Time: ${minTotal || 'Any'}-${maxTotal || 'Any'} min` })
    }

    return chips
  }, [appliedSafeFilters.maxTotalTimeInMinutes, appliedSafeFilters.minTotalTimeInMinutes])

  const filtersQueryString = useMemo(() => {
    const queryParams = new URLSearchParams()
    const trimmedSearch = debouncedSearchValue.trim()

    if (trimmedSearch) {
      queryParams.set('name', trimmedSearch)
    }

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
  }, [debouncedSearchValue, normalizedFilters])

  const handleFilterChange = (fieldName) => (event) => {
    setSafeFilters((previous) => ({
      ...previous,
      [fieldName]: event.target.value,
    }))
  }

  const handleAddDietary = (option) => {
    setSelectedDietary((previous) => [...previous, option])
    setDietaryQuery('')
  }

  const handleRemoveDietary = (option) => {
    setSelectedDietary((previous) => previous.filter((item) => !sameOption(item, option)))
  }

  const handleAddAllergen = (option) => {
    setSelectedAllergens((previous) => [...previous, option])
    setAllergenQuery('')
  }

  const handleRemoveAllergen = (option) => {
    setSelectedAllergens((previous) => previous.filter((item) => !sameOption(item, option)))
  }

  const handleApplyFilters = () => {
    const nextAppliedFilters = { ...safeFilters }
    const nextAppliedDietary = [...selectedDietary]
    const nextAppliedAllergens = [...selectedAllergens]
    const normalizedAppliedFilters = normalizeFilters(nextAppliedFilters, nextAppliedDietary, nextAppliedAllergens)

    setAppliedSafeFilters(nextAppliedFilters)
    setAppliedSelectedDietary(nextAppliedDietary)
    setAppliedSelectedAllergens(nextAppliedAllergens)
    setCurrentPage(1)
    setSearchParamsIfChanged(
      searchParams,
      setSearchParams,
      buildFilterSearchParams(searchParams, debouncedSearchValue.trim(), normalizedAppliedFilters, 1),
    )
  }

  const handleClearFilters = () => {
    const clearedFilters = {
      difficulty: '',
      minTotalTimeInMinutes: '',
      maxTotalTimeInMinutes: '',
      minServings: '',
      maxServings: '',
      minRating: '',
      maxRating: '',
    }

    setSafeFilters(clearedFilters)
    setAppliedSafeFilters(clearedFilters)
    setSelectedDietary([])
    setSelectedAllergens([])
    setAppliedSelectedDietary([])
    setAppliedSelectedAllergens([])
    setDietaryQuery('')
    setAllergenQuery('')
    onSearchValueChange?.('')
    setDebouncedSearchValue('')
    setCurrentPage(1)
    setSearchParamsIfChanged(searchParams, setSearchParams, buildFilterSearchParams(searchParams, '', {}, 1))
  }

  const handlePreviousPage = () => {
    if (isLoading) {
      return
    }

    setCurrentPage((previous) => Math.max(1, previous - 1))
  }

  const handleNextPage = () => {
    if (isLoading || !hasNextPage) {
      return
    }

    setCurrentPage((previous) => previous + 1)
  }

  useEffect(() => {
    const requestedDifficulty = normalizeDifficultyValue(voiceDifficultyRequest?.difficulty)

    if (!requestedDifficulty) {
      return
    }

    setSafeFilters((previous) => ({
      ...previous,
      difficulty: requestedDifficulty,
    }))
  }, [voiceDifficultyRequest])

  useEffect(() => {
    const requestType = String(voiceTimeRequest?.type ?? '').trim().toLowerCase()
    const requestedMinutes = normalizeMinutesValue(voiceTimeRequest?.minutes)

    if (!requestedMinutes || (requestType !== 'min' && requestType !== 'max')) {
      return
    }

    setSafeFilters((previous) => ({
      ...previous,
      minTotalTimeInMinutes: requestType === 'min' ? requestedMinutes : previous.minTotalTimeInMinutes,
      maxTotalTimeInMinutes: requestType === 'max' ? requestedMinutes : previous.maxTotalTimeInMinutes,
    }))
  }, [voiceTimeRequest])

  useEffect(() => {
    const requestedDietary = String(voiceDietaryRequest?.dietaryPreference ?? '').trim()

    if (!requestedDietary) {
      return
    }

    const normalizedRequestedDietary = normalizeTagValue(requestedDietary)

    if (!normalizedRequestedDietary) {
      return
    }

    const matchedOption = availableDietaryOptions.find(
      (option) => normalizeTagValue(option.label) === normalizedRequestedDietary,
    )

    const optionToAdd = matchedOption ?? { id: requestedDietary, label: requestedDietary }

    setSelectedDietary((previous) => {
      if (previous.some((item) => sameOption(item, optionToAdd))) {
        return previous
      }

      return [...previous, optionToAdd]
    })
  }, [availableDietaryOptions, voiceDietaryRequest])

  useEffect(() => {
    const requestedAllergen = String(voiceAllergenRequest?.allergen ?? '').trim()

    if (!requestedAllergen) {
      return
    }

    const normalizedRequestedAllergen = normalizeTagValue(requestedAllergen)

    if (!normalizedRequestedAllergen) {
      return
    }

    const matchedOption = availableAllergenOptions.find(
      (option) => normalizeTagValue(option.label) === normalizedRequestedAllergen,
    )

    const optionToAdd = matchedOption ?? { id: requestedAllergen, label: requestedAllergen }

    setSelectedAllergens((previous) => {
      if (previous.some((item) => sameOption(item, optionToAdd))) {
        return previous
      }

      return [...previous, optionToAdd]
    })
  }, [availableAllergenOptions, voiceAllergenRequest])

  useEffect(() => {
    const requestType = String(voiceServingsRequest?.type ?? '').trim().toLowerCase()
    const requestedServings = normalizeServingsValue(voiceServingsRequest?.servings)

    if (!requestedServings || (requestType !== 'min' && requestType !== 'max')) {
      return
    }

    setSafeFilters((previous) => ({
      ...previous,
      minServings: requestType === 'min' ? requestedServings : previous.minServings,
      maxServings: requestType === 'max' ? requestedServings : previous.maxServings,
    }))
  }, [voiceServingsRequest])

  useEffect(() => {
    const requestType = String(voiceRatingRequest?.type ?? '').trim().toLowerCase()
    const requestedRating = normalizeRatingValue(voiceRatingRequest?.rating)

    if (!requestedRating || (requestType !== 'min' && requestType !== 'max')) {
      return
    }

    setSafeFilters((previous) => ({
      ...previous,
      minRating: requestType === 'min' ? requestedRating : previous.minRating,
      maxRating: requestType === 'max' ? requestedRating : previous.maxRating,
    }))
  }, [voiceRatingRequest])

  useEffect(() => {
    if (voiceApplyFiltersToken <= 0) {
      return
    }

    handleApplyFilters()
  }, [voiceApplyFiltersToken])

  useEffect(() => {
    if (voiceClearFiltersToken <= 0) {
      return
    }

    handleClearFilters()
  }, [voiceClearFiltersToken])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchValue(searchValue)
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchValue])

  useEffect(() => {
    const nextSafeFilters = getSafeFiltersFromSearchParams(searchParams)
    const nextSelectedDietary = toTagOptions(splitCsvParam(searchParams.get('dietaryPreferences')))
    const nextSelectedAllergens = toTagOptions(splitCsvParam(searchParams.get('excludeAllergens')))
    const nextSearchValue = getSearchNameFromParams(searchParams)
    const hasLegacyParams =
      searchParams.has('search') ||
      searchParams.has('query') ||
      searchParams.has('minPrepTimeInMinutes') ||
      searchParams.has('maxPrepTimeInMinutes') ||
      searchParams.has('minCookingTimeInMinutes') ||
      searchParams.has('maxCookingTimeInMinutes')

    setSafeFilters(nextSafeFilters)
    setAppliedSafeFilters(nextSafeFilters)
    setSelectedDietary(nextSelectedDietary)
    setSelectedAllergens(nextSelectedAllergens)
    setAppliedSelectedDietary(nextSelectedDietary)
    setAppliedSelectedAllergens(nextSelectedAllergens)
    setCurrentPage(getCurrentPageFromSearchParams(searchParams))
    setDebouncedSearchValue(nextSearchValue)
    onSearchValueChange?.(nextSearchValue)

    if (hasLegacyParams) {
      const normalizedFromUrl = normalizeFilters(nextSafeFilters, nextSelectedDietary, nextSelectedAllergens)
      setSearchParamsIfChanged(
        searchParams,
        setSearchParams,
        buildFilterSearchParams(
          searchParams,
          nextSearchValue,
          normalizedFromUrl,
          getCurrentPageFromSearchParams(searchParams),
        ),
      )
    }
  }, [])

  useEffect(() => {
    setCurrentPage(getCurrentPageFromSearchParams(searchParams))
  }, [searchParams])

  useEffect(() => {
    if (!hasInitializedFiltersRef.current) {
      hasInitializedFiltersRef.current = true
      return
    }

    setCurrentPage(1)
  }, [filtersQueryString])

  useEffect(() => {
    const normalizedAppliedFilters = normalizeFilters(appliedSafeFilters, appliedSelectedDietary, appliedSelectedAllergens)
    setSearchParamsIfChanged(
      searchParams,
      setSearchParams,
      buildFilterSearchParams(searchParams, debouncedSearchValue.trim(), normalizedAppliedFilters, currentPage),
    )
  }, [appliedSafeFilters, appliedSelectedAllergens, appliedSelectedDietary, currentPage, debouncedSearchValue, searchParams, setSearchParams])

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
          setAvailableDietaryOptions(normalizeOptions(extractListFromPayload(dietaryPayload)))
        }

        if (allergenResponse.ok) {
          setAvailableAllergenOptions(normalizeOptions(extractListFromPayload(allergenPayload)))
        }
      } catch {
        // Keep Home usable even if tag options fail to load.
      }
    }

    loadReferenceOptions()

    return () => {
      isMounted = false
    }
  }, [allergenOptionsEndpoint, dietaryOptionsEndpoint])

  useEffect(() => {
    let isActive = true
    const abortController = new AbortController()

    const loadRecipes = async () => {
      setIsLoading(true)
      setErrorMessage('')

      const queryParams = new URLSearchParams(filtersQueryString)
      queryParams.set('page', String(currentPage))
      queryParams.set('limit', String(RECIPES_PER_PAGE))
      const requestUrl = `${recipesEndpoint}?${queryParams.toString()}`

      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          credentials: 'include',
          signal: abortController.signal,
        })

        const payload = await response.json().catch(() => null)

        if (!isActive) {
          return
        }

        if (!response.ok || payload?.success === false) {
          setErrorMessage(
            toUserSafeErrorMessage(
              payload?.message ?? payload?.error?.message,
              'We could not load recipes right now. Please try again in a moment.',
            ),
          )
          setHasNextPage(false)
          return
        }

        const recipeList = extractListFromPayload(payload)
        const nextTotalPages = getTotalPagesFromPayload(payload)

        setRecipes(recipeList)
        setTotalPages(nextTotalPages ?? currentPage)
        setHasNextPage(nextTotalPages ? currentPage < nextTotalPages : recipeList.length === RECIPES_PER_PAGE)
      } catch (error) {
        if (error?.name === 'AbortError') {
          return
        }

        if (!isActive) {
          return
        }

        setErrorMessage('We could not load recipes right now. Please try again in a moment.')
        setHasNextPage(false)
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    loadRecipes()

    return () => {
      isActive = false
      abortController.abort()
    }
  }, [currentPage, filtersQueryString, recipesEndpoint])

  useEffect(() => {
    onRecipesChange?.(recipes)
  }, [onRecipesChange, recipes])

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
          <div className="home-filter-range" aria-label="Time range in minutes">
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Time min" value={safeFilters.minTotalTimeInMinutes} onChange={handleFilterChange('minTotalTimeInMinutes')} />
            <span className="home-filter-range-separator">-</span>
            <input className="home-filter-range-input" type="text" inputMode="numeric" placeholder="Max" value={safeFilters.maxTotalTimeInMinutes} onChange={handleFilterChange('maxTotalTimeInMinutes')} />
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

          <div className="tag-selector home-filter-tag home-filter-tag-dietary">
            <div className="tag-search">
              <input
                className="home-filter-input home-filter-tag-input"
                value={dietaryQuery}
                onChange={(event) => setDietaryQuery(event.target.value)}
                placeholder="Dietary preferences"
                aria-label="Dietary preferences"
              />

              {dietaryQuery.trim() ? (
                <ul className="tag-dropdown">
                  {filteredDietaryOptions.length > 0 ? (
                    filteredDietaryOptions.map((option) => (
                      <li key={`dietary-option-${option.id}-${option.label}`}>
                        <button type="button" className="tag-option" onClick={() => handleAddDietary(option)}>
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
          </div>

          <div className="tag-selector home-filter-tag home-filter-tag-allergen">
            <div className="tag-search">
              <input
                className="home-filter-input home-filter-tag-input"
                value={allergenQuery}
                onChange={(event) => setAllergenQuery(event.target.value)}
                placeholder="Exclude allergens"
                aria-label="Exclude allergens"
              />

              {allergenQuery.trim() ? (
                <ul className="tag-dropdown">
                  {filteredAllergenOptions.length > 0 ? (
                    filteredAllergenOptions.map((option) => (
                      <li key={`allergen-option-${option.id}-${option.label}`}>
                        <button type="button" className="tag-option" onClick={() => handleAddAllergen(option)}>
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
          </div>

          <div className="home-filter-actions" aria-label="Filter actions">
            <button
              type="button"
              className="home-filter-action-button home-filter-action-apply"
              onClick={handleApplyFilters}
              disabled={!hasPendingFilterChanges}
            >
              Apply filters
            </button>
            <button
              type="button"
              className="home-filter-action-button home-filter-action-clear"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          </div>
        </div>

        {appliedCoreFilterChips.length > 0 || selectedDietary.length > 0 || selectedAllergens.length > 0 ? (
          <div className="home-selected-tags" aria-label="Selected recipe filters">
            {appliedCoreFilterChips.length > 0 ? (
              <div className="home-selected-tag-list">
                {appliedCoreFilterChips.map((chip) => (
                  <span className="tag-pill" key={chip.key}>
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : null}

            {selectedDietary.length > 0 ? (
              <div className="home-selected-tag-group home-selected-tag-group-dietary">
                <p className="home-selected-tag-label">Dietary preferences</p>
                <div className="home-selected-tag-list">
                  {selectedDietary.map((item) => (
                    <span className="tag-pill home-tag-pill-dietary" key={`dietary-${item.id}-${item.label}`}>
                      {item.label}
                      <button type="button" className="tag-remove" aria-label={`Remove ${item.label}`} onClick={() => handleRemoveDietary(item)}>
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedAllergens.length > 0 ? (
              <div className="home-selected-tag-group home-selected-tag-group-allergen">
                <p className="home-selected-tag-label">Exclude allergens</p>
                <div className="home-selected-tag-list">
                  {selectedAllergens.map((item) => (
                    <span className="tag-pill home-tag-pill-allergen" key={`allergen-${item.id}-${item.label}`}>
                      {item.label}
                      <button type="button" className="tag-remove" aria-label={`Remove ${item.label}`} onClick={() => handleRemoveAllergen(item)}>
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="home-recipes-skeleton-grid" aria-hidden="true">
          {Array.from({ length: RECIPES_PER_PAGE }).map((_, index) => (
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
          <>
            <div className="home-recipes-grid">
              {recipes.map((recipe) => (
                <Link key={recipe.id} to={`/recipes/${encodeURIComponent(recipe.id)}`} className="home-recipe-card">
                  <p className="home-recipe-status">{getStatusLabel(recipe.status)}</p>
                  <h2>{recipe.title}</h2>
                  <p className="home-recipe-meta">{recipe.difficulty}</p>
                  <p className="home-recipe-meta">
                    {recipe.prepTimeInMinutes + recipe.cookingTimeInMinutes} min total
                  </p>
                </Link>
              ))}
            </div>
            <div className="home-pagination" aria-label="Recipe pagination">
              <button type="button" className="home-pagination-button" onClick={handlePreviousPage} disabled={isLoading || currentPage <= 1}>
                Previous
              </button>
              <p className="home-pagination-status">Page {currentPage}{totalPages > currentPage ? ` of ${totalPages}` : ''}</p>
              <button type="button" className="home-pagination-button" onClick={handleNextPage} disabled={isLoading || !hasNextPage}>
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="home-recipes-empty">No recipes yet. Create one from the Create page.</div>
        )
      ) : null}
    </section>
  )
}

export default HomePage

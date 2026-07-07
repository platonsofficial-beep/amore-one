const MOBILE_TAB_STORAGE_KEY = 'one.mobileTab.v1'
const MOBILE_MANAGER_TAB_STORAGE_KEY = 'one.mobileManagerTab.v1'
const DEFAULT_MOBILE_TAB = 'home'
const DEFAULT_MANAGER_MOBILE_TAB = 'today'

const VALID_MOBILE_TABS = new Set(['home', 'schedule', 'tasks', 'menu'])
const VALID_MANAGER_MOBILE_TABS = new Set(['today', 'stock', 'tasks', 'menu'])

export function normalizeMobileTab(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return VALID_MOBILE_TABS.has(normalized) ? normalized : DEFAULT_MOBILE_TAB
}

export function readPersistedMobileTab() {
  if (typeof window === 'undefined') return DEFAULT_MOBILE_TAB

  try {
    const stored = window.localStorage.getItem(MOBILE_TAB_STORAGE_KEY)
    if (!stored) return DEFAULT_MOBILE_TAB
    return normalizeMobileTab(stored)
  } catch {
    return DEFAULT_MOBILE_TAB
  }
}

export function persistMobileTab(tab) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MOBILE_TAB_STORAGE_KEY, normalizeMobileTab(tab))
  } catch {
    // Ignore storage failures.
  }
}

export function normalizeManagerMobileTab(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return VALID_MANAGER_MOBILE_TABS.has(normalized) ? normalized : DEFAULT_MANAGER_MOBILE_TAB
}

export function readPersistedManagerMobileTab() {
  if (typeof window === 'undefined') return DEFAULT_MANAGER_MOBILE_TAB

  try {
    const stored = window.localStorage.getItem(MOBILE_MANAGER_TAB_STORAGE_KEY)
    if (!stored) return DEFAULT_MANAGER_MOBILE_TAB
    return normalizeManagerMobileTab(stored)
  } catch {
    return DEFAULT_MANAGER_MOBILE_TAB
  }
}

export function persistManagerMobileTab(tab) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MOBILE_MANAGER_TAB_STORAGE_KEY, normalizeManagerMobileTab(tab))
  } catch {
    // Ignore storage failures.
  }
}

const MOBILE_WEEK_START_STORAGE_KEY = 'one.mobileWeekStart.v1'

function normalizeWeekStartDate(value) {
  const normalized = `${value ?? ''}`.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return ''
  return normalized
}

export function readPersistedMobileWeekStart(fallbackWeekStart = '') {
  if (typeof window === 'undefined') {
    return normalizeWeekStartDate(fallbackWeekStart)
  }

  try {
    const stored = normalizeWeekStartDate(window.sessionStorage.getItem(MOBILE_WEEK_START_STORAGE_KEY))
    return stored || normalizeWeekStartDate(fallbackWeekStart)
  } catch {
    return normalizeWeekStartDate(fallbackWeekStart)
  }
}

export function persistMobileWeekStart(weekStart) {
  if (typeof window === 'undefined') return

  const normalized = normalizeWeekStartDate(weekStart)
  if (!normalized) return

  try {
    window.sessionStorage.setItem(MOBILE_WEEK_START_STORAGE_KEY, normalized)
  } catch {
    // Ignore storage failures.
  }
}

export function clearMobileSessionState() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(MOBILE_TAB_STORAGE_KEY)
    window.localStorage.removeItem(MOBILE_MANAGER_TAB_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }

  try {
    const sessionKeysToRemove = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (!key) continue
      if (key === MOBILE_WEEK_START_STORAGE_KEY || key.startsWith('one.mobile')) {
        sessionKeysToRemove.push(key)
      }
    }

    sessionKeysToRemove.forEach((key) => {
      window.sessionStorage.removeItem(key)
    })
  } catch {
    // Ignore storage failures.
  }
}

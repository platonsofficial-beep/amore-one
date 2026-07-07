const MOBILE_TAB_STORAGE_KEY = 'one.mobileTab.v1'
const DEFAULT_MOBILE_TAB = 'home'

const VALID_MOBILE_TABS = new Set(['home', 'schedule', 'tasks', 'menu'])

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
  window.localStorage.setItem(MOBILE_TAB_STORAGE_KEY, normalizeMobileTab(tab))
}

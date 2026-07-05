const NAVIGATION_STORAGE_KEY = 'one.navigation.v1'
const DEFAULT_ACTIVE_VIEW = 'dashboard'
const DEFAULT_SETTINGS_SECTION = 'profile'

const VALID_ACTIVE_VIEWS = new Set([
  'dashboard',
  'staff',
  'schedule',
  'reservations',
  'suppliers',
  'tasks',
  'stock',
  'reports',
  'settings',
  'floor-plan-builder',
])

const VALID_SETTINGS_SECTIONS = new Set([
  'profile',
  'positions',
  'venue',
  'team',
  'system',
])

export function normalizeActiveView(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_ACTIVE_VIEWS.has(normalized) ? normalized : DEFAULT_ACTIVE_VIEW
}

export function normalizeSettingsSection(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_SETTINGS_SECTIONS.has(normalized) ? normalized : DEFAULT_SETTINGS_SECTION
}

function readStoredNavigationRaw() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(NAVIGATION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function readPersistedNavigation() {
  const stored = readStoredNavigationRaw()
  if (!stored) {
    return {
      activeView: DEFAULT_ACTIVE_VIEW,
      settingsSection: DEFAULT_SETTINGS_SECTION,
    }
  }

  const activeView = normalizeActiveView(stored.activeView)
  const settingsSection = normalizeSettingsSection(stored.settingsSection)

  return { activeView, settingsSection }
}

export function persistNavigation({ activeView, settingsSection }) {
  if (typeof window === 'undefined') return

  const normalizedActiveView = normalizeActiveView(activeView)
  const normalizedSettingsSection = normalizeSettingsSection(settingsSection)

  window.localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
    activeView: normalizedActiveView,
    settingsSection: normalizedSettingsSection,
  }))
}

export function persistActiveView(activeView, settingsSection = DEFAULT_SETTINGS_SECTION) {
  persistNavigation({ activeView, settingsSection })
}

export function persistSettingsSection(settingsSection, activeView = DEFAULT_ACTIVE_VIEW) {
  persistNavigation({ activeView, settingsSection })
}

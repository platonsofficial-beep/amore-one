import { migrateLegacyActiveView } from './appNavigation'

const NAVIGATION_STORAGE_KEY = 'one.navigation.v2'
const LEGACY_NAVIGATION_STORAGE_KEY = 'one.navigation.v1'
const DEFAULT_ACTIVE_VIEW = 'today'
const DEFAULT_SETTINGS_SECTION = 'profile'
const DEFAULT_TEAM_SECTION = 'today'
const DEFAULT_STOCK_SECTION = 'dashboard'
const DEFAULT_OPERATIONS_SECTION = 'dashboard'

const VALID_ACTIVE_VIEWS = new Set([
  'today',
  'reservations',
  'team',
  'stock',
  'operations',
  'insights',
  'settings',
  'time-clock',
  'floor-plan-builder',
  'my-week',
  'account',
  'clock',
  'notifications',
  'chat',
])

const VALID_TEAM_SECTIONS = new Set(['today', 'members', 'schedule'])
const VALID_STOCK_SECTIONS = new Set(['dashboard', 'count', 'storages', 'suppliers', 'orders', 'migration'])
const VALID_OPERATIONS_SECTIONS = new Set(['dashboard', 'tasks', 'checklists'])

const VALID_SETTINGS_SECTIONS = new Set([
  'profile',
  'positions',
  'venue',
  'team',
  'notifications',
  'system',
])

function normalizeTeamSection(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_TEAM_SECTIONS.has(normalized) ? normalized : DEFAULT_TEAM_SECTION
}

function normalizeStockSection(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_STOCK_SECTIONS.has(normalized) ? normalized : DEFAULT_STOCK_SECTION
}

function normalizeOperationsSection(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_OPERATIONS_SECTIONS.has(normalized) ? normalized : DEFAULT_OPERATIONS_SECTION
}

function normalizeScheduleWeekStart(value) {
  const normalized = `${value ?? ''}`.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  return normalized
}

/**
 * Team schedule always opens on the current venue week.
 * A week saved in localStorage is ignored, including a previous week that
 * was left open the last time the app was used.
 */
export function resolveInitialScheduleWeekStart(currentWeekStart) {
  return normalizeScheduleWeekStart(currentWeekStart)
}

export function normalizeActiveView(value) {
  const normalized = `${value ?? ''}`.trim()
  if (VALID_ACTIVE_VIEWS.has(normalized)) {
    return normalized
  }

  const migrated = migrateLegacyActiveView(normalized)
  if (migrated?.activeView && VALID_ACTIVE_VIEWS.has(migrated.activeView)) {
    return migrated.activeView
  }

  return DEFAULT_ACTIVE_VIEW
}

export function normalizeSettingsSection(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_SETTINGS_SECTIONS.has(normalized) ? normalized : DEFAULT_SETTINGS_SECTION
}

function readStoredNavigationRaw() {
  if (typeof window === 'undefined') return null

  try {
    const current = window.localStorage.getItem(NAVIGATION_STORAGE_KEY)
    if (current) return JSON.parse(current)

    const legacy = window.localStorage.getItem(LEGACY_NAVIGATION_STORAGE_KEY)
    if (!legacy) return null

    const legacyStored = JSON.parse(legacy)
    const migrated = applyLegacyMigration(legacyStored)
    persistNavigation(migrated)
    window.localStorage.removeItem(LEGACY_NAVIGATION_STORAGE_KEY)
    return migrated
  } catch {
    return null
  }
}

function applyLegacyMigration(stored) {
  const legacyView = `${stored?.activeView ?? ''}`.trim()
  const migrated = migrateLegacyActiveView(legacyView)

  return {
    activeView: migrated?.activeView ?? normalizeActiveView(legacyView),
    settingsSection: normalizeSettingsSection(stored?.settingsSection),
    teamSection: normalizeTeamSection(migrated?.teamSection ?? stored?.teamSection),
    stockSection: normalizeStockSection(migrated?.stockSection ?? stored?.stockSection),
    operationsSection: normalizeOperationsSection(migrated?.operationsSection ?? stored?.operationsSection),
  }
}

/** True when a previous session already stored a route (PWA refresh keeps it). */
export function hasPersistedNavigation() {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(window.localStorage.getItem(NAVIGATION_STORAGE_KEY))
  } catch {
    return false
  }
}

export function readPersistedNavigation() {
  const stored = readStoredNavigationRaw()
  if (!stored) {
    return {
      activeView: DEFAULT_ACTIVE_VIEW,
      settingsSection: DEFAULT_SETTINGS_SECTION,
      teamSection: DEFAULT_TEAM_SECTION,
      stockSection: DEFAULT_STOCK_SECTION,
      operationsSection: DEFAULT_OPERATIONS_SECTION,
      scheduleWeekStart: null,
    }
  }

  const legacyView = `${stored.activeView ?? ''}`.trim()
  const migrated = migrateLegacyActiveView(legacyView)

  return {
    activeView: normalizeActiveView(migrated?.activeView ?? legacyView),
    settingsSection: normalizeSettingsSection(stored.settingsSection),
    teamSection: normalizeTeamSection(migrated?.teamSection ?? stored.teamSection),
    stockSection: normalizeStockSection(migrated?.stockSection ?? stored.stockSection),
    operationsSection: normalizeOperationsSection(migrated?.operationsSection ?? stored.operationsSection),
    scheduleWeekStart: null,
  }
}

export function persistNavigation({
  activeView,
  settingsSection,
  teamSection,
  stockSection,
  operationsSection,
}) {
  if (typeof window === 'undefined') return

  const current = readPersistedNavigation()

  window.localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
    activeView: normalizeActiveView(activeView ?? current.activeView),
    settingsSection: normalizeSettingsSection(settingsSection ?? current.settingsSection),
    teamSection: normalizeTeamSection(teamSection ?? current.teamSection),
    stockSection: normalizeStockSection(stockSection ?? current.stockSection),
    operationsSection: normalizeOperationsSection(operationsSection ?? current.operationsSection),
  }))
}

export function persistActiveView(activeView, settingsSection = DEFAULT_SETTINGS_SECTION) {
  persistNavigation({ activeView, settingsSection })
}

export function persistSettingsSection(settingsSection, activeView = DEFAULT_ACTIVE_VIEW) {
  persistNavigation({ activeView, settingsSection })
}

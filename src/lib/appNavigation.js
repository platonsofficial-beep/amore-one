export const NAV_ITEMS = [
  { id: 'today', label: 'Today', icon: '◈' },
  { id: 'reservations', label: 'Reservations', icon: '🍽️' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'operations', label: 'Operations', icon: '✓' },
  { id: 'insights', label: 'Insights', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export const TEAM_SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'members', label: 'People' },
  { id: 'schedule', label: 'Schedule' },
]

export const STOCK_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'count', label: 'Inventory Count' },
  { id: 'storages', label: 'Storages' },
  { id: 'inventory', label: 'Legacy Inventory' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'orders', label: 'Orders' },
  { id: 'migration', label: 'Import & Migration' },
]

export const OPERATIONS_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'checklists', label: 'Checklists' },
]

export const MODULE_LABELS = {
  today: 'Today',
  reservations: 'Reservations',
  team: 'Team',
  stock: 'Stock',
  operations: 'Operations',
  insights: 'Insights',
  settings: 'Settings',
  'floor-plan-builder': 'Floor Plan Builder',
}

const LEGACY_ACTIVE_VIEW_MAP = {
  dashboard: { activeView: 'today' },
  staff: { activeView: 'team', teamSection: 'schedule' },
  schedule: { activeView: 'team', teamSection: 'schedule' },
  reservations: { activeView: 'reservations' },
  suppliers: { activeView: 'stock', stockSection: 'suppliers' },
  tasks: { activeView: 'operations', operationsSection: 'dashboard' },
  reports: { activeView: 'insights' },
  settings: { activeView: 'settings' },
  'floor-plan-builder': { activeView: 'reservations' },
}

const INSIGHTS_MODULE_LINKS = {
  tasks: { activeView: 'operations', operationsSection: 'dashboard' },
  schedule: { activeView: 'team', teamSection: 'schedule' },
  suppliers: { activeView: 'stock', stockSection: 'suppliers' },
  stock: { activeView: 'stock', stockSection: 'dashboard' },
  reservations: { activeView: 'reservations' },
  reports: { activeView: 'insights' },
  insights: { activeView: 'insights' },
  operations: { activeView: 'operations', operationsSection: 'dashboard' },
  team: { activeView: 'team', teamSection: 'today' },
  today: { activeView: 'today' },
}

export function migrateLegacyActiveView(value) {
  const normalized = `${value ?? ''}`.trim()
  return LEGACY_ACTIVE_VIEW_MAP[normalized] ?? null
}

export function resolveInsightsModuleLink(moduleId) {
  const normalized = `${moduleId ?? ''}`.trim()
  return INSIGHTS_MODULE_LINKS[normalized] ?? migrateLegacyActiveView(normalized) ?? { activeView: 'today' }
}

export function getModuleLabel(moduleId) {
  return MODULE_LABELS[moduleId] || 'This module'
}

export function isTodayView(activeView) {
  return activeView === 'today'
}

export function isTeamScheduleView(activeView, teamSection) {
  return activeView === 'team' && teamSection === 'schedule'
}

export function isStockWorkspaceView(activeView) {
  return activeView === 'stock'
}

export function shouldHideStandardTopbar(activeView, teamSection) {
  return isTeamScheduleView(activeView, teamSection)
    || activeView === 'floor-plan-builder'
    || activeView === 'reservations'
    || isStockWorkspaceView(activeView)
}

export function resolveExitStockDestination(previousView) {
  const normalized = `${previousView ?? ''}`.trim()
  if (normalized && normalized !== 'stock') {
    return normalized
  }
  return 'today'
}

export function shouldUseCommandTopbar(activeView) {
  return isTodayView(activeView)
}

export function getModuleTitle(activeView, {
  teamSection = 'today',
  stockSection = 'dashboard',
  operationsSection = 'dashboard',
} = {}) {
  if (activeView === 'today') return 'Today'
  if (activeView === 'reservations') return 'Reservations'
  if (activeView === 'team') {
    if (teamSection === 'schedule') return 'Schedule'
    if (teamSection === 'members') return 'People'
    return 'Team'
  }
  if (activeView === 'stock') {
    if (stockSection === 'count') return 'Inventory Count'
    if (stockSection === 'storages') return 'Storages'
    if (stockSection === 'suppliers') return 'Suppliers'
    if (stockSection === 'inventory') return 'Legacy Inventory'
    if (stockSection === 'orders') return 'Orders'
    if (stockSection === 'migration') return 'Import & Migration'
    return 'Stock'
  }
  if (activeView === 'operations') {
    if (operationsSection === 'checklists') return 'Checklists'
    return 'Operations'
  }
  if (activeView === 'insights') return 'Insights'
  if (activeView === 'settings') return 'Settings'
  return getModuleLabel(activeView)
}

export function getModuleSubtitle(activeView, currentDateLabel, {
  teamSection = 'today',
  stockSection = 'dashboard',
  operationsSection = 'dashboard',
} = {}) {
  if (activeView === 'today') {
    return `${currentDateLabel} · Your daily command center`
  }
  if (activeView === 'reservations') return 'Guest flow and service.'
  if (activeView === 'team' && teamSection === 'today') return "Who's working today."
  if (activeView === 'team' && teamSection === 'members') return 'Manage your team.'
  if (activeView === 'team' && teamSection === 'schedule') return ''
  if (activeView === 'stock' && stockSection === 'dashboard') return 'Stock levels, movements, and alerts.'
  if (activeView === 'stock' && stockSection === 'count') {
    return 'Count inventory by location, review variances, and post verified stock levels.'
  }
  if (activeView === 'stock' && stockSection === 'storages') {
    return 'Understand and manage stock by physical location.'
  }
  if (activeView === 'stock' && stockSection === 'inventory') {
    return 'Legacy product records retained for migration and historical reference. Live stock products are managed from Dashboard.'
  }
  if (activeView === 'stock' && stockSection === 'suppliers') return 'Supplier contacts, products, and purchase history.'
  if (activeView === 'stock' && stockSection === 'orders') return 'Supplier purchase orders and receiving.'
  if (activeView === 'stock' && stockSection === 'migration') {
    return 'Spreadsheet import for catalog onboarding, or one-time legacy inventory cutover.'
  }
  if (activeView === 'operations' && operationsSection === 'checklists') return 'Build reusable opening, closing, and prep procedures.'
  if (activeView === 'operations') return 'Daily tasks, issues, and shift communication.'
  if (activeView === 'insights') return 'Business intelligence from live data.'
  if (activeView === 'settings') return 'Workspace and account configuration.'
  return ''
}

export function getSearchPlaceholder(activeView, {
  teamSection = 'today',
  stockSection = 'dashboard',
  operationsSection = 'dashboard',
} = {}) {
  if (activeView === 'team' && teamSection === 'members') return 'Search employee'
  if (activeView === 'stock' && stockSection === 'orders') return 'Search order #, supplier, product'
  if (activeView === 'stock' && stockSection === 'dashboard') return 'Search stock item'
  if (activeView === 'stock' && stockSection === 'inventory') return 'Search legacy inventory'
  if (activeView === 'stock' && stockSection === 'count') return 'Search counts'
  if (activeView === 'stock' && stockSection === 'storages') return 'Search storages'
  if (activeView === 'stock' && stockSection === 'suppliers') return 'Search supplier'
  if (activeView === 'stock' && stockSection === 'migration') return 'Search migration stages'
  if (activeView === 'operations' && operationsSection === 'checklists') return 'Search checklists'
  if (activeView === 'operations' && operationsSection === 'dashboard') return 'Search tasks and notes'
  if (activeView === 'insights') return 'Search insights'
  return 'Search'
}

export function shouldShowModuleSearch(activeView, teamSection) {
  if (isTodayView(activeView)) return false
  if (isTeamScheduleView(activeView, teamSection)) return false
  if (activeView === 'team' && teamSection === 'today') return false
  if (activeView === 'settings') return false
  return true
}

export function getDefaultTeamSection(role, canAccessTeamSection) {
  if (canAccessTeamSection(role, 'today')) return 'today'
  if (canAccessTeamSection(role, 'members')) return 'members'
  if (canAccessTeamSection(role, 'schedule')) return 'schedule'
  return 'schedule'
}

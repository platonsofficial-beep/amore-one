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
  { id: 'inventory', label: 'Inventory' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'orders', label: 'Orders' },
]

export const OPERATIONS_SECTIONS = [
  { id: 'tasks', label: 'Tasks' },
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
  stock: { activeView: 'stock', stockSection: 'dashboard' },
  tasks: { activeView: 'operations', operationsSection: 'tasks' },
  reports: { activeView: 'insights' },
  settings: { activeView: 'settings' },
  'floor-plan-builder': { activeView: 'reservations' },
}

const INSIGHTS_MODULE_LINKS = {
  tasks: { activeView: 'operations', operationsSection: 'tasks' },
  schedule: { activeView: 'team', teamSection: 'schedule' },
  suppliers: { activeView: 'stock', stockSection: 'suppliers' },
  stock: { activeView: 'stock', stockSection: 'dashboard' },
  reservations: { activeView: 'reservations' },
  reports: { activeView: 'insights' },
  insights: { activeView: 'insights' },
  operations: { activeView: 'operations', operationsSection: 'tasks' },
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

export function shouldHideStandardTopbar(activeView, teamSection) {
  return isTeamScheduleView(activeView, teamSection)
    || activeView === 'floor-plan-builder'
    || activeView === 'reservations'
}

export function shouldUseCommandTopbar(activeView) {
  return isTodayView(activeView)
}

export function getModuleTitle(activeView, {
  teamSection = 'today',
  stockSection = 'dashboard',
  operationsSection = 'tasks',
} = {}) {
  if (activeView === 'today') return 'Today'
  if (activeView === 'reservations') return 'Reservations'
  if (activeView === 'team') {
    if (teamSection === 'schedule') return 'Schedule'
    if (teamSection === 'members') return 'People'
    return 'Team'
  }
  if (activeView === 'stock') {
    if (stockSection === 'suppliers') return 'Suppliers'
    if (stockSection === 'inventory') return 'Inventory'
    if (stockSection === 'orders') return 'Orders'
    return 'Stock'
  }
  if (activeView === 'operations') {
    if (operationsSection === 'tasks') return 'Operations'
    return 'Operations'
  }
  if (activeView === 'insights') return 'Insights'
  if (activeView === 'settings') return 'Settings'
  return getModuleLabel(activeView)
}

export function getModuleSubtitle(activeView, currentDateLabel, {
  teamSection = 'today',
  stockSection = 'dashboard',
} = {}) {
  if (activeView === 'today') {
    return `${currentDateLabel} · Your daily command center`
  }
  if (activeView === 'reservations') return 'Guest flow and service.'
  if (activeView === 'team' && teamSection === 'today') return "Who's working today."
  if (activeView === 'team' && teamSection === 'members') return 'Manage your team.'
  if (activeView === 'team' && teamSection === 'schedule') return ''
  if (activeView === 'stock' && stockSection === 'dashboard') return 'Stock levels, movements, and alerts.'
  if (activeView === 'stock' && stockSection === 'inventory') return 'Inventory levels and replenishment.'
  if (activeView === 'stock' && stockSection === 'suppliers') return 'Supplier contacts, products, and purchase history.'
  if (activeView === 'stock' && stockSection === 'orders') return 'Supplier purchase orders and receiving.'
  if (activeView === 'operations') return 'Tasks and daily execution.'
  if (activeView === 'insights') return 'Business intelligence from live data.'
  if (activeView === 'settings') return 'Workspace and account configuration.'
  return ''
}

export function getSearchPlaceholder(activeView, {
  teamSection = 'today',
  stockSection = 'dashboard',
  operationsSection = 'tasks',
} = {}) {
  if (activeView === 'team' && teamSection === 'members') return 'Search employee'
  if (activeView === 'stock' && stockSection === 'orders') return 'Search order #, supplier, product'
  if (activeView === 'stock' && (stockSection === 'dashboard' || stockSection === 'inventory')) return 'Search stock item'
  if (activeView === 'stock' && stockSection === 'suppliers') return 'Search supplier'
  if (activeView === 'operations' && operationsSection === 'tasks') return 'Search tasks'
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

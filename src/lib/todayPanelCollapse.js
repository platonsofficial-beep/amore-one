const STORAGE_KEY = 'one.today.panels.v1'

export const TODAY_PANEL_IDS = {
  ANNOUNCEMENTS: 'announcements',
  SERVICE_TIMELINE: 'service-timeline',
  TEAM_TODAY: 'team-today',
  ATTENTION: 'attention',
  QUICK_ACTIONS: 'quick-actions',
}

export function getDefaultTodayPanelExpanded(panelId, { hasUrgentAttention = false } = {}) {
  switch (panelId) {
    case TODAY_PANEL_IDS.ANNOUNCEMENTS:
    case TODAY_PANEL_IDS.SERVICE_TIMELINE:
      return true
    case TODAY_PANEL_IDS.ATTENTION:
      return hasUrgentAttention
    case TODAY_PANEL_IDS.TEAM_TODAY:
    case TODAY_PANEL_IDS.QUICK_ACTIONS:
      return false
    default:
      return true
  }
}

function readStoredPanelState() {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function readTodayPanelExpanded(panelId, defaultExpanded) {
  const stored = readStoredPanelState()
  if (Object.prototype.hasOwnProperty.call(stored, panelId)) {
    return Boolean(stored[panelId])
  }
  return defaultExpanded
}

export function hasTodayPanelStoredPreference(panelId) {
  const stored = readStoredPanelState()
  return Object.prototype.hasOwnProperty.call(stored, panelId)
}

export function writeTodayPanelExpanded(panelId, isExpanded) {
  if (typeof window === 'undefined') return

  const stored = readStoredPanelState()
  stored[panelId] = Boolean(isExpanded)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

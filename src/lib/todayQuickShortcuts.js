import {
  canAccessHostMobileTasksTab,
  canAccessMobileExpandedModule,
  canAccessOperationsSection,
  canAccessTeamSection,
  canManageReservations,
  canManageStock,
  canOpenMobileFullSchedule,
  canUseChat,
  isManagerRole,
} from './permissions'

export const TODAY_QUICK_ACTION_MAX = 6

export const TODAY_QUICK_GROUPS = [
  { id: 'reservations', labelKey: 'Reservations' },
  { id: 'stock', labelKey: 'Stock' },
  { id: 'team', labelKey: 'Team and schedule' },
  { id: 'operations', labelKey: 'Operations' },
  { id: 'chat', labelKey: 'Chat' },
]

/** Shortcuts that already open a screen or action in the app. */
export const TODAY_QUICK_SHORTCUTS = [
  { id: 'new-reservation', group: 'reservations', labelKey: 'New reservation' },
  { id: 'walk-in', group: 'reservations', labelKey: 'Walk-in' },
  { id: 'reservations', group: 'reservations', labelKey: 'Reservations' },
  { id: 'stock', group: 'stock', labelKey: 'Stock' },
  { id: 'stock-orders', group: 'stock', labelKey: 'Order drafts' },
  { id: 'inventory-count', group: 'stock', labelKey: 'Counts' },
  { id: 'schedule', group: 'team', labelKey: 'Schedule' },
  { id: 'team-today', group: 'team', labelKey: 'Team today' },
  { id: 'clock', group: 'team', labelKey: 'Clock in / My hours' },
  { id: 'operations', group: 'operations', labelKey: 'Operations' },
  { id: 'tasks', group: 'operations', labelKey: 'Tasks' },
  { id: 'chat', group: 'chat', labelKey: 'Chat' },
]

const MANAGER_DEFAULT_IDS = [
  'reservations',
  'stock',
  'schedule',
  'tasks',
  'team-today',
  'operations',
]

const OTHER_DEFAULT_IDS = [
  'reservations',
  'new-reservation',
  'walk-in',
  'stock',
  'inventory-count',
  'schedule',
  'tasks',
  'chat',
  'clock',
  'operations',
  'team-today',
]

const STORAGE_PREFIX = 'one.todayQuickActions.v1'

export function todayQuickActionsStorageKey(userId, workspaceId) {
  return `${STORAGE_PREFIX}:${userId || 'user'}:${workspaceId || 'venue'}`
}

export function shortcutIsAllowed(id, access) {
  switch (id) {
    case 'new-reservation':
    case 'walk-in':
      return canManageReservations(access) && canAccessMobileExpandedModule(access, 'reservations')
    case 'reservations':
      return canAccessMobileExpandedModule(access, 'reservations')
    case 'stock':
    case 'inventory-count':
      return canAccessMobileExpandedModule(access, 'stock')
    case 'stock-orders':
      return canAccessMobileExpandedModule(access, 'stock') && canManageStock(access)
    case 'schedule':
      return canOpenMobileFullSchedule(access) || canAccessTeamSection(access, 'schedule')
    case 'team-today':
      return canAccessTeamSection(access, 'today') && canAccessMobileExpandedModule(access, 'team')
    case 'clock':
      return true
    case 'operations':
      return canAccessMobileExpandedModule(access, 'operations')
    case 'tasks':
      return canAccessOperationsSection(access, 'tasks') || canAccessHostMobileTasksTab(access)
    case 'chat':
      return canUseChat(access)
    default:
      return false
  }
}

export function availableTodayShortcuts(access) {
  return TODAY_QUICK_SHORTCUTS.filter((shortcut) => shortcutIsAllowed(shortcut.id, access))
}

export function defaultTodayShortcutIds(access) {
  const preferred = isManagerRole(access) ? MANAGER_DEFAULT_IDS : OTHER_DEFAULT_IDS
  return preferred.filter((id) => shortcutIsAllowed(id, access)).slice(0, TODAY_QUICK_ACTION_MAX)
}

export function toggleTodayShortcut(ids, id, access) {
  const current = Array.isArray(ids) ? ids.filter((entry) => shortcutIsAllowed(entry, access)) : []
  if (!shortcutIsAllowed(id, access)) return current
  if (current.includes(id)) return current.filter((entry) => entry !== id)
  if (current.length >= TODAY_QUICK_ACTION_MAX) return current
  return [...current, id]
}

export function moveTodayShortcut(ids, id, direction) {
  const current = Array.isArray(ids) ? [...ids] : []
  const index = current.indexOf(id)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
  const [item] = current.splice(index, 1)
  current.splice(nextIndex, 0, item)
  return current
}

export function resolveTodayShortcutIds(stored, access) {
  const defaults = defaultTodayShortcutIds(access)
  if (!Array.isArray(stored)) return defaults
  const picked = []
  stored.forEach((id) => {
    if (picked.length >= TODAY_QUICK_ACTION_MAX) return
    if (!shortcutIsAllowed(id, access) || picked.includes(id)) return
    picked.push(id)
  })
  return picked.length > 0 ? picked : defaults
}

function memory() {
  return globalThis.localStorage
}

export function readStoredTodayShortcutIds(userId, workspaceId, storage = memory()) {
  if (!storage || !userId || !workspaceId) return null
  try {
    const raw = storage.getItem(todayQuickActionsStorageKey(userId, workspaceId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.ids) ? parsed.ids : null
  } catch {
    return null
  }
}

export function writeStoredTodayShortcutIds(userId, workspaceId, ids, storage = memory()) {
  if (!storage || !userId || !workspaceId) return
  const unique = []
  ;(Array.isArray(ids) ? ids : []).forEach((id) => {
    if (unique.length >= TODAY_QUICK_ACTION_MAX || unique.includes(id)) return
    unique.push(id)
  })
  storage.setItem(
    todayQuickActionsStorageKey(userId, workspaceId),
    JSON.stringify({ ids: unique }),
  )
}

export function clearStoredTodayShortcutIds(userId, workspaceId, storage = memory()) {
  if (!storage || !userId || !workspaceId) return
  storage.removeItem(todayQuickActionsStorageKey(userId, workspaceId))
}

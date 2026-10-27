import { isHostRole, normalizeWorkspaceRole } from './membershipRoles'

export const STAFF_HOST_PERSONAL_VIEWS = ['my-week', 'account', 'clock', 'notifications']

const PERSONAL_VIEWS = new Set(STAFF_HOST_PERSONAL_VIEWS)

function roleName(access) {
  if (access && typeof access === 'object') return `${access.role ?? ''}`.trim()
  return `${access ?? ''}`.trim()
}

export function isStaffOrHostRole(access) {
  const normalized = normalizeWorkspaceRole(roleName(access), '')
  return normalized === 'staff' || isHostRole(normalized)
}

export function isStaffHostPersonalView(view) {
  return PERSONAL_VIEWS.has(`${view ?? ''}`.trim())
}

export function canOpenStaffHostPersonalView(access, view) {
  return isStaffOrHostRole(access) && isStaffHostPersonalView(view)
}

export const MY_WEEK_NAV_ITEM = { id: 'my-week', label: 'My week', icon: '◔' }

export function withStaffHostRailItems(items, access) {
  const source = Array.isArray(items) ? items : []
  if (!isStaffOrHostRole(access) || source.some((item) => item.id === 'my-week')) {
    return source
  }

  const settingsIndex = source.findIndex((item) => item.id === 'settings')
  const insertAt = settingsIndex >= 0 ? settingsIndex : source.length
  return [
    ...source.slice(0, insertAt),
    MY_WEEK_NAV_ITEM,
    ...source.slice(insertAt),
  ]
}

export function staffHostAvatarActions({ canRequestLeave = false } = {}) {
  return [
    { id: 'my-week', label: 'My week' },
    { id: 'account', label: 'Profile' },
    { id: 'clock', label: 'Clock in/out' },
    ...(canRequestLeave ? [{ id: 'leave', label: 'Request Leave' }] : []),
  ]
}

export function mobileStateForPersonalView(view) {
  if (view === 'my-week') return { tab: 'availability', menuScreen: 'main', clockOpen: false }
  if (view === 'account') return { tab: 'menu', menuScreen: 'profile', clockOpen: false }
  if (view === 'clock') return { tab: 'menu', menuScreen: 'main', clockOpen: true }
  if (view === 'notifications') return { tab: 'menu', menuScreen: 'notifications', clockOpen: false }
  return null
}

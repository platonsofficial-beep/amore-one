import { getReservationsForFloorTable } from './floorAssignmentMapping'
import { readLiveViewportBox } from './viewportUtils'
import { resolveFloorTableOperationalState } from './floorTableOperationalState'
import {
  canAccessModule,
  canAccessTeamSection,
  canConfigureReservationSeatings,
  canManageAttendance,
} from './permissions'

export const MANAGER_PHONE_MAX_WIDTH = 760

/**
 * Phone shell for owners and managers.
 * A sideways phone with a usable landscape canvas (including iPhone SE at
 * 667×375) uses the full workspace. A narrow or portrait phone uses the
 * bottom-nav shell. Tablets and desktops stay on the workspace shell.
 */
export function shouldUseManagerPhoneShell(source) {
  const box = resolveManagerViewportBox(source)
  const width = Number(box.width) || 0
  const height = Number(box.height) || 0
  const isPortrait = box.portrait
  const isNarrow = box.narrow
  const shortSide = Math.min(width, height)
  const usableLandscape = !isPortrait && width >= 600 && height >= 320 && width > height

  if (usableLandscape) return false
  if (shortSide >= 600 && !isNarrow) return false
  // Orientation media can update before innerWidth on iOS standalone.
  if (!isPortrait && !isNarrow && width > 0) return false
  if (isPortrait && (isNarrow || width <= MANAGER_PHONE_MAX_WIDTH || (shortSide > 0 && shortSide <= 500))) {
    return true
  }
  if (isNarrow || (width > 0 && width <= MANAGER_PHONE_MAX_WIDTH)) return true
  return false
}

function resolveManagerViewportBox(source) {
  if (source && typeof source === 'object' && ('width' in source || 'portrait' in source || 'narrow' in source)) {
    const width = Number(source.width) || 0
    const height = Number(source.height) || 0
    return {
      width,
      height,
      portrait: typeof source.portrait === 'boolean'
        ? source.portrait
        : height >= width && height > 0,
      narrow: typeof source.narrow === 'boolean'
        ? source.narrow
        : width > 0 && width <= MANAGER_PHONE_MAX_WIDTH,
    }
  }

  const win = source && typeof source.matchMedia === 'function' ? source : globalThis.window
  if (!win) {
    return { width: 0, height: 0, portrait: false, narrow: false }
  }

  const live = readLiveViewportBox(win)
  const width = live.width || Number(win.innerWidth) || 0
  const height = live.height || Number(win.innerHeight) || 0
  let portrait = null
  let narrow = null
  try {
    const portraitQuery = win.matchMedia?.('(orientation: portrait)')
    if (portraitQuery && typeof portraitQuery.matches === 'boolean') portrait = portraitQuery.matches
  } catch {
    portrait = null
  }
  try {
    const narrowQuery = win.matchMedia?.(`(max-width: ${MANAGER_PHONE_MAX_WIDTH}px)`)
    if (narrowQuery && typeof narrowQuery.matches === 'boolean') narrow = narrowQuery.matches
  } catch {
    narrow = null
  }

  return {
    width,
    height,
    portrait: portrait ?? (height >= width && height > 0),
    narrow: narrow ?? (width > 0 && width <= MANAGER_PHONE_MAX_WIDTH),
  }
}

export function resolveManagerPortraitScreen({
  activeView = '',
  teamSection = '',
  menuScreen = '',
} = {}) {
  if (menuScreen === 'profile') return 'profile'
  if (menuScreen === 'leave-inbox') return 'leave-inbox'
  if (menuScreen === 'notifications') return 'notifications'

  const view = `${activeView ?? ''}`.trim()
  if (view === 'reservations') return 'reservations'
  if (view === 'chat') return 'chat'
  if (view === 'operations') return 'tasks'
  if (view === 'stock') return 'stock'
  if (view === 'team' && `${teamSection ?? ''}`.trim() === 'schedule') return 'schedule'
  if (view === 'team') return 'team'
  if (view === 'time-clock') return 'time-clock'
  if (view === 'settings') return 'settings'
  if (view === 'insights') return 'insights'
  if (view === 'account') return 'profile'
  return 'today'
}

export function resolveManagerPortraitTab(screen) {
  if (screen === 'today' || screen === 'reservations' || screen === 'chat' || screen === 'tasks') {
    return screen
  }
  return 'more'
}

export function buildManagerPortraitMoreItems(access, {
  canViewLeaveInbox = false,
  showNotifications = true,
} = {}) {
  const items = []

  if (canAccessTeamSection(access, 'schedule')) {
    items.push({
      id: 'schedule',
      label: 'Schedule',
      subtitle: 'One day at a time. Turn sideways for the week.',
      icon: '📅',
    })
  }
  if (canAccessModule(access, 'stock')) {
    items.push({
      id: 'stock',
      label: 'Stock',
      subtitle: 'Quick list for counting',
      icon: '📦',
    })
  }
  if (canAccessModule(access, 'team')) {
    items.push({
      id: 'team',
      label: 'Team',
      subtitle: 'People and who is in today',
      icon: '👥',
    })
  }
  if (canManageAttendance(access)) {
    items.push({
      id: 'time-clock',
      label: 'Time clock',
      subtitle: 'Who is in, late, and hours',
      icon: '⏱',
    })
  }
  if (canAccessModule(access, 'insights')) {
    items.push({
      id: 'insights',
      label: 'Insights',
      subtitle: 'Reports and performance',
      icon: '📈',
    })
  }
  if (canAccessModule(access, 'settings') || canConfigureReservationSeatings(access)) {
    items.push({
      id: 'settings',
      label: 'Settings',
      subtitle: 'Venue preferences',
      icon: '⚙️',
    })
  }

  items.push({
    id: 'profile',
    label: 'Profile',
    subtitle: 'Personal details and account',
    icon: '👤',
  })

  if (canViewLeaveInbox) {
    items.push({
      id: 'leave-inbox',
      label: 'Leave inbox',
      subtitle: 'Pending leave requests',
      icon: '◷',
    })
  }
  if (showNotifications) {
    items.push({
      id: 'notifications',
      label: 'Notifications',
      subtitle: 'Reminders, quiet hours and this device',
      icon: '🔔',
    })
  }
  items.push({
    id: 'sign-out',
    label: 'Sign out',
    subtitle: '',
    icon: '↪',
    tone: 'danger',
  })

  return items
}

export const PORTRAIT_TABLE_STATUS_LABELS = {
  available: 'Available',
  seated: 'Seated',
  arrived: 'Arrived',
  upcoming: 'Upcoming',
  cleaning: 'Cleaning',
  reserved: 'Reserved',
}

export function portraitTableStatusLabel(status) {
  const key = `${status ?? ''}`.trim().toLowerCase()
  return PORTRAIT_TABLE_STATUS_LABELS[key] || 'Available'
}

export function buildPortraitFloorTables({
  layout,
  reservations = [],
  dateKey = '',
  nowMinutes = null,
} = {}) {
  const tables = layout?.tables ?? layout?.units ?? []
  return tables.map((table, index) => {
    const matched = getReservationsForFloorTable(table, reservations, dateKey, {
      syncWithList: true,
      floorUnits: tables,
    })
    const operational = resolveFloorTableOperationalState(matched, nowMinutes, dateKey)
    const label = `${table?.displayLabel ?? table?.label ?? table?.name ?? ''}`.trim()
      || `Table ${index + 1}`
    const seats = Number(table?.seatedCapacity ?? table?.seats ?? table?.capacity ?? 0) || null
    const guest = `${operational.displayReservation?.guestName ?? ''}`.trim()
    return {
      id: `${table?.id ?? index}`,
      label,
      seats,
      status: operational.floorStatus || 'available',
      guest,
    }
  })
}

export function portraitShiftSubtitle(shift) {
  const role = `${shift?.role ?? ''}`.trim()
  const area = `${shift?.area ?? ''}`.trim()
  if (!role && !area) return 'Shift'
  if (role && area && role.localeCompare(area, undefined, { sensitivity: 'accent' }) === 0) return role
  return [role, area].filter(Boolean).join(' · ')
}

import { useEffect, useState } from 'react'
import {
  canAccessHostMobileTasksTab,
  canAccessMobileExpandedModule,
  canAccessModule,
  canAccessTeamSection,
  canOpenMobileFullSchedule,
  canUseChat,
} from '../lib/permissions'
import { normalizeWorkspaceRole } from '../lib/membershipRoles'

export const SETUP_GUIDE_STORAGE_PREFIX = 'one.setupGuide.v1'
export const STAFF_TOUR_STORAGE_PREFIX = 'one.staffTour.v1'

export const SETUP_STEPS = [
  {
    id: 'profile',
    view: 'settings',
    settingsSection: 'profile',
    target: 'setup.profile-name',
    titleKey: 'Confirm the venue',
    bodyKey: 'Check the name, time zone, and phone country. The schedule and the booking page use these.',
    needsSettings: true,
  },
  {
    id: 'positions',
    view: 'settings',
    settingsSection: 'positions',
    target: 'setup.add-position',
    titleKey: 'Add a position',
    bodyKey: 'Add the jobs you roster, such as Server or Cook, and set a department on each.',
    needsSettings: true,
  },
  {
    id: 'seatings',
    view: 'settings',
    settingsSection: 'reservations',
    target: 'setup.add-seating',
    titleKey: 'Add a seating',
    bodyKey: 'Add each service, for example Dinner 19:00 for 120 minutes, on the days you open.',
    needsSettings: true,
  },
  {
    id: 'floor-area',
    view: 'reservations',
    openFloor: true,
    target: 'setup.create-area',
    fallbackTarget: 'reservations.edit-layout',
    titleKey: 'Name the room',
    bodyKey: 'Add an area, such as Main or Terrace.',
    needsSettings: false,
  },
  {
    id: 'floor-tables',
    view: 'reservations',
    openFloor: true,
    target: 'setup.add-table',
    fallbackTarget: 'reservations.edit-layout',
    titleKey: 'Place the tables',
    bodyKey: 'Add a table and set how many guests it seats.',
    needsSettings: false,
  },
  {
    id: 'floor-publish',
    view: 'reservations',
    openFloor: true,
    target: 'setup.publish-layout',
    fallbackTarget: 'reservations.edit-layout',
    titleKey: 'Publish the floor',
    bodyKey: 'Press Publish. The live floor uses the published plan, not the draft.',
    needsSettings: false,
  },
]

function roleName(role) {
  if (role && typeof role === 'object') return `${role.role ?? ''}`.trim()
  return `${role ?? ''}`.trim()
}

export function setupGuideAudience(role) {
  const normalized = normalizeWorkspaceRole(roleName(role), '')
  if (normalized === 'owner' || normalized === 'general_manager') return 'full'
  if (normalized === 'manager') return 'limited'
  if (normalized === 'staff') return 'staff'
  return 'none'
}

export const STAFF_TOUR_STEPS = [
  {
    id: 'staff-today',
    view: 'today',
    mobileTab: 'home',
    targets: ['nav.today', 'nav.home'],
    titleKey: 'Your day',
    bodyKey: 'See your shift and what the venue needs today.',
  },
  {
    id: 'staff-week',
    view: 'my-week',
    personal: true,
    mobileTab: 'schedule',
    targets: ['nav.my-week', 'nav.schedule'],
    titleKey: 'Your scheduled week',
    bodyKey: 'This is the week you are scheduled to work.',
  },
  {
    id: 'staff-clock',
    view: 'clock',
    personal: true,
    mobileTab: 'menu',
    targets: ['timeclock.clock-in', 'staff.clock'],
    titleKey: 'Clock in and out',
    bodyKey: 'Clock in when you arrive, and clock out when you leave.',
  },
  {
    id: 'staff-schedule',
    view: 'team',
    teamSection: 'schedule',
    mobileTab: 'menu',
    targets: ['nav.team', 'staff.full-schedule'],
    titleKey: 'The team schedule',
    bodyKey: 'Open the schedule to see the shifts and who is working.',
  },
  {
    id: 'staff-reservations',
    view: 'reservations',
    targets: ['nav.reservations'],
    titleKey: 'Reservations',
    bodyKey: 'See today\'s bookings and the tables on the floor.',
  },
  {
    id: 'staff-chat',
    view: 'chat',
    mobileTab: 'chat',
    targets: ['nav.chat'],
    titleKey: 'Team messages',
    bodyKey: 'Read the team chat. A badge means something is unread.',
  },
  {
    id: 'staff-stock',
    view: 'stock',
    mobileTab: 'menu',
    targets: ['nav.stock'],
    titleKey: 'Stock',
    bodyKey: 'See what is on hand. Count a shelf when you are asked.',
  },
  {
    id: 'staff-tasks',
    view: 'operations',
    mobileTab: 'tasks',
    targets: ['nav.operations', 'nav.tasks'],
    titleKey: 'Tasks',
    bodyKey: 'Open the tasks and checklists for the service.',
  },
  {
    id: 'staff-profile',
    view: 'account',
    personal: true,
    mobileTab: 'menu',
    targets: ['header.profile', 'staff.profile', 'nav.menu'],
    titleKey: 'Your profile',
    bodyKey: 'Your name, contact details, and sign out are here.',
  },
]

function staffTourStepAllowed(role, step, mobile) {
  if (step.id === 'staff-today') return canAccessModule(role, 'today')
  if (step.id === 'staff-week' || step.id === 'staff-clock' || step.id === 'staff-profile') return true
  if (step.id === 'staff-schedule') {
    return mobile ? canOpenMobileFullSchedule(role) : canAccessTeamSection(role, 'schedule')
  }
  if (step.id === 'staff-reservations') {
    if (!canAccessModule(role, 'reservations')) return false
    return mobile ? canAccessMobileExpandedModule(role, 'reservations') : true
  }
  if (step.id === 'staff-chat') return canUseChat(role)
  if (step.id === 'staff-stock') {
    if (!canAccessModule(role, 'stock')) return false
    return mobile ? canAccessMobileExpandedModule(role, 'stock') : true
  }
  if (step.id === 'staff-tasks') {
    return canAccessModule(role, 'operations') || canAccessHostMobileTasksTab(role)
  }
  return false
}

export function visibleStaffTourSteps(role, options = {}) {
  if (setupGuideAudience(role) !== 'staff') return []
  const mobile = Boolean(options.mobile)
  return STAFF_TOUR_STEPS.filter((step) => staffTourStepAllowed(role, step, mobile))
}

export function visibleSetupSteps(role) {
  const audience = setupGuideAudience(role)
  if (audience !== 'full' && audience !== 'limited') return []
  return SETUP_STEPS.filter((step) => {
    if (step.needsSettings && !canAccessModule(role, 'settings')) return false
    if (step.view === 'reservations' && !canAccessModule(role, 'reservations')) return false
    return true
  })
}

export function isProfileSetupDone(profile = {}) {
  const name = `${profile.businessName ?? ''}`.trim()
  const timeZone = `${profile.timezone ?? ''}`.trim()
  const phoneCountry = `${profile.defaultPhoneCountryCode ?? profile.countryCode ?? ''}`.trim()
  return Boolean(name && timeZone && phoneCountry)
}

export function isPositionsSetupDone(positions = []) {
  return (positions ?? []).length > 0
}

export function isSeatingsSetupDone(seatings = []) {
  return (seatings ?? []).some((seating) => seating && seating.isActive !== false)
}

export function floorSetupDone(published = {}) {
  const zones = published?.zones ?? published?.floors ?? []
  const tables = published?.tables ?? (published?.objects ?? []).filter((object) => (
    !object?.type || object.type === 'table'
  ))
  const publishedAt = published?.publishedAt
  const hasArea = zones.some((zone) => `${zone?.label ?? zone?.name ?? ''}`.trim())
  const hasTable = tables.length > 0
  const isPublished = Boolean(publishedAt) && (hasArea || hasTable)
  return {
    'floor-area': isPublished && hasArea,
    'floor-tables': isPublished && hasTable,
    'floor-publish': isPublished && hasArea && hasTable,
  }
}

export function withSetupDone(steps, facts) {
  const floor = floorSetupDone(facts.floor)
  const doneById = {
    profile: isProfileSetupDone(facts.profile),
    positions: isPositionsSetupDone(facts.positions),
    seatings: isSeatingsSetupDone(facts.seatings),
    ...floor,
  }
  return steps.map((step) => ({ ...step, done: Boolean(doneById[step.id]) }))
}

export function emptySetupProgress() {
  return { skipped: false, remindAfter: '', replay: false }
}

export function emptyStaffTourProgress() {
  return { skipped: false, replay: false, finished: false }
}

export function setupGuideStorageKey(userId, workspaceId) {
  return `${SETUP_GUIDE_STORAGE_PREFIX}:${userId || 'local'}:${workspaceId || 'local'}`
}

export function staffTourStorageKey(userId, workspaceId) {
  return `${STAFF_TOUR_STORAGE_PREFIX}:${userId || 'local'}:${workspaceId || 'local'}`
}

export function readSetupProgress(userId, workspaceId, storage) {
  const fallback = emptySetupProgress()
  if (!storage) return fallback
  try {
    const raw = storage.getItem(setupGuideStorageKey(userId, workspaceId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return {
      skipped: Boolean(parsed?.skipped),
      remindAfter: `${parsed?.remindAfter ?? ''}`.slice(0, 10),
      replay: Boolean(parsed?.replay),
    }
  } catch {
    return fallback
  }
}

export function readStaffTourProgress(userId, workspaceId, storage) {
  const fallback = emptyStaffTourProgress()
  if (!storage) return fallback
  try {
    const raw = storage.getItem(staffTourStorageKey(userId, workspaceId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return {
      skipped: Boolean(parsed?.skipped),
      replay: Boolean(parsed?.replay),
      finished: Boolean(parsed?.finished),
    }
  } catch {
    return fallback
  }
}

export function writeStaffTourProgress(userId, workspaceId, progress, storage) {
  if (!storage) return progress
  const next = {
    skipped: Boolean(progress?.skipped),
    replay: Boolean(progress?.replay),
    finished: Boolean(progress?.finished),
  }
  storage.setItem(staffTourStorageKey(userId, workspaceId), JSON.stringify(next))
  return next
}

export function shouldShowStaffTour({ steps, progress }) {
  if (!steps?.length) return false
  const state = progress ?? emptyStaffTourProgress()
  if (state.skipped && !state.replay) return false
  if (state.finished && !state.replay) return false
  return true
}

export function writeSetupProgress(userId, workspaceId, progress, storage) {
  if (!storage) return progress
  const next = {
    skipped: Boolean(progress?.skipped),
    remindAfter: `${progress?.remindAfter ?? ''}`.slice(0, 10),
    replay: Boolean(progress?.replay),
  }
  storage.setItem(setupGuideStorageKey(userId, workspaceId), JSON.stringify(next))
  return next
}

let pendingFloorEditor = false

export function requestFloorEditor() {
  pendingFloorEditor = true
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('one-setup-open-floor'))
}

export function consumeFloorEditorRequest() {
  const pending = pendingFloorEditor
  pendingFloorEditor = false
  return pending
}

export function useSetupCoachStep() {
  const [activeId, setActiveId] = useState('')
  useEffect(() => {
    function open(event) {
      setActiveId(`${event.detail?.id ?? ''}`)
    }
    window.addEventListener('one-setup-coach', open)
    return function cleanup() {
      window.removeEventListener('one-setup-coach', open)
    }
  }, [])
  return [activeId, setActiveId]
}

export function nextDateKey(dateKey) {
  const match = `${dateKey ?? ''}`.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function shouldShowSetupChecklist({ steps, progress, todayKey }) {
  if (!steps?.length) return false
  const state = progress ?? emptySetupProgress()
  if (state.skipped && !state.replay) return false
  if (state.remindAfter && todayKey && todayKey < state.remindAfter) return false
  const allDone = steps.every((step) => step.done)
  if (allDone && !state.replay) return false
  return true
}

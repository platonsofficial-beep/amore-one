import { useEffect, useState } from 'react'
import {
  canAccessHostMobileTasksTab,
  canAccessMobileExpandedModule,
  canAccessModule,
  canAccessTeamSection,
  canManageStock,
  canOpenMobileFullSchedule,
  canUseChat,
} from '../lib/permissions'
import { normalizeWorkspaceRole } from '../lib/membershipRoles'

export const SETUP_GUIDE_STORAGE_PREFIX = 'one.setupGuide.v1'
export const STAFF_TOUR_STORAGE_PREFIX = 'one.staffTour.v1'
export const STOCK_TOUR_STORAGE_PREFIX = 'one.stockTour.v1'

export const VENUE_WIZARD_STEPS = [
  {
    id: 'venue',
    view: 'settings',
    settingsSection: 'profile',
    target: 'setup.profile-name',
    titleKey: 'Name the venue',
    bodyKey: 'Set the venue name, address, country, time zone, currency, and logo. The schedule and the booking page use these.',
    needsSettings: true,
    module: 'settings',
  },
  {
    id: 'team',
    view: 'settings',
    settingsSection: 'positions',
    target: 'setup.add-position',
    titleKey: 'Departments and positions',
    bodyKey: 'Add departments such as Bar and Kitchen, and the jobs you roster, such as Waiter.',
    needsSettings: true,
    module: 'settings',
  },
  {
    id: 'employees',
    view: 'team',
    teamSection: 'members',
    target: 'setup.invite',
    titleKey: 'Invite your team',
    bodyKey: 'Add the first people and send their invite.',
    module: 'team',
  },
  {
    id: 'roles',
    view: 'team',
    teamSection: 'members',
    target: 'setup.permissions',
    fallbackTarget: 'setup.invite',
    titleKey: 'Roles and permissions',
    bodyKey: 'Open a person and choose what they can see. Owners see the whole venue. Everyone else sees only their sections.',
    module: 'team',
  },
  {
    id: 'schedule',
    view: 'team',
    teamSection: 'schedule',
    target: 'setup.schedule',
    fallbackTarget: 'nav.team',
    titleKey: 'First shifts',
    bodyKey: 'Add the first shifts of the week.',
    module: 'team',
  },
  {
    id: 'reservations',
    view: 'settings',
    settingsSection: 'reservations',
    target: 'setup.add-seating',
    titleKey: 'Seatings, floor, and online booking',
    bodyKey: 'Add a seating and the hours for each day, then the room and tables. Publish the floor, then turn on the public booking link.',
    module: 'reservations',
  },
  {
    id: 'stock',
    view: 'stock',
    stockSection: 'storages',
    target: 'stock.storages-page',
    fallbackTarget: 'stock.storages',
    titleKey: 'Stock setup',
    bodyKey: 'Check the storages, then add a supplier, products, and par levels.',
    module: 'stock',
  },
  {
    id: 'operations',
    view: 'operations',
    operationsSection: 'tasks',
    target: 'setup.tasks',
    fallbackTarget: 'nav.operations',
    titleKey: 'Tasks and checklists',
    bodyKey: 'Add the first task and a checklist for the shift.',
    module: 'operations',
  },
  {
    id: 'chat',
    view: 'chat',
    target: 'chat.new',
    fallbackTarget: 'nav.chat',
    titleKey: 'Tell the team',
    bodyKey: 'Send the first announcement so the team knows you are open.',
    module: 'chat',
  },
]

export const SETUP_STEPS = VENUE_WIZARD_STEPS

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
    targets: ['today.home', 'nav.today', 'nav.home'],
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

export const STOCK_TOUR_STEPS = [
  {
    id: 'stock-dashboard',
    section: 'dashboard',
    manageOnly: true,
    targets: ['stock.dashboard'],
    titleKey: 'The stock home',
    bodyKey: 'The dashboard shows what is on hand, what is low, and what needs an order.',
  },
  {
    id: 'stock-take',
    section: 'take',
    targets: ['stock.take', 'stock.take-page', 'stock.more-sections'],
    titleKey: 'Take from a storage',
    bodyKey: 'Open a storage, tap the product, set how many, and confirm. That quantity leaves the storage.',
  },
  {
    id: 'stock-take-where',
    section: 'take',
    targets: ['stock.take-storage', 'stock.take-page'],
    titleKey: 'Choose the storage',
    bodyKey: 'Start with the storage you are taking from. Then pick the product and confirm.',
  },
  {
    id: 'stock-count',
    section: 'count',
    manageOnly: true,
    targets: ['stock.count', 'stock.count-page'],
    titleKey: 'Inventory counts',
    bodyKey: 'Start a count, enter what is on the shelf, review the difference, then post the verified levels.',
  },
  {
    id: 'stock-count-staff',
    section: 'count',
    staffOnly: true,
    targets: ['stock.count', 'stock.count-page'],
    titleKey: 'Your counts',
    bodyKey: 'Open the count a manager started and enter what is on the shelf. A manager posts the result.',
  },
  {
    id: 'stock-start-count',
    section: 'count',
    manageOnly: true,
    targets: ['stock.start-count', 'stock.count'],
    titleKey: 'Start the count',
    bodyKey: 'Press Start count. Choose the locations or products, then count them one by one.',
  },
  {
    id: 'stock-storages',
    section: 'storages',
    manageOnly: true,
    targets: ['stock.storages', 'stock.storages-page'],
    titleKey: 'Stock storages',
    bodyKey: 'Each storage is a place that holds products. Open one to receive a delivery, transfer to another storage, adjust a quantity, or record waste.',
  },
  {
    id: 'stock-receive',
    section: 'storages',
    manageOnly: true,
    targets: ['stock.receive', 'stock.storages', 'stock.storages-page'],
    titleKey: 'Receive a delivery',
    bodyKey: 'Open a storage and press Receive to add stock from a delivery. You can also receive a supplier order into a storage.',
  },
  {
    id: 'stock-transfer',
    section: 'storages',
    manageOnly: true,
    targets: ['stock.transfer', 'stock.storages', 'stock.storages-page'],
    titleKey: 'Transfer between storages',
    bodyKey: 'Open a storage, press Transfer, and choose the storage that should receive the product.',
  },
  {
    id: 'stock-orders',
    section: 'orders',
    manageOnly: true,
    targets: ['stock.orders'],
    titleKey: 'Supplier orders',
    bodyKey: 'Create an order or use Suggest order. When the delivery arrives, receive it into a storage.',
  },
  {
    id: 'stock-create-order',
    section: 'orders',
    manageOnly: true,
    targets: ['stock.create-order', 'stock.orders'],
    titleKey: 'Create the order',
    bodyKey: 'Press Create order and add the lines, or let Suggest order draft them from what is under par.',
  },
  {
    id: 'stock-suppliers',
    section: 'suppliers',
    manageOnly: true,
    targets: ['stock.suppliers', 'stock.add-supplier'],
    titleKey: 'Your suppliers',
    bodyKey: 'Suppliers are who you buy from. Add one here before you order.',
  },
  {
    id: 'stock-import',
    section: 'migration',
    manageOnly: true,
    targets: ['stock.migration', 'stock.start-import'],
    titleKey: 'Import products',
    bodyKey: 'Import brings products in from a spreadsheet. Review every row before it is saved.',
  },
]

export function canShowStockTour(role) {
  return canAccessModule(role, 'stock')
}

export function visibleStockTourSteps(role) {
  if (!canShowStockTour(role)) return []
  const manage = canManageStock(role)
  return STOCK_TOUR_STEPS.filter((step) => {
    if (step.manageOnly && !manage) return false
    if (step.staffOnly && manage) return false
    return true
  })
}

export function visibleSetupSteps(role) {
  const audience = setupGuideAudience(role)
  if (audience !== 'full' && audience !== 'limited') return []
  return VENUE_WIZARD_STEPS.filter((step) => {
    if (step.id === 'chat') return canUseChat(role)
    if (step.needsSettings && !canAccessModule(role, 'settings')) return false
    if (step.module && !canAccessModule(role, step.module)) return false
    return true
  })
}

export function reservationWizardFocus(facts = {}) {
  if (!isSeatingsSetupDone(facts.seatings)) {
    return {
      view: 'settings',
      settingsSection: 'reservations',
      openFloor: false,
      target: 'setup.add-seating',
      fallbackTarget: 'settings.reservations',
    }
  }
  const floor = floorSetupDone(facts.floor)
  if (!floor['floor-area']) {
    return {
      view: 'reservations',
      openFloor: true,
      target: 'setup.create-area',
      fallbackTarget: 'reservations.edit-layout',
    }
  }
  if (!floor['floor-tables']) {
    return {
      view: 'reservations',
      openFloor: true,
      target: 'setup.add-table',
      fallbackTarget: 'reservations.edit-layout',
    }
  }
  if (!floor['floor-publish']) {
    return {
      view: 'reservations',
      openFloor: true,
      target: 'setup.publish-layout',
      fallbackTarget: 'reservations.edit-layout',
    }
  }
  return {
    view: 'settings',
    settingsSection: 'online',
    openFloor: false,
    target: 'setup.online',
    fallbackTarget: 'settings.reservations',
  }
}

export function isVenueSetupDone(profile = {}) {
  const name = `${profile.businessName ?? ''}`.trim()
  const city = `${profile.city ?? ''}`.trim()
  const country = `${profile.countryCode ?? profile.countryName ?? ''}`.trim()
  const timeZone = `${profile.timezone ?? ''}`.trim()
  return Boolean(name && city && country && timeZone)
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

export function withSetupDone(steps, facts = {}) {
  const floor = floorSetupDone(facts.floor)
  const reservationsReady = isSeatingsSetupDone(facts.seatings) && floor['floor-publish']
  const focus = reservationWizardFocus(facts)
  const doneById = {
    profile: isProfileSetupDone(facts.profile),
    positions: isPositionsSetupDone(facts.positions),
    seatings: isSeatingsSetupDone(facts.seatings),
    venue: isVenueSetupDone(facts.profile),
    team: isPositionsSetupDone(facts.positions),
    employees: (facts.employees ?? []).length > 0,
    roles: (facts.employees ?? []).some((person) => `${person?.role ?? person?.accessRole ?? ''}`.trim()),
    schedule: (facts.shifts ?? []).length > 0,
    reservations: reservationsReady,
    stock: (facts.suppliers ?? []).length > 0 && (facts.stockItems ?? []).length > 0,
    operations: (facts.tasks ?? []).length > 0 || (facts.checklists ?? []).length > 0,
    chat: (facts.announcements ?? []).length > 0,
    ...floor,
  }
  return steps.map((step) => {
    const next = { ...step, done: Boolean(doneById[step.id]) }
    if (step.id === 'reservations') {
      next.view = focus.view
      next.settingsSection = focus.settingsSection
      next.openFloor = focus.openFloor
      next.target = focus.target
      next.fallbackTarget = focus.fallbackTarget
    }
    return next
  })
}

export function nextWizardStep(steps, afterId = '', skippedIds = []) {
  const skipped = new Set(skippedIds)
  const start = steps.findIndex((step) => step.id === afterId)
  const ordered = start >= 0 ? steps.slice(start + 1) : steps
  return ordered.find((step) => !step.done && !skipped.has(step.id)) ?? null
}

export function wizardStepNumber(steps, stepId) {
  let index = -1
  for (let cursor = 0; cursor < steps.length; cursor += 1) {
    if (steps[cursor].id === stepId) index = cursor
  }
  if (index < 0) return 0
  return index + 1
}

export function emptySetupProgress() {
  return { skipped: false, remindAfter: '', replay: false, walking: false, paused: false, skippedStepIds: [] }
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

export function stockTourStorageKey(userId, workspaceId) {
  return `${STOCK_TOUR_STORAGE_PREFIX}:${userId || 'local'}:${workspaceId || 'local'}`
}

export function readSetupProgress(userId, workspaceId, storage) {
  const fallback = emptySetupProgress()
  if (!storage) return fallback
  try {
    const raw = storage.getItem(setupGuideStorageKey(userId, workspaceId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const skippedStepIds = Array.isArray(parsed?.skippedStepIds)
      ? parsed.skippedStepIds.map((id) => `${id ?? ''}`.trim()).filter(Boolean)
      : []
    return {
      skipped: Boolean(parsed?.skipped),
      remindAfter: `${parsed?.remindAfter ?? ''}`.slice(0, 10),
      replay: Boolean(parsed?.replay),
      walking: Boolean(parsed?.walking),
      paused: Boolean(parsed?.paused),
      skippedStepIds,
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

export function readStockTourProgress(userId, workspaceId, storage) {
  const fallback = emptyStaffTourProgress()
  if (!storage) return fallback
  try {
    const raw = storage.getItem(stockTourStorageKey(userId, workspaceId))
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

export function writeStockTourProgress(userId, workspaceId, progress, storage) {
  if (!storage) return progress
  const next = {
    skipped: Boolean(progress?.skipped),
    replay: Boolean(progress?.replay),
    finished: Boolean(progress?.finished),
  }
  storage.setItem(stockTourStorageKey(userId, workspaceId), JSON.stringify(next))
  return next
}

export function shouldShowStockTour({ steps, progress }) {
  return shouldShowStaffTour({ steps, progress })
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
    walking: Boolean(progress?.walking),
    paused: Boolean(progress?.paused),
    skippedStepIds: Array.isArray(progress?.skippedStepIds) ? progress.skippedStepIds : [],
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

import {
  computeSeatingAssignmentTotals,
  enrichReservationWithSeatingAssignment,
} from '../../lib/seatingAssignment'
import {
  getReservationDateKey,
} from '../../lib/floorAssignmentMapping'
import { getCurrentDateKey, getLocalNow } from '../../lib/currentDateUtils'
import { normalizeReservationDateKey } from '../../lib/timeFormatUtils'
import { formatLocalDateKey, parseLocalDate } from '../../lib/weekUtils'
import {
  getHostListGroupId,
  isReservationInHouse,
  isReservationLate,
  isReservationWaiting,
  isTerminalReservationStatus,
  normalizeReservationStatus,
} from '../../lib/reservationHostStatus'
import {
  isReservationCompletedForHostFilter,
  isReservationProblemForHostFilter,
  isReservationUpcomingForHostFilter,
  sortHostListFilterReservations,
} from '../../lib/hostServiceDashboard'
import {
  buildDailyServiceSnapshot,
  getHostReservationAlertReasons,
} from '../../lib/reservationServiceIntelligence'

export {
  HOST_LIST_GROUP_DEFS,
  getHostListGroupId,
  groupHostListReservations,
} from '../../lib/reservationHostStatus'

export const HOST_LIST_OPERATIONAL_SECTION_DEFS = [
  { id: 'upcoming', label: 'Upcoming', sortFilter: 'Upcoming', defaultExpanded: true },
  { id: 'arrived', label: 'Arrived', sortFilter: 'Arrived', defaultExpanded: false },
  { id: 'seated', label: 'Seated', sortFilter: 'Arrived', defaultExpanded: false },
  { id: 'completed', label: 'Completed', sortFilter: 'Completed', defaultExpanded: false },
  { id: 'problems', label: 'Problems', sortFilter: 'Problems', defaultExpanded: true },
]


export const HOST_LIST_SECTION_COLLAPSE_STORAGE_KEY = 'host-list-section-collapsed-v2'

function getHostListOperationalSectionId(reservation, nowMinutes, todayKey, problemOptions = {}) {
  if (isReservationCompletedForHostFilter(reservation)) return 'completed'
  if (isReservationInHouse(reservation)) return 'seated'
  if (normalizeReservationStatus(reservation?.status) === 'Waiting') return 'arrived'
  if (isReservationUpcomingForHostFilter(reservation, nowMinutes, todayKey)) return 'upcoming'
  if (isReservationProblemForHostFilter(reservation, nowMinutes, todayKey, problemOptions)) {
    return 'problems'
  }
  return null
}

export function groupHostListOperationalSections(
  reservations = [],
  nowMinutes,
  todayKey,
  problemOptions = {},
) {
  const buckets = Object.fromEntries(
    HOST_LIST_OPERATIONAL_SECTION_DEFS.map((section) => [section.id, []]),
  )

  reservations.forEach((reservation) => {
    const sectionId = getHostListOperationalSectionId(
      reservation,
      nowMinutes,
      todayKey,
      problemOptions,
    )
    if (sectionId) buckets[sectionId]?.push(reservation)
  })

  return HOST_LIST_OPERATIONAL_SECTION_DEFS.map((section) => ({
    ...section,
    reservations: sortHostListFilterReservations(
      buckets[section.id] ?? [],
      section.sortFilter,
      nowMinutes,
      todayKey,
      problemOptions,
    ),
  }))
}

export function getDefaultHostListCollapsedSections() {
  return new Set(
    HOST_LIST_OPERATIONAL_SECTION_DEFS
      .filter((section) => !section.defaultExpanded)
      .map((section) => section.id),
  )
}

export function formatHostWorkspaceShortDateLabel(dateKey = '') {
  const normalizedDateKey = normalizeReservationDateKey(dateKey)
  if (!normalizedDateKey) return ''

  const date = parseLocalDate(normalizedDateKey)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  return `${weekday} • ${monthDay}`
}

export function resolveHostWorkspaceDateKey(date = getLocalNow(), timeZone = '') {
  return getCurrentDateKey(date, timeZone)
}

export function shiftHostWorkspaceDateKey(dateKey = '', dayOffset = 0) {
  const normalizedDateKey = normalizeReservationDateKey(dateKey)
  if (!normalizedDateKey) return ''

  const date = parseLocalDate(normalizedDateKey)
  date.setDate(date.getDate() + dayOffset)
  return formatLocalDateKey(date)
}

export function formatHostWorkspaceLongDateLabel(dateKey = '') {
  const normalizedDateKey = normalizeReservationDateKey(dateKey)
  if (!normalizedDateKey) return ''

  const date = parseLocalDate(normalizedDateKey)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function formatHostWorkspaceDateNavLabel(
  selectedDateKey = '',
  workspaceTodayKey = '',
) {
  const selected = normalizeReservationDateKey(selectedDateKey)
  const today = normalizeReservationDateKey(workspaceTodayKey)
  const longLabel = formatHostWorkspaceLongDateLabel(selected)

  if (!selected || !longLabel) return longLabel
  if (selected === today) return `Today · ${longLabel}`
  if (selected === shiftHostWorkspaceDateKey(today, -1)) return `Yesterday · ${longLabel}`
  if (selected === shiftHostWorkspaceDateKey(today, 1)) return `Tomorrow · ${longLabel}`
  return longLabel
}

export const HOST_WORKSPACE_CALENDAR_WEEKDAY_LABELS = [
  'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su',
]

export function getHostWorkspaceMonthKey(dateKey = '') {
  const normalizedDateKey = normalizeReservationDateKey(dateKey)
  if (!normalizedDateKey) return ''
  return normalizedDateKey.slice(0, 7)
}

export function shiftHostWorkspaceMonthKey(monthKey = '', monthOffset = 0) {
  const normalizedMonth = `${monthKey ?? ''}`.trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) return ''

  const date = parseLocalDate(`${normalizedMonth}-01`)
  date.setMonth(date.getMonth() + monthOffset, 1)
  return formatLocalDateKey(date).slice(0, 7)
}

export function formatHostWorkspaceMonthLabel(monthKey = '') {
  const normalizedMonth = `${monthKey ?? ''}`.trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) return ''

  const date = parseLocalDate(`${normalizedMonth}-01`)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function buildHostWorkspaceCalendarWeeks(
  monthKey = '',
  selectedDateKey = '',
  workspaceTodayKey = '',
) {
  const normalizedMonth = `${monthKey ?? ''}`.trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) return []

  const [year, month] = normalizedMonth.split('-').map(Number)
  const firstOfMonth = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const mondayFirstOffset = (firstOfMonth.getDay() + 6) % 7
  const normalizedSelected = normalizeReservationDateKey(selectedDateKey)
  const normalizedToday = normalizeReservationDateKey(workspaceTodayKey)
  const cells = []

  for (let index = mondayFirstOffset - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1, 1 - (index + 1))
    const dateKey = formatLocalDateKey(date)
    cells.push({
      dateKey,
      day: date.getDate(),
      inMonth: false,
      isSelected: dateKey === normalizedSelected,
      isToday: dateKey === normalizedToday,
    })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatLocalDateKey(new Date(year, month - 1, day))
    cells.push({
      dateKey,
      day,
      inMonth: true,
      isSelected: dateKey === normalizedSelected,
      isToday: dateKey === normalizedToday,
    })
  }

  while (cells.length % 7 !== 0) {
    const trailingDate = parseLocalDate(cells[cells.length - 1].dateKey)
    trailingDate.setDate(trailingDate.getDate() + 1)
    const dateKey = formatLocalDateKey(trailingDate)
    cells.push({
      dateKey,
      day: trailingDate.getDate(),
      inMonth: false,
      isSelected: dateKey === normalizedSelected,
      isToday: dateKey === normalizedToday,
    })
  }

  const weeks = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }

  return weeks
}

export function getReservationDateKeyForWorkspace(reservation, timeZone = '') {
  const raw = reservation?.date ?? reservation?.reservation_date ?? ''
  const rawText = `${raw ?? ''}`.trim()

  if (timeZone && rawText.includes('T')) {
    const parsed = new Date(rawText)
    if (!Number.isNaN(parsed.getTime())) {
      return getCurrentDateKey(parsed, timeZone)
    }
  }

  return getReservationDateKey(reservation)
}

export function reservationBelongsToHostWorkspaceDate(
  reservation,
  selectedDateKey = '',
  timeZone = '',
) {
  const normalizedDateKey = normalizeReservationDateKey(selectedDateKey)
  if (!normalizedDateKey) return false

  return getReservationDateKeyForWorkspace(reservation, timeZone) === normalizedDateKey
}

export function getHostWorkspaceReservations(
  reservations = [],
  selectedDateKey = '',
  timeZone = '',
) {
  const normalizedDateKey = normalizeReservationDateKey(selectedDateKey)
  if (!normalizedDateKey) return []

  return reservations.filter(
    (reservation) => reservationBelongsToHostWorkspaceDate(
      reservation,
      normalizedDateKey,
      timeZone,
    ),
  )
}

export function getSelectedDateReservations(
  reservations = [],
  dateKey = '',
  timeZone = '',
) {
  return getHostWorkspaceReservations(reservations, dateKey, timeZone)
}

function reservationHasCapacityWarning(reservation) {
  const guests = Number(
    reservation.guests ?? reservation.party_size ?? reservation.guest_count,
  ) || 0
  const assignment = reservation.seatingAssignment
  if (!assignment?.assignedUnits?.length) return false
  return computeSeatingAssignmentTotals(assignment, guests).isOverCapacity
}

function isActiveServiceReservation(reservation) {
  if (getHostListGroupId(reservation) === 'completed') return false
  if (isTerminalReservationStatus(reservation?.status)) return false
  return true
}

function reservationNeedsHostAttention(reservation, nowMinutes, todayKey) {
  if (!isActiveServiceReservation(reservation)) return false

  const reasons = getHostReservationAlertReasons(reservation, nowMinutes, todayKey, new Date(), {
    includeUnassigned: false,
    includeCapacity: false,
  })
  if (reasons.length > 0) return true

  if (
    isReservationUnassignedForCounter(reservation)
    && !isTerminalReservationStatus(reservation?.status)
  ) {
    return true
  }

  if (reservationHasCapacityWarning(reservation)) return true
  if (isReservationLate(reservation, nowMinutes, todayKey)) return true
  if (isReservationWaiting(reservation, todayKey, nowMinutes)) return true

  return false
}

function normalizeCounterStatusKey(status) {
  return `${status ?? ''}`.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function isReservationSeatedForCounter(reservation) {
  const statusKey = normalizeCounterStatusKey(reservation?.status)
  if (statusKey === 'seated' || statusKey === 'checked_in' || statusKey === 'in_house') {
    return true
  }

  return getHostListGroupId(reservation) === 'in-house'
}

export function isReservationUnassignedForCounter(reservation) {
  const enriched = enrichReservationWithSeatingAssignment(reservation)
  return (enriched.seatingAssignment?.assignedUnits ?? []).length === 0
}

export function buildHostManagerSummary(visibleReservations = [], nowMinutes, todayKey) {
  const snapshot = buildDailyServiceSnapshot(visibleReservations, nowMinutes, todayKey)
  let needsAttention = 0

  visibleReservations.forEach((entry) => {
    const reservation = enrichReservationWithSeatingAssignment(entry)
    if (reservationNeedsHostAttention(reservation, nowMinutes, todayKey)) {
      needsAttention += 1
    }
  })

  return {
    ...snapshot,
    totalReservations: snapshot.activeReservations,
    totalGuests: snapshot.totalCovers,
    inHouse: snapshot.seatedTables,
    seated: snapshot.seatedTables,
    unassigned: snapshot.unassignedTables,
    needsAttention,
  }
}

export function getHostListCustomerTypeMeta(reservation, getGuestCustomerType) {
  const notes = `${reservation?.notes ?? ''}`.toLowerCase()
  const customerType = getGuestCustomerType(reservation)

  if (notes.includes('walk-in') || notes.includes('walk in') || notes.includes('walkin')) {
    return { label: 'WALK-IN', className: 'type-walkin' }
  }

  if (customerType === 'VVIP') {
    return { label: 'VVIP', className: 'type-vvip' }
  }

  if (customerType === 'VIP') {
    return { label: 'VIP', className: 'type-vip' }
  }

  if (customerType === 'House Guest') {
    return { label: 'HOUSE GUEST', className: 'type-house-guest' }
  }

  return { label: 'REG', className: 'type-regular' }
}

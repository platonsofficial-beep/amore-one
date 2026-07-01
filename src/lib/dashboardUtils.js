import { resolveShiftTemplateId } from './shiftIntegrity'
import { formatTime24, normalizeTimeValue } from './timeFormatUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { getCurrentDateKey } from './currentDateUtils'
import { getWeekDateKeys } from './weekUtils'

function normalizeDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function isTimeWithinShift(nowMinutes, startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return false
  if (startMinutes === endMinutes) return false

  if (endMinutes > startMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

export function isModuleUnavailableMessage(message) {
  const lower = `${message ?? ''}`.toLowerCase()
  return lower.includes('not ready')
    || lower.includes('does not exist')
    || lower.includes('could not find the table')
}

/** Dashboard metrics always use draft shifts — never published snapshots. */
export function resolveLiveDraftShiftsForDashboard(draftShifts = []) {
  return Array.isArray(draftShifts) ? draftShifts : []
}

/** Same week-level draft filter used by the scheduler visibleWeekShifts. */
export function resolveLiveDraftShiftsForWeek(draftShifts = [], weekStartDate = '') {
  const normalizedWeekStart = `${weekStartDate ?? ''}`.trim()
  if (!normalizedWeekStart) return []

  const weekKeySet = new Set(getWeekDateKeys(normalizedWeekStart))
  return resolveLiveDraftShiftsForDashboard(
    (draftShifts ?? []).filter((shift) => weekKeySet.has(normalizeDate(shift.date))),
  )
}

export function resolveLiveDraftCapacitiesForWeek(
  draftCapacities = [],
  weekStartDate = '',
  { useSchedulerSource = false } = {},
) {
  if (useSchedulerSource) {
    return Array.isArray(draftCapacities) ? draftCapacities : []
  }

  const normalizedWeekStart = `${weekStartDate ?? ''}`.trim()
  if (!normalizedWeekStart) return []

  const weekKeySet = new Set(getWeekDateKeys(normalizedWeekStart))
  return (draftCapacities ?? []).filter((item) => weekKeySet.has(normalizeDate(item.shiftDate)))
}

function resolvePublishedShiftEmployeeName(shift, employee) {
  const joinedEmployee = Array.isArray(shift.employees) ? shift.employees[0] : shift.employees

  return `${employee?.name
    ?? joinedEmployee?.full_name
    ?? joinedEmployee?.name
    ?? shift.employeeName
    ?? ''}`.trim()
}

function resolveEmployeeShiftMember(shift, employeesById) {
  const employee = employeesById.get(String(shift.employeeId))
  const name = resolvePublishedShiftEmployeeName(shift, employee)
  const position = `${employee?.position ?? shift.role ?? ''}`.trim()
  const startTimeLabel = formatTime24(normalizeTimeValue(shift.startTime))
  const endTimeLabel = formatTime24(normalizeTimeValue(shift.endTime))

  return {
    shiftId: String(shift.id),
    name,
    position,
    startTime: shift.startTime,
    endTime: shift.endTime,
    startTimeLabel,
    endTimeLabel,
  }
}

/** Live floor manager view — published shifts only, never draft assignments. */
export function buildLiveFloorState({
  publishedShifts = [],
  isWeekPublished = false,
  employees = [],
  todayKey = getCurrentDateKey(),
  now = new Date(),
} = {}) {
  const todayPublishedShifts = (publishedShifts ?? []).filter(
    (shift) => normalizeDate(shift.date) === todayKey,
  )

  if (!isWeekPublished || todayPublishedShifts.length === 0) {
    return {
      state: 'unpublished',
      eyebrow: 'Live floor',
      heading: 'Staff on shift',
      title: 'No published schedule',
      message: "Publish today's schedule to monitor live operations.",
      onShift: [],
      onShiftCount: 0,
      nextShiftStartLabel: null,
    }
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const employeesById = new Map(employees.map((employee) => [String(employee.id), employee]))
  const onShift = []
  const seenOnShift = new Set()
  let nextStartMinutes = null

  todayPublishedShifts.forEach((shift) => {
    if (!shift.employeeId) return

    const startMinutes = parseTimeToMinutes(shift.startTime)
    const endMinutes = parseTimeToMinutes(shift.endTime)

    if (isTimeWithinShift(nowMinutes, startMinutes, endMinutes)) {
      const shiftId = String(shift.id)
      if (seenOnShift.has(shiftId)) return
      seenOnShift.add(shiftId)
      onShift.push(resolveEmployeeShiftMember(shift, employeesById))
      return
    }

    if (startMinutes !== null && startMinutes > nowMinutes) {
      if (nextStartMinutes === null || startMinutes < nextStartMinutes) {
        nextStartMinutes = startMinutes
      }
    }
  })

  onShift.sort((left, right) => (
    (parseTimeToMinutes(left.startTime) ?? 0) - (parseTimeToMinutes(right.startTime) ?? 0)
  ))

  if (onShift.length > 0) {
    return {
      state: 'live',
      eyebrow: 'LIVE FLOOR',
      heading: 'Staff on shift',
      title: 'LIVE FLOOR',
      message: '',
      onShift,
      onShiftCount: onShift.length,
      nextShiftStartLabel: null,
    }
  }

  const nextShiftStartLabel = nextStartMinutes !== null
    ? formatTime24(`${String(Math.floor(nextStartMinutes / 60)).padStart(2, '0')}:${String(nextStartMinutes % 60).padStart(2, '0')}`)
    : null

  return {
    state: 'idle',
    eyebrow: 'Live floor',
    heading: 'Staff on shift',
    title: 'No active shift',
    message: nextShiftStartLabel
      ? `Next shift starts at ${nextShiftStartLabel}`
      : 'No more shifts scheduled today.',
    onShift: [],
    onShiftCount: 0,
    nextShiftStartLabel,
  }
}

export function buildTodayTimeline({
  shifts = [],
  shiftTemplates = [],
  todayKey = getCurrentDateKey(),
} = {}) {
  const todayShifts = shifts.filter((shift) => normalizeDate(shift.date) === todayKey)
  const templatesById = new Map(
    shiftTemplates
      .map((template) => [resolveShiftTemplateId(template), template])
      .filter(([templateId]) => Boolean(templateId)),
  )

  const seen = new Set()
  const events = []

  todayShifts.forEach((shift) => {
    const startTime = normalizeTimeValue(shift.startTime)
    if (!startTime) return

    const templateId = resolveShiftTemplateId(shift)
    const template = templateId ? templatesById.get(templateId) : null
    const shiftName = `${template?.name ?? shift.area ?? shift.role ?? 'Shift'}`.trim() || 'Shift'
    const key = `${startTime}:${shiftName.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)

    const area = `${shift.area ?? template?.defaultArea ?? ''}`.trim()
    events.push({
      key,
      time: startTime,
      timeLabel: formatTime24(startTime),
      title: `${shiftName} starts`,
      note: area,
    })
  })

  events.sort((left, right) => (
    (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
  ))

  return events
}

export function buildTodayReservationsSummary(reservations = [], todayKey = getCurrentDateKey()) {
  const todayReservations = getTodayReservations(reservations, todayKey)
  const tableNumbers = new Set()
  let guests = 0

  todayReservations.forEach((reservation) => {
    const partySize = Number(reservation.guests)
    if (Number.isFinite(partySize) && partySize > 0) {
      guests += partySize
    }

    const tableNumber = `${reservation.tableNumber ?? ''}`.trim()
    if (tableNumber) {
      tableNumbers.add(tableNumber.toLowerCase())
    }
  })

  return {
    bookings: todayReservations.length,
    tables: tableNumbers.size,
    guests,
  }
}

export function countTodayReservations(reservations = [], todayKey = getCurrentDateKey()) {
  return buildTodayReservationsSummary(reservations, todayKey).bookings
}

export function getTodayReservations(reservations = [], todayKey = getCurrentDateKey()) {
  return reservations
    .filter((reservation) => normalizeDate(reservation.date) === todayKey)
    .sort((left, right) => (
      (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
    ))
}

export function countLowStockAlerts(inventoryItems = []) {
  return inventoryItems.filter((item) => (
    item.status === 'Low Stock' || item.status === 'Out of Stock'
  )).length
}

export function getLowStockAlertItems(inventoryItems = [], limit = 5) {
  return inventoryItems
    .filter((item) => item.status === 'Low Stock' || item.status === 'Out of Stock')
    .sort((left, right) => {
      if (left.status === right.status) {
        return `${left.name ?? ''}`.localeCompare(`${right.name ?? ''}`)
      }
      return left.status === 'Out of Stock' ? -1 : 1
    })
    .slice(0, limit)
    .map((item) => ({
      id: String(item.id),
      name: `${item.name ?? 'Item'}`.trim() || 'Item',
      status: item.status,
      quantity: item.quantity,
      unit: item.unit,
    }))
}

export function buildDashboardIssuesSummary(snapshot = {}) {
  const issueCount = Number(snapshot.issues) || 0

  if (issueCount === 0) {
    return {
      count: 0,
      title: 'All clear',
      message: snapshot.statusMessage || 'Everything is ready for service.',
      tone: 'ready',
    }
  }

  return {
    count: issueCount,
    title: issueCount === 1 ? '1 issue needs attention' : `${issueCount} issues need attention`,
    message: 'Review today\'s schedule for staffing gaps, overstaffing, and overtime.',
    tone: 'attention',
  }
}

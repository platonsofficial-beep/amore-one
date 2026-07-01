import { resolveShiftTemplateId } from './shiftIntegrity'
import { formatTime24, normalizeTimeValue } from './timeFormatUtils'
import { calculateShiftDurationHours, parseTimeToMinutes } from './shiftHoursUtils'
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
  const department = `${shift.area ?? ''}`.trim()
  const startTimeLabel = formatTime24(normalizeTimeValue(shift.startTime))
  const endTimeLabel = formatTime24(normalizeTimeValue(shift.endTime))

  return {
    shiftId: String(shift.id),
    name,
    position,
    department,
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
      nextShifts: [],
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

  const resolveNextShiftMembers = () => {
    if (nextStartMinutes === null) return []

    const seen = new Set()
    const members = []

    todayPublishedShifts.forEach((shift) => {
      if (!shift.employeeId) return
      const startMinutes = parseTimeToMinutes(shift.startTime)
      if (startMinutes !== nextStartMinutes) return

      const shiftId = String(shift.id)
      if (seen.has(shiftId)) return
      seen.add(shiftId)
      members.push(resolveEmployeeShiftMember(shift, employeesById))
    })

    return members.sort((left, right) => (
      (parseTimeToMinutes(left.startTime) ?? 0) - (parseTimeToMinutes(right.startTime) ?? 0)
    ))
  }

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
      nextShifts: [],
    }
  }

  const nextShiftStartLabel = nextStartMinutes !== null
    ? formatTime24(`${String(Math.floor(nextStartMinutes / 60)).padStart(2, '0')}:${String(nextStartMinutes % 60).padStart(2, '0')}`)
    : null
  const nextShifts = resolveNextShiftMembers()

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
    nextShifts,
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
    const key = `shift:${startTime}:${shiftName.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)

    const area = `${shift.area ?? template?.defaultArea ?? ''}`.trim()
    events.push({
      key,
      time: startTime,
      timeLabel: formatTime24(startTime),
      title: `${shiftName} starts`,
      note: area,
      type: 'shift',
    })
  })

  events.sort((left, right) => (
    (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
  ))

  return events
}

export function buildTodayCommandTimeline({
  shifts = [],
  shiftTemplates = [],
  reservations = [],
  todayKey = getCurrentDateKey(),
  reservationsConnected = false,
} = {}) {
  const events = buildTodayTimeline({ shifts, shiftTemplates, todayKey })

  if (reservationsConnected) {
    getTodayReservations(reservations, todayKey).forEach((reservation) => {
      const time = normalizeTimeValue(reservation.time)
      if (!time) return

      const guestName = `${reservation.guestName ?? 'Guest'}`.trim() || 'Guest'
      const guests = Number(reservation.guests)
      const guestNote = Number.isFinite(guests) && guests > 0 ? `${guests} guests` : ''
      const tableNumber = `${reservation.tableNumber ?? ''}`.trim()
      const tableNote = tableNumber ? `Table ${tableNumber}` : ''

      events.push({
        key: `reservation:${reservation.id ?? `${guestName}-${time}`}`,
        time,
        timeLabel: formatTime24(time),
        title: `${guestName} reservation`,
        note: [guestNote, tableNote].filter(Boolean).join(' · '),
        type: 'reservation',
      })
    })
  }

  return events.sort((left, right) => (
    (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
  ))
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
      name: `${item.itemName ?? item.name ?? item.item_name ?? ''}`.trim() || 'Item',
      status: item.status,
      severity: item.status === 'Out of Stock' ? 'critical' : 'low',
      quantity: item.quantity,
      unit: item.unit,
    }))
}

export function buildDashboardIssuesSummary(snapshot = {}) {
  const issueCount = Number(snapshot.issues) || 0

  if (issueCount === 0) {
    return {
      count: 0,
      severity: 'info',
      title: 'All clear',
      message: '',
      tone: 'ready',
    }
  }

  const severity = issueCount >= 3 ? 'critical' : 'warning'

  return {
    count: issueCount,
    severity,
    title: issueCount === 1 ? '1 issue needs attention' : `${issueCount} issues need attention`,
    message: severity === 'critical' ? 'Act now.' : 'Review schedule.',
    tone: 'attention',
  }
}

export function buildExecutiveLabourSummary({
  snapshot = {},
  todayShifts = [],
  employees = [],
} = {}) {
  const hoursLabel = `${snapshot.labourHoursLabel ?? '0'}`.trim() || '0'

  const hourlyRateByEmployeeId = new Map()
  employees.forEach((employee) => {
    const hourlyRate = resolveEmployeeHourlyRate(employee)
    if (hourlyRate !== null) {
      hourlyRateByEmployeeId.set(String(employee.id), hourlyRate)
    }
  })

  if (hourlyRateByEmployeeId.size === 0) {
    return {
      hoursLabel,
      costConnected: false,
      costDisplay: null,
      costHint: 'Labour Cost not connected',
    }
  }

  let totalCost = 0
  let canCalculate = false
  const seenShiftIds = new Set()

  todayShifts.forEach((shift) => {
    const shiftId = String(shift.id)
    if (seenShiftIds.has(shiftId)) return
    seenShiftIds.add(shiftId)

    if (!shift.employeeId) return

    const hourlyRate = hourlyRateByEmployeeId.get(String(shift.employeeId))
    if (hourlyRate === undefined) return

    canCalculate = true
    totalCost += calculateShiftDurationHours(shift.startTime, shift.endTime) * hourlyRate
  })

  if (!canCalculate || totalCost <= 0) {
    return {
      hoursLabel,
      costConnected: false,
      costDisplay: null,
      costHint: 'Labour Cost not connected',
    }
  }

  return {
    hoursLabel,
    costConnected: true,
    costDisplay: formatEuroAmount(totalCost),
    costHint: "Today's Labour Cost",
  }
}

function resolveEmployeeHourlyRate(employee) {
  const candidates = [
    employee?.hourlyRate,
    employee?.hourly_rate,
    employee?.hourlyWage,
    employee?.hourly_wage,
  ]

  for (const candidate of candidates) {
    const parsed = parsePositiveNumber(candidate)
    if (parsed !== null) return parsed
  }

  return null
}

function parsePositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null

  const cleaned = trimmed.replace(/[€$,\s]/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

function formatEuroAmount(value) {
  const rounded = Math.round(value)
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(rounded)
}

export function buildBusinessHealthSummary({
  issuesSummary = {},
  stockAlerts = [],
  inventoryConnected = false,
} = {}) {
  const criticalStockCount = stockAlerts.filter((item) => item.severity === 'critical').length
  const hasScheduleCritical = issuesSummary.severity === 'critical'
  const hasScheduleWarning = issuesSummary.severity === 'warning'
  const hasStockAttention = inventoryConnected && stockAlerts.length > 0

  if (hasScheduleCritical || criticalStockCount > 0) {
    return {
      tone: 'critical',
      label: 'Critical',
      icon: '✕',
      message: 'Immediate attention required.',
    }
  }

  if (hasScheduleWarning || hasStockAttention) {
    return {
      tone: 'attention',
      label: 'Attention',
      icon: '⚠',
      message: 'Minor issues detected.',
    }
  }

  return {
    tone: 'healthy',
    label: 'Excellent',
    icon: '✓',
    message: 'All systems operating normally.',
  }
}

function getMinutesUntilTimeLabel(timeLabel, now = new Date()) {
  const targetMinutes = parseTimeToMinutes(timeLabel)
  if (targetMinutes === null) return null

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const diff = targetMinutes - nowMinutes
  return diff > 0 ? diff : null
}

export function buildDashboardContextMessage({
  snapshot = {},
  liveFloor = {},
  businessHealth = {},
  now = new Date(),
} = {}) {
  const issueCount = Number(snapshot.issues) || 0

  if (businessHealth.tone === 'critical') {
    return 'Immediate attention required before service.'
  }

  if (issueCount === 1) {
    return 'One issue needs your attention.'
  }

  if (issueCount > 1) {
    return `${issueCount} issues need your attention.`
  }

  if (liveFloor.state === 'live' && liveFloor.onShiftCount > 0) {
    return liveFloor.onShiftCount === 1
      ? 'One team member is on the floor now.'
      : `${liveFloor.onShiftCount} team members are on the floor now.`
  }

  if (liveFloor.nextShiftStartLabel) {
    const minutesUntil = getMinutesUntilTimeLabel(liveFloor.nextShiftStartLabel, now)
    const hour = now.getHours()
    const eveningShift = hour >= 17

    if (minutesUntil !== null) {
      if (minutesUntil < 60) {
        return `Next shift starts in ${minutesUntil} minute${minutesUntil === 1 ? '' : 's'}.`
      }

      const hoursUntil = Math.round(minutesUntil / 60)
      if (hoursUntil <= 6) {
        return eveningShift
          ? `Tonight's shift starts in ${hoursUntil} hour${hoursUntil === 1 ? '' : 's'}.`
          : `Next shift starts in ${hoursUntil} hour${hoursUntil === 1 ? '' : 's'}.`
      }
    }

    return `Next shift starts at ${liveFloor.nextShiftStartLabel}.`
  }

  if (liveFloor.state === 'unpublished') {
    return "Publish today's schedule to monitor live operations."
  }

  return 'Everything is running smoothly today.'
}

export function buildReservationsContextLine(
  reservations = [],
  todayKey = getCurrentDateKey(),
  now = new Date(),
) {
  const todayReservations = getTodayReservations(reservations, todayKey)

  if (todayReservations.length === 0) {
    return 'No reservations booked today.'
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const upcoming = todayReservations.find((reservation) => {
    const minutes = parseTimeToMinutes(reservation.time)
    return minutes !== null && minutes >= nowMinutes
  }) ?? todayReservations[todayReservations.length - 1]

  const timeLabel = formatTime24(normalizeTimeValue(upcoming.time))
  if (!timeLabel) {
    return `${todayReservations.length === 1 ? '1 reservation' : `${todayReservations.length} reservations`} booked today.`
  }

  return `Next reservation at ${timeLabel}.`
}

export function buildReservationsFooter(
  reservations = [],
  todayKey = getCurrentDateKey(),
  now = new Date(),
) {
  const todayReservations = getTodayReservations(reservations, todayKey)

  if (todayReservations.length === 0) {
    return { type: 'empty', message: 'No upcoming reservations.' }
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const upcoming = todayReservations.find((reservation) => {
    const minutes = parseTimeToMinutes(reservation.time)
    return minutes !== null && minutes >= nowMinutes
  })

  if (!upcoming) {
    return { type: 'empty', message: 'No upcoming reservations.' }
  }

  const timeLabel = formatTime24(normalizeTimeValue(upcoming.time))
  if (!timeLabel) {
    return { type: 'empty', message: 'No upcoming reservations.' }
  }

  return { type: 'next', label: 'Next reservation', time: timeLabel }
}

export function buildDashboardOperationalSummary({
  snapshot = {},
  reservationsSummary = {},
  reservationsConnected = false,
  stockAlerts = [],
  inventoryConnected = false,
  issuesSummary = {},
  liveFloor = {},
  now = new Date(),
} = {}) {
  const hour = now.getHours()
  const isEvening = hour >= 17
  const dayPart = isEvening ? 'Tonight' : 'Today'
  const scheduledStaff = Number(snapshot.scheduledStaff) || 0
  const bookings = reservationsConnected ? Number(reservationsSummary.bookings) || 0 : null
  const issueCount = Number(issuesSummary.count) || 0
  const stockCount = inventoryConnected ? stockAlerts.length : 0

  if (stockCount > 0) {
    return stockCount === 1
      ? 'One stock item requires attention before service.'
      : `${stockCount} stock items require attention before service.`
  }

  if (issueCount > 0) {
    return issueCount === 1
      ? 'One issue needs attention before service.'
      : `${issueCount} issues need attention before service.`
  }

  if (bookings !== null && scheduledStaff > 0) {
    const reservationLabel = bookings === 1 ? '1 reservation' : `${bookings} reservations`
    const staffLabel = scheduledStaff === 1 ? '1 employee scheduled' : `${scheduledStaff} employees scheduled`
    return `${dayPart} has ${reservationLabel} and ${staffLabel}.`
  }

  if (bookings !== null && bookings > 0) {
    const reservationLabel = bookings === 1 ? '1 reservation' : `${bookings} reservations`
    return `${dayPart} has ${reservationLabel}.`
  }

  if (scheduledStaff > 0) {
    const staffLabel = scheduledStaff === 1 ? '1 employee scheduled' : `${scheduledStaff} employees scheduled`
    return `${dayPart} has ${staffLabel}.`
  }

  if (liveFloor.state === 'unpublished') {
    return "Publish today's schedule to prepare for service."
  }

  if (isEvening) {
    return "Everything is ready for today's evening shift."
  }

  return 'Everything is running smoothly today.'
}

import { formatTime24, normalizeTimeValue } from './timeFormatUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { buildEmployeeWeekScheduleView } from './employeeWeekScheduleView'
import { isTaskOverdue } from './taskUtils'

function normalizeDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeTaskStatus(value) {
  const status = `${value ?? ''}`.trim().toLowerCase()
  return status === 'completed' ? 'completed' : 'active'
}

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function isShiftActiveNow(shift, nowMinutes) {
  const startMinutes = parseTimeToMinutes(normalizeTimeValue(shift?.startTime))
  const endMinutes = parseTimeToMinutes(normalizeTimeValue(shift?.endTime))
  if (startMinutes === null || endMinutes === null) return false

  if (endMinutes > startMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

export function buildMobileEmployeeShiftSummary({
  employeeId = null,
  publishedShifts = [],
  isWeekPublished = false,
  todayKey = '',
  now = new Date(),
  liveFloor = {},
} = {}) {
  if (!isWeekPublished) {
    return {
      tone: 'neutral',
      headline: 'Schedule not published',
      detail: 'Your manager has not published this week yet.',
    }
  }

  const employeeKey = employeeId ? String(employeeId) : ''
  const todayShifts = (publishedShifts ?? [])
    .filter((shift) => normalizeDate(shift.date) === todayKey && `${shift.employeeId ?? ''}` === employeeKey)
    .sort((left, right) => (
      (parseTimeToMinutes(left.startTime) ?? 0) - (parseTimeToMinutes(right.startTime) ?? 0)
    ))

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const activeShift = todayShifts.find((shift) => isShiftActiveNow(shift, nowMinutes))

  if (activeShift) {
    const endLabel = formatTime24(normalizeTimeValue(activeShift.endTime))
    return {
      tone: 'live',
      headline: 'On shift now',
      detail: endLabel ? `Until ${endLabel}` : 'Currently working',
    }
  }

  const upcomingShift = todayShifts.find((shift) => {
    const startMinutes = parseTimeToMinutes(normalizeTimeValue(shift.startTime))
    return startMinutes !== null && startMinutes > nowMinutes
  })

  if (upcomingShift) {
    const startLabel = formatTime24(normalizeTimeValue(upcomingShift.startTime))
    const endLabel = formatTime24(normalizeTimeValue(upcomingShift.endTime))
    return {
      tone: 'upcoming',
      headline: 'Next shift today',
      detail: startLabel && endLabel ? `${startLabel} - ${endLabel}` : (startLabel || 'Scheduled later'),
    }
  }

  if (todayShifts.length > 0) {
    return {
      tone: 'completed',
      headline: 'Shift completed',
      detail: 'No more shifts scheduled today.',
    }
  }

  if (liveFloor?.state === 'live' && Number(liveFloor.onShiftCount) > 0 && !employeeKey) {
    return {
      tone: 'live',
      headline: 'Service is live',
      detail: `${liveFloor.onShiftCount} team member${liveFloor.onShiftCount === 1 ? '' : 's'} on shift`,
    }
  }

  if (liveFloor?.nextShiftStartLabel) {
    return {
      tone: 'upcoming',
      headline: 'Next shift',
      detail: liveFloor.nextShiftStartLabel,
    }
  }

  return {
    tone: 'neutral',
    headline: 'No shift today',
    detail: 'You are not scheduled for today.',
  }
}

export function buildMobileEmployeeWeekSchedule({
  employeeId = null,
  employees = [],
  weekDays = [],
  publishedShifts = [],
} = {}) {
  const scheduleRows = buildEmployeeWeekScheduleView({
    employees,
    weekDays,
    weekShifts: publishedShifts,
  })

  if (!employeeId) {
    return null
  }

  return scheduleRows.find((row) => `${row.employeeId}` === `${employeeId}`) ?? {
    employeeId,
    employeeName: 'You',
    days: (weekDays ?? []).map((day) => ({
      date: day.key,
      dayLabel: day.label,
      shortDate: day.shortDate,
      isDayOff: true,
      shifts: [],
    })),
  }
}

export function partitionMobileTasks(tasks = [], todayKey = '') {
  const upcoming = []
  const pending = []
  const completed = []

  ;(tasks ?? []).forEach((task) => {
    const status = normalizeTaskStatus(task?.status)
    if (status === 'completed') {
      completed.push(task)
      return
    }

    const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
    if (!dueDate || dueDate > todayKey) {
      upcoming.push(task)
      return
    }

    pending.push(task)
  })

  const sortByDue = (left, right) => {
    const leftDate = normalizeTaskDateKey(left?.dueDate ?? left?.due_date) || '9999-12-31'
    const rightDate = normalizeTaskDateKey(right?.dueDate ?? right?.due_date) || '9999-12-31'
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
    return `${left?.title ?? ''}`.localeCompare(`${right?.title ?? ''}`)
  }

  upcoming.sort(sortByDue)
  pending.sort((left, right) => {
    const leftOverdue = isTaskOverdue(left, todayKey) ? 0 : 1
    const rightOverdue = isTaskOverdue(right, todayKey) ? 0 : 1
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue
    return sortByDue(left, right)
  })
  completed.sort((left, right) => {
    const leftCompleted = normalizeTaskDateKey(left?.completedAt ?? left?.completed_at) || ''
    const rightCompleted = normalizeTaskDateKey(right?.completedAt ?? right?.completed_at) || ''
    return rightCompleted.localeCompare(leftCompleted)
  })

  return { upcoming, pending, completed }
}

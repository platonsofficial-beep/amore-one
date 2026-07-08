import { formatTime24, normalizeTimeValue } from './timeFormatUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { isTaskOverdue } from './taskUtils'
import { normalizeOperationsStatus } from './operationsUtils'

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function formatMobilePositionArea(position, area) {
  const normalizedPosition = `${position ?? ''}`.trim()
  const normalizedArea = `${area ?? ''}`.trim()

  if (normalizedPosition && normalizedArea) {
    return `${normalizedPosition} · ${normalizedArea}`
  }

  return normalizedPosition || normalizedArea || '—'
}

function resolveMobileShiftPosition(shift, employee) {
  const role = `${shift?.role ?? ''}`.trim()
  if (role) return role

  return `${employee?.primaryPosition ?? employee?.position ?? ''}`.trim() || '—'
}

function mapMobileShiftEntry(shift, employee) {
  const position = resolveMobileShiftPosition(shift, employee)
  const area = `${shift?.area ?? ''}`.trim()

  return {
    shiftId: shift?.id ?? null,
    startTime: shift?.startTime ?? '',
    endTime: shift?.endTime ?? '',
    startTimeLabel: formatTime24(shift?.startTime),
    endTimeLabel: formatTime24(shift?.endTime),
    position,
    area,
    positionAreaLabel: formatMobilePositionArea(position, area),
  }
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
    .filter((shift) => normalizeShiftDate(shift.date) === todayKey && `${shift.employeeId ?? ''}` === employeeKey)
    .sort((left, right) => (
      `${left.startTime ?? ''}`.localeCompare(`${right.startTime ?? ''}`)
    ))

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const activeShift = todayShifts.find((shift) => {
    const startMinutes = parseTimeToMinutes(normalizeTimeValue(shift.startTime))
    const endMinutes = parseTimeToMinutes(normalizeTimeValue(shift.endTime))
    if (startMinutes === null || endMinutes === null) return false
    if (endMinutes > startMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes
    }
    return nowMinutes >= startMinutes || nowMinutes < endMinutes
  })

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
  todayKey = '',
} = {}) {
  if (!employeeId) {
    return null
  }

  const employee = (employees ?? []).find((item) => `${item.id}` === `${employeeId}`)
  const employeeName = `${employee?.name ?? employee?.fullName ?? ''}`.trim() || 'You'

  const days = (weekDays ?? []).map((day) => {
    const dayShifts = (publishedShifts ?? [])
      .filter((shift) => (
        normalizeShiftDate(shift.date) === day.key
        && `${shift.employeeId ?? ''}` === `${employeeId}`
      ))
      .slice()
      .sort((left, right) => `${left.startTime ?? ''}`.localeCompare(`${right.startTime ?? ''}`))
      .map((shift) => mapMobileShiftEntry(shift, employee))

    return {
      date: day.key,
      dayLabel: day.label,
      shortDate: day.shortDate,
      isToday: Boolean(todayKey && day.key === todayKey),
      isDayOff: dayShifts.length === 0,
      shifts: dayShifts,
    }
  })

  return {
    employeeId,
    employeeName,
    days,
  }
}

export function partitionMobileTasks(tasks = [], todayKey = '') {
  const upcoming = []
  const pending = []
  const completed = []

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

function normalizeMobileTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function isMobileOperationsTaskDone(task) {
  const status = normalizeOperationsStatus(task?.status)
  return status === 'completed' || status === 'skipped'
}

function isMobileOperationsTaskOverdue(task, todayKey) {
  if (isMobileOperationsTaskDone(task)) return false
  const dueDate = normalizeMobileTaskDateKey(task?.dueDate ?? task?.due_date)
  if (!dueDate) return false
  return dueDate < todayKey
}

function isMobileOperationsTaskCompletedToday(task, todayKey) {
  if (!isMobileOperationsTaskDone(task)) return false
  const completedAt = task?.completedAt ?? task?.completed_at ?? null
  if (!completedAt) return false

  const parsed = new Date(completedAt)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear()
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
    const day = `${parsed.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}` === todayKey
  }

  return normalizeMobileTaskDateKey(completedAt) === todayKey
}

export function filterMobileStaffOperationsTasks(tasks = [], employeeId = null) {
  const employeeKey = employeeId ? `${employeeId}` : ''

  return (tasks ?? []).filter((task) => {
    const assignedTo = `${task?.assignedTo ?? task?.assigned_to ?? ''}`.trim()
    if (!assignedTo) return true
    if (!employeeKey) return false
    return assignedTo === employeeKey
  })
}

export function partitionMobileOperationsTasks(tasks = [], todayKey = '') {
  const upcoming = []
  const pending = []
  const completed = []

  ;(tasks ?? []).forEach((task) => {
    if (isMobileOperationsTaskDone(task)) {
      completed.push(task)
      return
    }

    const dueDate = normalizeMobileTaskDateKey(task?.dueDate ?? task?.due_date)
    if (!dueDate || dueDate > todayKey) {
      upcoming.push(task)
      return
    }

    pending.push(task)
  })

  const sortByDue = (left, right) => {
    const leftDate = normalizeMobileTaskDateKey(left?.dueDate ?? left?.due_date) || '9999-12-31'
    const rightDate = normalizeMobileTaskDateKey(right?.dueDate ?? right?.due_date) || '9999-12-31'
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
    return `${left?.title ?? ''}`.localeCompare(`${right?.title ?? ''}`)
  }

  upcoming.sort(sortByDue)
  pending.sort((left, right) => {
    const leftOverdue = isMobileOperationsTaskOverdue(left, todayKey) ? 0 : 1
    const rightOverdue = isMobileOperationsTaskOverdue(right, todayKey) ? 0 : 1
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue
    return sortByDue(left, right)
  })
  completed.sort((left, right) => {
    const leftCompleted = normalizeMobileTaskDateKey(left?.completedAt ?? left?.completed_at) || ''
    const rightCompleted = normalizeMobileTaskDateKey(right?.completedAt ?? right?.completed_at) || ''
    return rightCompleted.localeCompare(leftCompleted)
  })

  return { upcoming, pending, completed }
}

export function calculateMobileOperationsTaskOverview(tasks = [], todayKey = '') {
  const allTasks = tasks ?? []
  const activeTasks = allTasks.filter((task) => !isMobileOperationsTaskDone(task))
  const active = activeTasks.length
  const overdue = activeTasks.filter((task) => isMobileOperationsTaskOverdue(task, todayKey)).length
  const completedToday = allTasks.filter((task) => isMobileOperationsTaskCompletedToday(task, todayKey)).length

  const todayWorkload = allTasks.filter((task) => {
    const dueDate = normalizeMobileTaskDateKey(task?.dueDate ?? task?.due_date)

    if (isMobileOperationsTaskDone(task)) {
      return isMobileOperationsTaskCompletedToday(task, todayKey)
    }

    return Boolean(dueDate) && dueDate <= todayKey
  })

  const completedInTodayWorkload = todayWorkload.filter((task) => (
    isMobileOperationsTaskCompletedToday(task, todayKey)
  )).length
  const completionPercent = todayWorkload.length > 0
    ? Math.round((completedInTodayWorkload / todayWorkload.length) * 100)
    : 0

  const showEmptyToday = active === 0 && overdue === 0 && completedToday === 0

  return {
    active,
    overdue,
    completedToday,
    completionPercent,
    showEmptyToday,
    todayTotal: todayWorkload.length,
    todayCompleted: completedInTodayWorkload,
  }
}
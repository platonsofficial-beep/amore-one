import { parseTimeToMinutes } from './shiftHoursUtils'

export const EMPLOYEE_TODAY_STATUS = Object.freeze({
  on_leave: Object.freeze({
    key: 'on_leave',
    label: 'On leave today',
    priority: 1,
  }),
  working_now: Object.freeze({
    key: 'working_now',
    label: 'Working now',
    priority: 2,
  }),
  scheduled_later: Object.freeze({
    key: 'scheduled_later',
    label: 'Scheduled later',
    priority: 3,
  }),
  shift_completed: Object.freeze({
    key: 'shift_completed',
    label: 'Shift completed',
    priority: 4,
  }),
  day_off: Object.freeze({
    key: 'day_off',
    label: 'Day off today',
    priority: 5,
  }),
  not_scheduled: Object.freeze({
    key: 'not_scheduled',
    label: 'Not scheduled',
    priority: 6,
  }),
  unavailable: Object.freeze({
    key: 'unavailable',
    label: 'Unavailable today',
    priority: 7,
  }),
})

function normalizeDateKey(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeEmployeeId(value) {
  const raw = `${value ?? ''}`.trim()
  return raw || null
}

function normalizeNowMinutes(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  const rounded = Math.trunc(parsed)
  if (rounded < 0) return 0
  if (rounded > 1439) return 1439
  return rounded
}

function readShiftEmployeeId(shift) {
  const employeeId = shift?.employeeId ?? shift?.employee_id ?? null
  if (employeeId === null || employeeId === undefined || `${employeeId}`.trim() === '') return null
  return String(employeeId)
}

function readShiftDateKey(shift) {
  return normalizeDateKey(shift?.date ?? shift?.shiftDate ?? shift?.shift_date)
}

function readShiftTime(shift, camelKey, snakeKey) {
  const value = shift?.[camelKey] ?? shift?.[snakeKey] ?? ''
  return `${value ?? ''}`.trim()
}

function isOvernightShift(startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return false
  return endMinutes <= startMinutes
}

function isShiftActiveAt(nowMinutes, startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return false
  if (startMinutes === endMinutes) return false

  if (endMinutes > startMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

function isShiftCompletedAt(nowMinutes, startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return false

  if (endMinutes > startMinutes) {
    return nowMinutes >= endMinutes
  }

  return nowMinutes >= endMinutes && nowMinutes < startMinutes
}

function isShiftFutureAt(nowMinutes, startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return false
  if (isShiftActiveAt(nowMinutes, startMinutes, endMinutes)) return false
  if (isShiftCompletedAt(nowMinutes, startMinutes, endMinutes)) return false

  if (endMinutes > startMinutes) {
    return nowMinutes < startMinutes
  }

  return nowMinutes < startMinutes && nowMinutes >= endMinutes
}

function isPreviousDayOvernightActive(nowMinutes, startMinutes, endMinutes) {
  if (!isOvernightShift(startMinutes, endMinutes)) return false
  return nowMinutes < endMinutes
}

function getPreviousDateKey(dateKey) {
  const normalized = normalizeDateKey(dateKey)
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null

  const utcDate = new Date(Date.UTC(year, month - 1, day))
  utcDate.setUTCDate(utcDate.getUTCDate() - 1)

  return utcDate.toISOString().slice(0, 10)
}

function normalizePublishedShift(shift) {
  if (!shift || typeof shift !== 'object') return null

  const employeeId = readShiftEmployeeId(shift)
  const dateKey = readShiftDateKey(shift)
  const startTime = readShiftTime(shift, 'startTime', 'start_time')
  const endTime = readShiftTime(shift, 'endTime', 'end_time')
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)

  if (!employeeId || !dateKey || startMinutes === null || endMinutes === null) {
    return null
  }

  return {
    shift,
    employeeId,
    dateKey,
    startTime,
    endTime,
    startMinutes,
    endMinutes,
  }
}

function sortShiftsByStart(shifts = []) {
  return [...shifts].sort((left, right) => (
    left.startMinutes - right.startMinutes
    || left.endMinutes - right.endMinutes
    || `${left.startTime}`.localeCompare(`${right.startTime}`)
  ))
}

function completionSortKey(shift) {
  if (shift.endMinutes > shift.startMinutes) return shift.endMinutes
  return shift.endMinutes + 1440
}

function minutesToTimeLabel(minutes) {
  if (!Number.isFinite(minutes)) return null
  const normalized = ((Math.trunc(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const mins = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function buildShiftSnapshot(normalizedShift) {
  if (!normalizedShift) return null

  return {
    shift: normalizedShift.shift,
    employeeId: normalizedShift.employeeId,
    date: normalizedShift.dateKey,
    startTime: normalizedShift.startTime,
    endTime: normalizedShift.endTime,
    startMinutes: normalizedShift.startMinutes,
    endMinutes: normalizedShift.endMinutes,
  }
}

function normalizeApprovedLeaveInput(approvedLeave) {
  if (!approvedLeave) return []
  if (Array.isArray(approvedLeave)) return approvedLeave.filter(Boolean)
  return [approvedLeave]
}

function readLeaveEmployeeId(leave) {
  const employeeId = leave?.employeeId ?? leave?.employee_id ?? null
  if (employeeId === null || employeeId === undefined || `${employeeId}`.trim() === '') return null
  return String(employeeId)
}

function isApprovedLeaveActiveForToday(leave, employeeId, todayKey) {
  if (!leave || typeof leave !== 'object') return false
  if (`${leave.status ?? ''}`.trim().toLowerCase() !== 'approved') return false

  const leaveEmployeeId = readLeaveEmployeeId(leave)
  if (leaveEmployeeId && leaveEmployeeId !== String(employeeId)) return false

  const startDate = normalizeDateKey(leave.startDate ?? leave.start_date)
  const endDate = normalizeDateKey(leave.endDate ?? leave.end_date)
  if (!startDate || !endDate || !todayKey) return false

  return todayKey >= startDate && todayKey <= endDate
}

function findMatchingApprovedLeave(approvedLeave, employeeId, todayKey) {
  return normalizeApprovedLeaveInput(approvedLeave).find((leave) => (
    isApprovedLeaveActiveForToday(leave, employeeId, todayKey)
  )) ?? null
}

function buildBaseResult({
  employeeId,
  todayKey,
  isWeekPublished,
  shiftsToday,
}) {
  return {
    key: EMPLOYEE_TODAY_STATUS.not_scheduled.key,
    label: EMPLOYEE_TODAY_STATUS.not_scheduled.label,
    employeeId,
    todayKey,
    isWeekPublished: Boolean(isWeekPublished),
    currentShift: null,
    nextShift: null,
    completedShift: null,
    shiftsToday,
    leave: null,
    startsAt: null,
    endsAt: null,
    reason: null,
  }
}

function withStatus(result, statusKey, extras = {}) {
  const status = EMPLOYEE_TODAY_STATUS[statusKey] ?? EMPLOYEE_TODAY_STATUS.not_scheduled

  return {
    ...result,
    key: status.key,
    label: status.label,
    ...extras,
  }
}

export function getWorkspaceNowMinutes(date, timeZone = '') {
  const inputDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : null

  if (!inputDate) {
    return {
      minutes: null,
      usedTimeZone: null,
      usedFallback: true,
    }
  }

  const trimmedTimeZone = `${timeZone ?? ''}`.trim()

  if (!trimmedTimeZone) {
    return {
      minutes: inputDate.getHours() * 60 + inputDate.getMinutes(),
      usedTimeZone: null,
      usedFallback: true,
    }
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: trimmedTimeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(inputDate)

    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      throw new Error('Invalid timezone parts')
    }

    return {
      minutes: hour * 60 + minute,
      usedTimeZone: trimmedTimeZone,
      usedFallback: false,
    }
  } catch {
    return {
      minutes: inputDate.getHours() * 60 + inputDate.getMinutes(),
      usedTimeZone: trimmedTimeZone,
      usedFallback: true,
    }
  }
}

export function resolveEmployeeTodayStatus(input = {}) {
  const employeeId = normalizeEmployeeId(input?.employeeId)
  const todayKey = normalizeDateKey(input?.todayKey)
  const nowMinutes = normalizeNowMinutes(input?.nowMinutes)
  const isWeekPublished = Boolean(input?.isWeekPublished)
  const publishedShifts = Array.isArray(input?.publishedShifts) ? input.publishedShifts : []

  const base = buildBaseResult({
    employeeId,
    todayKey,
    isWeekPublished,
    shiftsToday: [],
  })

  if (!employeeId || !todayKey) {
    return withStatus(base, 'not_scheduled', {
      reason: 'Missing employee or workspace date context',
    })
  }

  const normalizedShifts = publishedShifts
    .map((shift) => normalizePublishedShift(shift))
    .filter(Boolean)

  const employeeShiftsToday = sortShiftsByStart(
    normalizedShifts.filter((shift) => (
      shift.employeeId === employeeId && shift.dateKey === todayKey
    )),
  )

  const shiftsToday = employeeShiftsToday.map((shift) => buildShiftSnapshot(shift))

  const result = {
    ...base,
    shiftsToday,
  }

  const matchingLeave = findMatchingApprovedLeave(input?.approvedLeave, employeeId, todayKey)
  if (matchingLeave) {
    return withStatus(result, 'on_leave', {
      leave: matchingLeave,
      reason: 'Approved leave covers today',
    })
  }

  const previousDateKey = getPreviousDateKey(todayKey)
  const previousDayOvernightActive = previousDateKey
    ? normalizedShifts.find((shift) => (
      shift.employeeId === employeeId
      && shift.dateKey === previousDateKey
      && isPreviousDayOvernightActive(nowMinutes, shift.startMinutes, shift.endMinutes)
    )) ?? null
    : null

  if (previousDayOvernightActive) {
    const currentShift = buildShiftSnapshot(previousDayOvernightActive)
    const nextShiftToday = employeeShiftsToday.find((shift) => (
      isShiftFutureAt(nowMinutes, shift.startMinutes, shift.endMinutes)
    )) ?? null

    return withStatus(result, 'working_now', {
      currentShift,
      nextShift: buildShiftSnapshot(nextShiftToday),
      startsAt: currentShift?.startTime ?? null,
      endsAt: currentShift?.endTime ?? null,
      reason: 'Active overnight shift from previous day',
    })
  }

  const activeShiftToday = employeeShiftsToday.find((shift) => (
    isShiftActiveAt(nowMinutes, shift.startMinutes, shift.endMinutes)
  )) ?? null

  if (activeShiftToday) {
    const currentShift = buildShiftSnapshot(activeShiftToday)
    const nextShiftToday = employeeShiftsToday.find((shift) => (
      shift !== activeShiftToday
      && isShiftFutureAt(nowMinutes, shift.startMinutes, shift.endMinutes)
    )) ?? null

    return withStatus(result, 'working_now', {
      currentShift,
      nextShift: buildShiftSnapshot(nextShiftToday),
      startsAt: currentShift?.startTime ?? null,
      endsAt: currentShift?.endTime ?? null,
      reason: 'Active published shift',
    })
  }

  const futureShiftsToday = employeeShiftsToday.filter((shift) => (
    isShiftFutureAt(nowMinutes, shift.startMinutes, shift.endMinutes)
  ))
  const nextShiftToday = futureShiftsToday[0] ?? null

  if (nextShiftToday) {
    const completedCandidates = employeeShiftsToday.filter((shift) => (
      isShiftCompletedAt(nowMinutes, shift.startMinutes, shift.endMinutes)
    ))
    const completedShift = completedCandidates.length > 0
      ? buildShiftSnapshot(
        [...completedCandidates].sort((left, right) => completionSortKey(right) - completionSortKey(left))[0],
      )
      : null

    const nextShift = buildShiftSnapshot(nextShiftToday)

    return withStatus(result, 'scheduled_later', {
      nextShift,
      completedShift,
      startsAt: nextShift?.startTime ?? null,
      endsAt: nextShift?.endTime ?? null,
      reason: 'Future published shift today',
    })
  }

  const completedCandidates = employeeShiftsToday.filter((shift) => (
    isShiftCompletedAt(nowMinutes, shift.startMinutes, shift.endMinutes)
  ))

  if (completedCandidates.length > 0) {
    const completedShift = buildShiftSnapshot(
      [...completedCandidates].sort((left, right) => completionSortKey(right) - completionSortKey(left))[0],
    )

    return withStatus(result, 'shift_completed', {
      completedShift,
      startsAt: completedShift?.startTime ?? null,
      endsAt: completedShift?.endTime ?? null,
      reason: 'All published shifts for today are completed',
    })
  }

  if (isWeekPublished) {
    return withStatus(result, 'day_off', {
      reason: 'Published schedule exists with no shift today',
    })
  }

  return withStatus(result, 'not_scheduled', {
    reason: 'No published schedule for this week',
  })
}

export function formatEmployeeTodayStatusDetail(result) {
  if (!result || typeof result !== 'object') return EMPLOYEE_TODAY_STATUS.not_scheduled.label

  switch (result.key) {
    case EMPLOYEE_TODAY_STATUS.on_leave.key:
      return EMPLOYEE_TODAY_STATUS.on_leave.label
    case EMPLOYEE_TODAY_STATUS.working_now.key: {
      const endLabel = result.endsAt || minutesToTimeLabel(result.currentShift?.endMinutes)
      return endLabel ? `Working now · Until ${endLabel}` : EMPLOYEE_TODAY_STATUS.working_now.label
    }
    case EMPLOYEE_TODAY_STATUS.scheduled_later.key: {
      const startLabel = result.startsAt || minutesToTimeLabel(result.nextShift?.startMinutes)
      return startLabel ? `Scheduled at ${startLabel}` : EMPLOYEE_TODAY_STATUS.scheduled_later.label
    }
    case EMPLOYEE_TODAY_STATUS.shift_completed.key:
      return EMPLOYEE_TODAY_STATUS.shift_completed.label
    case EMPLOYEE_TODAY_STATUS.day_off.key:
      return EMPLOYEE_TODAY_STATUS.day_off.label
    case EMPLOYEE_TODAY_STATUS.unavailable.key:
      return EMPLOYEE_TODAY_STATUS.unavailable.label
    default:
      return EMPLOYEE_TODAY_STATUS.not_scheduled.label
  }
}

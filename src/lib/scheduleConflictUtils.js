import { isEmployeeUnavailable } from './scheduleDropUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { normalizeTimeValue } from './timeFormatUtils'

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function getShiftSegments(startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return []
  if (startMinutes === endMinutes) return []

  if (endMinutes > startMinutes) {
    return [[startMinutes, endMinutes]]
  }

  return [
    [startMinutes, 1440],
    [0, endMinutes],
  ]
}

function shiftsOverlap(startA, endA, startB, endB) {
  const segmentsA = getShiftSegments(startA, endA)
  const segmentsB = getShiftSegments(startB, endB)

  if (segmentsA.length === 0 || segmentsB.length === 0) {
    return false
  }

  return segmentsA.some(([segmentStartA, segmentEndA]) => (
    segmentsB.some(([segmentStartB, segmentEndB]) => segmentStartA < segmentEndB && segmentEndA > segmentStartB)
  ))
}

/**
 * Returns a scheduling conflict type for display logic.
 * Capacity issues (overstaffed cells) are intentionally excluded.
 */
export function getShiftSchedulingConflictType(shift, {
  employees = [],
  dayShifts = [],
  excludeShiftId = null,
} = {}) {
  if (!shift) return null

  const employee = (employees ?? []).find((entry) => String(entry.id) === String(shift.employeeId))
  if (isEmployeeUnavailable(employee)) {
    return 'unavailable'
  }

  const shiftDate = normalizeShiftDate(shift.date)
  const startTime = normalizeTimeValue(shift.startTime)
  const endTime = normalizeTimeValue(shift.endTime)
  const role = `${shift.role ?? ''}`.trim()
  const area = `${shift.area ?? ''}`.trim()

  if (!shift.employeeId || !shiftDate || !startTime || !endTime || !role || !area) {
    return 'invalid'
  }

  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return 'invalid'
  }

  const sameEmployeeDayShifts = (dayShifts ?? []).filter((entry) => {
    if (excludeShiftId && String(entry.id) === String(excludeShiftId)) return false
    return String(entry.employeeId) === String(shift.employeeId)
      && normalizeShiftDate(entry.date) === shiftDate
  })

  const hasOverlap = sameEmployeeDayShifts.some((entry) => {
    if (excludeShiftId && String(entry.id) === String(excludeShiftId)) return false
    if (String(entry.id) === String(shift.id)) return false

    const existingStartMinutes = parseTimeToMinutes(normalizeTimeValue(entry.startTime))
    const existingEndMinutes = parseTimeToMinutes(normalizeTimeValue(entry.endTime))
    if (existingStartMinutes === null || existingEndMinutes === null) return false

    return shiftsOverlap(startMinutes, endMinutes, existingStartMinutes, existingEndMinutes)
  })

  if (hasOverlap) {
    return 'overlap'
  }

  return null
}

export function shiftHasSchedulingConflict(shift, options = {}) {
  return Boolean(getShiftSchedulingConflictType(shift, options))
}

export function getRestOfWeekDateKeys(shiftDate, weekDateKeys = []) {
  const normalizedShiftDate = normalizeShiftDate(shiftDate)
  const normalizedWeekKeys = (weekDateKeys ?? []).map((key) => normalizeShiftDate(key)).filter(Boolean)
  const sourceIndex = normalizedWeekKeys.indexOf(normalizedShiftDate)

  if (sourceIndex < 0) {
    return []
  }

  return normalizedWeekKeys.slice(sourceIndex + 1)
}

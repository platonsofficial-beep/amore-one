import { normalizeTimeValue } from './timeFormatUtils'

export function parseTimeToMinutes(value) {
  if (!value) return null

  const normalized = `${value}`.trim()
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return hours * 60 + minutes
}

export function calculateShiftDurationHours(startTime, endTime) {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)

  if (startMinutes === null || endMinutes === null) return 0
  if (startMinutes === endMinutes) return 0

  let durationMinutes
  if (endMinutes > startMinutes) {
    durationMinutes = endMinutes - startMinutes
  } else {
    durationMinutes = (1440 - startMinutes) + endMinutes
  }

  return durationMinutes / 60
}

export function parseWeeklyHoursTarget(value) {
  if (value === null || value === undefined || value === '') return null

  const match = `${value}`.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null

  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

export function formatHoursLabel(hours) {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function buildEmployeeWeeklyHoursMap(shifts = []) {
  const totals = new Map()

  shifts.forEach((shift) => {
    const employeeId = shift?.employeeId
    if (!employeeId) return

    const key = String(employeeId)
    const duration = calculateShiftDurationHours(shift.startTime, shift.endTime)
    if (duration <= 0) return

    totals.set(key, (totals.get(key) ?? 0) + duration)
  })

  return totals
}

export function isAssignmentUsingCustomTime(shift, template) {
  if (!shift || !template) return false

  const assignmentStart = normalizeTimeValue(shift.startTime)
  const assignmentEnd = normalizeTimeValue(shift.endTime)
  const templateStart = normalizeTimeValue(template.startTime)
  const templateEnd = normalizeTimeValue(template.endTime)

  if (!assignmentStart || !assignmentEnd || !templateStart || !templateEnd) return false

  return assignmentStart !== templateStart || assignmentEnd !== templateEnd
}

export function getAssignmentOvertimeHours(shift, template) {
  if (!shift || !template) return 0

  const assignmentDuration = calculateShiftDurationHours(shift.startTime, shift.endTime)
  const templateDuration = calculateShiftDurationHours(template.startTime, template.endTime)
  const overtime = assignmentDuration - templateDuration

  return overtime > 0.05 ? Math.round(overtime * 10) / 10 : 0
}

export function getEmployeeHoursTrackerState(scheduledHours, weeklyTarget) {
  const scheduled = Math.max(0, scheduledHours)

  if (weeklyTarget === null) {
    return {
      hasTarget: false,
      status: 'none',
      barWidth: 0,
      primaryLabel: scheduled > 0 ? `${formatHoursLabel(scheduled)}h scheduled` : '0h scheduled',
      secondaryLabel: 'No weekly target',
    }
  }

  const target = weeklyTarget
  const roundedScheduled = Math.round(scheduled * 10) / 10
  const roundedTarget = Math.round(target * 10) / 10
  const barWidth = target > 0 ? Math.min(100, (scheduled / target) * 100) : 0

  if (roundedScheduled > roundedTarget) {
    const overtime = roundedScheduled - roundedTarget
    return {
      hasTarget: true,
      status: 'over',
      barWidth: 100,
      primaryLabel: `${formatHoursLabel(roundedScheduled)}/${formatHoursLabel(roundedTarget)}h`,
      secondaryLabel: `+${formatHoursLabel(overtime)}h Overtime`,
    }
  }

  if (roundedScheduled === roundedTarget) {
    return {
      hasTarget: true,
      status: 'complete',
      barWidth: 100,
      primaryLabel: `${formatHoursLabel(roundedTarget)}/${formatHoursLabel(roundedTarget)}h`,
      secondaryLabel: 'Complete ✓',
    }
  }

  const remaining = roundedTarget - roundedScheduled
  return {
    hasTarget: true,
    status: 'under',
    barWidth,
    primaryLabel: `${formatHoursLabel(roundedScheduled)}/${formatHoursLabel(roundedTarget)}h`,
    secondaryLabel: `${formatHoursLabel(remaining)}h left`,
  }
}

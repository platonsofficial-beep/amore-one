import { resolveShiftTemplateId } from './shiftIntegrity'
import { isEmployeeAssignedInCell } from './scheduleDropUtils'

function dayKeyOf(shift) {
  return `${shift?.date ?? ''}`.slice(0, 10)
}

function templateKey(source) {
  return `${resolveShiftTemplateId(source) ?? ''}`.trim()
}

function byStartTime(left, right) {
  return `${left.template?.startTime ?? ''}`.localeCompare(`${right.template?.startTime ?? ''}`)
}

function isUncovered(cell, employeeId) {
  if (isEmployeeAssignedInCell(cell, employeeId)) return false
  const required = Number(cell?.requiredCount ?? 1) || 1
  const assigned = Number(cell?.assignedCount ?? cell?.shifts?.length ?? 0) || 0
  return assigned < required
}

/**
 * One assignment for a selected employee and a tapped day.
 * Moves a single existing shift when they already have one, otherwise
 * assigns them to one uncovered shift on that day. Never every shift.
 */
export function resolveEmployeeDayAdjust({
  employeeId = '',
  dayKey = '',
  shifts = [],
  rows = [],
} = {}) {
  const id = `${employeeId ?? ''}`.trim()
  const day = `${dayKey ?? ''}`.slice(0, 10)
  if (!id || !day) {
    return { action: 'error', message: 'Choose an employee and a day.' }
  }

  const dayRows = rows
    .map((row) => ({
      template: row.template,
      cell: (row.dayCells ?? []).find((item) => `${item?.day?.key ?? ''}`.slice(0, 10) === day) ?? null,
    }))
    .filter((item) => item.cell)

  if (dayRows.length === 0) {
    return { action: 'error', message: 'That day has no shifts to assign.' }
  }

  const mine = shifts.filter((shift) => `${shift?.employeeId ?? ''}` === id)
  const elsewhere = mine.filter((shift) => dayKeyOf(shift) !== day)
  const onThisDay = dayRows.filter((item) => isEmployeeAssignedInCell(item.cell, id))
  const uncovered = dayRows.filter((item) => isUncovered(item.cell, id)).sort(byStartTime)
  const ordered = [...dayRows].sort(byStartTime)

  if (elsewhere.length === 0 && onThisDay.length > 0) {
    return { action: 'noop', message: 'This employee is already on this day.' }
  }

  if (elsewhere.length > 0) {
    const source = elsewhere.find((shift) => uncovered.some((item) => templateKey(item.template) && templateKey(item.template) === templateKey(shift)))
      ?? [...elsewhere].sort((left, right) => `${left.startTime ?? ''}`.localeCompare(`${right.startTime ?? ''}`))[0]
    const sameTemplate = dayRows.find((item) => templateKey(item.template) && templateKey(item.template) === templateKey(source))
    const target = sameTemplate ?? uncovered[0] ?? ordered[0]
    if (dayKeyOf(source) === day && isEmployeeAssignedInCell(target.cell, id)) {
      return { action: 'noop', message: 'This employee is already on this day.' }
    }
    return {
      action: 'move',
      shiftId: source.id,
      template: target.template,
      cell: target.cell,
      dayKey: day,
    }
  }

  const target = uncovered[0] ?? ordered[0]
  return {
    action: 'assign',
    template: target.template,
    cell: target.cell,
    dayKey: day,
  }
}

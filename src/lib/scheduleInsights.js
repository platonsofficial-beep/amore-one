function normalizeScheduleShiftDate(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function countScheduleRosterEmployees(employees = []) {
  return (employees ?? []).filter((employee) => `${employee?.id ?? ''}`.trim()).length
}

export function buildScheduleWeekShiftStats(shifts = [], weekDays = []) {
  const weekKeys = new Set((weekDays ?? []).map((day) => `${day?.key ?? ''}`.trim()).filter(Boolean))
  const weekShifts = (shifts ?? []).filter((shift) => weekKeys.has(normalizeScheduleShiftDate(shift?.date)))
  const scheduledEmployeeIds = new Set(
    weekShifts.map((shift) => `${shift?.employeeId ?? ''}`.trim()).filter(Boolean),
  )

  const totalHours = weekShifts.reduce((sum, shift) => {
    const startMinutes = Number(shift?.startMinutes)
    const endMinutes = Number(shift?.endMinutes)
    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
      return sum + (endMinutes - startMinutes) / 60
    }
    return sum
  }, 0)

  return {
    shiftCount: weekShifts.length,
    scheduledEmployeeCount: scheduledEmployeeIds.size,
    totalHours,
  }
}

function templateLabel(row) {
  return `${row?.template?.name ?? row?.template?.templateName ?? 'Shift'}`.trim() || 'Shift'
}

/**
 * One warning per day that is short, over the required count, or in conflict.
 * The list is the explanation for the Warnings total.
 */
export function buildScheduleDayWarnings(weekDays = [], gridRows = []) {
  return (weekDays ?? []).flatMap((day) => {
    const reasons = []

    ;(gridRows ?? []).forEach((row) => {
      const cell = (row?.dayCells ?? []).find((entry) => entry?.day?.key === day.key)
      if (!cell) return

      const name = templateLabel(row)
      const assigned = Number(cell.assignedCount) || 0
      const required = Number(cell.requiredCount) || 0

      if (assigned < required) {
        const missing = required - assigned
        reasons.push(`${name} needs ${missing} more`)
      } else if (required > 0 && assigned > required) {
        const extra = assigned - required
        reasons.push(`${name} has ${extra} extra`)
      }

      if (cell.hasRealConflict) {
        reasons.push(`${name} has a scheduling conflict`)
      }
    })

    if (reasons.length === 0) return []

    return [{
      id: day.key,
      label: day.label || day.key,
      detail: reasons.join('; '),
    }]
  })
}

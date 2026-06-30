import { formatTime24 } from './timeFormatUtils'

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function resolveEmployeeName(employee, shift = null) {
  const joinedEmployee = Array.isArray(shift?.employees) ? shift.employees[0] : shift?.employees

  return `${employee?.full_name
    ?? employee?.name
    ?? joinedEmployee?.full_name
    ?? shift?.employeeName
    ?? ''}`.trim()
}

function resolveShiftRole(shift, employee) {
  const role = `${shift?.role ?? ''}`.trim()
  if (role) return role

  const position = `${employee?.position ?? ''}`.trim()
  if (position) return position

  return '—'
}

function mapShiftEntry(shift, employee) {
  return {
    shiftId: shift?.id ?? null,
    role: resolveShiftRole(shift, employee),
    startTime: shift?.startTime ?? '',
    endTime: shift?.endTime ?? '',
    startTimeLabel: formatTime24(shift?.startTime),
    endTimeLabel: formatTime24(shift?.endTime),
    notes: `${shift?.notes ?? ''}`.trim(),
  }
}

/**
 * Build a per-employee, 7-day schedule view from the same week shift list used by the grid.
 */
export function buildEmployeeWeekScheduleView({
  employees = [],
  weekDays = [],
  weekShifts = [],
} = {}) {
  const employeesById = new Map(
    (employees ?? []).map((employee) => [String(employee.id), employee]),
  )

  const shiftsByEmployeeDate = new Map()

  ;(weekShifts ?? []).forEach((shift) => {
    const employeeId = shift?.employeeId
    if (!employeeId) return

    const employeeKey = String(employeeId)
    const shiftDate = normalizeShiftDate(shift.date)
    if (!shiftDate) return

    if (!employeesById.has(employeeKey)) {
      employeesById.set(employeeKey, {
        id: employeeId,
        full_name: resolveEmployeeName(null, shift) || `Employee ${employeeKey}`,
      })
    }

    const bucketKey = `${employeeKey}|${shiftDate}`
    if (!shiftsByEmployeeDate.has(bucketKey)) {
      shiftsByEmployeeDate.set(bucketKey, [])
    }
    shiftsByEmployeeDate.get(bucketKey).push(shift)
  })

  const rosterIds = new Set(employeesById.keys())

  return Array.from(rosterIds)
    .map((employeeId) => {
      const employee = employeesById.get(employeeId)
      const days = (weekDays ?? []).map((day) => {
        const bucketKey = `${employeeId}|${day.key}`
        const dayShifts = (shiftsByEmployeeDate.get(bucketKey) ?? [])
          .slice()
          .sort((left, right) => `${left.startTime ?? ''}`.localeCompare(`${right.startTime ?? ''}`))
          .map((shift) => mapShiftEntry(shift, employee))

        return {
          date: day.key,
          dayLabel: day.label,
          shortDate: day.shortDate,
          isDayOff: dayShifts.length === 0,
          shifts: dayShifts,
        }
      })

      return {
        employeeId,
        employeeName: resolveEmployeeName(employee) || `Employee ${employeeId}`,
        days,
      }
    })
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName))
}

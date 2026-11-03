/*
  Shifts of removed people (Platon, 3 Nov 2026): when an employee is deleted
  or disabled, their shifts from today on drop out of the schedule; everyone
  else's shifts stay exactly as they are. Past shifts are kept and keep the
  person's name (employee_name snapshot when the employee row is gone).
  Disabled is reversible: re-enabling brings the shifts back.
*/

let disabledEmployeeIds = new Set()

export function setDisabledEmployeeIds(ids = []) {
  disabledEmployeeIds = new Set((ids ?? []).map((id) => `${id ?? ''}`.trim()).filter(Boolean))
}

export function getDisabledEmployeeKey() {
  return [...disabledEmployeeIds].sort().join(',')
}

export function localTodayKey(now = new Date()) {
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, '0')
  const d = `${now.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isRemovedEmployeeShift(shift, options = {}) {
  if (!shift) return false
  const todayKey = options.todayKey ?? localTodayKey()
  const disabled = options.disabledIds ? new Set([...options.disabledIds].map(String)) : disabledEmployeeIds
  const dateKey = `${shift.date ?? shift.shift_date ?? ''}`.slice(0, 10)
  if (!dateKey || dateKey < todayKey) return false

  const employeeId = `${shift.employeeId ?? shift.employee_id ?? ''}`.trim()
  if (!employeeId) return true

  const joined = Array.isArray(shift.employees) ? shift.employees[0] : shift.employees
  if (joined && (joined.active === false || `${joined.status ?? ''}`.trim().toLowerCase() === 'disabled')) return true

  return disabled.has(employeeId)
}

export function filterRemovedEmployeeShifts(shifts, options = {}) {
  if (!Array.isArray(shifts)) return shifts
  return shifts.filter((shift) => !isRemovedEmployeeShift(shift, options))
}

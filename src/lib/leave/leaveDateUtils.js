import { LEAVE_STATUS } from './leaveConstants'

/**
 * Normalize a calendar date key to YYYY-MM-DD.
 * No timezone libraries — dates are workspace calendar dates.
 */
export function normalizeLeaveDateKey(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''

  if (raw.includes('T')) {
    return raw.split('T')[0]
  }

  const slice = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slice)) {
    return ''
  }

  const [year, month, day] = slice.split('-').map(Number)
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  if (
    utcDate.getUTCFullYear() !== year
    || utcDate.getUTCMonth() !== month - 1
    || utcDate.getUTCDate() !== day
  ) {
    return ''
  }

  return slice
}

export function readLeaveStartDate(leave) {
  return normalizeLeaveDateKey(leave?.startDate ?? leave?.start_date)
}

export function readLeaveEndDate(leave) {
  return normalizeLeaveDateKey(leave?.endDate ?? leave?.end_date)
}

export function readLeaveStatus(leave) {
  return `${leave?.status ?? ''}`.trim().toLowerCase()
}

/**
 * Returns true when an approved leave record covers the given calendar date (inclusive).
 */
export function isLeaveActiveOnDate(leave, date) {
  if (!leave || typeof leave !== 'object') return false

  const status = readLeaveStatus(leave)
  if (status !== LEAVE_STATUS.APPROVED) return false

  const dateKey = normalizeLeaveDateKey(date)
  const startDate = readLeaveStartDate(leave)
  const endDate = readLeaveEndDate(leave)

  if (!dateKey || !startDate || !endDate) return false

  return dateKey >= startDate && dateKey <= endDate
}

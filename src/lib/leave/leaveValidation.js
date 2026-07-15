import { normalizeLeaveDateKey } from './leaveDateUtils'

const MAX_LEAVE_DURATION_DAYS = 365

/**
 * Validate leave date range (P6.9.0 design lock).
 *
 * @param {object} input
 * @param {string} input.startDate
 * @param {string} input.endDate
 * @param {string} [input.workspaceToday] - workspace calendar today (YYYY-MM-DD)
 * @param {boolean} [input.allowPastRequests=false] - manager override for backdated leave
 */
export function validateLeaveDates({
  startDate,
  endDate,
  workspaceToday = '',
  allowPastRequests = false,
} = {}) {
  const normalizedStart = normalizeLeaveDateKey(startDate)
  const normalizedEnd = normalizeLeaveDateKey(endDate)
  const normalizedToday = normalizeLeaveDateKey(workspaceToday)

  if (!normalizedStart) {
    return { ok: false, error: 'Start date is required.' }
  }

  if (!normalizedEnd) {
    return { ok: false, error: 'End date is required.' }
  }

  if (normalizedEnd < normalizedStart) {
    return { ok: false, error: 'End date must be on or after start date.' }
  }

  if (!allowPastRequests && normalizedToday) {
    if (normalizedEnd < normalizedToday) {
      return { ok: false, error: 'Leave cannot be requested for past dates.' }
    }
  }

  const durationDays = countInclusiveLeaveDays(normalizedStart, normalizedEnd)
  if (durationDays > MAX_LEAVE_DURATION_DAYS) {
    return { ok: false, error: 'Leave duration exceeds the maximum allowed range.' }
  }

  return {
    ok: true,
    error: '',
    startDate: normalizedStart,
    endDate: normalizedEnd,
    durationDays,
  }
}

function countInclusiveLeaveDays(startDate, endDate) {
  const start = parseLeaveDateParts(startDate)
  const end = parseLeaveDateParts(endDate)
  if (!start || !end) return 0

  const startUtc = Date.UTC(start.year, start.month - 1, start.day)
  const endUtc = Date.UTC(end.year, end.month - 1, end.day)
  const diffMs = endUtc - startUtc

  if (diffMs < 0) return 0

  return Math.floor(diffMs / 86_400_000) + 1
}

function parseLeaveDateParts(dateKey) {
  const normalized = normalizeLeaveDateKey(dateKey)
  if (!normalized) return null

  const [year, month, day] = normalized.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  return { year, month, day }
}

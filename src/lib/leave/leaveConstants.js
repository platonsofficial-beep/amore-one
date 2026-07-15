/**
 * Leave domain constants (P6.9.0 design lock).
 *
 * Intentionally deferred (not implemented in this layer):
 * - Partial-day / half-day leave
 * - Recurring leave patterns
 * - Leave balances / accrual
 * - Draft, Submitted, and Expired lifecycle states
 */

export const LEAVE_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
})

export const LEAVE_STATUSES = Object.freeze([
  LEAVE_STATUS.PENDING,
  LEAVE_STATUS.APPROVED,
  LEAVE_STATUS.REJECTED,
  LEAVE_STATUS.CANCELLED,
])

export const LEAVE_TYPE = Object.freeze({
  VACATION: 'vacation',
  SICK: 'sick',
  PERSONAL: 'personal',
  UNPAID: 'unpaid',
  TRAINING: 'training',
  EMERGENCY: 'emergency',
  BEREAVEMENT: 'bereavement',
  OTHER: 'other',
})

export const LEAVE_TYPES = Object.freeze([
  LEAVE_TYPE.VACATION,
  LEAVE_TYPE.SICK,
  LEAVE_TYPE.PERSONAL,
  LEAVE_TYPE.UNPAID,
  LEAVE_TYPE.TRAINING,
  LEAVE_TYPE.EMERGENCY,
  LEAVE_TYPE.BEREAVEMENT,
  LEAVE_TYPE.OTHER,
])

const LEAVE_STATUS_SET = new Set(LEAVE_STATUSES)
const LEAVE_TYPE_SET = new Set(LEAVE_TYPES)

export function isValidLeaveStatus(status) {
  const normalized = `${status ?? ''}`.trim().toLowerCase()
  return LEAVE_STATUS_SET.has(normalized)
}

export function isValidLeaveType(type) {
  const normalized = `${type ?? ''}`.trim().toLowerCase()
  return LEAVE_TYPE_SET.has(normalized)
}

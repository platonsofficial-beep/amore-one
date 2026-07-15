import { LEAVE_STATUS, LEAVE_STATUSES, isValidLeaveStatus } from './leaveConstants'

const ALLOWED_TRANSITIONS = Object.freeze({
  [LEAVE_STATUS.PENDING]: Object.freeze([
    LEAVE_STATUS.APPROVED,
    LEAVE_STATUS.REJECTED,
    LEAVE_STATUS.CANCELLED,
  ]),
  [LEAVE_STATUS.APPROVED]: Object.freeze([
    LEAVE_STATUS.CANCELLED,
  ]),
})

/**
 * Returns true when a lifecycle transition is allowed (P6.9.0 design lock).
 * Terminal states (rejected, cancelled) cannot transition.
 */
export function canTransitionLeaveStatus(fromStatus, toStatus) {
  const from = `${fromStatus ?? ''}`.trim().toLowerCase()
  const to = `${toStatus ?? ''}`.trim().toLowerCase()

  if (!isValidLeaveStatus(from) || !isValidLeaveStatus(to)) {
    return false
  }

  if (from === to) {
    return false
  }

  const allowed = ALLOWED_TRANSITIONS[from]
  if (!allowed) {
    return false
  }

  return allowed.includes(to)
}

export function getAllowedLeaveTransitions(fromStatus) {
  const from = `${fromStatus ?? ''}`.trim().toLowerCase()
  if (!isValidLeaveStatus(from)) {
    return []
  }

  return [...(ALLOWED_TRANSITIONS[from] ?? [])]
}

export { LEAVE_STATUSES, isValidLeaveStatus }

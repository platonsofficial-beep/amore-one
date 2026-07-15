import { normalizeWorkspaceRole } from '../membershipRoles'

const LEAVE_QUEUE_ROLES = new Set(['owner', 'general_manager', 'manager'])
const LEAVE_DECISION_ROLES = new Set(['owner', 'general_manager', 'manager'])
const LEAVE_ON_BEHALF_ROLES = new Set(['owner', 'general_manager', 'manager'])

function normalizeRole(role) {
  return normalizeWorkspaceRole(role, '')
}

/**
 * Any linked workspace member may create a leave request for themselves.
 */
export function canCreateLeave(role) {
  const normalized = normalizeRole(role)
  return normalized !== ''
}

/**
 * Managers and above may create leave on behalf of another employee.
 */
export function canCreateLeaveOnBehalf(role) {
  return LEAVE_ON_BEHALF_ROLES.has(normalizeRole(role))
}

/**
 * Managers and above may view the team leave approval queue.
 */
export function canViewLeaveQueue(role) {
  return LEAVE_QUEUE_ROLES.has(normalizeRole(role))
}

/**
 * Managers and above may approve pending leave.
 * Staff cannot approve their own or others' requests.
 */
export function canApproveLeave(role) {
  return LEAVE_DECISION_ROLES.has(normalizeRole(role))
}

/**
 * Managers and above may reject pending leave.
 */
export function canRejectLeave(role) {
  return LEAVE_DECISION_ROLES.has(normalizeRole(role))
}

/**
 * Cancel rules (P6.9.0 design lock):
 * - Managers+ may cancel any request.
 * - Host and staff may cancel only their own requests.
 */
export function canCancelLeave(role, { isOwnRequest = true } = {}) {
  const normalized = normalizeRole(role)
  if (!normalized) return false

  if (LEAVE_DECISION_ROLES.has(normalized)) {
    return true
  }

  return Boolean(isOwnRequest)
}

import { normalizeWorkspaceRole } from '../membershipRoles'

const LEAVE_QUEUE_ROLES = new Set(['owner', 'general_manager', 'manager'])
const LEAVE_DECISION_ROLES = new Set(['owner', 'general_manager', 'manager'])
const LEAVE_ON_BEHALF_ROLES = new Set(['owner', 'general_manager', 'manager'])

function roleOf(access) {
  if (access && typeof access === 'object') return `${access.role ?? ''}`.trim()
  return access
}

function normalizeRole(role) {
  return normalizeWorkspaceRole(roleOf(role), '')
}

function customLeaveLevel(access) {
  if (!access || typeof access !== 'object' || !access.customModules?.leave) return null
  const level = access.permissions?.leave ?? access.customModules.leave
  if (level === 'none' || level === 'view' || level === 'manage') return level
  return null
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
  const customLevel = customLeaveLevel(role)
  if (customLevel) return customLevel === 'manage'
  return LEAVE_ON_BEHALF_ROLES.has(normalizeRole(role))
}

/**
 * Managers and above may view the team leave approval queue.
 */
export function canViewLeaveQueue(role) {
  const customLevel = customLeaveLevel(role)
  if (customLevel) return customLevel === 'view' || customLevel === 'manage'
  return LEAVE_QUEUE_ROLES.has(normalizeRole(role))
}

/**
 * Managers and above may approve pending leave.
 * Staff cannot approve their own or others' requests.
 */
export function canApproveLeave(role) {
  const customLevel = customLeaveLevel(role)
  if (customLevel) return customLevel === 'manage'
  return LEAVE_DECISION_ROLES.has(normalizeRole(role))
}

/**
 * Managers and above may reject pending leave.
 */
export function canRejectLeave(role) {
  const customLevel = customLeaveLevel(role)
  if (customLevel) return customLevel === 'manage'
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

  const customLevel = customLeaveLevel(role)
  if (customLevel) {
    if (customLevel === 'manage') return true
    return Boolean(isOwnRequest)
  }

  if (LEAVE_DECISION_ROLES.has(normalized)) {
    return true
  }

  return Boolean(isOwnRequest)
}

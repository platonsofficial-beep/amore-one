export const WORKSPACE_ROLES = [
  'owner',
  'general_manager',
  'manager',
  'host',
  'staff',
]

export const WORKSPACE_ROLE_LABELS = {
  owner: 'Owner',
  general_manager: 'General Manager',
  manager: 'Manager',
  host: 'Host',
  staff: 'Staff',
}

export function normalizeWorkspaceRole(role, fallback = 'staff') {
  const normalized = `${role ?? ''}`.trim().toLowerCase()
  return WORKSPACE_ROLES.includes(normalized) ? normalized : fallback
}

export function getWorkspaceRoleLabel(role) {
  const normalized = normalizeWorkspaceRole(role, '')
  return WORKSPACE_ROLE_LABELS[normalized] || 'Staff'
}

export function isOwnerRole(role) {
  return normalizeWorkspaceRole(role) === 'owner'
}

export function isHostRole(role) {
  return normalizeWorkspaceRole(role) === 'host'
}

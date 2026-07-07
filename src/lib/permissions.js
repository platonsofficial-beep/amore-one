import { normalizeWorkspaceRole } from './membershipRoles'

export const APP_MODULES = [
  'today',
  'reservations',
  'team',
  'stock',
  'operations',
  'insights',
  'settings',
  'floor-plan-builder',
]

export const DEFAULT_FALLBACK_MODULE = 'today'

const FULL_ACCESS_ROLES = new Set(['owner', 'general_manager'])

const ROLE_MODULE_ACCESS = {
  manager: [
    'today',
    'reservations',
    'team',
    'stock',
    'operations',
    'insights',
    'floor-plan-builder',
  ],
  staff: [
    'today',
    'team',
    'stock',
    'operations',
  ],
}

const TEAM_SECTION_ACCESS = {
  owner: ['today', 'members', 'schedule'],
  general_manager: ['today', 'members', 'schedule'],
  manager: ['today', 'members', 'schedule'],
  staff: ['schedule'],
}

function normalizeModuleId(moduleId) {
  return `${moduleId ?? ''}`.trim()
}

function getAllowedModulesForRole(role) {
  const normalizedRole = normalizeWorkspaceRole(role, '')

  if (!normalizedRole) {
    return new Set([DEFAULT_FALLBACK_MODULE])
  }

  if (FULL_ACCESS_ROLES.has(normalizedRole)) {
    return new Set(APP_MODULES)
  }

  return new Set(ROLE_MODULE_ACCESS[normalizedRole] ?? [DEFAULT_FALLBACK_MODULE])
}

export function canAccessModule(role, moduleId) {
  const normalizedModule = normalizeModuleId(moduleId)
  if (!normalizedModule) return false
  return getAllowedModulesForRole(role).has(normalizedModule)
}

export function canAccessTeamSection(role, sectionId) {
  const normalizedRole = normalizeWorkspaceRole(role, 'staff')
  const normalizedSection = `${sectionId ?? ''}`.trim()
  const allowedSections = TEAM_SECTION_ACCESS[normalizedRole] ?? TEAM_SECTION_ACCESS.staff
  return allowedSections.includes(normalizedSection)
}

export function getAccessibleModules(role) {
  return APP_MODULES.filter((moduleId) => canAccessModule(role, moduleId))
}

export function filterNavItemsByRole(navItems, role) {
  return navItems.filter((item) => canAccessModule(role, item.id))
}

export function resolvePermittedActiveView(role, requestedView) {
  const normalizedView = normalizeModuleId(requestedView) || DEFAULT_FALLBACK_MODULE
  return canAccessModule(role, normalizedView) ? normalizedView : DEFAULT_FALLBACK_MODULE
}

export function canEditSchedule(role) {
  const normalizedRole = normalizeWorkspaceRole(role, 'staff')
  return ['owner', 'general_manager', 'manager'].includes(normalizedRole)
}

export function canManageEmployeeInvites(role) {
  return canEditSchedule(role)
}

export function canAssignManagerInviteRole(role) {
  const normalizedRole = normalizeWorkspaceRole(role, 'staff')
  return ['owner', 'general_manager'].includes(normalizedRole)
}

const MOBILE_MANAGEMENT_ROLES = new Set(['owner', 'general_manager', 'manager'])

export function isManagementMobileRole(role) {
  return MOBILE_MANAGEMENT_ROLES.has(normalizeWorkspaceRole(role, 'staff'))
}

export function canAccessMobileExpandedModule(role, moduleId) {
  const normalizedRole = normalizeWorkspaceRole(role, 'staff')
  if (!MOBILE_MANAGEMENT_ROLES.has(normalizedRole)) {
    return false
  }

  return canAccessModule(role, moduleId)
}

export function filterMobileMenuNavItems(navItems, role) {
  return (navItems ?? []).filter((item) => {
    if (item.id === 'today') return false
    return canAccessMobileExpandedModule(role, item.id)
  })
}

export function canOpenMobileFullSchedule(role) {
  return canEditSchedule(role)
}

export function canOpenMobileTasksWorkspace(role) {
  return canAccessMobileExpandedModule(role, 'operations')
}

export function resolvePermittedTeamSection(role, requestedSection) {
  const normalizedSection = `${requestedSection ?? ''}`.trim()
  if (normalizedSection && canAccessTeamSection(role, normalizedSection)) {
    return normalizedSection
  }

  const fallbackOrder = ['today', 'members', 'schedule']
  const resolved = fallbackOrder.find((sectionId) => canAccessTeamSection(role, sectionId))
  return resolved ?? 'schedule'
}

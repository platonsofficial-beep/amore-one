import { isHostRole, normalizeWorkspaceRole } from './membershipRoles'

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
export const HOST_FALLBACK_MODULE = 'reservations'

const FULL_ACCESS_ROLES = new Set(['owner', 'general_manager'])

const MANAGEMENT_ROLES = new Set(['owner', 'general_manager', 'manager'])

export const MOBILE_STAFF_BOTTOM_TABS = [
  { id: 'home', label: 'Home', icon: '◈' },
  { id: 'schedule', label: 'Schedule', icon: '◷' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'menu', label: 'Menu', icon: '≡' },
]

export const MOBILE_HOST_BOTTOM_TABS = []

export const MOBILE_MANAGER_BOTTOM_TABS = [
  { id: 'today', label: 'Today', icon: '◈' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'menu', label: 'Menu', icon: '≡' },
]

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
  host: [
    'reservations',
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
  host: [],
  staff: ['schedule'],
}

const OPERATIONS_SECTION_IDS = new Set(['dashboard', 'tasks', 'checklists'])

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

export function resolveDefaultModuleForRole(role) {
  return isHostRole(role) ? HOST_FALLBACK_MODULE : DEFAULT_FALLBACK_MODULE
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
  const fallbackModule = resolveDefaultModuleForRole(role)
  const normalizedView = normalizeModuleId(requestedView) || fallbackModule
  return canAccessModule(role, normalizedView) ? normalizedView : fallbackModule
}

export function isManagerRole(role) {
  return MANAGEMENT_ROLES.has(normalizeWorkspaceRole(role, 'staff'))
}

export function isHostMobileRole(role) {
  return isHostRole(role)
}

export function resolveMobileShellVariant(role) {
  if (isManagementMobileRole(role)) return 'manager'
  if (isHostMobileRole(role)) return 'host'
  return 'staff'
}

export function canManageStock(role) {
  return isManagerRole(role)
}

export function canManageOperations(role) {
  return isManagerRole(role)
}

export function canManageAnnouncements(role) {
  return isManagerRole(role)
}

export function canEditSchedule(role) {
  return isManagerRole(role)
}

export function canEditFloorPlan(role) {
  if (isHostRole(role)) return true
  return isManagerRole(role)
}

export function canConfigureReservationSeatings(role) {
  return isManagerRole(role)
}

export function canManageReservations(role) {
  return canAccessModule(role, 'reservations')
}

export function canOpenReservationsHostMode(role) {
  if (!canAccessModule(role, 'reservations')) return false
  if (isHostRole(role)) return true
  return isManagerRole(role)
}

export function shouldShowReservationsHostView({
  role,
  useMobileExperience = false,
  mobileReservationsHostMode = false,
} = {}) {
  if (!canAccessModule(role, 'reservations')) return false
  if (isHostRole(role)) return true
  if (canOpenReservationsHostMode(role)) return true
  return Boolean(useMobileExperience && mobileReservationsHostMode)
}

export function shouldUseReservationsHostDedicatedShell({
  role,
  activeView = '',
  useMobileExperience = false,
  mobileReservationsHostMode = false,
} = {}) {
  if (`${activeView ?? ''}`.trim() !== 'reservations') return false
  return shouldShowReservationsHostView({
    role,
    useMobileExperience,
    mobileReservationsHostMode,
  })
}

export function resolveExitReservationsHostDestination(previousView, role) {
  const normalized = `${previousView ?? ''}`.trim()
  if (normalized && normalized !== 'reservations') {
    return resolvePermittedActiveView(role, normalized)
  }
  return resolvePermittedActiveView(role, 'today')
}

export function resolveHostMobileTabChange(tab, role) {
  if (!isHostRole(role)) {
    return {
      tab: `${tab ?? ''}`.trim(),
      openHostMode: false,
      activeView: null,
    }
  }

  return {
    tab: 'host',
    openHostMode: true,
    activeView: 'reservations',
  }
}

export function shouldUseHostMobileLanding(role, useMobileExperience = false) {
  return isHostRole(role) && Boolean(useMobileExperience)
}

export function shouldUseHostStationShell(role) {
  return isHostRole(role)
}

export function shouldUseHostStationLanding(role) {
  return isHostRole(role)
}

export function canManageEmployeeInvites(role) {
  return canEditSchedule(role)
}

export function canAssignManagerInviteRole(role) {
  const normalizedRole = normalizeWorkspaceRole(role, 'staff')
  return ['owner', 'general_manager'].includes(normalizedRole)
}

export function canLinkMembershipEmployee(role) {
  const normalizedRole = normalizeWorkspaceRole(role, 'staff')
  return ['owner', 'general_manager'].includes(normalizedRole)
}

export function isManagementMobileRole(role) {
  return isManagerRole(role)
}

export function canAccessMobileExpandedModule(role, moduleId) {
  const normalizedModuleId = `${moduleId ?? ''}`.trim()

  if (isHostRole(role)) {
    return normalizedModuleId === 'reservations'
  }

  if (normalizedModuleId === 'stock' && canAccessModule(role, 'stock')) {
    return true
  }

  if (!isManagementMobileRole(role)) {
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

const MANAGER_MOBILE_TAB_MODULE_IDS = new Set(['today', 'stock', 'tasks'])

export function filterManagerMobileMenuNavItems(navItems, role) {
  return (navItems ?? []).filter((item) => {
    if (MANAGER_MOBILE_TAB_MODULE_IDS.has(item.id)) return false
    return canAccessMobileExpandedModule(role, item.id)
  })
}

export function canOpenMobileFullSchedule(role) {
  return canEditSchedule(role)
}

export function canOpenMobileTasksWorkspace(role) {
  if (isHostRole(role)) return false
  return canAccessMobileExpandedModule(role, 'operations')
}

export function canAccessHostMobileTasksTab(role) {
  return normalizeWorkspaceRole(role, 'staff') === 'staff'
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

export function canAccessOperationsSection(role, sectionId) {
  const normalizedSection = `${sectionId ?? ''}`.trim() || 'dashboard'
  if (!canAccessModule(role, 'operations')) return false
  if (!OPERATIONS_SECTION_IDS.has(normalizedSection)) return false
  if (normalizedSection === 'checklists') return canManageOperations(role)
  return true
}

export function filterOperationsSections(sections, role, { hideMobileTasks = false } = {}) {
  return (sections ?? []).filter((section) => {
    if (section.id === 'tasks' && hideMobileTasks) return false
    return canAccessOperationsSection(role, section.id)
  })
}

export function resolvePermittedOperationsSection(role, requestedSection) {
  const normalizedSection = `${requestedSection ?? ''}`.trim() || 'dashboard'
  if (canAccessOperationsSection(role, normalizedSection)) {
    return normalizedSection
  }

  const fallbackOrder = ['dashboard', 'tasks', 'checklists']
  const resolved = fallbackOrder.find((sectionId) => canAccessOperationsSection(role, sectionId))
  return resolved ?? 'dashboard'
}

export function getTodayQuickActions(role) {
  return [
    {
      id: 'add-reservation',
      label: 'Reservation',
      icon: '➕',
      available: canManageReservations(role),
    },
    {
      id: 'add-task',
      label: 'Task',
      icon: '✓',
      available: canAccessModule(role, 'operations') && canManageOperations(role),
    },
    {
      id: 'add-announcement',
      label: 'Announcement',
      icon: '📢',
      available: canManageAnnouncements(role),
    },
    {
      id: 'create-order',
      label: 'Order',
      icon: '📦',
      available: canAccessModule(role, 'stock') && canManageStock(role),
    },
  ]
}

export function getMobileBottomTabs(role, variant = 'staff') {
  if (variant === 'host') {
    return MOBILE_HOST_BOTTOM_TABS
  }

  if (variant === 'manager') {
    return MOBILE_MANAGER_BOTTOM_TABS.filter((tab) => {
      if (tab.id === 'stock') return canAccessModule(role, 'stock')
      if (tab.id === 'tasks') return canAccessModule(role, 'operations')
      return true
    })
  }

  return MOBILE_STAFF_BOTTOM_TABS
}

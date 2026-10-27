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

const MANAGEMENT_ROLES = new Set(['owner', 'general_manager', 'manager'])

export const PERMISSION_LEVELS = ['none', 'view', 'manage']

const PERMISSION_LEVEL_RANK = {
  none: 0,
  view: 1,
  manage: 2,
}

export const PERMISSION_MODULES = [
  'today',
  'reservations',
  'seatings',
  'team',
  'stock',
  'shelf_count',
  'operations',
  'insights',
  'settings',
  'floor_plan',
  'floor_plan_edit',
  'announcements',
  'private_data',
  'access',
  'mobile_tasks',
]

const APP_MODULE_PERMISSION = {
  today: 'today',
  reservations: 'reservations',
  team: 'team',
  stock: 'stock',
  operations: 'operations',
  insights: 'insights',
  settings: 'settings',
  'floor-plan-builder': 'floor_plan',
}

function defineRolePreset(overrides = {}) {
  const preset = {}
  for (const module of PERMISSION_MODULES) {
    preset[module] = 'none'
  }
  preset.today = 'view'
  return Object.freeze({ ...preset, ...overrides })
}

// Presets match today's role behaviour. private_data stays with Owner and GM.
// access is owner-only and is not read by a helper yet. shelf_count stays on Staff.
// team:manage is what sends invites.
export const ROLE_PERMISSION_PRESETS = {
  owner: defineRolePreset({
    today: 'manage',
    reservations: 'manage',
    seatings: 'manage',
    team: 'manage',
    stock: 'manage',
    operations: 'manage',
    insights: 'manage',
    settings: 'manage',
    floor_plan: 'manage',
    floor_plan_edit: 'manage',
    announcements: 'manage',
    private_data: 'manage',
    access: 'manage',
  }),
  general_manager: defineRolePreset({
    today: 'manage',
    reservations: 'manage',
    seatings: 'manage',
    team: 'manage',
    stock: 'manage',
    operations: 'manage',
    insights: 'manage',
    settings: 'manage',
    floor_plan: 'manage',
    floor_plan_edit: 'manage',
    announcements: 'manage',
    private_data: 'manage',
  }),
  manager: defineRolePreset({
    today: 'manage',
    reservations: 'manage',
    seatings: 'manage',
    team: 'manage',
    stock: 'manage',
    operations: 'manage',
    insights: 'manage',
    floor_plan: 'manage',
    floor_plan_edit: 'manage',
    announcements: 'manage',
  }),
  host: defineRolePreset({
    reservations: 'manage',
    team: 'view',
    operations: 'view',
    floor_plan_edit: 'manage',
    mobile_tasks: 'view',
  }),
  staff: defineRolePreset({
    team: 'view',
    stock: 'view',
    shelf_count: 'manage',
    operations: 'view',
    mobile_tasks: 'view',
  }),
}

export function hasPermission(perms, module, level) {
  const required = PERMISSION_LEVEL_RANK[level]
  if (required == null) return false
  const current = PERMISSION_LEVEL_RANK[perms?.[module]] ?? PERMISSION_LEVEL_RANK.none
  return current >= required
}

export function getRolePreset(role, fallback = '') {
  const normalized = normalizeWorkspaceRole(role, fallback)
  const preset = ROLE_PERMISSION_PRESETS[normalized]
  if (!preset) return { ...defineRolePreset() }
  return { ...preset }
}

export function resolvePermissions(role, memberPermissions = null, { fallback = '' } = {}) {
  const resolved = getRolePreset(role, fallback)
  if (!memberPermissions || typeof memberPermissions !== 'object' || Array.isArray(memberPermissions)) {
    return resolved
  }

  for (const [module, level] of Object.entries(memberPermissions)) {
    if (!Object.hasOwn(resolved, module)) continue
    if (!Object.hasOwn(PERMISSION_LEVEL_RANK, level)) continue
    resolved[module] = level
  }

  return resolved
}

function rolePermissions(role, fallback = '') {
  return resolvePermissions(role, null, { fallback })
}

function roleOf(access) {
  if (access && typeof access === 'object') return `${access.role ?? ''}`.trim()
  return access
}

function readAccess(access, fallback = '') {
  const role = roleOf(access)
  if (access && typeof access === 'object' && access.permissions && typeof access.permissions === 'object') {
    return {
      role,
      perms: access.permissions,
      custom: access.customModules && typeof access.customModules === 'object' ? access.customModules : {},
    }
  }
  return {
    role,
    perms: rolePermissions(role, fallback),
    custom: {},
  }
}

export const MOBILE_STAFF_BOTTOM_TABS = [
  { id: 'home', label: 'Home', icon: '◈' },
  { id: 'schedule', label: 'Schedule', icon: '◷' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'menu', label: 'Menu', icon: '≡' },
]

export const MOBILE_HOST_BOTTOM_TABS = [
  { id: 'home', label: 'Home', icon: '◈' },
  { id: 'schedule', label: 'Schedule', icon: '◷' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'reservations', label: 'Bookings', icon: '▣' },
  { id: 'menu', label: 'Menu', icon: '≡' },
]

export const MOBILE_MANAGER_BOTTOM_TABS = [
  { id: 'today', label: 'Today', icon: '◈' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'menu', label: 'Menu', icon: '≡' },
]

const OPERATIONS_SECTION_IDS = new Set(['dashboard', 'tasks', 'checklists'])
const TEAM_MANAGE_SECTIONS = new Set(['today', 'members'])

function normalizeModuleId(moduleId) {
  return `${moduleId ?? ''}`.trim()
}

export function resolveDefaultModuleForRole(role) {
  return isHostRole(roleOf(role)) ? HOST_FALLBACK_MODULE : DEFAULT_FALLBACK_MODULE
}

export function canAccessModule(role, moduleId) {
  const normalizedModule = normalizeModuleId(moduleId)
  const permissionModule = APP_MODULE_PERMISSION[normalizedModule]
  if (!permissionModule) return false
  return hasPermission(readAccess(role, '').perms, permissionModule, 'view')
}

export function canAccessTeamSection(role, sectionId) {
  const normalizedSection = `${sectionId ?? ''}`.trim()
  const { role: resolvedRole, perms, custom } = readAccess(role, 'staff')
  if (normalizedSection === 'schedule') {
    if (custom.schedule && hasPermission(perms, 'schedule', 'view')) return true
    if (custom.team) {
      return hasPermission(rolePermissions(resolvedRole, 'staff'), 'team', 'view')
        || hasPermission(perms, 'team', 'view')
    }
    if (hasPermission(perms, 'team', 'view')) return true
    // Unknown roles keep the staff fallback this helper has always used.
    if (!ROLE_PERMISSION_PRESETS[normalizeWorkspaceRole(resolvedRole, '')]) {
      return hasPermission(rolePermissions(resolvedRole, 'staff'), 'team', 'view')
    }
    return false
  }
  if (TEAM_MANAGE_SECTIONS.has(normalizedSection)) return hasPermission(perms, 'team', 'manage')
  return false
}

export function getAccessibleModules(role) {
  return APP_MODULES.filter((moduleId) => canAccessModule(role, moduleId))
}

export function filterNavItemsByRole(navItems, role) {
  return navItems.filter((item) => {
    if (item.id === 'settings' && canConfigureReservationSeatings(role)) return true
    return canAccessModule(role, item.id)
  })
}

export function resolvePermittedActiveView(role, requestedView) {
  const fallbackModule = resolveDefaultModuleForRole(role)
  const normalizedView = normalizeModuleId(requestedView) || fallbackModule
  if (normalizedView === 'settings' && canConfigureReservationSeatings(role)) return 'settings'
  if (normalizedView === 'attendance' || normalizedView === 'time-clock') {
    return canManageAttendance(role) ? 'time-clock' : fallbackModule
  }
  return canAccessModule(role, normalizedView) ? normalizedView : fallbackModule
}

// Attendance manager view. Owner always. Host never, even with a stored override.
// Everyone else follows the attendance module (manage), or the role preset when
// no custom level is stored. Clocking in stays open to every member.
export function canManageAttendance(access) {
  const roleName = roleOf(access)
  const normalized = normalizeWorkspaceRole(roleName, '')
  if (normalized === 'owner') return true
  if (normalized === 'host') return false

  const { perms } = readAccess(access, '')
  if (Object.hasOwn(perms, 'attendance')) {
    return hasPermission(perms, 'attendance', 'manage')
  }

  return normalized === 'general_manager' || normalized === 'manager'
}

export function isManagerRole(role) {
  return MANAGEMENT_ROLES.has(normalizeWorkspaceRole(roleOf(role), 'staff'))
}

export function isHostMobileRole(role) {
  return isHostRole(roleOf(role))
}

export function resolveMobileShellVariant(role) {
  if (isManagementMobileRole(role)) return 'manager'
  if (isHostMobileRole(role)) return 'host'
  return 'staff'
}

export function canManageStock(role) {
  return hasPermission(readAccess(role).perms, 'stock', 'manage')
}

export function canManageOperations(role) {
  return hasPermission(readAccess(role).perms, 'operations', 'manage')
}

export function canManageAnnouncements(role) {
  return hasPermission(readAccess(role).perms, 'announcements', 'manage')
}

export function canEditSchedule(role) {
  const { role: resolvedRole, perms, custom } = readAccess(role)
  if (custom.schedule) return hasPermission(perms, 'schedule', 'manage')
  if (custom.team) return hasPermission(rolePermissions(resolvedRole), 'team', 'manage')
  return hasPermission(perms, 'team', 'manage')
}

export function canEditFloorPlan(role) {
  return hasPermission(readAccess(role).perms, 'floor_plan_edit', 'manage')
}

export function canConfigureReservationSeatings(role) {
  return hasPermission(readAccess(role).perms, 'reservations', 'manage')
}

export function canManageReservations(role) {
  const { perms, custom } = readAccess(role)
  if (custom.reservations) return hasPermission(perms, 'reservations', 'manage')
  return hasPermission(perms, 'reservations', 'view')
}

export function canOpenReservationsHostMode(role) {
  return hasPermission(readAccess(role).perms, 'reservations', 'view')
}

export function shouldShowReservationsHostView({
  role,
  useMobileExperience = false,
  mobileReservationsHostMode = false,
} = {}) {
  if (!canAccessModule(role, 'reservations')) return false
  if (isHostRole(roleOf(role))) return true
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

const HOST_MOBILE_TAB_VIEWS = {
  home: 'today',
  schedule: 'team',
  tasks: 'operations',
  reservations: 'reservations',
  host: 'reservations',
}

export function resolveHostMobileTabChange(tab, role) {
  if (!isHostRole(roleOf(role))) {
    return {
      tab: `${tab ?? ''}`.trim(),
      openHostMode: false,
      activeView: null,
    }
  }

  const normalized = `${tab ?? ''}`.trim() || 'reservations'
  if (normalized === 'reservations' || normalized === 'host') {
    return {
      tab: 'reservations',
      openHostMode: true,
      activeView: 'reservations',
    }
  }

  return {
    tab: normalized,
    openHostMode: false,
    activeView: HOST_MOBILE_TAB_VIEWS[normalized] ?? 'today',
  }
}

export function shouldUseHostMobileLanding(role, useMobileExperience = false) {
  return isHostRole(roleOf(role)) && Boolean(useMobileExperience)
}

export function shouldUseHostStationShell(role) {
  return isHostRole(roleOf(role))
}

export function shouldUseHostStationLanding(role) {
  return isHostRole(roleOf(role))
}

export function canManageEmployeeInvites(role) {
  return hasPermission(readAccess(role).perms, 'team', 'manage')
}

export function canAssignManagerInviteRole(role) {
  return hasPermission(readAccess(role).perms, 'private_data', 'manage')
}

export function canLinkMembershipEmployee(role) {
  return hasPermission(readAccess(role).perms, 'private_data', 'manage')
}

export function isManagementMobileRole(role) {
  return isManagerRole(role)
}

export function canSubmitStaffShelfCount(role) {
  return hasPermission(readAccess(role, '').perms, 'shelf_count', 'manage')
}

const MOBILE_EXPANDED_CUSTOM_SOURCES = {
  reservations: ['reservations'],
  team: ['team'],
  stock: ['stock'],
  operations: ['tasks'],
  insights: ['insights'],
  settings: [],
  'floor-plan-builder': ['reservations'],
  today: [],
}

export function canAccessMobileExpandedModule(role, moduleId) {
  const normalizedModuleId = `${moduleId ?? ''}`.trim()
  const { role: resolvedRole, perms, custom } = readAccess(role, '')
  const customSources = MOBILE_EXPANDED_CUSTOM_SOURCES[normalizedModuleId] ?? []
  if (customSources.some((module) => custom[module])) {
    const permissionModule = APP_MODULE_PERMISSION[normalizedModuleId]
    if (!permissionModule) return false
    return hasPermission(perms, permissionModule, 'view')
  }

  if (isHostRole(resolvedRole)) {
    if (normalizedModuleId === 'stock') return false
    if (normalizedModuleId === 'reservations' || normalizedModuleId === 'operations') {
      return hasPermission(perms, APP_MODULE_PERMISSION[normalizedModuleId], 'view')
    }
    return false
  }

  if (normalizedModuleId === 'stock' && hasPermission(perms, 'stock', 'view')) {
    return true
  }

  if (!isManagementMobileRole(resolvedRole)) {
    return false
  }

  const permissionModule = APP_MODULE_PERMISSION[normalizedModuleId]
  if (!permissionModule) return false
  return hasPermission(perms, permissionModule, 'view')
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
  const { role: resolvedRole, perms, custom } = readAccess(role)
  if (custom.schedule) return hasPermission(perms, 'schedule', 'manage')
  if (custom.team) return hasPermission(rolePermissions(resolvedRole), 'team', 'manage')
  return hasPermission(perms, 'team', 'manage')
}

export function canOpenMobileTasksWorkspace(role) {
  return canAccessMobileExpandedModule(role, 'operations')
}

export function canAccessHostMobileTasksTab(role) {
  return hasPermission(readAccess(role, '').perms, 'mobile_tasks', 'view')
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
  const perms = readAccess(role, '').perms
  if (!hasPermission(perms, 'operations', 'view')) return false
  if (!OPERATIONS_SECTION_IDS.has(normalizedSection)) return false
  if (normalizedSection === 'checklists') return hasPermission(perms, 'operations', 'manage')
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

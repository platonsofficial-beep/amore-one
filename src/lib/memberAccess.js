import { getWorkspaceRoleLabel, isOwnerRole, normalizeWorkspaceRole } from './membershipRoles'
import { PERMISSION_MODULES, getRolePreset, resolvePermissions } from './permissions'

// Live workspace_member_permissions modules. Levels match the database:
// 0 none, 1 view, 2 manage.
export const WORKSPACE_PERMISSION_MODULES = [
  'reservations',
  'schedule',
  'leave',
  'tasks',
  'stock',
  'team',
  'insights',
  'attendance',
  'private_data',
]

const LEVEL_NAMES = ['none', 'view', 'manage']

const PRESET_MODULE_KEYS = new Set(PERMISSION_MODULES)

export const MEMBER_ACCESS_AREAS = [
  {
    module: 'reservations',
    label: 'Bookings & floor plan',
    hint: 'Open bookings, or also book, seat, and edit the floor.',
    icon: '▣',
    control: 'level',
  },
  {
    module: 'schedule',
    label: 'Schedule',
    hint: 'See the rota, or also build and publish it.',
    icon: '◷',
    control: 'level',
  },
  {
    module: 'leave',
    label: 'Time off',
    hint: 'See requests, or also approve and reject them.',
    icon: '✈',
    control: 'level',
  },
  {
    module: 'tasks',
    label: 'Tasks & checklists',
    hint: 'See tasks, or also create, assign, and post announcements.',
    icon: '✓',
    control: 'level',
  },
  {
    module: 'stock',
    label: 'Stock',
    hint: 'See stock and count shelves, or also manage items and orders.',
    icon: '📦',
    control: 'level',
  },
  {
    module: 'team',
    label: 'Team',
    hint: 'See the team, or also invite and edit people.',
    icon: '👥',
    control: 'level',
  },
  {
    module: 'insights',
    label: 'Insights',
    hint: 'See reports.',
    icon: '◈',
    control: 'level',
  },
  {
    module: 'attendance',
    label: 'Clock in/out',
    hint: 'Timesheets and exceptions.',
    icon: '⏱',
    control: 'level',
    note: 'Coming soon',
  },
  {
    module: 'private_data',
    label: 'Salaries & personal data',
    hint: 'Salary and personal details.',
    icon: '🔒',
    control: 'toggle',
  },
]

export function permissionLevelFromRank(rank) {
  if (rank === 'manage' || rank === 'view' || rank === 'none') return rank
  const value = Number(rank)
  if (!Number.isFinite(value) || value <= 0) return 'none'
  if (value >= 2) return 'manage'
  return 'view'
}

export function permissionRankFromLevel(level) {
  const name = permissionLevelFromRank(level)
  return LEVEL_NAMES.indexOf(name)
}

// Same table as public.workspace_role_preset_level. Reset uses this JS copy.
export function workspaceRolePresetLevel(role, module) {
  const normalizedRole = normalizeWorkspaceRole(role, '')
  if (!WORKSPACE_PERMISSION_MODULES.includes(module)) return 0
  if (normalizedRole === 'owner') return 2
  if (normalizedRole === 'general_manager') return module === 'insights' ? 1 : 2
  if (normalizedRole === 'manager') {
    if (module === 'insights') return 1
    if (module === 'private_data') return 0
    return 2
  }
  if (normalizedRole === 'host') return module === 'reservations' ? 2 : 0
  if (normalizedRole === 'staff') return module === 'stock' ? 1 : 0
  return 0
}

export function presetLevelsForRole(role) {
  return Object.fromEntries(
    WORKSPACE_PERMISSION_MODULES.map((module) => [
      module,
      permissionLevelFromRank(workspaceRolePresetLevel(role, module)),
    ]),
  )
}

export function presetLabelForRole(role) {
  return getWorkspaceRoleLabel(role)
}

export function canShowMemberAccess(actorRole) {
  return isOwnerRole(actorRole)
}

export function isMemberAccessEditable({
  actorRole,
  targetRole = '',
  targetMemberId = '',
  actorMemberId = '',
} = {}) {
  if (!canShowMemberAccess(actorRole)) return false
  if (isOwnerRole(targetRole)) return false
  const targetId = `${targetMemberId ?? ''}`.trim()
  const actorId = `${actorMemberId ?? ''}`.trim()
  if (targetId && actorId && targetId === actorId) return false
  return true
}

export function indexStoredPermissionLevels(rows) {
  const stored = {}
  if (!Array.isArray(rows)) return stored

  for (const row of rows) {
    const module = `${row?.module ?? ''}`.trim()
    if (!WORKSPACE_PERMISSION_MODULES.includes(module)) continue
    stored[module] = permissionLevelFromRank(row?.level)
  }

  return stored
}

export function levelsForMember(role, rows) {
  const levels = presetLevelsForRole(role)
  const stored = indexStoredPermissionLevels(rows)
  for (const module of WORKSPACE_PERMISSION_MODULES) {
    if (Object.hasOwn(stored, module)) levels[module] = stored[module]
  }
  return levels
}

export function buildMemberPermissionUpsertRows({
  workspaceId,
  memberId,
  levels,
  updatedBy = null,
  updatedAt = new Date().toISOString(),
} = {}) {
  return WORKSPACE_PERMISSION_MODULES.map((module) => ({
    workspace_id: workspaceId,
    member_id: memberId,
    module,
    level: permissionRankFromLevel(levels?.[module] ?? 'none'),
    updated_by: updatedBy || null,
    updated_at: updatedAt,
  }))
}

function projectModuleOverride(module, level) {
  if (module === 'reservations') {
    if (level === 'none') {
      return { reservations: 'none', seatings: 'none', floor_plan: 'none', floor_plan_edit: 'none' }
    }
    if (level === 'view') {
      return { reservations: 'view', seatings: 'none', floor_plan: 'none', floor_plan_edit: 'none' }
    }
    return { reservations: 'manage', seatings: 'manage', floor_plan: 'manage', floor_plan_edit: 'manage' }
  }

  if (module === 'schedule') return { schedule: level }

  if (module === 'leave') return { leave: level }

  if (module === 'tasks') {
    if (level === 'none') return { operations: 'none', announcements: 'none', tasks: 'none' }
    if (level === 'view') return { operations: 'view', announcements: 'none', tasks: 'view' }
    return { operations: 'manage', announcements: 'manage', tasks: 'manage' }
  }

  if (module === 'stock') {
    if (level === 'none') return { stock: 'none', shelf_count: 'none' }
    if (level === 'view') return { stock: 'view', shelf_count: 'manage' }
    return { stock: 'manage' }
  }

  if (module === 'team') return { team: level }
  if (module === 'insights') return { insights: level === 'none' ? 'none' : level }
  if (module === 'attendance') return { attendance: level }
  if (module === 'private_data') return { private_data: level === 'none' ? 'none' : level }
  return {}
}

function roleName(role) {
  if (role && typeof role === 'object') return `${role.role ?? ''}`.trim()
  return `${role ?? ''}`.trim()
}

export function resolveMemberAccess(role, rows = null) {
  const resolvedRole = roleName(role)

  if (isOwnerRole(resolvedRole)) {
    return {
      role: 'owner',
      permissions: getRolePreset('owner'),
      customModules: {},
    }
  }

  const presetAccess = {
    role: resolvedRole,
    permissions: getRolePreset(resolvedRole, ''),
    customModules: {},
  }

  if (!Array.isArray(rows) || rows.length === 0) return presetAccess

  const stored = indexStoredPermissionLevels(rows)
  if (Object.keys(stored).length === 0) return presetAccess

  const customModules = {}
  const presetOverrides = {}
  const extra = {}

  for (const module of WORKSPACE_PERMISSION_MODULES) {
    if (!Object.hasOwn(stored, module)) continue
    const presetLevel = permissionLevelFromRank(workspaceRolePresetLevel(resolvedRole, module))
    if (stored[module] === presetLevel) continue

    customModules[module] = stored[module]
    const projected = projectModuleOverride(module, stored[module])
    for (const [key, level] of Object.entries(projected)) {
      if (PRESET_MODULE_KEYS.has(key)) presetOverrides[key] = level
      else extra[key] = level
    }
  }

  if (Object.keys(customModules).length === 0) return presetAccess

  return {
    role: resolvedRole,
    permissions: {
      ...resolvePermissions(resolvedRole, presetOverrides),
      ...extra,
    },
    customModules,
  }
}

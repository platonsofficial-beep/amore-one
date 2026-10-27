import { describe, expect, it } from 'vitest'
import { WORKSPACE_ROLES } from './membershipRoles'
import expectedMatrix from './permissionRoleMatrix.fixture.json'
import {
  APP_MODULES,
  PERMISSION_MODULES,
  ROLE_PERMISSION_PRESETS,
  canAccessHostMobileTasksTab,
  canAccessMobileExpandedModule,
  canAccessModule,
  canAccessOperationsSection,
  canAccessTeamSection,
  canAssignManagerInviteRole,
  canConfigureReservationSeatings,
  canEditFloorPlan,
  canEditSchedule,
  canLinkMembershipEmployee,
  canManageAnnouncements,
  canManageEmployeeInvites,
  canManageOperations,
  canManageReservations,
  canManageStock,
  canOpenMobileFullSchedule,
  canOpenMobileTasksWorkspace,
  canOpenReservationsHostMode,
  canSubmitStaffShelfCount,
  hasPermission,
  resolvePermissions,
} from './permissions'

const ROLES = [...WORKSPACE_ROLES, '', 'chef']
const TEAM_SECTIONS = ['today', 'members', 'schedule', 'unknown']
const OPERATIONS_SECTIONS = ['dashboard', 'tasks', 'checklists', 'unknown', '']

const BOOLEAN_HELPERS = {
  canManageStock,
  canManageOperations,
  canManageAnnouncements,
  canEditSchedule,
  canEditFloorPlan,
  canConfigureReservationSeatings,
  canManageReservations,
  canOpenReservationsHostMode,
  canManageEmployeeInvites,
  canAssignManagerInviteRole,
  canLinkMembershipEmployee,
  canSubmitStaffShelfCount,
  canOpenMobileFullSchedule,
  canOpenMobileTasksWorkspace,
  canAccessHostMobileTasksTab,
}

function roleKey(role) {
  return role === '' ? '(blank)' : role
}

function actualMatrix() {
  const matrix = {}
  for (const role of ROLES) {
    const row = {}
    for (const [name, helper] of Object.entries(BOOLEAN_HELPERS)) {
      row[name] = helper(role)
    }
    row.canAccessModule = Object.fromEntries(
      [...APP_MODULES, 'unknown'].map((moduleId) => [moduleId, canAccessModule(role, moduleId)]),
    )
    row.canAccessTeamSection = Object.fromEntries(
      TEAM_SECTIONS.map((sectionId) => [sectionId, canAccessTeamSection(role, sectionId)]),
    )
    row.canAccessOperationsSection = Object.fromEntries(
      OPERATIONS_SECTIONS.map((sectionId) => [sectionId, canAccessOperationsSection(role, sectionId)]),
    )
    row.canAccessMobileExpandedModule = Object.fromEntries(
      [...APP_MODULES, 'unknown'].map((moduleId) => [moduleId, canAccessMobileExpandedModule(role, moduleId)]),
    )
    matrix[roleKey(role)] = row
  }
  return matrix
}

describe('permission role presets', () => {
  it('keeps every canX result identical to the pre-preset role matrix', () => {
    expect(actualMatrix()).toEqual(expectedMatrix)
  })

  it('defines a complete none/view/manage preset for every workspace role', () => {
    for (const role of WORKSPACE_ROLES) {
      const preset = ROLE_PERMISSION_PRESETS[role]
      expect(preset, role).toBeTruthy()
      expect(Object.keys(preset).sort()).toEqual([...PERMISSION_MODULES].sort())
      for (const level of Object.values(preset)) {
        expect(['none', 'view', 'manage']).toContain(level)
      }
    }
  })

  it('records the approved private data, access, and shelf-count presets', () => {
    expect(ROLE_PERMISSION_PRESETS.owner.private_data).toBe('manage')
    expect(ROLE_PERMISSION_PRESETS.general_manager.private_data).toBe('manage')
    expect(ROLE_PERMISSION_PRESETS.manager.private_data).toBe('none')
    expect(ROLE_PERMISSION_PRESETS.host.private_data).toBe('none')
    expect(ROLE_PERMISSION_PRESETS.staff.private_data).toBe('none')

    expect(ROLE_PERMISSION_PRESETS.owner.access).toBe('manage')
    expect(ROLE_PERMISSION_PRESETS.general_manager.access).toBe('none')
    expect(ROLE_PERMISSION_PRESETS.manager.access).toBe('none')
    expect(ROLE_PERMISSION_PRESETS.staff.access).toBe('none')

    expect(ROLE_PERMISSION_PRESETS.staff.shelf_count).toBe('manage')
    expect(ROLE_PERMISSION_PRESETS.host.shelf_count).toBe('none')
    expect(ROLE_PERMISSION_PRESETS.manager.shelf_count).toBe('none')
    expect(ROLE_PERMISSION_PRESETS.manager.team).toBe('manage')
  })

  it('lets a later per-member grant override a preset and falls back for the rest', () => {
    const perms = resolvePermissions('staff', {
      shelf_count: 'none',
      stock: 'manage',
      ignored: 'manage',
      operations: 'nope',
    })

    expect(hasPermission(perms, 'shelf_count', 'manage')).toBe(false)
    expect(hasPermission(perms, 'stock', 'manage')).toBe(true)
    expect(hasPermission(perms, 'stock', 'view')).toBe(true)
    expect(hasPermission(perms, 'operations', 'view')).toBe(true)
    expect(hasPermission(perms, 'team', 'view')).toBe(true)
    expect(hasPermission(perms, 'reservations', 'view')).toBe(false)
    expect(perms.ignored).toBeUndefined()

    expect(canSubmitStaffShelfCount('staff')).toBe(true)
    expect(resolvePermissions('staff')).toEqual({ ...ROLE_PERMISSION_PRESETS.staff })
  })

  it('treats manage as including view and none as denying both', () => {
    const perms = ROLE_PERMISSION_PRESETS.manager
    expect(hasPermission(perms, 'stock', 'view')).toBe(true)
    expect(hasPermission(perms, 'stock', 'manage')).toBe(true)
    expect(hasPermission(perms, 'settings', 'view')).toBe(false)
    expect(hasPermission(perms, 'settings', 'manage')).toBe(false)
    expect(hasPermission(perms, 'stock', 'edit')).toBe(false)
  })
})

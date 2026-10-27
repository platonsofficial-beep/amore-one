import { describe, expect, it } from 'vitest'
import { WORKSPACE_ROLES } from './membershipRoles'
import {
  MEMBER_ACCESS_AREAS,
  WORKSPACE_PERMISSION_MODULES,
  buildMemberPermissionUpsertRows,
  canShowMemberAccess,
  isMemberAccessEditable,
  levelsForMember,
  permissionRankFromLevel,
  presetLevelsForRole,
  resolveMemberAccess,
  workspaceRolePresetLevel,
} from './memberAccess'
import {
  APP_MODULES,
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
  canOpenReservationsHostMode,
  canSubmitStaffShelfCount,
} from './permissions'
import { canApproveLeave, canCreateLeave, canViewLeaveQueue } from './leave/leavePermissionUtils'

const ROLES = [...WORKSPACE_ROLES, '', 'chef']

function presetRows(role) {
  return WORKSPACE_PERMISSION_MODULES.map((module) => ({
    module,
    level: workspaceRolePresetLevel(role, module),
  }))
}

const HELPERS = {
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
}

function snapshot(access) {
  const row = {}
  for (const [name, helper] of Object.entries(HELPERS)) {
    row[name] = helper(access)
  }
  row.modules = Object.fromEntries(
    [...APP_MODULES, 'unknown'].map((moduleId) => [moduleId, canAccessModule(access, moduleId)]),
  )
  row.team = Object.fromEntries(
    ['today', 'members', 'schedule', 'unknown'].map((sectionId) => [sectionId, canAccessTeamSection(access, sectionId)]),
  )
  row.operations = Object.fromEntries(
    ['dashboard', 'tasks', 'checklists', 'unknown', ''].map((sectionId) => [sectionId, canAccessOperationsSection(access, sectionId)]),
  )
  row.mobile = Object.fromEntries(
    [...APP_MODULES, 'unknown'].map((moduleId) => [moduleId, canAccessMobileExpandedModule(access, moduleId)]),
  )
  row.leave = {
    view: canViewLeaveQueue(access),
    approve: canApproveLeave(access),
    create: canCreateLeave(access),
  }
  return row
}

describe('stored member permissions', () => {
  it('keeps every canX result identical when stored levels equal the role preset', () => {
    for (const role of ROLES) {
      const access = resolveMemberAccess(role, presetRows(role))
      expect(snapshot(access), role || '(blank)').toEqual(snapshot(role))
    }
  })

  it('falls back to the role preset when the fetch fails or returns no rows', () => {
    for (const rows of [null, undefined, [], [{ module: 'not-a-module', level: 2 }]]) {
      expect(snapshot(resolveMemberAccess('manager', rows))).toEqual(snapshot('manager'))
      expect(snapshot(resolveMemberAccess('host', rows))).toEqual(snapshot('host'))
      expect(snapshot(resolveMemberAccess('staff', rows))).toEqual(snapshot('staff'))
    }
  })

  it('keeps the owner at full access even when stored rows say none', () => {
    const rows = WORKSPACE_PERMISSION_MODULES.map((module) => ({ module, level: 0 }))
    const access = resolveMemberAccess('owner', rows)
    expect(access.customModules).toEqual({})
    expect(snapshot(access)).toEqual(snapshot('owner'))
    expect(canManageStock(access)).toBe(true)
    expect(canEditSchedule(access)).toBe(true)
  })

  it('lets a stored grant change nav and action gates without dropping unrelated preset access', () => {
    const staffStock = resolveMemberAccess('staff', [{ module: 'stock', level: 2 }])
    expect(canManageStock(staffStock)).toBe(true)
    expect(canAccessModule(staffStock, 'stock')).toBe(true)
    expect(canSubmitStaffShelfCount(staffStock)).toBe(true)
    expect(canManageReservations(staffStock)).toBe(false)

    const staffBookings = resolveMemberAccess('staff', [{ module: 'reservations', level: 2 }])
    expect(canAccessModule(staffBookings, 'reservations')).toBe(true)
    expect(canManageReservations(staffBookings)).toBe(true)
    expect(canEditFloorPlan(staffBookings)).toBe(true)
    expect(canConfigureReservationSeatings(staffBookings)).toBe(true)
    expect(canAccessMobileExpandedModule(staffBookings, 'reservations')).toBe(true)

    const hostSchedule = resolveMemberAccess('host', [{ module: 'schedule', level: 2 }])
    expect(canEditSchedule(hostSchedule)).toBe(true)
    expect(canOpenMobileFullSchedule(hostSchedule)).toBe(true)
    expect(canAccessTeamSection(hostSchedule, 'members')).toBe(false)
    expect(canManageEmployeeInvites(hostSchedule)).toBe(false)

    const managerTeam = resolveMemberAccess('manager', [{ module: 'team', level: 1 }])
    expect(canManageEmployeeInvites(managerTeam)).toBe(false)
    expect(canAccessTeamSection(managerTeam, 'members')).toBe(false)
    expect(canEditSchedule(managerTeam)).toBe(true)
    expect(canAccessTeamSection(managerTeam, 'schedule')).toBe(true)

    const managerSchedule = resolveMemberAccess('manager', [{ module: 'schedule', level: 0 }])
    expect(canEditSchedule(managerSchedule)).toBe(false)
    expect(canAccessTeamSection(managerSchedule, 'schedule')).toBe(true)
    expect(canManageEmployeeInvites(managerSchedule)).toBe(true)

    const managerTasks = resolveMemberAccess('manager', [{ module: 'tasks', level: 1 }])
    expect(canManageOperations(managerTasks)).toBe(false)
    expect(canManageAnnouncements(managerTasks)).toBe(false)
    expect(canAccessOperationsSection(managerTasks, 'tasks')).toBe(true)
    expect(canAccessOperationsSection(managerTasks, 'checklists')).toBe(false)

    const staffLeave = resolveMemberAccess('staff', [{ module: 'leave', level: 2 }])
    expect(canViewLeaveQueue(staffLeave)).toBe(true)
    expect(canApproveLeave(staffLeave)).toBe(true)
    expect(canCreateLeave(staffLeave)).toBe(true)

    const managerLeave = resolveMemberAccess('manager', [{ module: 'leave', level: 0 }])
    expect(canViewLeaveQueue(managerLeave)).toBe(false)
    expect(canApproveLeave(managerLeave)).toBe(false)
    expect(canCreateLeave(managerLeave)).toBe(true)

    const managerPrivate = resolveMemberAccess('manager', [{ module: 'private_data', level: 2 }])
    expect(canAssignManagerInviteRole(managerPrivate)).toBe(true)
    expect(canLinkMembershipEmployee(managerPrivate)).toBe(true)
  })
})

describe('member access screen logic', () => {
  it('lists the ten areas in plain language, with the salary toggle and live clock-in levels', () => {
    expect(MEMBER_ACCESS_AREAS.map((area) => area.module)).toEqual(WORKSPACE_PERMISSION_MODULES)
    expect(MEMBER_ACCESS_AREAS.find((area) => area.module === 'private_data')).toMatchObject({
      label: 'Salaries & personal data',
      control: 'toggle',
    })
    expect(MEMBER_ACCESS_AREAS.find((area) => area.module === 'attendance')).toMatchObject({
      label: 'Clock in/out',
      control: 'level',
    })
    expect(MEMBER_ACCESS_AREAS.find((area) => area.module === 'attendance').note).toBeUndefined()
    expect(MEMBER_ACCESS_AREAS.filter((area) => area.control === 'level')).toHaveLength(9)
    expect(MEMBER_ACCESS_AREAS.find((area) => area.module === 'chat')).toMatchObject({
      label: 'Chat',
      control: 'level',
    })
  })

  it('shows access only to the owner and locks an owner row', () => {
    expect(canShowMemberAccess('owner')).toBe(true)
    expect(canShowMemberAccess('general_manager')).toBe(false)
    expect(canShowMemberAccess('manager')).toBe(false)
    expect(canShowMemberAccess('host')).toBe(false)
    expect(canShowMemberAccess('staff')).toBe(false)

    expect(isMemberAccessEditable({
      actorRole: 'owner',
      targetRole: 'manager',
      targetMemberId: 'member-2',
      actorMemberId: 'member-1',
    })).toBe(true)
    expect(isMemberAccessEditable({
      actorRole: 'owner',
      targetRole: 'owner',
      targetMemberId: 'member-1',
      actorMemberId: 'member-1',
    })).toBe(false)
    expect(isMemberAccessEditable({
      actorRole: 'owner',
      targetRole: 'manager',
      targetMemberId: 'member-1',
      actorMemberId: 'member-1',
    })).toBe(false)
    expect(isMemberAccessEditable({
      actorRole: 'manager',
      targetRole: 'staff',
      targetMemberId: 'member-2',
      actorMemberId: 'member-1',
    })).toBe(false)
  })

  it('uses the role preset when rows are missing and writes all ten rows on save', () => {
    expect(levelsForMember('manager', null)).toEqual(presetLevelsForRole('manager'))
    expect(levelsForMember('host', [])).toEqual(presetLevelsForRole('host'))
    expect(presetLevelsForRole('manager')).toMatchObject({
      reservations: 'manage',
      schedule: 'manage',
      insights: 'view',
      attendance: 'manage',
      private_data: 'none',
    })
    expect(presetLevelsForRole('staff').stock).toBe('view')
    expect(presetLevelsForRole('host').reservations).toBe('manage')
    expect(presetLevelsForRole('host').schedule).toBe('none')

    const updatedAt = '2026-10-27T07:00:00.000Z'
    const rows = buildMemberPermissionUpsertRows({
      workspaceId: 'ws-1',
      memberId: 'member-2',
      levels: presetLevelsForRole('manager'),
      updatedBy: 'user-1',
      updatedAt,
    })

    expect(rows).toHaveLength(10)
    expect(presetLevelsForRole('staff').chat).toBe('view')
    expect(presetLevelsForRole('host').chat).toBe('view')
    expect(presetLevelsForRole('manager').chat).toBe('manage')
    expect(rows.map((row) => row.module)).toEqual(WORKSPACE_PERMISSION_MODULES)
    expect(rows.every((row) => row.updated_by === 'user-1' && row.updated_at === updatedAt)).toBe(true)
    expect(rows.every((row) => row.workspace_id === 'ws-1' && row.member_id === 'member-2')).toBe(true)
    expect(rows.find((row) => row.module === 'insights').level).toBe(permissionRankFromLevel('view'))
    expect(rows.find((row) => row.module === 'private_data').level).toBe(0)
    expect(rows.find((row) => row.module === 'stock').level).toBe(2)
  })
})

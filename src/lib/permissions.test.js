import { describe, expect, it } from 'vitest'
import {
  APP_MODULES,
  HOST_FALLBACK_MODULE,
  MOBILE_HOST_BOTTOM_TABS,
  MOBILE_STAFF_BOTTOM_TABS,
  canAccessHostMobileTasksTab,
  canAccessMobileExpandedModule,
  canAccessModule,
  canAccessOperationsSection,
  canAccessTeamSection,
  canSubmitStaffShelfCount,
  canAssignManagerInviteRole,
  canEditFloorPlan,
  canEditSchedule,
  canLinkMembershipEmployee,
  canManageAnnouncements,
  canManageEmployeeInvites,
  canManageOperations,
  canConfigureReservationSeatings,
  canManageReservations,
  canManageStock,
  canOpenMobileFullSchedule,
  canOpenMobileTasksWorkspace,
  canOpenReservationsHostMode,
  filterNavItemsByRole,
  filterOperationsSections,
  getAccessibleModules,
  getMobileBottomTabs,
  getTodayQuickActions,
  isHostMobileRole,
  resolveDefaultModuleForRole,
  resolveHostMobileTabChange,
  resolveMobileShellVariant,
  resolvePermittedActiveView,
  resolvePermittedOperationsSection,
  resolvePermittedTeamSection,
  resolveExitReservationsHostDestination,
  shouldShowReservationsHostView,
  shouldUseHostStationLanding,
  shouldUseHostStationShell,
  shouldUseReservationsHostDedicatedShell,
} from './permissions'
import { canApproveLeave, canCreateLeave, canViewLeaveQueue } from './leave/leavePermissionUtils'

const OPERATIONS_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'checklists', label: 'Checklists' },
  { id: 'tasks', label: 'Tasks' },
]

function tabIds(tabs) {
  return tabs.map((tab) => tab.id)
}

function quickActionAvailability(role) {
  return Object.fromEntries(
    getTodayQuickActions(role).map((action) => [action.id, action.available]),
  )
}

describe('permissions', () => {
  describe('module access', () => {
    it.each(['owner', 'general_manager'])('grants %s full module access', (role) => {
      expect(getAccessibleModules(role)).toEqual(APP_MODULES)
      expect(canAccessModule(role, 'settings')).toBe(true)
      expect(canAccessModule(role, 'reservations')).toBe(true)
    })

    it('grants manager access without settings', () => {
      const modules = getAccessibleModules('manager')

      expect(modules).toContain('reservations')
      expect(modules).toContain('stock')
      expect(modules).toContain('operations')
      expect(modules).not.toContain('settings')
      expect(canAccessModule('manager', 'settings')).toBe(false)
    })

    it('limits staff to staff-safe modules', () => {
      const modules = getAccessibleModules('staff')

      expect(modules).toEqual(['today', 'team', 'stock', 'operations'])
      expect(canAccessModule('staff', 'reservations')).toBe(false)
      expect(canAccessModule('staff', 'settings')).toBe(false)
      expect(canAccessModule('staff', 'insights')).toBe(false)
      expect(canAccessMobileExpandedModule('staff', 'stock')).toBe(true)
      expect(canAccessMobileExpandedModule('staff', 'operations')).toBe(false)
    })

    it('gives host staff parity without stock, shelf count, or approvals', () => {
      const modules = getAccessibleModules('host')

      expect(modules).toEqual(['today', 'reservations', 'team', 'operations'])
      expect(canAccessModule('host', 'reservations')).toBe(true)
      expect(canAccessModule('host', 'today')).toBe(true)
      expect(canAccessModule('host', 'team')).toBe(true)
      expect(canAccessTeamSection('host', 'schedule')).toBe(true)
      expect(canAccessTeamSection('host', 'members')).toBe(false)
      expect(canAccessModule('host', 'operations')).toBe(true)
      expect(canAccessOperationsSection('host', 'tasks')).toBe(true)
      expect(canAccessOperationsSection('host', 'checklists')).toBe(false)
      expect(canAccessModule('host', 'stock')).toBe(false)
      expect(canAccessModule('host', 'settings')).toBe(false)
      expect(canAccessModule('host', 'insights')).toBe(false)
      expect(canAccessMobileExpandedModule('host', 'reservations')).toBe(true)
      expect(canAccessMobileExpandedModule('host', 'operations')).toBe(true)
      expect(canAccessMobileExpandedModule('host', 'stock')).toBe(false)
      expect(canAccessMobileExpandedModule('host', 'team')).toBe(false)
      expect(canOpenMobileFullSchedule('host')).toBe(false)
      expect(canOpenMobileTasksWorkspace('host')).toBe(true)
      expect(canAccessHostMobileTasksTab('host')).toBe(true)
      expect(canAccessHostMobileTasksTab('staff')).toBe(true)
      expect(canSubmitStaffShelfCount('staff')).toBe(true)
      expect(canSubmitStaffShelfCount('host')).toBe(false)
      expect(canSubmitStaffShelfCount('manager')).toBe(false)
      expect(canSubmitStaffShelfCount('')).toBe(false)
      expect(canCreateLeave('host')).toBe(true)
      expect(canApproveLeave('host')).toBe(false)
      expect(canViewLeaveQueue('host')).toBe(false)
      expect(canEditSchedule('host')).toBe(false)
      expect(canManageOperations('host')).toBe(false)
      expect(canManageStock('host')).toBe(false)
      expect(canEditFloorPlan('host')).toBe(true)
      expect(resolveDefaultModuleForRole('host')).toBe(HOST_FALLBACK_MODULE)
      expect(resolvePermittedActiveView('host', 'stock')).toBe(HOST_FALLBACK_MODULE)
      expect(resolvePermittedActiveView('host', 'today')).toBe('today')
      expect(resolvePermittedTeamSection('host', 'members')).toBe('schedule')
      expect(isHostMobileRole('host')).toBe(true)
      expect(resolveMobileShellVariant('host')).toBe('host')
    })
  })

  describe('management helpers', () => {
    it('allows manager roles to manage reservations', () => {
      expect(canManageReservations('owner')).toBe(true)
      expect(canManageReservations('general_manager')).toBe(true)
      expect(canManageReservations('manager')).toBe(true)
      expect(canManageReservations('host')).toBe(true)
      expect(canManageReservations('staff')).toBe(false)
    })

    it('allows anyone who can manage reservations to configure seatings', () => {
      expect(canConfigureReservationSeatings('owner')).toBe(true)
      expect(canConfigureReservationSeatings('general_manager')).toBe(true)
      expect(canConfigureReservationSeatings('manager')).toBe(true)
      expect(canConfigureReservationSeatings('host')).toBe(true)
      expect(canConfigureReservationSeatings('staff')).toBe(false)
      expect(canConfigureReservationSeatings({
        role: 'staff',
        permissions: { reservations: 'view' },
        customModules: { reservations: true },
      })).toBe(false)
      expect(canConfigureReservationSeatings({
        role: 'staff',
        permissions: { reservations: 'manage' },
        customModules: { reservations: true },
      })).toBe(true)
      expect(filterNavItemsByRole([{ id: 'settings' }, { id: 'stock' }], 'host').map((item) => item.id)).toEqual(['settings'])
      expect(filterNavItemsByRole([{ id: 'settings' }, { id: 'today' }], 'staff').map((item) => item.id)).toEqual(['today'])
    })
  })

  describe('reservations host mode', () => {
    it('always renders host view for host role, including tablet/desktop shells', () => {
      expect(shouldShowReservationsHostView({
        role: 'host',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
      expect(shouldShowReservationsHostView({
        role: 'host',
        useMobileExperience: true,
        mobileReservationsHostMode: true,
      })).toBe(true)
    })

    it('routes manager and host-capable roles to host view on desktop', () => {
      expect(shouldShowReservationsHostView({
        role: 'owner',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
      expect(shouldShowReservationsHostView({
        role: 'manager',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
      expect(shouldShowReservationsHostView({
        role: 'general_manager',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
      expect(shouldShowReservationsHostView({
        role: 'manager',
        useMobileExperience: true,
        mobileReservationsHostMode: true,
      })).toBe(true)
    })

    it('opens the host station from the reservations tab and leaves it for staff tabs', () => {
      expect(resolveHostMobileTabChange('reservations', 'host')).toEqual({
        tab: 'reservations',
        openHostMode: true,
        activeView: 'reservations',
      })
      expect(resolveHostMobileTabChange('host', 'host')).toEqual({
        tab: 'reservations',
        openHostMode: true,
        activeView: 'reservations',
      })
      expect(resolveHostMobileTabChange('schedule', 'host')).toEqual({
        tab: 'schedule',
        openHostMode: false,
        activeView: 'team',
      })
      expect(resolveHostMobileTabChange('tasks', 'host')).toEqual({
        tab: 'tasks',
        openHostMode: false,
        activeView: 'operations',
      })
      expect(resolveHostMobileTabChange('menu', 'host')).toEqual({
        tab: 'menu',
        openHostMode: false,
        activeView: 'today',
      })
    })

    it('allows host and managers to open host mode but not staff', () => {
      expect(canOpenReservationsHostMode('owner')).toBe(true)
      expect(canOpenReservationsHostMode('general_manager')).toBe(true)
      expect(canOpenReservationsHostMode('host')).toBe(true)
      expect(canOpenReservationsHostMode('manager')).toBe(true)
      expect(canOpenReservationsHostMode('staff')).toBe(false)
    })
  })

  describe('host station shell', () => {
    it('uses dedicated host station for host role on all viewports', () => {
      expect(shouldUseHostStationShell('host')).toBe(true)
      expect(shouldUseHostStationShell('owner')).toBe(false)
      expect(shouldUseHostStationLanding('host')).toBe(true)
    })

    it('uses reservations host dedicated shell for host-capable roles on reservations', () => {
      const desktopContext = {
        activeView: 'reservations',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      }

      expect(shouldUseReservationsHostDedicatedShell({ role: 'owner', ...desktopContext })).toBe(true)
      expect(shouldUseReservationsHostDedicatedShell({ role: 'general_manager', ...desktopContext })).toBe(true)
      expect(shouldUseReservationsHostDedicatedShell({ role: 'manager', ...desktopContext })).toBe(true)
      expect(shouldUseReservationsHostDedicatedShell({ role: 'host', ...desktopContext })).toBe(true)
    })

    it('does not use reservations host dedicated shell outside reservations', () => {
      expect(shouldUseReservationsHostDedicatedShell({
        role: 'owner',
        activeView: 'today',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(false)
    })

    it('keeps staff on the standard shell outside mobile host mode', () => {
      expect(shouldUseReservationsHostDedicatedShell({
        role: 'staff',
        activeView: 'reservations',
        useMobileExperience: false,
        mobileReservationsHostMode: true,
      })).toBe(false)
    })

    it('resolves management host exit to the previous main view or Today', () => {
      expect(resolveExitReservationsHostDestination('stock', 'owner')).toBe('stock')
      expect(resolveExitReservationsHostDestination('operations', 'manager')).toBe('operations')
      expect(resolveExitReservationsHostDestination('reservations', 'general_manager')).toBe('today')
      expect(resolveExitReservationsHostDestination('', 'owner')).toBe('today')
    })
  })

  describe('getMobileBottomTabs', () => {
    it('returns staff-safe tabs for the staff shell', () => {
      expect(getMobileBottomTabs('staff', 'staff')).toEqual(MOBILE_STAFF_BOTTOM_TABS)
      expect(tabIds(getMobileBottomTabs('staff', 'staff'))).toEqual(['home', 'schedule', 'tasks', 'menu'])
    })

    it('gives host the staff tabs plus reservations', () => {
      expect(getMobileBottomTabs('host', 'host')).toEqual(MOBILE_HOST_BOTTOM_TABS)
      expect(tabIds(getMobileBottomTabs('host', 'host'))).toEqual([
        'home',
        'schedule',
        'tasks',
        'reservations',
        'menu',
      ])
      expect(tabIds(getMobileBottomTabs('host', 'host'))).not.toContain('stock')
    })

    it('includes stock and tasks for manager roles with module access', () => {
      expect(tabIds(getMobileBottomTabs('manager', 'manager'))).toEqual(['today', 'stock', 'tasks', 'menu'])
      expect(tabIds(getMobileBottomTabs('owner', 'manager'))).toEqual(['today', 'stock', 'tasks', 'menu'])
    })

    it('filters manager stock/tasks tabs when modules are unavailable', () => {
      expect(tabIds(getMobileBottomTabs('', 'manager'))).toEqual(['today', 'menu'])
    })
  })

  describe('getTodayQuickActions', () => {
    it('hides reservation and create-task actions for staff', () => {
      expect(quickActionAvailability('staff')).toEqual({
        'add-reservation': false,
        'add-task': false,
        'add-announcement': false,
        'create-order': false,
      })
    })

    it('enables reservation quick action for host without operations actions', () => {
      expect(quickActionAvailability('host')).toEqual({
        'add-reservation': true,
        'add-task': false,
        'add-announcement': false,
        'create-order': false,
      })
    })

    it.each(['owner', 'general_manager', 'manager'])('enables manager quick actions for %s', (role) => {
      expect(quickActionAvailability(role)).toEqual({
        'add-reservation': true,
        'add-task': true,
        'add-announcement': true,
        'create-order': true,
      })
    })
  })

  describe('operations sections', () => {
    it('filters restricted sections by role', () => {
      expect(filterOperationsSections(OPERATIONS_SECTIONS, 'staff').map((section) => section.id))
        .toEqual(['dashboard', 'tasks'])
      expect(filterOperationsSections(OPERATIONS_SECTIONS, 'manager').map((section) => section.id))
        .toEqual(['dashboard', 'checklists', 'tasks'])
      expect(filterOperationsSections(OPERATIONS_SECTIONS, 'host').map((section) => section.id))
        .toEqual(['dashboard', 'tasks'])
    })

    it('resolves invalid sections to the first permitted section', () => {
      expect(resolvePermittedOperationsSection('staff', 'checklists')).toBe('dashboard')
      expect(resolvePermittedOperationsSection('manager', 'unknown')).toBe('dashboard')
      expect(resolvePermittedOperationsSection('owner', 'checklists')).toBe('checklists')
      expect(resolvePermittedOperationsSection('host', 'dashboard')).toBe('dashboard')
    })
  })

  describe('resolvePermittedTeamSection', () => {
    it('returns a permitted team section for each role', () => {
      expect(resolvePermittedTeamSection('staff', 'members')).toBe('schedule')
      expect(resolvePermittedTeamSection('staff', '')).toBe('schedule')
      expect(resolvePermittedTeamSection('host', 'members')).toBe('schedule')
      expect(resolvePermittedTeamSection('manager', 'members')).toBe('members')
      expect(resolvePermittedTeamSection('owner', 'schedule')).toBe('schedule')
    })
  })

  describe('management capabilities', () => {
    it.each(['owner', 'general_manager', 'manager'])('allows %s to manage stock, operations, and announcements', (role) => {
      expect(canManageStock(role)).toBe(true)
      expect(canManageOperations(role)).toBe(true)
      expect(canManageAnnouncements(role)).toBe(true)
      expect(canEditSchedule(role)).toBe(true)
    })

    it('denies staff and host management capabilities except floor plan for host', () => {
      expect(canManageStock('staff')).toBe(false)
      expect(canManageOperations('staff')).toBe(false)
      expect(canManageAnnouncements('staff')).toBe(false)
      expect(canEditSchedule('staff')).toBe(false)
      expect(canEditFloorPlan('staff')).toBe(false)

      expect(canManageStock('host')).toBe(false)
      expect(canManageOperations('host')).toBe(false)
      expect(canManageAnnouncements('host')).toBe(false)
      expect(canEditSchedule('host')).toBe(false)
      expect(canEditFloorPlan('host')).toBe(true)
    })
  })

  describe('workspace access and invites', () => {
    it.each(['owner', 'general_manager'])('allows %s to manage invites and link employees', (role) => {
      expect(canManageEmployeeInvites(role)).toBe(true)
      expect(canAssignManagerInviteRole(role)).toBe(true)
      expect(canLinkMembershipEmployee(role)).toBe(true)
    })

    it('allows managers to invite staff but not assign manager invites or open settings', () => {
      expect(canManageEmployeeInvites('manager')).toBe(true)
      expect(canAssignManagerInviteRole('manager')).toBe(false)
      expect(canLinkMembershipEmployee('manager')).toBe(false)
      expect(canAccessModule('manager', 'settings')).toBe(false)
    })

    it('blocks staff and host from workspace settings and invite management', () => {
      expect(canManageEmployeeInvites('staff')).toBe(false)
      expect(canAssignManagerInviteRole('staff')).toBe(false)
      expect(canLinkMembershipEmployee('staff')).toBe(false)
      expect(canAccessModule('staff', 'settings')).toBe(false)

      expect(canManageEmployeeInvites('host')).toBe(false)
      expect(canAssignManagerInviteRole('host')).toBe(false)
      expect(canLinkMembershipEmployee('host')).toBe(false)
      expect(canAccessModule('host', 'settings')).toBe(false)
    })
  })
})

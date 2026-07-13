import { describe, expect, it } from 'vitest'
import {
  APP_MODULES,
  HOST_FALLBACK_MODULE,
  MOBILE_HOST_BOTTOM_TABS,
  MOBILE_STAFF_BOTTOM_TABS,
  canAccessHostMobileTasksTab,
  canAccessMobileExpandedModule,
  canAccessModule,
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
  shouldShowReservationsHostView,
  shouldUseHostStationLanding,
  shouldUseHostStationShell,
  shouldUseReservationsHostDedicatedShell,
} from './permissions'

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

    it('limits host to reservations-only reception station access', () => {
      const modules = getAccessibleModules('host')

      expect(modules).toEqual(['reservations'])
      expect(canAccessModule('host', 'stock')).toBe(false)
      expect(canAccessModule('host', 'operations')).toBe(false)
      expect(canAccessModule('host', 'today')).toBe(false)
      expect(canAccessModule('host', 'settings')).toBe(false)
      expect(canAccessModule('host', 'insights')).toBe(false)
      expect(canAccessModule('host', 'team')).toBe(false)
      expect(canAccessModule('host', 'reservations')).toBe(true)
      expect(canAccessMobileExpandedModule('host', 'reservations')).toBe(true)
      expect(canAccessMobileExpandedModule('host', 'stock')).toBe(false)
      expect(canAccessMobileExpandedModule('host', 'operations')).toBe(false)
      expect(canAccessMobileExpandedModule('host', 'team')).toBe(false)
      expect(canOpenMobileFullSchedule('host')).toBe(false)
      expect(canOpenMobileTasksWorkspace('host')).toBe(false)
      expect(canAccessHostMobileTasksTab('host')).toBe(false)
      expect(canEditFloorPlan('host')).toBe(true)
      expect(resolveDefaultModuleForRole('host')).toBe(HOST_FALLBACK_MODULE)
      expect(resolvePermittedActiveView('host', 'stock')).toBe(HOST_FALLBACK_MODULE)
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

    it('limits seating configuration to management roles', () => {
      expect(canConfigureReservationSeatings('owner')).toBe(true)
      expect(canConfigureReservationSeatings('general_manager')).toBe(true)
      expect(canConfigureReservationSeatings('manager')).toBe(true)
      expect(canConfigureReservationSeatings('host')).toBe(false)
      expect(canConfigureReservationSeatings('staff')).toBe(false)
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

    it('keeps host role locked in reservations host mode', () => {
      expect(resolveHostMobileTabChange('host', 'host')).toEqual({
        tab: 'host',
        openHostMode: true,
        activeView: 'reservations',
      })
      expect(resolveHostMobileTabChange('schedule', 'host')).toEqual({
        tab: 'host',
        openHostMode: true,
        activeView: 'reservations',
      })
      expect(resolveHostMobileTabChange('menu', 'host')).toEqual({
        tab: 'host',
        openHostMode: true,
        activeView: 'reservations',
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
  })

  describe('getMobileBottomTabs', () => {
    it('returns staff-safe tabs for the staff shell', () => {
      expect(getMobileBottomTabs('staff', 'staff')).toEqual(MOBILE_STAFF_BOTTOM_TABS)
      expect(tabIds(getMobileBottomTabs('staff', 'staff'))).toEqual(['home', 'schedule', 'tasks', 'menu'])
    })

    it('returns no bottom tabs for the dedicated host station shell', () => {
      expect(getMobileBottomTabs('host', 'host')).toEqual(MOBILE_HOST_BOTTOM_TABS)
      expect(tabIds(getMobileBottomTabs('host', 'host'))).toEqual([])
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
        'create-order': false,
      })
    })

    it('enables reservation quick action for host without operations actions', () => {
      expect(quickActionAvailability('host')).toEqual({
        'add-reservation': true,
        'add-task': false,
        'create-order': false,
      })
    })

    it.each(['owner', 'general_manager', 'manager'])('enables manager quick actions for %s', (role) => {
      expect(quickActionAvailability(role)).toEqual({
        'add-reservation': true,
        'add-task': true,
        'create-order': false,
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
        .toEqual([])
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

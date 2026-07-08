import { describe, expect, it } from 'vitest'
import {
  APP_MODULES,
  MOBILE_STAFF_BOTTOM_TABS,
  canAccessMobileExpandedModule,
  canAccessModule,
  canManageAnnouncements,
  canManageOperations,
  canManageReservations,
  canManageStock,
  filterOperationsSections,
  getAccessibleModules,
  getMobileBottomTabs,
  getTodayQuickActions,
  resolvePermittedOperationsSection,
  resolvePermittedTeamSection,
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
  })

  describe('management helpers', () => {
    it('allows manager roles to manage reservations', () => {
      expect(canManageReservations('owner')).toBe(true)
      expect(canManageReservations('general_manager')).toBe(true)
      expect(canManageReservations('manager')).toBe(true)
      expect(canManageReservations('staff')).toBe(false)
    })
  })

  describe('getMobileBottomTabs', () => {
    it('returns staff-safe tabs for the staff shell', () => {
      expect(getMobileBottomTabs('staff', 'staff')).toEqual(MOBILE_STAFF_BOTTOM_TABS)
      expect(tabIds(getMobileBottomTabs('staff', 'staff'))).toEqual(['home', 'schedule', 'tasks', 'menu'])
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
    })

    it('resolves invalid sections to the first permitted section', () => {
      expect(resolvePermittedOperationsSection('staff', 'checklists')).toBe('dashboard')
      expect(resolvePermittedOperationsSection('manager', 'unknown')).toBe('dashboard')
      expect(resolvePermittedOperationsSection('owner', 'checklists')).toBe('checklists')
    })
  })

  describe('resolvePermittedTeamSection', () => {
    it('returns a permitted team section for each role', () => {
      expect(resolvePermittedTeamSection('staff', 'members')).toBe('schedule')
      expect(resolvePermittedTeamSection('staff', '')).toBe('schedule')
      expect(resolvePermittedTeamSection('manager', 'members')).toBe('members')
      expect(resolvePermittedTeamSection('owner', 'schedule')).toBe('schedule')
    })
  })

  describe('management capabilities', () => {
    it.each(['owner', 'general_manager', 'manager'])('allows %s to manage stock, operations, and announcements', (role) => {
      expect(canManageStock(role)).toBe(true)
      expect(canManageOperations(role)).toBe(true)
      expect(canManageAnnouncements(role)).toBe(true)
    })

    it('denies staff management capabilities', () => {
      expect(canManageStock('staff')).toBe(false)
      expect(canManageOperations('staff')).toBe(false)
      expect(canManageAnnouncements('staff')).toBe(false)
    })
  })
})

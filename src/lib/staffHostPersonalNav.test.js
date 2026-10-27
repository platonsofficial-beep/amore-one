import { describe, expect, it } from 'vitest'
import { normalizeActiveView } from './navigationPersistence'
import { resolvePermittedActiveView } from './permissions'
import {
  canOpenStaffHostPersonalView,
  mobileStateForPersonalView,
  staffHostAvatarActions,
  withStaffHostRailItems,
} from './staffHostPersonalNav'

const hostRail = [
  { id: 'today', label: 'Today' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'team', label: 'Team' },
  { id: 'operations', label: 'Operations' },
  { id: 'settings', label: 'Settings' },
]

describe('staff and host personal navigation', () => {
  it('adds My week to the staff and host rail without dropping existing items', () => {
    expect(withStaffHostRailItems(hostRail, 'host').map((item) => item.label)).toEqual([
      'Today',
      'Reservations',
      'Team',
      'Operations',
      'My week',
      'Settings',
    ])
    expect(withStaffHostRailItems(
      [{ id: 'today', label: 'Today' }, { id: 'team', label: 'Team' }],
      'staff',
    ).map((item) => item.id)).toEqual(['today', 'team', 'my-week'])
    expect(withStaffHostRailItems(hostRail, 'manager')).toEqual(hostRail)
  })

  it('offers the portrait profile actions in the avatar menu', () => {
    expect(staffHostAvatarActions({ canRequestLeave: true }).map((item) => item.label)).toEqual([
      'My week',
      'Profile',
      'Clock in/out',
      'Request Leave',
    ])
    expect(staffHostAvatarActions().some((item) => item.id === 'leave')).toBe(false)
    expect(staffHostAvatarActions({ canUseChat: true }).map((item) => item.label)[0]).toBe('Chat')
  })

  it('keeps personal routes for staff and host and maps them back to the portrait screen', () => {
    expect(canOpenStaffHostPersonalView('host', 'my-week')).toBe(true)
    expect(canOpenStaffHostPersonalView('staff', 'account')).toBe(true)
    expect(canOpenStaffHostPersonalView('manager', 'my-week')).toBe(false)
    expect(normalizeActiveView('my-week')).toBe('my-week')
    expect(resolvePermittedActiveView('host', 'my-week')).toBe('my-week')
    expect(resolvePermittedActiveView('staff', 'clock')).toBe('clock')
    expect(resolvePermittedActiveView('staff', 'notifications')).toBe('notifications')
    expect(resolvePermittedActiveView('manager', 'my-week')).toBe('today')
    expect(resolvePermittedActiveView('host', 'stock')).toBe('reservations')
    expect(mobileStateForPersonalView('my-week')).toEqual({
      tab: 'availability',
      menuScreen: 'main',
      clockOpen: false,
    })
    expect(mobileStateForPersonalView('account').menuScreen).toBe('profile')
    expect(mobileStateForPersonalView('notifications').menuScreen).toBe('notifications')
  })
})

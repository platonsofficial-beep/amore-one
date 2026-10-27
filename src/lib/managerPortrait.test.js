import { describe, expect, it, vi } from 'vitest'
import { normalizeManagerMobileTab } from './mobileNavigationPersistence'
import {
  buildManagerPortraitMoreItems,
  buildPortraitFloorTables,
  resolveManagerPortraitScreen,
  resolveManagerPortraitTab,
  shouldUseManagerPhoneShell,
} from './managerPortrait'

describe('manager portrait shell', () => {
  it('uses the phone shell for a portrait phone and a squeezed narrow window', () => {
    expect(shouldUseManagerPhoneShell({ width: 390, height: 844, portrait: true, narrow: true })).toBe(true)
    expect(shouldUseManagerPhoneShell({ width: 390, height: 84, portrait: false, narrow: true })).toBe(true)
    expect(shouldUseManagerPhoneShell({
      width: 1280,
      height: 800,
      portrait: true,
      narrow: true,
    })).toBe(true)
  })

  it('uses the full workspace when a phone is sideways', () => {
    expect(shouldUseManagerPhoneShell({ width: 844, height: 390, portrait: false, narrow: false })).toBe(false)
    expect(shouldUseManagerPhoneShell({ width: 667, height: 375, portrait: false, narrow: true })).toBe(false)
    expect(shouldUseManagerPhoneShell({ width: 568, height: 320, portrait: false, narrow: true })).toBe(false)
  })

  it('uses the full workspace when landscape dimensions disagree with a portrait query', () => {
    const previous = globalThis.window
    vi.stubGlobal('window', {
      innerWidth: 568,
      innerHeight: 320,
      matchMedia: (query) => ({
        matches: query.includes('portrait') || query.includes('max-width'),
      }),
    })
    expect(shouldUseManagerPhoneShell()).toBe(false)
    if (previous) vi.stubGlobal('window', previous)
    else vi.unstubAllGlobals()
  })

  it('leaves tablets and desktops on the workspace shell', () => {
    expect(shouldUseManagerPhoneShell({ width: 1280, height: 800, portrait: false, narrow: false })).toBe(false)
    expect(shouldUseManagerPhoneShell({ width: 820, height: 1180, portrait: true, narrow: false })).toBe(false)
    expect(shouldUseManagerPhoneShell({ width: 1024, height: 768, portrait: false, narrow: false })).toBe(false)
  })

  it('keeps the same page when the shell changes', () => {
    expect(resolveManagerPortraitScreen({ activeView: 'reservations' })).toBe('reservations')
    expect(resolveManagerPortraitScreen({ activeView: 'chat' })).toBe('chat')
    expect(resolveManagerPortraitScreen({ activeView: 'operations' })).toBe('tasks')
    expect(resolveManagerPortraitScreen({ activeView: 'stock' })).toBe('stock')
    expect(resolveManagerPortraitScreen({ activeView: 'team', teamSection: 'schedule' })).toBe('schedule')
    expect(resolveManagerPortraitScreen({ activeView: 'team', teamSection: 'members' })).toBe('team')
    expect(resolveManagerPortraitScreen({ activeView: 'time-clock' })).toBe('time-clock')
    expect(resolveManagerPortraitScreen({ activeView: 'settings' })).toBe('settings')
    expect(resolveManagerPortraitScreen({ activeView: 'today', menuScreen: 'profile' })).toBe('profile')
    expect(resolveManagerPortraitTab('reservations')).toBe('reservations')
    expect(resolveManagerPortraitTab('stock')).toBe('more')
    expect(resolveManagerPortraitTab('schedule')).toBe('more')
  })

  it('lists the other areas a manager can open', () => {
    const ids = buildManagerPortraitMoreItems('owner', { canViewLeaveInbox: true }).map((item) => item.id)
    expect(ids).toEqual([
      'schedule',
      'stock',
      'team',
      'time-clock',
      'insights',
      'settings',
      'profile',
      'leave-inbox',
      'notifications',
      'sign-out',
    ])
    expect(ids).not.toContain('today')
    expect(ids).not.toContain('reservations')
    expect(ids).not.toContain('chat')
    expect(ids).not.toContain('tasks')
  })

  it('hides areas the member cannot open', () => {
    const ids = buildManagerPortraitMoreItems({
      role: 'manager',
      permissions: {
        today: 'view',
        stock: 'none',
        team: 'none',
        operations: 'none',
        insights: 'none',
        settings: 'none',
        reservations: 'none',
        attendance: 'none',
      },
    }).map((item) => item.id)
    expect(ids).not.toContain('stock')
    expect(ids).not.toContain('schedule')
    expect(ids).not.toContain('team')
    expect(ids).not.toContain('time-clock')
    expect(ids).toContain('profile')
    expect(ids).toContain('sign-out')
  })

  it('remembers older manager tabs as More', () => {
    expect(normalizeManagerMobileTab('menu')).toBe('more')
    expect(normalizeManagerMobileTab('stock')).toBe('more')
    expect(normalizeManagerMobileTab('reservations')).toBe('reservations')
    expect(normalizeManagerMobileTab('nope')).toBe('today')
  })

  it('lists published tables with a status', () => {
    const rows = buildPortraitFloorTables({
      layout: {
        tables: [
          { id: 't1', label: '12', seats: 4 },
          { id: 't2', displayLabel: 'Bar 1', seatedCapacity: 2 },
        ],
      },
      reservations: [],
      dateKey: '2026-10-27',
      nowMinutes: 12 * 60,
    })
    expect(rows).toEqual([
      { id: 't1', label: '12', seats: 4, status: 'available', guest: '' },
      { id: 't2', label: 'Bar 1', seats: 2, status: 'available', guest: '' },
    ])
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
  TODAY_QUICK_ACTION_MAX,
  availableTodayShortcuts,
  clearStoredTodayShortcutIds,
  defaultTodayShortcutIds,
  readStoredTodayShortcutIds,
  resolveTodayShortcutIds,
  toggleTodayShortcut,
  writeStoredTodayShortcutIds,
} from './todayQuickShortcuts'

function storage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
}

describe('today quick shortcuts', () => {
  it('gives managers and owners the role default, with Operations in place of a missing invoice shortcut', () => {
    const expected = ['reservations', 'stock', 'schedule', 'tasks', 'team-today', 'operations']
    expect(defaultTodayShortcutIds('owner')).toEqual(expected)
    expect(defaultTodayShortcutIds('general_manager')).toEqual(expected)
    expect(defaultTodayShortcutIds('manager')).toEqual(expected)
    expect(expected).not.toContain('invoice')
  })

  it('gives other roles only shortcuts they can open', () => {
    expect(defaultTodayShortcutIds('host')).toEqual([
      'reservations',
      'new-reservation',
      'walk-in',
      'schedule',
      'tasks',
      'chat',
    ])
    expect(defaultTodayShortcutIds('staff')).toEqual([
      'stock',
      'inventory-count',
      'schedule',
      'tasks',
      'chat',
      'clock',
    ])
    expect(availableTodayShortcuts('staff').map((shortcut) => shortcut.id)).not.toEqual(
      expect.arrayContaining(['reservations', 'team-today', 'stock-orders', 'operations']),
    )
    expect(availableTodayShortcuts('host').map((shortcut) => shortcut.id)).not.toContain('stock')
  })

  it('stops at six selected shortcuts', () => {
    const access = 'manager'
    let ids = []
    availableTodayShortcuts(access).forEach((shortcut) => {
      ids = toggleTodayShortcut(ids, shortcut.id, access)
    })
    expect(ids).toHaveLength(TODAY_QUICK_ACTION_MAX)
    expect(toggleTodayShortcut(ids, 'chat', access)).toEqual(ids)
  })

  it('stores the choice per user and venue and ignores shortcuts the role cannot use', () => {
    const box = storage()
    writeStoredTodayShortcutIds('elena', 'venue-a', ['reservations', 'stock', 'chat', 'stock'], box)
    expect(readStoredTodayShortcutIds('elena', 'venue-a', box)).toEqual(['reservations', 'stock', 'chat'])
    expect(readStoredTodayShortcutIds('elena', 'venue-b', box)).toBeNull()
    expect(resolveTodayShortcutIds(
      ['stock-orders', 'reservations', 'walk-in'],
      'staff',
    )).toEqual(defaultTodayShortcutIds('staff'))
    expect(resolveTodayShortcutIds(
      ['chat', 'clock', 'stock-orders'],
      'staff',
    )).toEqual(['chat', 'clock'])
    clearStoredTodayShortcutIds('elena', 'venue-a', box)
    expect(readStoredTodayShortcutIds('elena', 'venue-a', box)).toBeNull()
    expect(resolveTodayShortcutIds(null, 'manager')).toEqual(defaultTodayShortcutIds('manager'))
  })
})

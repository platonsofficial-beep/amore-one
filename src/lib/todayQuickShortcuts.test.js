/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  TODAY_QUICK_ACTION_MAX,
  availableTodayShortcuts,
  clearStoredTodayShortcutIds,
  defaultTodayShortcutIds,
  shortcutIsAllowed,
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
  it('keeps Edit compact, with a gap above the grid and a 44px hit area', () => {
    const css = readFileSync('src/components/today/todayQuickActions.css', 'utf8')
    expect(css).toMatch(/\.today-quick-edit \{[^}]*height:\s*30px/)
    expect(css).toMatch(/\.today-quick-actions \{[^}]*gap:\s*10px/)
    expect(css).toMatch(/\.today-quick-edit::before \{[^}]*height:\s*44px/)
    expect(css).toMatch(/\.today-quick-move button \{[^}]*width:\s*28px/)
    expect(css).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/@media \(min-width: 700px\) and \(min-height: 500px\) \{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
  })

  it('renders the same quick actions on the workspace Today page used by phone landscape and tablets', () => {
    const app = readFileSync('src/App.jsx', 'utf8')
    const header = readFileSync('src/components/today/TodayCommandHeader.jsx', 'utf8')
    const view = app.slice(app.indexOf('function CommandCenterView'), app.indexOf('function toDateInputValue'))
    const quick = view.indexOf('<TodayQuickActions')
    const clock = view.indexOf('today-attendance-clock')
    expect(quick).toBeGreaterThan(-1)
    expect(clock).toBeGreaterThan(quick)
    expect(view).toContain('onRun={onRunTodayShortcut}')
    expect(app).toContain('quickActionAccess={permissionAccess}')
    expect(app).toContain('quickActionWorkspaceId={activeWorkspaceId || \'\'}')
    expect(app).toContain("shortcutId === 'new-task'")
    expect(app).toContain("handleDashboardQuickAction('add-task')")
    expect(app).toContain("handleDashboardQuickAction('add-announcement')")
    expect(app).toContain("handleDashboardQuickAction('create-order')")
    expect(app).toContain("handleDashboardQuickAction('add-reservation')")
    expect(header).not.toContain('today-command-action-pill')
  })

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
    expect(availableTodayShortcuts('manager').map((shortcut) => shortcut.id)).toEqual(
      expect.arrayContaining(['new-reservation', 'new-task', 'new-announcement', 'new-order']),
    )
    expect(shortcutIsAllowed('new-task', 'manager')).toBe(true)
    expect(shortcutIsAllowed('new-announcement', 'manager')).toBe(true)
    expect(shortcutIsAllowed('new-order', 'manager')).toBe(true)
    expect(shortcutIsAllowed('new-task', 'staff')).toBe(false)
    expect(shortcutIsAllowed('new-announcement', 'staff')).toBe(false)
    expect(shortcutIsAllowed('new-order', 'staff')).toBe(false)
    expect(shortcutIsAllowed('new-task', 'host')).toBe(false)
    expect(shortcutIsAllowed('new-announcement', 'host')).toBe(false)
    expect(shortcutIsAllowed('new-order', 'host')).toBe(false)
    expect(defaultTodayShortcutIds('manager')).not.toContain('new-task')
    expect(defaultTodayShortcutIds('manager')).not.toContain('new-announcement')
    expect(defaultTodayShortcutIds('manager')).not.toContain('new-order')
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

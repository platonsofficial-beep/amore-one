/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isStockWorkspaceView,
  resolveExitStockDestination,
  resolveSidebarWorkspaceExit,
  shouldHideStandardTopbar,
  shouldShowModuleSearch,
} from './appNavigation'

describe('Stock full-screen workspace navigation helpers', () => {
  it('identifies Stock as a workspace view', () => {
    expect(isStockWorkspaceView('stock')).toBe(true)
    expect(isStockWorkspaceView('today')).toBe(false)
    expect(isStockWorkspaceView('team')).toBe(false)
  })

  it('hides the standard topbar while Stock is active without changing other modules', () => {
    expect(shouldHideStandardTopbar('stock', 'today')).toBe(true)
    expect(shouldHideStandardTopbar('reservations', 'today')).toBe(true)
    expect(shouldHideStandardTopbar('team', 'schedule')).toBe(true)
    expect(shouldHideStandardTopbar('today', 'today')).toBe(false)
    expect(shouldHideStandardTopbar('team', 'members')).toBe(false)
    expect(shouldHideStandardTopbar('operations', 'dashboard')).toBe(false)
  })

  it('keeps Stock module search enabled for workspace chrome', () => {
    expect(shouldShowModuleSearch('stock', 'dashboard')).toBe(true)
    expect(shouldShowModuleSearch('stock', 'dashboard', 'storages')).toBe(true)
    expect(shouldShowModuleSearch('stock', 'dashboard', 'orders')).toBe(true)
    expect(shouldShowModuleSearch('stock', 'dashboard', 'suppliers')).toBe(true)
    expect(shouldShowModuleSearch('stock', 'dashboard', 'migration')).toBe(true)
  })

  it('resolves Exit Stock to the previous normal-shell destination with Today fallback', () => {
    expect(resolveExitStockDestination('today')).toBe('today')
    expect(resolveExitStockDestination('team')).toBe('team')
    expect(resolveExitStockDestination('operations')).toBe('operations')
    expect(resolveExitStockDestination('stock')).toBe('today')
    expect(resolveExitStockDestination('')).toBe('today')
    expect(resolveExitStockDestination(null)).toBe('today')
  })

  it('returns Exit from Schedule or Stock to the last sidebar page, or Today', () => {
    expect(resolveSidebarWorkspaceExit({ view: 'today', teamSection: 'today' })).toEqual({
      view: 'today',
      teamSection: 'today',
    })
    expect(resolveSidebarWorkspaceExit({ view: 'team', teamSection: 'members' })).toEqual({
      view: 'team',
      teamSection: 'members',
    })
    expect(resolveSidebarWorkspaceExit({ view: 'operations', teamSection: 'tasks' })).toEqual({
      view: 'operations',
      teamSection: 'tasks',
    })
    expect(resolveSidebarWorkspaceExit({ view: 'stock', teamSection: 'dashboard' })).toEqual({
      view: 'today',
      teamSection: 'today',
    })
    expect(resolveSidebarWorkspaceExit({ view: 'team', teamSection: 'schedule' })).toEqual({
      view: 'today',
      teamSection: 'today',
    })
    expect(resolveSidebarWorkspaceExit(null)).toEqual({
      view: 'today',
      teamSection: 'today',
    })
  })
})

import { describe, expect, it } from 'vitest'
import { defaultStockSection, nextStockSearchTerm, resolvePermittedStockSection, resolveStockSectionNav, shouldStaffLandOnTake, stockEntrySection } from './stockSectionNav'

describe('resolveStockSectionNav', () => {
  it('keeps every stock section for managers outside the phone shell', () => {
    const nav = resolveStockSectionNav({ canManage: true, compactPhone: false })

    expect(nav.overflow).toEqual([])
    expect(nav.primary.map((section) => section.id)).toEqual([
      'dashboard',
      'take',
      'count',
      'storages',
      'suppliers',
      'orders',
      'migration',
    ])
    expect(nav.primary.find((section) => section.id === 'count')?.label).toBe('Counts')
  })

  it('puts phone stock tabs on one primary row and keeps the rest in More', () => {
    const nav = resolveStockSectionNav({ canManage: true, compactPhone: true })

    expect(nav.primary.map((section) => section.label)).toEqual([
      'Dashboard',
      'Counts',
      'Storages',
      'Orders',
    ])
    expect(nav.overflow.map((section) => section.label)).toEqual([
      'Take',
      'Orders',
      'Suppliers',
      'Import',
    ])
  })

  it('shows staff only Take and Counts and lands them on Take', () => {
    const desktop = resolveStockSectionNav({ canManage: false, compactPhone: false })
    const phone = resolveStockSectionNav({ canManage: false, compactPhone: true })

    expect(desktop.primary.map((section) => section.id)).toEqual(['take', 'count'])
    expect(desktop.overflow).toEqual([])
    expect(phone.primary.map((section) => section.id)).toEqual(['take', 'count'])
    expect(phone.overflow).toEqual([])
    for (const id of ['dashboard', 'storages', 'suppliers', 'orders', 'migration', 'inventory']) {
      expect(resolvePermittedStockSection(id, false)).toBe('take')
    }
    expect(resolvePermittedStockSection('count', false)).toBe('count')
    expect(defaultStockSection(false)).toBe('take')
    expect(defaultStockSection(true)).toBe('dashboard')
    expect(resolvePermittedStockSection('migration', true)).toBe('migration')
    expect(resolvePermittedStockSection('inventory', true)).toBe('dashboard')
  })

  it('clears stock search when the tab changes and keeps it on the same tab', () => {
    expect(nextStockSearchTerm('dashboard', 'storages', 'vodka')).toBe('')
    expect(nextStockSearchTerm('dashboard', 'dashboard', 'vodka')).toBe('vodka')
  })
})

describe('shouldStaffLandOnTake', () => {
  it('sends staff to Take when they enter Stock', () => {
    expect(shouldStaffLandOnTake({ previousView: 'today', activeView: 'stock', stockSection: 'dashboard' })).toBe(true)
    expect(shouldStaffLandOnTake({ previousView: null, activeView: 'stock', stockSection: 'count' })).toBe(true)
  })
  it('leaves managers and in-Stock tab changes alone', () => {
    expect(shouldStaffLandOnTake({ previousView: 'today', activeView: 'stock', canManage: true, stockSection: 'dashboard' })).toBe(false)
    expect(shouldStaffLandOnTake({ previousView: 'stock', activeView: 'stock', stockSection: 'count' })).toBe(false)
    expect(shouldStaffLandOnTake({ previousView: 'stock', activeView: 'today', stockSection: 'count' })).toBe(false)
  })
})

describe('stockEntrySection (L-06)', () => {
  it('sends managers entering Stock to Dashboard, staff to Take', () => {
    expect(stockEntrySection({ previousView: 'today', activeView: 'stock', canManage: true, stockSection: 'migration' })).toBe('dashboard')
    expect(stockEntrySection({ previousView: null, activeView: 'stock', canManage: true, stockSection: 'count' })).toBe('dashboard')
    expect(stockEntrySection({ previousView: 'today', activeView: 'stock', canManage: false, stockSection: 'count' })).toBe('take')
  })
  it('leaves tabs alone inside Stock or when already on the default', () => {
    expect(stockEntrySection({ previousView: 'stock', activeView: 'stock', canManage: true, stockSection: 'orders' })).toBe(null)
    expect(stockEntrySection({ previousView: 'today', activeView: 'stock', canManage: true, stockSection: 'dashboard' })).toBe(null)
    expect(stockEntrySection({ previousView: 'stock', activeView: 'today', canManage: true, stockSection: 'count' })).toBe(null)
  })
})

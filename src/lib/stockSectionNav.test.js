import { describe, expect, it } from 'vitest'
import { nextStockSearchTerm, resolvePermittedStockSection, resolveStockSectionNav, shouldStaffLandOnTake } from './stockSectionNav'

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

  it('hides import from staff without removing suppliers', () => {
    const desktop = resolveStockSectionNav({ canManage: false, compactPhone: false })
    const phone = resolveStockSectionNav({ canManage: false, compactPhone: true })

    expect(desktop.primary.map((section) => section.id)).toEqual([
      'dashboard',
      'take',
      'count',
      'storages',
      'suppliers',
      'orders',
    ])
    expect(phone.primary.map((section) => section.id)).toEqual(['take', 'dashboard', 'count', 'storages'])
    expect(phone.overflow.map((section) => section.id)).toEqual(['orders', 'suppliers'])
    expect(resolvePermittedStockSection('migration', false)).toBe('dashboard')
    expect(resolvePermittedStockSection('inventory', false)).toBe('dashboard')
    expect(resolvePermittedStockSection('orders', false)).toBe('orders')
    expect(resolvePermittedStockSection('migration', true)).toBe('migration')
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

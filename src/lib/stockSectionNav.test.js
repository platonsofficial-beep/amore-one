import { describe, expect, it } from 'vitest'
import { nextStockSearchTerm, resolvePermittedStockSection, resolveStockSectionNav } from './stockSectionNav'

describe('resolveStockSectionNav', () => {
  it('keeps every stock section for managers outside the phone shell', () => {
    const nav = resolveStockSectionNav({ canManage: true, compactPhone: false })

    expect(nav.overflow).toEqual([])
    expect(nav.primary.map((section) => section.id)).toEqual([
      'dashboard',
      'count',
      'storages',
      'suppliers',
      'orders',
      'migration',
    ])
    expect(nav.primary.find((section) => section.id === 'count')?.label).toBe('Inventory Count')
  })

  it('puts phone stock tabs on one primary row and keeps the rest in More', () => {
    const nav = resolveStockSectionNav({ canManage: true, compactPhone: true })

    expect(nav.primary.map((section) => section.label)).toEqual([
      'Dashboard',
      'Count',
      'Storages',
      'Orders',
    ])
    expect(nav.overflow.map((section) => section.label)).toEqual([
      'Suppliers',
      'Import',
    ])
  })

  it('hides import from staff without removing suppliers', () => {
    const desktop = resolveStockSectionNav({ canManage: false, compactPhone: false })
    const phone = resolveStockSectionNav({ canManage: false, compactPhone: true })

    expect(desktop.primary.map((section) => section.id)).toEqual([
      'dashboard',
      'count',
      'storages',
      'suppliers',
      'orders',
    ])
    expect(phone.overflow.map((section) => section.id)).toEqual(['suppliers'])
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

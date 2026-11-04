/** Stock audit S-04 / S-15 — inactive suppliers and order-card supplier names. */
import { describe, expect, it } from 'vitest'
import {
  buildSupplierOrderGroups,
  isStockItemSupplierInactive,
  resolveOrderGroupIdentity,
  resolveStockOrderSupplierName,
} from './stockOrderUtils'
import { buildToOrderSupplierGroups } from './stockInsights'

const suppliers = [
  { id: 's-active', companyName: 'Cyprus Beverages', active: true },
  { id: 's-off', companyName: 'Kitchen Wholesale', active: false },
]
const item = (id, supplierId, supplier) => ({
  id, name: id, supplierId, supplier, unit: 'Bottle', active: true,
  currentQuantity: 0, minimumQuantity: 5, targetQuantity: 10, costPrice: 2,
})

describe('inactive suppliers (S-04)', () => {
  it('detects an item whose supplier is inactive', () => {
    expect(isStockItemSupplierInactive(item('a', 's-off'), suppliers)).toBe(true)
    expect(isStockItemSupplierInactive(item('a', 's-active'), suppliers)).toBe(false)
    expect(isStockItemSupplierInactive(item('a', null, 'Text only'), suppliers)).toBe(false)
  })

  it('never groups an order under an inactive supplier', () => {
    expect(resolveOrderGroupIdentity(item('a', 's-off', 'Kitchen Wholesale'), suppliers).supplierId).toBeNull()
    const groups = buildSupplierOrderGroups([item('a', 's-off', 'Kitchen Wholesale'), item('b', 's-active', 'Cyprus Beverages')], suppliers)
    const names = groups.map((group) => group.supplier)
    expect(names).toContain('Cyprus Beverages')
    expect(names).not.toContain('Kitchen Wholesale')
    expect(groups.some((group) => group.supplierId === 's-off')).toBe(false)
  })

  it('keeps old behaviour when no supplier directory is passed', () => {
    const groups = buildSupplierOrderGroups([item('a', 's-off', 'Kitchen Wholesale')])
    expect(groups[0].supplierId).toBe('s-off')
  })

  it('To order card lists inactive-supplier items under No supplier', () => {
    const groups = buildToOrderSupplierGroups([item('a', 's-off', 'Kitchen Wholesale'), item('b', 's-active', 'Cyprus Beverages')], suppliers)
    const names = groups.map((group) => group.supplier)
    expect(names).not.toContain('Kitchen Wholesale')
    expect(names).toContain('No supplier')
  })
})

describe('order card supplier name (S-15)', () => {
  it('prefers saved text, else falls back to the directory name by supplier_id', () => {
    expect(resolveStockOrderSupplierName({ supplier: 'Saved Ltd', supplierId: 's-active' }, suppliers)).toBe('Saved Ltd')
    expect(resolveStockOrderSupplierName({ supplier: '', supplierId: 's-active' }, suppliers)).toBe('Cyprus Beverages')
    expect(resolveStockOrderSupplierName({ supplier: '', supplierId: 'missing' }, suppliers)).toBe('')
  })
})

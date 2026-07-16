import { describe, expect, it } from 'vitest'
import {
  buildSupplierMetrics,
  getStockItemsForSupplier,
  getStockOrdersForSupplier,
  stockRecordMatchesSupplier,
  supplierHasHistory,
} from './stockSupplierUtils'

const supplierA = { id: 10, companyName: 'Malakakos AE' }
const supplierB = { id: 20, companyName: 'Wine House' }

describe('stockRecordMatchesSupplier (FK-first)', () => {
  it('matches by supplier_id when present', () => {
    expect(stockRecordMatchesSupplier(
      { id: 'i1', supplierId: 10, supplier: 'Other Text' },
      supplierA,
    )).toBe(true)
  })

  it('does not match text when FK points elsewhere', () => {
    expect(stockRecordMatchesSupplier(
      { id: 'i1', supplierId: 20, supplier: 'Malakakos AE' },
      supplierA,
    )).toBe(false)
  })

  it('falls back to text when FK missing', () => {
    expect(stockRecordMatchesSupplier(
      { id: 'i1', supplierId: null, supplier: 'Malakakos AE' },
      supplierA,
    )).toBe(true)
  })

  it('is null-safe', () => {
    expect(stockRecordMatchesSupplier(null, supplierA)).toBe(false)
    expect(stockRecordMatchesSupplier({ supplier: 'X' }, null)).toBe(false)
  })
})

describe('FK history / metrics / delete guard', () => {
  it('FK history counts items and orders by id', () => {
    const items = [
      { id: 'i1', supplierId: 10, supplier: 'Wrong Text' },
      { id: 'i2', supplierId: 20, supplier: 'Wine House' },
    ]
    const orders = [
      { id: 'o1', supplierId: 10, supplier: 'Wrong Name', status: 'draft', totalCost: 0, items: [] },
    ]

    const metrics = buildSupplierMetrics(supplierA, items, orders)
    expect(metrics.productsCount).toBe(1)
    expect(metrics.totalOrders).toBe(1)
    expect(metrics.linkedItems[0].id).toBe('i1')
  })

  it('legacy text fallback when supplier_id is null', () => {
    const items = [
      { id: 'i1', supplierId: null, supplier: 'Malakakos AE' },
    ]
    const metrics = buildSupplierMetrics(supplierA, items, [])
    expect(metrics.productsCount).toBe(1)
  })

  it('FK precedence: text match ignored when FK differs', () => {
    const items = [
      { id: 'i1', supplierId: 20, supplier: 'Malakakos AE' },
    ]
    expect(getStockItemsForSupplier(items, supplierA)).toHaveLength(0)
    expect(getStockItemsForSupplier(items, supplierB)).toHaveLength(1)
  })

  it('never double-counts FK + text for the same record', () => {
    const items = [
      { id: 'i1', supplierId: 10, supplier: 'Malakakos AE' },
    ]
    const linked = getStockItemsForSupplier(items, supplierA)
    expect(linked).toHaveLength(1)
  })

  it('missing supplier yields no history', () => {
    expect(supplierHasHistory(supplierA, {
      stockItems: [{ id: 'i1', supplierId: 20, supplier: 'Wine House' }],
      stockOrders: [],
      inventoryItems: [],
    })).toBe(false)
  })

  it('delete guard: FK-linked supplier has history', () => {
    expect(supplierHasHistory(supplierA, {
      stockItems: [{ id: 'i1', supplierId: 10, supplier: 'Anything' }],
      stockOrders: [],
      inventoryItems: [],
    })).toBe(true)
  })

  it('delete guard: legacy text-linked supplier still protected', () => {
    expect(supplierHasHistory(supplierA, {
      stockItems: [],
      stockOrders: [],
      inventoryItems: [{ id: 'inv1', supplier: 'Malakakos AE' }],
    })).toBe(true)
  })

  it('string overload stays text-only (reports compatibility)', () => {
    const items = [
      { id: 'i1', supplierId: 20, supplier: 'Malakakos AE' },
    ]
    // Text-only: still matches by name even when FK points elsewhere
    expect(getStockItemsForSupplier(items, 'Malakakos AE')).toHaveLength(1)
    expect(getStockOrdersForSupplier(
      [{ id: 'o1', supplierId: null, supplier: 'Wine House' }],
      'Wine House',
    )).toHaveLength(1)
  })
})

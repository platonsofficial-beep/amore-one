import { describe, expect, it } from 'vitest'
import { storageParShort } from './stockStoragePar'
import { computeSuggestedOrder } from './stockCatalog'
import { applyStockMovementQuantity, buildStockDashboardSummary, resolveStockItemStatus } from './stockUtils'
import { buildStorageProductRows } from '../services/stockStorageCenterService'

describe('minus balances (quick take beyond stock)', () => {
  it('orders up to par as if the minus were 0', () => {
    expect(storageParShort(20, -6)).toBe(20)
    expect(computeSuggestedOrder({ currentQuantity: -6, targetQuantity: 20 })).toBe(20)
  })
  it('flags a minus as out of stock', () => {
    expect(resolveStockItemStatus({ currentQuantity: -6, minimumQuantity: 5 })).toBe('out')
  })
  it('never lowers inventory value', () => {
    const summary = buildStockDashboardSummary([
      { id: 'a', currentQuantity: -6, costPrice: 10, active: true },
      { id: 'b', currentQuantity: 2, costPrice: 10, active: true },
    ])
    expect(summary.totalValue).toBe(20)
    const rows = buildStorageProductRows({ balances: [{ stock_item_id: 'a', quantity: -6, quantity_version: 2 }], items: [{ id: 'a', name: 'Wine', cost_price: 10 }] })
    expect(rows[0].quantity).toBe(-6)
    expect(rows[0].lineValue).toBe(0)
  })
  it('history shows the real minus, legacy writes keep the 0 floor', () => {
    expect(applyStockMovementQuantity(4, 'usage', 10, { allowNegative: true })).toBe(-6)
    expect(applyStockMovementQuantity(4, 'usage', 10)).toBe(0)
    expect(applyStockMovementQuantity(-6, 'receive', 12, { allowNegative: true })).toBe(6)
  })
})

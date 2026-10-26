import { describe, expect, it } from 'vitest'
import { formatStockMovementHeadline } from './stockProductHistory'

describe('formatStockMovementHeadline', () => {
  it('shows a stock count as before → after', () => {
    expect(formatStockMovementHeadline({
      type: 'stock_count',
      quantity: 4,
      quantityBefore: 0,
      quantityAfter: 4,
    }, 'Bottle')).toBe('Count 0 Bottle → 4 Bottle')
  })

  it('shows an adjustment as before → after', () => {
    expect(formatStockMovementHeadline({
      type: 'adjustment',
      quantity: -2,
      quantityBefore: 6,
      quantityAfter: 4,
    }, 'Bottle')).toBe('Adjustment 6 Bottle → 4 Bottle')
  })

  it('does not use Set to when a count has no before and after', () => {
    expect(formatStockMovementHeadline({
      type: 'stock_count',
      quantity: 4,
    }, 'Bottle')).toBe('Counted 4 Bottle')
  })
})

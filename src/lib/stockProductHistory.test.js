import { describe, expect, it } from 'vitest'
import { formatLastCountedLabel, formatStockMovementHeadline, formatStockMovementTypeLabel, resolveLastCountedRecord } from './stockProductHistory'

describe('formatStockMovementHeadline', () => {
  it('shows a stock count as before → after', () => {
    expect(formatStockMovementHeadline({
      type: 'stock_count',
      quantity: 4,
      quantityBefore: 0,
      quantityAfter: 4,
    }, 'Bottle')).toBe('Count 0 Bottle → 4 Bottle')
  })

  it('labels a waste usage movement as waste', () => {
    const movement = { type: 'usage', quantity: 1, note: 'Waste · Broken' }
    expect(formatStockMovementTypeLabel(movement.type, movement.note)).toBe('Waste')
    expect(formatStockMovementHeadline(movement, 'Bottle')).toBe('Waste −1 Bottle')
  })

  it('shows an adjustment as before → after', () => {
    expect(formatStockMovementHeadline({
      type: 'adjustment',
      quantity: -2,
      quantityBefore: 6,
      quantityAfter: 4,
    }, 'Bottle')).toBe('Adjustment 6 Bottle → 4 Bottle')
  })

  it('derives last counted from the newest stock count in history', () => {
    const record = resolveLastCountedRecord([
      { type: 'receive', createdAt: '2026-10-20T10:00:00.000Z', quantity: 6 },
      {
        type: 'stock_count',
        createdAt: '2026-10-18T09:00:00.000Z',
        quantity: 24,
        destinationLocationKey: 'Cellar',
      },
      {
        type: 'stock_count',
        createdAt: '2026-10-25T15:00:00.000Z',
        quantity: 24,
        destinationLocationKey: 'Bar',
      },
    ], null, { locationKey: 'Cellar' })

    expect(record.createdAt).toBe('2026-10-18T09:00:00.000Z')
    expect(formatLastCountedLabel(record, new Date('2026-10-26T12:00:00.000Z'))).not.toBe('Never')
  })

  it('uses the latest count when the shown location has none', () => {
    const record = resolveLastCountedRecord([
      { type: 'stock_count', createdAt: '2026-10-25T00:00:00.000Z', destinationLocationKey: 'Bar' },
    ], null, { locationKey: 'Main Storage' })

    expect(formatLastCountedLabel(record, new Date('2026-10-26T12:00:00.000Z'))).toBe('1 day ago')
    expect(formatLastCountedLabel(resolveLastCountedRecord([], null))).toBe('Never')
  })

  it('does not use Set to when a count has no before and after', () => {
    expect(formatStockMovementHeadline({
      type: 'stock_count',
      quantity: 4,
    }, 'Bottle')).toBe('Counted 4 Bottle')
  })
})

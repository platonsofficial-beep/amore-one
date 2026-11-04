/** Stock audit S-18 — unit label next to a quantity agrees with it. */
import { describe, expect, it } from 'vitest'
import { formatInventoryUnitLabelForQuantity } from './inventoryUnitDisplay'

describe('formatInventoryUnitLabelForQuantity', () => {
  it('pluralizes countable units except for 1', () => {
    expect(formatInventoryUnitLabelForQuantity(20, 'bottle')).toBe('Bottles')
    expect(formatInventoryUnitLabelForQuantity(1, 'bottle')).toBe('Bottle')
    expect(formatInventoryUnitLabelForQuantity(0, 'Bottle')).toBe('Bottles')
  })
  it('never pluralizes measured units and keeps unknown units as typed', () => {
    expect(formatInventoryUnitLabelForQuantity(5, 'kg')).toBe('kg')
    expect(formatInventoryUnitLabelForQuantity(3, 'tray')).toMatch(/^tray/i)
    expect(formatInventoryUnitLabelForQuantity(3, '')).toBe('')
  })
})

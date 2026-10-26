import { describe, expect, it } from 'vitest'
import { formatInventoryCountItemLabel } from './inventoryCountItemName'

describe('formatInventoryCountItemLabel', () => {
  it('joins brand, product name, and size for the count list', () => {
    expect(formatInventoryCountItemLabel({
      itemName: '12 Stars',
      productName: '12 Stars',
      brand: 'Metaxa',
      size: '700 ml',
    })).toBe('Metaxa 12 Stars 700 ml')
    expect(formatInventoryCountItemLabel({
      itemName: 'Blanco',
      brand: 'Olmeca',
    })).toBe('Olmeca Blanco')
    expect(formatInventoryCountItemLabel({
      itemName: 'Vodka',
      productName: 'Vodka',
      brand: 'Belvedere',
      size: '1 L',
    })).toBe('Belvedere Vodka 1 L')
  })

  it('keeps the frozen session name when brand and size are missing', () => {
    expect(formatInventoryCountItemLabel({ itemName: 'Coca-Cola' })).toBe('Coca-Cola')
    expect(formatInventoryCountItemLabel({})).toBe('Untitled item')
  })
})

import { describe, expect, it } from 'vitest'
import {
  STOCK_CATEGORIES,
  STOCK_DEFAULT_LOCATION_BY_CATEGORY,
  STOCK_DEFAULT_UNIT_BY_CATEGORY,
  STOCK_TYPES_BY_CATEGORY,
  getStockTypeOptionsForCategory,
  normalizeStockCategory,
} from './stockCatalog'

describe('food stock categories', () => {
  it('adds Vegetables and Meat and Seafood without moving Fresh items', () => {
    expect(STOCK_CATEGORIES).toEqual([
      'Spirits',
      'Syrups & Purées',
      'Beverages',
      'Wine',
      'Fresh',
      'Vegetables',
      'Meat and Seafood',
      'Consumables',
      'Other',
    ])
    expect(normalizeStockCategory('Fresh')).toBe('Fresh')
    expect(getStockTypeOptionsForCategory('Fresh')).toEqual([
      'Citrus',
      'Fruit',
      'Herbs',
      'Dairy',
      'Garnish',
      'Other',
    ])
    expect(STOCK_TYPES_BY_CATEGORY.Vegetables).toContain('Leafy greens')
    expect(STOCK_TYPES_BY_CATEGORY['Meat and Seafood']).toContain('Shellfish')
    expect(STOCK_DEFAULT_UNIT_BY_CATEGORY.Vegetables).toBe('Kilogram')
    expect(STOCK_DEFAULT_LOCATION_BY_CATEGORY['Meat and Seafood']).toBe('Fridge')
  })
})

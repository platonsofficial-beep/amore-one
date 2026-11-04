import { describe, expect, it } from 'vitest'
import { formatSupplierDisplayName, resolveStockOrderSupplierName, NO_SUPPLIER_LABEL } from './stockOrderUtils'
import { formatStockCategoryTypeLine } from './stockCatalog'

describe('Stock naming (batch C)', () => {
  it('shows one label for no supplier', () => {
    expect(formatSupplierDisplayName('Unassigned supplier')).toBe(NO_SUPPLIER_LABEL)
    expect(formatSupplierDisplayName('')).toBe('No supplier')
    expect(formatSupplierDisplayName('Cyprus Beverages')).toBe('Cyprus Beverages')
    expect(resolveStockOrderSupplierName({ supplier: 'Unassigned supplier' })).toBe('No supplier')
  })
  it('hides the "Other" type in the category line', () => {
    expect(formatStockCategoryTypeLine('Spirits', 'Other')).toBe('Spirits')
  })
})

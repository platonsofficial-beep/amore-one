/**
 * P8.31.6b — Product Create/Edit Metadata Wiring
 */
import { describe, expect, it } from 'vitest'
import {
  PRODUCT_METADATA_LIMITS,
  buildEmptyStockItemForm,
  normalizeProductBarcode,
  normalizeProductBrand,
  normalizeProductSize,
  stockFormToPayload,
  stockItemToForm,
  validateStockItemForm,
} from './stockCatalog.js'
import { serializeStockItem } from '../services/stockItemService.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('product metadata normalize helpers', () => {
  it('trims, nulls empty, and enforces max lengths', () => {
    expect(normalizeProductBrand('  Belvedere  ')).toBe('Belvedere')
    expect(normalizeProductBrand('')).toBeNull()
    expect(normalizeProductBrand('   ')).toBeNull()
    expect(normalizeProductBrand(null)).toBeNull()
    expect(normalizeProductBrand('x'.repeat(PRODUCT_METADATA_LIMITS.brand + 10)))
      .toHaveLength(PRODUCT_METADATA_LIMITS.brand)

    expect(normalizeProductSize('  700 ml  ')).toBe('700 ml')
    expect(normalizeProductSize('')).toBeNull()
    expect(normalizeProductSize('x'.repeat(PRODUCT_METADATA_LIMITS.size + 5)))
      .toHaveLength(PRODUCT_METADATA_LIMITS.size)

    expect(normalizeProductBarcode('  1234567890123  ')).toBe('1234567890123')
    expect(normalizeProductBarcode(null)).toBeNull()
    expect(normalizeProductBarcode('x'.repeat(PRODUCT_METADATA_LIMITS.barcode + 3)))
      .toHaveLength(PRODUCT_METADATA_LIMITS.barcode)
  })
})

describe('product form metadata save/load', () => {
  it('starts with empty optional metadata on new forms', () => {
    const form = buildEmptyStockItemForm('Spirits')
    expect(form.brand).toBe('')
    expect(form.size).toBe('')
    expect(form.barcode).toBe('')
    expect(form.packagingNote).toBe('')
    expect(validateStockItemForm({
      ...form,
      name: 'Belvedere Vodka',
      currentQuantity: '18',
      minimumQuantity: '6',
    })).toBe('')
  })

  it('round-trips brand/size/barcode/packaging without changing unit or qty', () => {
    const form = stockItemToForm({
      name: 'Belvedere Vodka',
      brand: '  Belvedere  ',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle',
      size: '  1 L  ',
      packagingNote: 'Usually supplied in cases of 6',
      barcode: '  5901234123457  ',
      currentQuantity: 18,
      minimumQuantity: 6,
      costPrice: 30,
      storageLocation: 'Main Storage',
    })

    expect(form.brand).toBe('Belvedere')
    expect(form.size).toBe('1 L')
    expect(form.barcode).toBe('5901234123457')
    expect(form.packagingNote).toBe('Usually supplied in cases of 6')
    expect(form.unitPreset).toBe('Bottle')
    expect(form.currentQuantity).toBe(18)

    const payload = stockFormToPayload(form)
    expect(payload.brand).toBe('Belvedere')
    expect(payload.size).toBe('1 L')
    expect(payload.barcode).toBe('5901234123457')
    expect(payload.packagingNote).toBe('Usually supplied in cases of 6')
    expect(payload.unit).toBe('Bottle')
    expect(payload.currentQuantity).toBe(18)
  })

  it('serializes blank metadata as null', () => {
    const payload = stockFormToPayload({
      ...buildEmptyStockItemForm('Spirits'),
      name: 'Item',
      brand: '   ',
      size: '',
      barcode: null,
      packagingNote: '  ',
      currentQuantity: '12',
      minimumQuantity: '2',
    })
    expect(payload.brand).toBeNull()
    expect(payload.size).toBeNull()
    expect(payload.barcode).toBeNull()
    expect(payload.packagingNote).toBeNull()
    expect(payload.currentQuantity).toBe(12)
    expect(payload.unit).toBe('Bottle')
  })
})

describe('serializeStockItem product metadata', () => {
  it('writes normalized metadata columns without inventing quantity multipliers', () => {
    const payload = serializeStockItem({
      name: 'Coca-Cola Glass 250ml',
      brand: 'Coca-Cola',
      category: 'Beverages',
      itemType: 'Soft Drink',
      unit: 'Bottle',
      size: '250 ml',
      packagingNote: 'Often delivered in cases of 24',
      barcode: '5449000000996',
      currentQuantity: 48,
      minimumQuantity: 12,
      costPrice: 0.45,
      storageLocation: 'Main Storage',
    }, 'ws-1', { supplierId: null })

    expect(payload.brand).toBe('Coca-Cola')
    expect(payload.size).toBe('250 ml')
    expect(payload.barcode).toBe('5449000000996')
    expect(payload.packaging_note).toBe('Often delivered in cases of 24')
    expect(payload.unit).toBe('Bottle')
    expect(payload.current_quantity).toBe(48)
  })

  it('defaults missing metadata to null', () => {
    const payload = serializeStockItem({
      name: 'Item',
      unit: 'Can',
      currentQuantity: 96,
      minimumQuantity: 24,
    }, 'ws-1', { supplierId: null })

    expect(payload).toMatchObject({
      brand: null,
      size: null,
      barcode: null,
      packaging_note: null,
      unit: 'Can',
      current_quantity: 96,
    })
  })
})

describe('StockItemFormModal section layout contract', () => {
  it('exposes Identity / Inventory / Purchasing / Storage sections', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/stock/StockItemFormModal.jsx'),
      'utf8',
    )
    expect(source).toContain('title="Identity"')
    expect(source).toContain('title="Inventory"')
    expect(source).toContain('title="Purchasing"')
    expect(source).toContain('title="Storage"')
    expect(source).toContain('Product Name')
    expect(source).toContain('Subcategory')
    expect(source).toContain('Inventory Unit')
    expect(source).toContain('Default Storage')
    expect(source).toContain('Minimum')
    expect(source).toContain('Target')
    expect(source).toContain('Current')
  })
})

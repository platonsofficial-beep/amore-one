/**
 * P8.31.3 — Packaging Metadata Foundation
 */
import { describe, expect, it } from 'vitest'
import {
  PACKAGING_NOTE_CONTRACT,
  normalizePackagingNote,
} from './inventoryUnitStandard.js'
import {
  buildEmptyStockItemForm,
  stockFormToPayload,
  stockItemToForm,
  validateStockItemForm,
} from './stockCatalog.js'
import { serializeStockItem } from '../services/stockItemService.js'

describe('normalizePackagingNote', () => {
  it('is optional and returns null for missing values', () => {
    expect(normalizePackagingNote(null)).toBeNull()
    expect(normalizePackagingNote(undefined)).toBeNull()
  })

  it('trims surrounding and collapsed whitespace', () => {
    expect(normalizePackagingNote('  Usually supplied in cases.  ')).toBe(
      'Usually supplied in cases.',
    )
    expect(normalizePackagingNote('Usually   arrives\nin Case 24')).toBe(
      'Usually arrives in Case 24',
    )
  })

  it('treats empty / whitespace-only as null', () => {
    expect(normalizePackagingNote('')).toBeNull()
    expect(normalizePackagingNote('   ')).toBeNull()
    expect(normalizePackagingNote('\n\t')).toBeNull()
  })

  it('enforces max length from packaging note contract', () => {
    const long = 'x'.repeat(PACKAGING_NOTE_CONTRACT.maxLength + 40)
    const normalized = normalizePackagingNote(long)
    expect(normalized).toHaveLength(PACKAGING_NOTE_CONTRACT.maxLength)
  })

  it('preserves free-text examples without inventing multipliers', () => {
    for (const example of PACKAGING_NOTE_CONTRACT.examples) {
      expect(normalizePackagingNote(example)).toBe(example)
    }
  })
})

describe('product form packaging note save/load', () => {
  it('starts empty/optional on new product forms', () => {
    const form = buildEmptyStockItemForm('Spirits')
    expect(form.packagingNote).toBe('')
    expect(validateStockItemForm({
      ...form,
      name: 'Belvedere Vodka',
      currentQuantity: '42',
      minimumQuantity: '6',
    })).toBe('')
  })

  it('round-trips packaging note through form mapping without changing unit/qty', () => {
    const form = stockItemToForm({
      name: 'Belvedere Vodka',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle',
      packagingNote: '  Usually supplied in cases.  ',
      currentQuantity: 42,
      minimumQuantity: 6,
      costPrice: 30,
      storageLocation: 'Main Storage',
    })

    expect(form.packagingNote).toBe('Usually supplied in cases.')
    expect(form.unitPreset).toBe('Bottle')
    expect(form.currentQuantity).toBe(42)

    const payload = stockFormToPayload(form)
    expect(payload.packagingNote).toBe('Usually supplied in cases.')
    expect(payload.unit).toBe('Bottle')
    expect(payload.currentQuantity).toBe(42)
  })

  it('serializes blank packaging note as null without touching inventory fields', () => {
    const withBlank = stockFormToPayload({
      ...buildEmptyStockItemForm('Spirits'),
      name: 'Belvedere Vodka',
      packagingNote: '   ',
      currentQuantity: '18',
      minimumQuantity: '4',
    })
    expect(withBlank.packagingNote).toBeNull()
    expect(withBlank.currentQuantity).toBe(18)
    expect(withBlank.unit).toBe('Bottle')

    const withNull = stockFormToPayload({
      ...buildEmptyStockItemForm('Spirits'),
      name: 'Belvedere Vodka',
      packagingNote: null,
      currentQuantity: '18',
      minimumQuantity: '4',
    })
    expect(withNull.packagingNote).toBeNull()
    expect(withNull.currentQuantity).toBe(18)
  })

  it('loads null packaging_note from persistence as empty form text', () => {
    const form = stockItemToForm({
      name: 'Item',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle',
      packaging_note: null,
      currentQuantity: 1,
      minimumQuantity: 0,
      storageLocation: 'Main Storage',
    })
    expect(form.packagingNote).toBe('')
  })
})

describe('serializeStockItem packaging_note', () => {
  it('writes normalized packaging_note and leaves quantities unchanged', () => {
    const payload = serializeStockItem({
      name: 'Belvedere Vodka',
      category: 'Spirits',
      itemType: 'Vodka',
      supplier: 'Supplier',
      unit: 'Bottle',
      packagingNote: '  Loose bottles accepted.  ',
      currentQuantity: 42,
      minimumQuantity: 6,
      costPrice: 30,
      storageLocation: 'Main Storage',
    }, 'ws-1', { supplierId: null })

    expect(payload.packaging_note).toBe('Loose bottles accepted.')
    expect(payload.unit).toBe('Bottle')
    expect(payload.current_quantity).toBe(42)
    expect(payload.minimum_quantity).toBe(6)
  })

  it('defaults missing packaging note to null without inventing inventory behavior', () => {
    const payload = serializeStockItem({
      name: 'Belvedere Vodka',
      unit: 'Bottle',
      currentQuantity: 12,
      minimumQuantity: 2,
    }, 'ws-1', { supplierId: null })

    expect(payload).toHaveProperty('packaging_note', null)
    expect(payload.current_quantity).toBe(12)
    expect(payload.unit).toBe('Bottle')
  })

  it('does not multiply quantity from packaging wording', () => {
    const payload = serializeStockItem({
      name: 'Wine',
      unit: 'Bottle',
      packagingNote: 'Usually arrives in Case 24',
      currentQuantity: 6,
      minimumQuantity: 1,
    }, 'ws-1', { supplierId: null })

    expect(payload.current_quantity).toBe(6)
    expect(payload.packaging_note).toBe('Usually arrives in Case 24')
  })
})

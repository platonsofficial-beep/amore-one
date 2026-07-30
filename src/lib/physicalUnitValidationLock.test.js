/**
 * P8.31.6c — Physical Unit Validation Lock
 */
import { describe, expect, it } from 'vitest'
import {
  PRODUCT_CREATE_EDIT_INVENTORY_UNIT_ERROR,
  PRODUCT_CREATE_EDIT_LEGACY_COMPOSITE_UNIT_ERROR,
  SELECTABLE_INVENTORY_UNIT_PRESETS,
  resolveProductCreateEditInventoryUnit,
} from './inventoryUnitStandard.js'
import {
  STOCK_GENERAL_UNIT_PRESETS,
  buildEmptyStockItemForm,
  stockFormToPayload,
  stockItemToForm,
  validateStockItemForm,
} from './stockCatalog.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function validBaseForm(overrides = {}) {
  return {
    ...buildEmptyStockItemForm('Spirits'),
    name: 'Belvedere Vodka',
    currentQuantity: '18',
    minimumQuantity: '6',
    ...overrides,
  }
}

describe('resolveProductCreateEditInventoryUnit — accepted canonical', () => {
  it.each([...SELECTABLE_INVENTORY_UNIT_PRESETS])('accepts %s', (unit) => {
    const result = resolveProductCreateEditInventoryUnit({ proposedUnit: unit })
    expect(result.ok).toBe(true)
    expect(result.unitToSave).toBe(unit)
    expect(result.error).toBe('')
  })
})

describe('resolveProductCreateEditInventoryUnit — packaging rejected', () => {
  it.each([
    'Case',
    'Case 6',
    'Case 24',
    'Case 6 bottles',
    'Case of 24',
    'Carton',
    'Tray',
    'Pallet',
    'Box of 24',
  ])('rejects %s', (unit) => {
    const result = resolveProductCreateEditInventoryUnit({ proposedUnit: unit })
    expect(result.ok).toBe(false)
    expect(result.unitToSave).toBeNull()
    expect(result.error).toBe(PRODUCT_CREATE_EDIT_INVENTORY_UNIT_ERROR)
  })
})

describe('resolveProductCreateEditInventoryUnit — ambiguous / unknown rejected', () => {
  it.each([
    'Pack',
    'Box',
    'Bag',
    'Container',
    'Portion',
    'Widget',
    'xyz-custom-unit',
  ])('rejects %s', (unit) => {
    const result = resolveProductCreateEditInventoryUnit({ proposedUnit: unit })
    expect(result.ok).toBe(false)
    expect(result.error).toBe(PRODUCT_CREATE_EDIT_INVENTORY_UNIT_ERROR)
  })
})

describe('size separation — composites cannot be newly saved as unit', () => {
  it('rejects Bottle 700ml as a new unit and accepts Bottle + Size', () => {
    const blocked = resolveProductCreateEditInventoryUnit({
      proposedUnit: 'Bottle 700ml',
      persistedUnit: '',
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toBe(PRODUCT_CREATE_EDIT_LEGACY_COMPOSITE_UNIT_ERROR)

    const form = validBaseForm({
      unitPreset: 'Bottle',
      customUnit: '',
      size: '700 ml',
      persistedUnit: '',
    })
    expect(validateStockItemForm(form)).toBe('')
    const payload = stockFormToPayload(form)
    expect(payload.unit).toBe('Bottle')
    expect(payload.size).toBe('700 ml')
    expect(payload.currentQuantity).toBe(18)
  })

  it('rejects Can 330ml as a new unit and accepts Can + Size', () => {
    expect(resolveProductCreateEditInventoryUnit({
      proposedUnit: 'Can 330ml',
      persistedUnit: '',
    }).ok).toBe(false)

    const form = validBaseForm({
      category: 'Beverages',
      itemType: 'Soft Drink',
      unitPreset: 'Can',
      size: '330 ml',
      persistedUnit: '',
    })
    // Soft Drink may not be valid for Beverages — use a valid type from options if needed
    const payloadReady = {
      ...buildEmptyStockItemForm('Beverages'),
      name: 'Red Bull',
      unitPreset: 'Can',
      size: '330 ml',
      currentQuantity: '96',
      minimumQuantity: '24',
    }
    expect(validateStockItemForm(payloadReady)).toBe('')
    const payload = stockFormToPayload(payloadReady)
    expect(payload.unit).toBe('Can')
    expect(payload.size).toBe('330 ml')
  })
})

describe('edit compatibility — legacy unit preserve / canonical change', () => {
  it('loads a legacy composite product without rewriting unit', () => {
    const form = stockItemToForm({
      name: 'Ketel One',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle 700ml',
      packagingNote: 'Usually supplied in cases',
      brand: 'Ketel One',
      currentQuantity: 12,
      minimumQuantity: 4,
      costPrice: 20,
      storageLocation: 'Main Storage',
    })

    expect(form.persistedUnit).toBe('Bottle 700ml')
    expect(form.customUnit).toBe('Bottle 700ml')
    expect(form.packagingNote).toBe('Usually supplied in cases')
    expect(form.brand).toBe('Ketel One')
    expect(form.currentQuantity).toBe(12)
  })

  it('preserves legacy unit when saving unrelated metadata', () => {
    const form = stockItemToForm({
      name: 'Ketel One',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle 700ml',
      packagingNote: 'Usually supplied in cases',
      brand: '',
      barcode: '',
      currentQuantity: 12,
      minimumQuantity: 4,
      costPrice: 20,
      storageLocation: 'Main Storage',
    })

    form.brand = 'Ketel One'
    form.barcode = '123'
    form.packagingNote = 'Usually supplied in cases of 6'
    form.size = '700 ml'

    expect(validateStockItemForm(form)).toBe('')
    const payload = stockFormToPayload(form)
    expect(payload.unit).toBe('Bottle 700ml')
    expect(payload.brand).toBe('Ketel One')
    expect(payload.barcode).toBe('123')
    expect(payload.packagingNote).toBe('Usually supplied in cases of 6')
    expect(payload.size).toBe('700 ml')
    expect(payload.currentQuantity).toBe(12)
  })

  it('requires canonical unit when the operator explicitly changes Inventory Unit', () => {
    const form = stockItemToForm({
      name: 'Ketel One',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle 700ml',
      currentQuantity: 12,
      minimumQuantity: 4,
      storageLocation: 'Main Storage',
    })

    form.unitPreset = 'Case'
    form.customUnit = ''
    expect(validateStockItemForm(form)).toBe(PRODUCT_CREATE_EDIT_INVENTORY_UNIT_ERROR)

    form.unitPreset = 'Bottle'
    form.customUnit = ''
    expect(validateStockItemForm(form)).toBe('')
    const payload = stockFormToPayload(form)
    expect(payload.unit).toBe('Bottle')
    expect(payload.currentQuantity).toBe(12)
  })

  it('does not mutate quantity or packaging note when only unit is canonicalized by operator', () => {
    const form = stockItemToForm({
      name: 'Item',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle 1L',
      packagingNote: 'Supplier packaging varies',
      currentQuantity: 7,
      minimumQuantity: 2,
      storageLocation: 'Main Storage',
    })
    const noteBefore = form.packagingNote
    const qtyBefore = form.currentQuantity
    form.unitPreset = 'Bottle'
    form.customUnit = ''
    const payload = stockFormToPayload(form)
    expect(payload.unit).toBe('Bottle')
    expect(payload.packagingNote).toBe(noteBefore)
    expect(payload.currentQuantity).toBe(qtyBefore)
  })
})

describe('product form validation gate', () => {
  it('blocks packaging custom values on new products', () => {
    const form = validBaseForm({
      unitPreset: '__custom__',
      customUnit: 'Case 24',
      persistedUnit: '',
    })
    expect(validateStockItemForm(form)).toBe(PRODUCT_CREATE_EDIT_INVENTORY_UNIT_ERROR)
  })

  it('accepts canonical presets on new products', () => {
    expect(validateStockItemForm(validBaseForm({ unitPreset: 'Bottle' }))).toBe('')
    expect(stockFormToPayload(validBaseForm({ unitPreset: 'Liter' })).unit).toBe('Liter')
  })
})

describe('regression — presets / metadata / packaging / supplier', () => {
  it('keeps selectable presets identical to canonical list', () => {
    expect(STOCK_GENERAL_UNIT_PRESETS).toEqual([...SELECTABLE_INVENTORY_UNIT_PRESETS])
    for (const blocked of ['Case', 'Box', 'Pack']) {
      expect(STOCK_GENERAL_UNIT_PRESETS).not.toContain(blocked)
    }
  })

  it('keeps packaging note and supplier payload paths intact', () => {
    const form = validBaseForm({
      supplier: 'Malakakos AE',
      packagingNote: 'Usually supplied in cases',
      brand: 'Belvedere',
      barcode: '5901234123457',
      unitPreset: 'Bottle',
    })
    const payload = stockFormToPayload(form)
    expect(payload.supplier).toBe('Malakakos AE')
    expect(payload.packagingNote).toBe('Usually supplied in cases')
    expect(payload.brand).toBe('Belvedere')
    expect(payload.barcode).toBe('5901234123457')
    expect(payload.unit).toBe('Bottle')
  })

  it('removes unrestricted Custom Unit entry from Product Create/Edit UI', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/stock/StockItemFormModal.jsx'),
      'utf8',
    )
    expect(source).not.toMatch(/>\s*Custom\s*</)
    expect(source).not.toContain('Enter custom unit')
    expect(source).toContain('Select a physical unit above to update')
  })
})

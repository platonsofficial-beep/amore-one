import { describe, expect, it } from 'vitest'
import {
  buildInventoryOperationalImportPreview,
} from './inventoryOperationalImportPreview.js'
import {
  matchInventoryOperationalProducts,
} from './inventoryOperationalProductMatcher.js'
import {
  applyInventoryOperationalMatchResolutions,
  getOperationalMatchResolutionRowKey,
  INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION,
} from './inventoryOperationalMatchResolutions.js'
import {
  INVENTORY_NEW_PRODUCT_UNITS,
  InventoryNewProductDraftError,
  applyInventoryNewProductDrafts,
  areAllNewProductDraftsValid,
  getNewProductDraftDefaults,
  listCreateNewPreviewRows,
  listNewProductCategoryOptions,
  mergeNewProductDraft,
  validateNewProductDraft,
} from './inventoryNewProductDrafts.js'

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? 'Vodka',
    unit: partial.unit ?? 'Bottle',
    sku: null,
    active: partial.active ?? true,
  }
}

function buildResolvedPreview(options = {}) {
  const operationalModel = options.operationalModel ?? {
    categories: [{
      name: 'VODKA',
      products: [
        {
          name: 'Ketel One 70cl',
          storage: 4,
          bar: 1,
          weekdays: null,
          order: null,
          stockControl: null,
        },
        {
          name: 'Brand New Spirit',
          storage: 2,
          bar: 0,
          weekdays: null,
          order: null,
          stockControl: null,
        },
      ],
    }],
  }
  const existingStockItems = options.existingStockItems ?? [
    stock({ id: 'ko', name: 'KETEL ONE', category: 'Vodka', unit: 'Bottle 0.7L' }),
  ]
  const matchingResult = matchInventoryOperationalProducts({
    operationalModel,
    existingStockItems,
  })
  const base = buildInventoryOperationalImportPreview({
    operationalModel,
    matchingResult,
    existingStockItems,
  })

  /** @type {Record<string, object>} */
  const resolutions = {}
  base.rows.forEach((row, index) => {
    if (row.proposedAction !== 'requires_resolution') return
    const key = getOperationalMatchResolutionRowKey(row, index)
    resolutions[key] = options.resolvePossibleAs === 'link'
      ? {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
          selectedStockItemId: row.match.candidates[0].stockItem.id,
        }
      : {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW,
          selectedStockItemId: null,
        }
  })

  return applyInventoryOperationalMatchResolutions({
    preview: base,
    resolutions,
  })
}

describe('inventoryNewProductDrafts', () => {
  it('lists only create_new rows and excludes link/skip', () => {
    const preview = buildResolvedPreview({ resolvePossibleAs: 'link' })
    const createRows = listCreateNewPreviewRows(preview)
    expect(createRows.length).toBe(1)
    expect(createRows[0].row.source.productName).toBe('Brand New Spirit')
    expect(createRows.every(({ row }) => row.proposedAction === 'create_new')).toBe(true)
  })

  it('defaults product name and category with unit unselected when no volume token', () => {
    const preview = buildResolvedPreview({ resolvePossibleAs: 'link' })
    const { row } = listCreateNewPreviewRows(preview)[0]
    const defaults = getNewProductDraftDefaults(row)
    expect(defaults.productName).toBe('Brand New Spirit')
    expect(defaults.category).toBe('VODKA')
    expect(defaults.unit).toBeNull()
  })

  it('initializes inferred units from product name and keeps manual overrides', () => {
    const preview = buildResolvedPreview({
      resolvePossibleAs: 'link',
      operationalModel: {
        categories: [{
          name: 'APERITIVO',
          products: [
            {
              name: 'Campari 1lt',
              storage: 2,
              bar: 1,
              weekdays: null,
              order: null,
              stockControl: null,
            },
            {
              name: 'Soda 330ml',
              storage: 1,
              bar: 0,
              weekdays: null,
              order: null,
              stockControl: null,
            },
            {
              name: 'Coke Can 330ml',
              storage: 1,
              bar: 0,
              weekdays: null,
              order: null,
              stockControl: null,
            },
          ],
        }],
      },
      existingStockItems: [],
    })

    const rows = listCreateNewPreviewRows(preview)
    const campari = rows.find(({ row }) => row.source.productName === 'Campari 1lt')
    const soda = rows.find(({ row }) => row.source.productName === 'Soda 330ml')
    const coke = rows.find(({ row }) => row.source.productName === 'Coke Can 330ml')

    expect(getNewProductDraftDefaults(campari.row).unit).toBe('Bottle')
    expect(getNewProductDraftDefaults(soda.row).unit).toBeNull()
    expect(getNewProductDraftDefaults(coke.row).unit).toBeNull()

    const overridden = mergeNewProductDraft(campari.row, {
      productName: 'Campari 1lt',
      category: 'APERITIVO',
      unit: 'Liter',
    })
    expect(overridden.unit).toBe('Liter')
    expect(validateNewProductDraft(getNewProductDraftDefaults(campari.row)).valid).toBe(true)

    const derived = applyInventoryNewProductDrafts({ preview, drafts: {} })
    const derivedCampari = listCreateNewPreviewRows(derived)
      .find(({ row }) => row.source.productName === 'Campari 1lt')
      ?.row
    expect(derivedCampari?.metadataProposal.proposedUnit).toBe('Bottle')
    expect(derivedCampari?.blockers).not.toContain('unit_missing')
  })

  it('validates required trimmed name, category, and unit', () => {
    expect(validateNewProductDraft({
      productName: '  ',
      category: '',
      unit: null,
    })).toMatchObject({
      valid: false,
      errors: {
        productName: 'Product name is required',
        category: 'Category is required',
        unit: 'Unit is required',
      },
    })

    expect(validateNewProductDraft({
      productName: '  Brand New Spirit  ',
      category: 'Vodka',
      unit: 'Bottle 700ml',
    })).toMatchObject({
      valid: true,
      errors: {},
      normalized: {
        productName: 'Brand New Spirit',
        category: 'Vodka',
        unit: 'Bottle 700ml',
      },
    })

    expect(validateNewProductDraft({
      productName: 'X',
      category: 'Vodka',
      unit: 'Not A Unit',
    }).errors.unit).toBe('Select a valid unit')

    expect(validateNewProductDraft({
      productName: 'X',
      category: 'Vodka',
      unit: 'Case',
    }).errors.unit).toBe('Select a valid unit')

    expect(INVENTORY_NEW_PRODUCT_UNITS).toContain('Bottle')
    expect(INVENTORY_NEW_PRODUCT_UNITS).toContain('Milliliter')
    expect(INVENTORY_NEW_PRODUCT_UNITS).not.toContain('Case')
    expect(INVENTORY_NEW_PRODUCT_UNITS).not.toContain('Bottle 700ml')
    expect(INVENTORY_NEW_PRODUCT_UNITS).toEqual([
      'Bottle',
      'Can',
      'Piece',
      'Kilogram',
      'Gram',
      'Liter',
      'Milliliter',
      'Keg',
      'Roll',
    ])
    expect(new Set(INVENTORY_NEW_PRODUCT_UNITS).size).toBe(INVENTORY_NEW_PRODUCT_UNITS.length)
    expect(validateNewProductDraft({
      productName: 'Latina Beer',
      category: 'Beverages',
      unit: 'Bottle 330ml',
    }).valid).toBe(true)
    expect(validateNewProductDraft({
      productName: 'Mixer',
      category: 'Beverages',
      unit: 'Bottle',
    }).valid).toBe(true)
  })

  it('applies drafts into derived preview unit/category/name without mutating inputs', () => {
    const preview = buildResolvedPreview({ resolvePossibleAs: 'link' })
    const { key, row } = listCreateNewPreviewRows(preview)[0]
    const drafts = {
      [key]: {
        productName: '  Brand New Spirit 70cl  ',
        category: 'Vodka',
        unit: 'Bottle 700ml',
      },
    }
    const frozenDrafts = Object.freeze({ ...drafts })
    const beforeName = row.source.productName
    const beforeBlockers = [...row.blockers]

    const derived = applyInventoryNewProductDrafts({ preview, drafts: frozenDrafts })
    const derivedRow = listCreateNewPreviewRows(derived)[0].row

    expect(derivedRow.source.productName).toBe('Brand New Spirit 70cl')
    expect(derivedRow.metadataProposal.proposedCategory).toBe('Vodka')
    expect(derivedRow.metadataProposal.proposedUnit).toBe('Bottle 700ml')
    expect(derivedRow.blockers).not.toContain('unit_missing')
    expect(derived.summary.missingUnits).toBe(0)

    expect(row.source.productName).toBe(beforeName)
    expect(row.blockers).toEqual(beforeBlockers)
    expect(Object.isFrozen(derived)).toBe(true)
    expect(Object.isFrozen(derived.rows[0])).toBe(true)

    const again = applyInventoryNewProductDrafts({ preview, drafts: frozenDrafts })
    expect(again).toEqual(derived)
  })

  it('keeps unit_missing until a unit is selected', () => {
    const preview = buildResolvedPreview({ resolvePossibleAs: 'link' })
    const { key } = listCreateNewPreviewRows(preview)[0]
    const derived = applyInventoryNewProductDrafts({
      preview,
      drafts: {
        [key]: mergeNewProductDraft(listCreateNewPreviewRows(preview)[0].row, {
          unit: null,
        }),
      },
    })
    expect(listCreateNewPreviewRows(derived)[0].row.blockers).toContain('unit_missing')
    expect(derived.summary.missingUnits).toBe(1)
    expect(areAllNewProductDraftsValid({
      preview,
      drafts: { [key]: { productName: 'Brand New Spirit', category: 'VODKA', unit: null } },
    })).toBe(false)
  })

  it('areAllNewProductDraftsValid is true when no create_new rows exist', () => {
    const preview = buildResolvedPreview({
      resolvePossibleAs: 'link',
      operationalModel: {
        categories: [{
          name: 'VODKA',
          products: [{
            name: 'KETEL ONE',
            storage: 1,
            bar: 0,
            weekdays: null,
            order: null,
            stockControl: null,
          }],
        }],
      },
      existingStockItems: [
        stock({ id: 'ko', name: 'KETEL ONE', category: 'Vodka' }),
      ],
    })
    expect(listCreateNewPreviewRows(preview)).toHaveLength(0)
    expect(areAllNewProductDraftsValid({ preview, drafts: {} })).toBe(true)
  })

  it('attaches locationQuantities and total resolvedQuantity from allocations', () => {
    const preview = buildResolvedPreview({ resolvePossibleAs: 'link' })
    const { key } = listCreateNewPreviewRows(preview)[0]
    const workspaceStorages = [
      { id: 's-water', locationKey: 'Water Storage', name: 'Water Storage' },
      { id: 's-bar', locationKey: 'Bar', name: 'Bar' },
    ]
    const derived = applyInventoryNewProductDrafts({
      preview,
      drafts: {
        [key]: {
          productName: 'Brand New Spirit',
          category: 'Vodka',
          unit: 'Bottle 700ml',
          storage: 'Water Storage',
          locationAllocations: [
            {
              sourceField: 'storage',
              quantityInput: '288+180',
              destinationLocationKey: 'Water Storage',
            },
            {
              sourceField: 'bar',
              quantityInput: 20,
              destinationLocationKey: 'Bar',
            },
          ],
        },
      },
      quantitySourceColumns: [
        { sourceField: 'storage', sourceHeader: 'Storage', sourceColumnIndex: 1 },
        { sourceField: 'bar', sourceHeader: 'BAR', sourceColumnIndex: 2 },
      ],
      workspaceStorages,
    })
    const derivedRow = listCreateNewPreviewRows(derived)[0].row
    expect(derivedRow.locationQuantities).toHaveLength(2)
    expect(derivedRow.resolvedQuantity).toBe(488)
    expect(derivedRow.locationProposal.resolvedStorageLocation).toBe('Water Storage')
    expect(derivedRow.blockers).not.toContain('duplicate_location_destination')
  })

  it('lists category options from catalog and create_new defaults', () => {
    const preview = buildResolvedPreview({ resolvePossibleAs: 'link' })
    const options = listNewProductCategoryOptions({
      catalogItems: [
        stock({ id: 'a', name: 'A', category: 'Gin' }),
        stock({ id: 'b', name: 'B', category: 'Vodka' }),
        stock({ id: 'c', name: 'C', category: '  ' }),
      ],
      preview,
    })
    expect(options).toContain('Gin')
    expect(options).toContain('Vodka')
    expect(options).toContain('VODKA')
    expect(options).toContain('Other')
  })

  it('ignores unknown draft keys and throws typed errors for invalid contracts', () => {
    const preview = buildResolvedPreview({ resolvePossibleAs: 'link' })
    const derived = applyInventoryNewProductDrafts({
      preview,
      drafts: { '999::ghost::name': { productName: 'X', category: 'Y', unit: 'Bottle 700ml' } },
    })
    expect(listCreateNewPreviewRows(derived)[0].row.metadataProposal.proposedUnit).toBeNull()

    expect(() => applyInventoryNewProductDrafts({ preview: null, drafts: {} }))
      .toThrow(InventoryNewProductDraftError)
    expect(() => applyInventoryNewProductDrafts({ preview, drafts: null }))
      .toThrow(InventoryNewProductDraftError)
  })
})

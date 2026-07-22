/**
 * P8.16.11 — Operational Import Preview Domain Foundation tests.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INVENTORY_OPERATIONAL_MATCH_STATUS,
  matchInventoryOperationalProducts,
} from './inventoryOperationalProductMatcher.js'
import {
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_VERSION,
  InventoryOperationalImportPreviewError,
  buildInventoryOperationalImportPreview,
} from './inventoryOperationalImportPreview.js'

const PREVIEW_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'inventoryOperationalImportPreview.js'),
  'utf8',
)

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? null,
    unit: partial.unit ?? 'Bottle 0.7L',
    sku: partial.sku ?? null,
    active: partial.active ?? true,
  }
}

function product(name, extras = {}) {
  return {
    name,
    storage: Object.prototype.hasOwnProperty.call(extras, 'storage') ? extras.storage : null,
    bar: Object.prototype.hasOwnProperty.call(extras, 'bar') ? extras.bar : null,
    weekdays: Object.prototype.hasOwnProperty.call(extras, 'weekdays') ? extras.weekdays : null,
    order: Object.prototype.hasOwnProperty.call(extras, 'order') ? extras.order : null,
    stockControl: Object.prototype.hasOwnProperty.call(extras, 'stockControl')
      ? extras.stockControl
      : null,
  }
}

function model(categories) {
  return { categories }
}

function buildPreview(operationalModel, existingStockItems) {
  const matchingResult = matchInventoryOperationalProducts({
    operationalModel,
    existingStockItems,
  })
  return {
    matchingResult,
    preview: buildInventoryOperationalImportPreview({
      operationalModel,
      matchingResult,
      existingStockItems,
    }),
  }
}

describe('buildInventoryOperationalImportPreview', () => {
  it('1. exact match creates link_existing', () => {
    const { preview } = buildPreview(
      model([{ name: 'VODKA', products: [product('Belvedere', { storage: 6, bar: 1.8 })] }]),
      [stock({ id: 's1', name: 'Belvedere', category: 'Vodka' })],
    )

    expect(preview.rows[0].proposedAction).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING,
    )
    expect(preview.previewVersion).toBe(INVENTORY_OPERATIONAL_IMPORT_PREVIEW_VERSION)
  })

  it('2. exact match preserves source facts', () => {
    const weekdays = {
      monday: 1,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    }
    const { preview } = buildPreview(
      model([{
        name: 'VODKA',
        products: [product('Absolut Blue', {
          storage: 6,
          bar: 1.8,
          weekdays,
          order: 2,
          stockControl: 4,
        })],
      }]),
      [stock({ id: 's1', name: 'Absolut Blue' })],
    )

    expect(preview.rows[0].source).toEqual({
      category: 'VODKA',
      productName: 'Absolut Blue',
      storage: 6,
      bar: 1.8,
      weekdays,
      order: 2,
      stockControl: 4,
    })
  })

  it('3. exact match snapshots existing ONE item', () => {
    const { preview } = buildPreview(
      model([{ name: 'GIN', products: [product('Tanqueray')] }]),
      [stock({ id: 's1', name: 'Tanqueray', category: 'Gin', unit: 'Bottle', sku: 'TQ-1' })],
    )

    expect(preview.rows[0].existingOne).toEqual({
      id: 's1',
      name: 'Tanqueray',
      category: 'Gin',
      unit: 'Bottle',
      sku: 'TQ-1',
      storageLocation: null,
      currentQuantity: null,
      active: true,
    })
  })

  it('4–5. exact match does not propose quantity and requires policy', () => {
    const { preview } = buildPreview(
      model([{ name: 'VODKA', products: [product('Belvedere', { storage: 6, bar: 2 })] }]),
      [stock({ id: 's1', name: 'Belvedere' })],
    )

    const qty = preview.rows[0].quantityProposal
    expect(qty.status).toBe(INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY)
    expect(qty.proposedQuantity).toBeNull()
    expect(qty.calculationRule).toBeNull()
    expect(qty.sourceStorage).toBe(6)
    expect(qty.sourceBar).toBe(2)
    expect(preview.rows[0].blockers).toContain('quantity_policy_unset')
  })

  it('6–7. inactive exact match warns and is not reactivated', () => {
    const { preview } = buildPreview(
      model([{ name: 'GIN', products: [product('Bombay Sapphire')] }]),
      [stock({ id: 's1', name: 'Bombay Sapphire', active: false })],
    )

    expect(preview.rows[0].warnings).toContain('matched_item_inactive')
    expect(preview.rows[0].metadataProposal.proposedActive).toBe(false)
    expect(preview.rows[0].existingOne?.active).toBe(false)
  })

  it('8–11. possible match requires resolution, preserves candidates, never selects, blocks', () => {
    const existingStockItems = [
      stock({ id: 'a', name: 'Belvedere', category: 'Bar' }),
      stock({ id: 'b', name: 'BELVEDERE', category: 'Storage' }),
    ]
    const { matchingResult, preview } = buildPreview(
      model([{ name: 'VODKA', products: [product('Belvedere')] }]),
      existingStockItems,
    )

    expect(matchingResult.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH)
    expect(preview.rows[0].proposedAction).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION,
    )
    expect(preview.rows[0].existingOne).toBeNull()
    expect(preview.rows[0].match.matchedStockItem).toBeNull()
    expect(preview.rows[0].match.candidates).toHaveLength(2)
    expect(preview.rows[0].match.candidates.map((c) => c.stockItem.id)).toEqual(
      matchingResult.matches[0].candidates.map((c) => c.stockItem.id),
    )
    expect(preview.rows[0].blockers).toContain('possible_match_unresolved')
    expect(preview.rows[0].quantityProposal.status).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
    )
    expect(preview.rows[0].locationProposal.status).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
    )
  })

  it('12–17. new product action, category, unit/location/quantity blockers', () => {
    const { preview } = buildPreview(
      model([{
        name: null,
        products: [product('Grey Goose', { storage: 3, bar: 1 })],
      }]),
      [],
    )

    const row = preview.rows[0]
    expect(row.proposedAction).toBe(INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW)
    expect(row.metadataProposal.proposedActive).toBe(true)
    expect(row.metadataProposal.sourceCategory).toBeNull()
    expect(row.metadataProposal.proposedCategory).toBe('Other')
    expect(row.warnings).toContain('category_defaulted_to_other')
    expect(row.metadataProposal.proposedUnit).toBeNull()
    expect(row.blockers).toEqual(expect.arrayContaining([
      'unit_missing',
      'quantity_policy_unset',
      'location_policy_unset',
    ]))
    expect(row.quantityProposal.status).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
    )
    expect(row.quantityProposal.proposedQuantity).toBeNull()
    expect(row.locationProposal.status).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
    )
    expect(row.locationProposal.proposedStorageLocation).toBeNull()
    expect(row.warnings).toContain('source_location_requires_policy')
  })

  it('14. new product preserves non-empty source category', () => {
    const { preview } = buildPreview(
      model([{ name: 'WHISKY', products: [product('Chivas 12')] }]),
      [],
    )

    expect(preview.rows[0].metadataProposal.proposedCategory).toBe('WHISKY')
    expect(preview.rows[0].warnings).not.toContain('category_defaulted_to_other')
  })

  it('18. does not calculate Storage + BAR', () => {
    const { preview } = buildPreview(
      model([{ name: 'VODKA', products: [product('Belvedere', { storage: 6, bar: 1.8 })] }]),
      [stock({ id: 's1', name: 'Belvedere' })],
    )

    expect(preview.rows[0].quantityProposal.proposedQuantity).toBeNull()
    expect(preview.rows[0].quantityProposal.calculationRule).toBeNull()
    expect(JSON.stringify(preview)).not.toContain('7.8')
  })

  it('19–20. invalid source remains as skip_invalid', () => {
    const { preview } = buildPreview(
      model([{
        name: 'VODKA',
        products: [
          product(''),
          product('Belvedere'),
        ],
      }]),
      [stock({ id: 's1', name: 'Belvedere' })],
    )

    expect(preview.rows).toHaveLength(2)
    expect(preview.rows[0].proposedAction).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID,
    )
    expect(preview.rows[0].blockers).toContain('invalid_source_name')
    expect(preview.rows[0].quantityProposal.status).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
    )
    expect(preview.rows[1].proposedAction).toBe(
      INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING,
    )
  })

  it('21–24. source-field warnings only when meaningfully populated', () => {
    const { preview: populated } = buildPreview(
      model([{
        name: 'VODKA',
        products: [product('Mystery', {
          storage: 1,
          bar: null,
          weekdays: {
            monday: 2,
            tuesday: null,
            wednesday: null,
            thursday: null,
            friday: null,
            saturday: null,
            sunday: null,
          },
          order: 3,
          stockControl: 4,
        })],
      }]),
      [],
    )

    expect(populated.rows[0].warnings).toEqual(expect.arrayContaining([
      'source_quantity_requires_policy',
      'source_weekdays_unmapped',
      'source_order_unmapped',
      'source_stock_control_unmapped',
      'source_location_requires_policy',
    ]))

    const { preview: emptyCells } = buildPreview(
      model([{
        name: 'VODKA',
        products: [product('Mystery Two', {
          storage: null,
          bar: null,
          weekdays: {
            monday: null,
            tuesday: null,
            wednesday: null,
            thursday: null,
            friday: null,
            saturday: null,
            sunday: null,
          },
          order: null,
          stockControl: '   ',
        })],
      }]),
      [],
    )

    expect(emptyCells.rows[0].warnings).not.toContain('source_quantity_requires_policy')
    expect(emptyCells.rows[0].warnings).not.toContain('source_weekdays_unmapped')
    expect(emptyCells.rows[0].warnings).not.toContain('source_order_unmapped')
    expect(emptyCells.rows[0].warnings).not.toContain('source_stock_control_unmapped')
  })

  it('25. catalog limitations become null storageLocation and currentQuantity', () => {
    const richCatalog = [{
      id: 's1',
      name: 'Belvedere',
      category: 'Vodka',
      unit: 'Bottle',
      sku: null,
      active: true,
      storageLocation: 'Bar',
      currentQuantity: 99,
    }]
    const { preview } = buildPreview(
      model([{ name: 'VODKA', products: [product('Belvedere')] }]),
      richCatalog,
    )

    expect(preview.rows[0].existingOne?.storageLocation).toBeNull()
    expect(preview.rows[0].existingOne?.currentQuantity).toBeNull()
    expect(preview.rows[0].quantityProposal.currentOneQuantity).toBeNull()
  })

  it('26–27. source order and multiple categories preserved', () => {
    const { preview } = buildPreview(
      model([
        { name: 'VODKA', products: [product('Belvedere'), product('Absolut Blue')] },
        { name: 'GIN', products: [product('Tanqueray')] },
      ]),
      [
        stock({ id: '1', name: 'Belvedere' }),
        stock({ id: '2', name: 'Absolut Blue' }),
        stock({ id: '3', name: 'Tanqueray' }),
      ],
    )

    expect(preview.rows.map((row) => row.source.productName)).toEqual([
      'Belvedere',
      'Absolut Blue',
      'Tanqueray',
    ])
    expect(preview.rows.map((row) => row.source.category)).toEqual([
      'VODKA',
      'VODKA',
      'GIN',
    ])
  })

  it('28–30. summary action, blocker, and warning counts', () => {
    const { preview } = buildPreview(
      model([{
        name: 'VODKA',
        products: [
          product('Belvedere', { storage: 1, order: 2 }),
          product('Dup', { bar: 1 }),
          product('Brand New', {
            weekdays: {
              monday: 1, tuesday: null, wednesday: null, thursday: null,
              friday: null, saturday: null, sunday: null,
            },
            stockControl: 5,
          }),
          product(''),
        ],
      }]),
      [
        stock({ id: '1', name: 'Belvedere', active: false }),
        stock({ id: 'd1', name: 'Dup' }),
        stock({ id: 'd2', name: 'DUP' }),
      ],
    )

    expect(preview.summary).toMatchObject({
      total: 4,
      linkExisting: 1,
      createNew: 1,
      requiresResolution: 1,
      skippedInvalid: 1,
      inactiveMatches: 1,
      missingUnits: 1,
      quantityPolicyRequired: 2,
      locationPolicyRequired: 1,
      unmappedWeekdayRows: 1,
      unmappedOrderRows: 1,
      unmappedStockControlRows: 1,
    })
    // A create_new row can contribute to multiple counters at once.
    expect(preview.summary.missingUnits).toBe(1)
    expect(preview.summary.locationPolicyRequired).toBe(1)
  })

  it('31. empty model', () => {
    const { preview } = buildPreview(model([]), [stock({ id: '1', name: 'Belvedere' })])

    expect(preview.rows).toEqual([])
    expect(preview.summary.total).toBe(0)
    expect(preview.summary.linkExisting).toBe(0)
  })

  it('32. invalid top-level input throws typed error', () => {
    expect(() => buildInventoryOperationalImportPreview({
      operationalModel: null,
      matchingResult: { matches: [] },
      existingStockItems: [],
    })).toThrow(InventoryOperationalImportPreviewError)

    expect(() => buildInventoryOperationalImportPreview({
      operationalModel: model([]),
      matchingResult: null,
      existingStockItems: [],
    })).toThrow(InventoryOperationalImportPreviewError)

    expect(() => buildInventoryOperationalImportPreview({
      operationalModel: model([]),
      matchingResult: { matches: [] },
      existingStockItems: null,
    })).toThrow(InventoryOperationalImportPreviewError)
  })

  it('33. matcher/source length mismatch throws alignment error', () => {
    const operationalModel = model([
      { name: 'VODKA', products: [product('Belvedere'), product('Absolut Blue')] },
    ])
    const matchingResult = matchInventoryOperationalProducts({
      operationalModel: model([{ name: 'VODKA', products: [product('Belvedere')] }]),
      existingStockItems: [stock({ id: '1', name: 'Belvedere' })],
    })

    try {
      buildInventoryOperationalImportPreview({
        operationalModel,
        matchingResult,
        existingStockItems: [],
      })
      expect.unreachable('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryOperationalImportPreviewError)
      expect(error.code).toBe('SOURCE_MATCH_ALIGNMENT')
    }
  })

  it('33b. matcher/source identity mismatch throws alignment error', () => {
    const operationalModel = model([
      { name: 'VODKA', products: [product('Belvedere')] },
    ])
    const matchingResult = matchInventoryOperationalProducts({
      operationalModel: model([{ name: 'GIN', products: [product('Tanqueray')] }]),
      existingStockItems: [stock({ id: '1', name: 'Tanqueray' })],
    })

    expect(() => buildInventoryOperationalImportPreview({
      operationalModel,
      matchingResult,
      existingStockItems: [],
    })).toThrow(/identity mismatch/i)
  })

  it('34. inputs not mutated', () => {
    const operationalModel = model([
      { name: 'VODKA', products: [product('Belvedere', { storage: 6 })] },
    ])
    const existingStockItems = [stock({ id: 's1', name: 'Belvedere' })]
    const matchingResult = matchInventoryOperationalProducts({
      operationalModel,
      existingStockItems,
    })
    const modelBefore = JSON.stringify(operationalModel)
    const stockBefore = JSON.stringify(existingStockItems)
    const matchBefore = JSON.stringify(matchingResult)

    buildInventoryOperationalImportPreview({
      operationalModel,
      matchingResult,
      existingStockItems,
    })

    expect(JSON.stringify(operationalModel)).toBe(modelBefore)
    expect(JSON.stringify(existingStockItems)).toBe(stockBefore)
    expect(JSON.stringify(matchingResult)).toBe(matchBefore)
    expect(Object.isExtensible(operationalModel)).toBe(true)
  })

  it('35. output deeply frozen', () => {
    const { preview } = buildPreview(
      model([{ name: 'VODKA', products: [product('Belvedere', { storage: 1 })] }]),
      [stock({ id: 's1', name: 'Belvedere' })],
    )

    expect(Object.isFrozen(preview)).toBe(true)
    expect(Object.isFrozen(preview.rows)).toBe(true)
    expect(Object.isFrozen(preview.rows[0])).toBe(true)
    expect(Object.isFrozen(preview.rows[0].source)).toBe(true)
    expect(Object.isFrozen(preview.summary)).toBe(true)
    expect(() => {
      preview.summary.total = 99
    }).toThrow()
  })

  it('36. deterministic repeated output', () => {
    const operationalModel = model([
      { name: 'WHISKY', products: [product('Johnnie Walker Black'), product('Chivas 12')] },
      { name: 'GIN', products: [product('Bombay Sapphire')] },
    ])
    const existingStockItems = [
      stock({ id: '1', name: 'Johnnie Walker Black' }),
      stock({ id: '2', name: 'Bombay Sapphire' }),
    ]

    const first = buildPreview(operationalModel, existingStockItems).preview
    const second = buildPreview(operationalModel, existingStockItems).preview

    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('37. no forbidden imports', () => {
    expect(PREVIEW_SOURCE).not.toMatch(/from ['"][^'"]*supabase/i)
    expect(PREVIEW_SOURCE).not.toMatch(/from ['"]react['"]/)
    expect(PREVIEW_SOURCE).not.toMatch(/from ['"][^'"]*\/services\//)
    expect(PREVIEW_SOURCE).not.toMatch(/fetch\s*\(/)
    expect(PREVIEW_SOURCE).not.toMatch(/\bDate\b/)
    expect(PREVIEW_SOURCE).not.toMatch(/Math\.random/)
  })
})

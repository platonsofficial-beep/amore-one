/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildInventoryImportColumnMappingSummary } from './inventoryImportWizardUx.js'
import { parseInventoryImportTable } from './inventoryImportTabularParser.js'
import {
  buildStandardInventoryImportPreview,
  buildStandardInventoryImportStagingPayload,
  listStandardImportContinueMessages,
} from './inventoryStandardImportPreview.js'

const CSV = [
  ['Name', 'Category', 'Unit', 'Quantity', 'Minimum', 'Cost price', 'Supplier', 'Storage'],
  ['TEST Import Lemon Syrup', 'Syrups', 'Bottle', '3', '1', '4.50', 'TEST GrokBot Supplier', 'Main Storage'],
  ['TEST Import Tonic', 'Beverages', 'Bottle', '12', '6', '0.80', 'TEST GrokBot Supplier', 'Bar'],
]

const STORAGES = [
  { id: '11111111-1111-4111-8111-111111111111', locationKey: 'Main Storage', name: 'Main Storage', active: true },
  { id: '22222222-2222-4222-8222-222222222222', locationKey: 'Bar', name: 'Bar', active: true },
]

function previewFrom(rows, options = {}) {
  const [headers, ...data] = rows
  const parseResult = parseInventoryImportTable({ headers, rows: data })
  const columnMappingSummary = buildInventoryImportColumnMappingSummary(parseResult)
  return buildStandardInventoryImportPreview({
    parseResult,
    columnMappingSummary,
    workspaceStorages: STORAGES,
    existingStockItems: options.existingStockItems ?? [],
    actionOverrides: options.actionOverrides ?? {},
    quantityPolicy: options.quantityPolicy ?? 'opening_stock',
  })
}

describe('buildStandardInventoryImportPreview', () => {
  it('previews the sample catalog as two creates with per-storage opening balances', () => {
    const preview = previewFrom(CSV)
    expect(preview.isReady).toBe(true)
    expect(preview.counts).toEqual({ create: 2, link: 0, skip: 0, blocked: 0 })
    expect(preview.rows[0]).toMatchObject({
      name: 'TEST Import Lemon Syrup',
      action: 'create',
      category: 'Syrups',
      unit: 'Bottle',
      minimumQuantity: 1,
      costPrice: 4.5,
      supplier: 'TEST GrokBot Supplier',
      resolvedQuantity: 3,
      locationQuantities: [{
        destinationStorageId: STORAGES[0].id,
        destinationLocationKey: 'Main Storage',
        parsedQuantity: 3,
        validationState: 'valid',
      }],
    })
    expect(preview.rows[1]).toMatchObject({
      name: 'TEST Import Tonic',
      costPrice: 0.8,
      minimumQuantity: 6,
      resolvedQuantity: 12,
      locationQuantities: [{
        destinationLocationKey: 'Bar',
        parsedQuantity: 12,
      }],
    })
  })

  it('skips an existing name unless the manager explicitly links it', () => {
    const existing = [{
      id: '33333333-3333-4333-8333-333333333333',
      name: 'test import lemon syrup',
      unit: 'Bottle',
    }]
    const skipped = previewFrom(CSV, { existingStockItems: existing })
    expect(skipped.rows[0]).toMatchObject({
      action: 'skip',
      createOffered: false,
      linkOffered: true,
      matchedStockItemId: existing[0].id,
    })
    expect(skipped.rows[0].messages.join(' ')).toContain('left unchanged')
    expect(skipped.rows[1].action).toBe('create')

    const linked = previewFrom(CSV, {
      existingStockItems: existing,
      actionOverrides: { [skipped.rows[0].productKey]: 'link' },
    })
    expect(linked.rows[0].action).toBe('link')
    expect(linked.isReady).toBe(true)
    expect(listStandardImportContinueMessages(linked, {
      quantityPolicy: 'opening_stock',
    }).join(' ')).toContain('Confirm replacing quantities on existing products.')
  })

  it('does not offer create when several existing products share the name', () => {
    const preview = previewFrom([CSV[0], CSV[1]], {
      existingStockItems: [
        { id: '33333333-3333-4333-8333-333333333333', name: 'TEST Import Lemon Syrup' },
        { id: '44444444-4444-4444-8444-444444444444', name: 'TEST Import Lemon Syrup' },
      ],
    })
    expect(preview.rows[0]).toMatchObject({
      action: 'skip',
      createOffered: false,
      linkOffered: false,
    })
  })

  it('blocks an unknown storage and merges the same product across storages', () => {
    const unknown = previewFrom([
      CSV[0],
      CSV[1],
      ['TEST Import Lemon Syrup', 'Syrups', 'Bottle', '3', '1', '4.50', 'TEST GrokBot Supplier', 'Nope'],
    ])
    expect(unknown.isReady).toBe(false)
    expect(unknown.rows[0].messages.join(' ')).toContain('Storage “Nope” is not in this workspace.')

    const merged = previewFrom([
      CSV[0],
      CSV[1],
      ['TEST Import Lemon Syrup', 'Other', 'Bottle', '2', '9', '1.00', 'Other Supplier', 'Bar'],
      ['TEST Import Lemon Syrup', '', 'Bottle', '1', '', '', '', 'Main Storage'],
    ])
    expect(merged.rows).toHaveLength(1)
    expect(merged.rows[0].action).toBe('create')
    expect(merged.rows[0].resolvedQuantity).toBe(6)
    expect(merged.rows[0].category).toBe('Syrups')
    expect(merged.rows[0].minimumQuantity).toBe(1)
    expect(merged.rows[0].costPrice).toBe(4.5)
    expect(merged.rows[0].supplier).toBe('TEST GrokBot Supplier')
    expect(merged.rows[0].locationQuantities).toEqual([
      expect.objectContaining({ destinationLocationKey: 'Main Storage', parsedQuantity: 4 }),
      expect.objectContaining({ destinationLocationKey: 'Bar', parsedQuantity: 2 }),
    ])
    expect(merged.rows[0].messages.join(' ')).toContain('first value is kept')
  })

  it('blocks the same name with two units', () => {
    const preview = previewFrom([
      CSV[0],
      CSV[1],
      ['TEST Import Lemon Syrup', 'Syrups', 'ml', '2', '1', '4.50', 'TEST GrokBot Supplier', 'Bar'],
    ])
    expect(preview.rows[0].action).toBe('blocked')
    expect(preview.rows[0].messages.join(' ')).toContain('more than one unit')
    expect(preview.rows[0].createOffered).toBe(false)
  })

  it('stages opening stock, cost, minimum, supplier text, and storage balances', () => {
    const preview = previewFrom(CSV)
    const payload = buildStandardInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: { name: 'one-import-test.csv', size: 80 },
      preview,
      policy: { quantityPolicy: 'opening_stock' },
    })
    expect(payload.session.confirmations.quantityPolicy).toBe('opening_stock')
    expect(payload.session.confirmations.standardImport).toBe(true)
    expect(payload.rows).toHaveLength(2)
    expect(payload.rows[0]).toMatchObject({
      selected_action: 'create',
      apply_state: 'pending',
      normalized_payload: {
        name: 'TEST Import Lemon Syrup',
        costPrice: 4.5,
        minimumQuantity: 1,
        supplier: 'TEST GrokBot Supplier',
        supplierId: null,
        resolvedQuantity: 3,
        locationKey: 'Main Storage',
        locationQuantities: [
          expect.objectContaining({
            destinationLocationKey: 'Main Storage',
            parsedQuantity: 3,
            validationState: 'valid',
          }),
        ],
      },
    })
    expect(payload.rows[1].normalized_payload.costPrice).toBe(0.8)
    expect(payload.rows[1].normalized_payload.locationKey).toBe('Bar')
  })
})

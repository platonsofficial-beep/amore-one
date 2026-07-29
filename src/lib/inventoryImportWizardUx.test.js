import { describe, expect, it } from 'vitest'
import {
  INVENTORY_IMPORT_MAP_PREVIEW_ROW_LIMIT,
  buildInventoryImportColumnMappingSummary,
  buildInventoryImportMapSamplePreview,
  buildInventoryImportStepSummary,
  buildInventoryImportValidateGroups,
  mapInventoryImportHeaderToOneField,
} from './inventoryImportWizardUx'
import { INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION } from './inventoryOperationalImportPreview'

describe('inventoryImportWizardUx', () => {
  it('maps operational blank first column to required product name', () => {
    expect(mapInventoryImportHeaderToOneField({
      columnIndex: 0,
      isBlank: true,
      sourceHeader: '',
      normalized: '',
    })).toMatchObject({
      oneField: 'Product name',
      required: true,
      role: 'product_name',
    })
  })

  it('builds mapping summary and caps sample preview at 5 rows', () => {
    const headers = [
      { columnIndex: 0, sourceHeader: '', normalized: '', isBlank: true },
      { columnIndex: 1, sourceHeader: 'Storage Tasos', normalized: 'storage tasos', isBlank: false },
      { columnIndex: 2, sourceHeader: 'BAR', normalized: 'bar', isBlank: false },
    ]
    const rows = Array.from({ length: 8 }, (_, index) => ({
      cells: [
        { normalized: { value: `P${index}` }, raw: `P${index}` },
        { normalized: { value: 1 }, raw: 1 },
        { normalized: { value: 0 }, raw: 0 },
      ],
    }))
    const parseResult = { headers, rows }

    const summary = buildInventoryImportColumnMappingSummary(parseResult)
    expect(summary.missingRequired).toEqual([])
    expect(summary.optionalMapped).toContain('Storage / location')
    expect(summary.optionalMapped).toContain('Bar quantity')

    const sample = buildInventoryImportMapSamplePreview(parseResult)
    expect(sample.rows).toHaveLength(INVENTORY_IMPORT_MAP_PREVIEW_ROW_LIMIT)
    expect(sample.rows[0][0]).toBe('P0')
  })

  it('groups validate issues without requiring a full product list', () => {
    const groups = buildInventoryImportValidateGroups({
      rows: [
        {
          source: { productName: 'A' },
          proposedAction: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW,
          blockers: ['unit_missing'],
          warnings: ['source_location_requires_policy'],
        },
        {
          source: { productName: 'B' },
          proposedAction: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION,
          blockers: ['possible_match_unresolved'],
          warnings: [],
        },
        {
          source: { productName: 'C' },
          proposedAction: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING,
          existingOne: { id: '1' },
          blockers: [],
          warnings: [],
        },
      ],
    })

    expect(groups.summary.rows).toBe(3)
    expect(groups.summary.ready).toBe(1)
    expect(groups.groups.find((group) => group.id === 'missing_units')?.items).toEqual(['A'])
    expect(groups.groups.find((group) => group.id === 'manual_review')?.items).toEqual(['B'])
    expect(groups.groups.find((group) => group.id === 'missing_supplier')?.count).toBe(0)
  })

  it('builds compact per-step summary header contracts', () => {
    const mapSummary = buildInventoryImportStepSummary({
      wizardView: 'columns',
      selectedFile: { name: 'Amore Drinks.xlsx' },
      selectedWorksheetName: 'June 8–14',
      parseResult: { summary: { sourceColumnCount: 12 } },
      columnMappingSummary: {
        mapped: Array.from({ length: 12 }, (_, index) => ({
          role: index === 11 ? 'unmapped' : 'weekday',
        })),
        missingRequired: [],
      },
    })
    expect(mapSummary?.items.map((item) => [item.label, item.value])).toEqual([
      ['File', 'Amore Drinks.xlsx'],
      ['Worksheet', 'June 8–14'],
      ['Detected', '12'],
      ['Mapped', '11'],
      ['Missing', 'None'],
    ])

    const validateSummary = buildInventoryImportStepSummary({
      wizardView: 'data',
      selectedFile: { name: 'Amore Drinks.xlsx' },
      selectedWorksheetName: 'Inventory',
      operationalModel: { summary: { productCount: 144 } },
      validateImportGroups: {
        summary: { rows: 144, ready: 120, errors: 24 },
        groups: [{ id: 'blocked_rows', count: 3 }],
      },
    })
    expect(validateSummary?.items.find((item) => item.id === 'products')?.value).toBe('144')
    expect(validateSummary?.items.find((item) => item.id === 'ready')?.value).toBe('120')
    expect(validateSummary?.items.find((item) => item.id === 'attention')?.value).toBe('21')
    expect(validateSummary?.items.find((item) => item.id === 'blocked')?.value).toBe('3')

    const previewSummary = buildInventoryImportStepSummary({
      wizardView: 'preview',
      readyEligibility: { counts: { create: 118, link: 20, skip: 6 } },
      importSessionPolicy: {
        quantityPolicy: 'opening_stock',
        newProductLocationFallback: 'Main Storage',
      },
    })
    expect(previewSummary?.items.map((item) => [item.label, item.value])).toEqual([
      ['Create', '118'],
      ['Link', '20'],
      ['Skip', '6'],
      ['Opening Stock', 'Yes'],
      ['Storage', 'Main Storage'],
    ])

    const readySummary = buildInventoryImportStepSummary({
      wizardView: 'ready',
      readyEligibility: {
        isReady: true,
        counts: { create: 118, link: 20, skip: 6 },
      },
      importSessionPolicy: {
        quantityPolicy: 'no_change',
        newProductLocationFallback: null,
      },
    })
    expect(readySummary?.items.find((item) => item.id === 'total')?.value).toBe('144')
    expect(readySummary?.items.find((item) => item.id === 'opening')?.value).toBe('No')
    expect(readySummary?.items.find((item) => item.id === 'status')?.value).toBe('Ready')
  })
})

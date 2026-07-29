import { describe, expect, it } from 'vitest'
import {
  INVENTORY_IMPORT_MAP_PREVIEW_ROW_LIMIT,
  buildInventoryImportColumnMappingSummary,
  buildInventoryImportMapSamplePreview,
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
})

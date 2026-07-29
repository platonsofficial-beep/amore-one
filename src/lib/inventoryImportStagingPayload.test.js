// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  INVENTORY_IMPORT_QUANTITY_POLICY,
} from './inventoryImportEligibility.js'
import {
  INVENTORY_IMPORT_STAGED_ACTION,
  INVENTORY_IMPORT_STAGING_ERROR,
  INVENTORY_IMPORT_STAGING_VERSION,
  InventoryImportStagingPayloadError,
  buildInventoryImportRowPayload,
  buildInventoryImportSessionPayload,
  buildInventoryImportStagingPayload,
  mapReviewedActionToStagedAction,
} from './inventoryImportStagingPayload.js'

const SUPPLIER_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

function selectedFile(overrides = {}) {
  return {
    name: 'weekly-stock.xlsx',
    extension: 'xlsx',
    sizeBytes: 2048,
    fingerprint: 'fp-abc',
    ...overrides,
  }
}

function baseLink(overrides = {}) {
  return {
    source: {
      category: 'Vodka',
      productName: 'Ketel One',
      storage: 4,
      bar: 1,
      weekdays: null,
      order: null,
      stockControl: null,
    },
    match: {
      status: 'exact_match',
      matchedStockItem: {
        id: 'item-1',
        name: 'Ketel One',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
      },
      candidates: [],
      evidence: ['exact_name'],
    },
    existingOne: {
      id: 'item-1',
      name: 'Ketel One',
      category: 'Vodka',
      unit: 'Bottle',
      sku: null,
      storageLocation: 'Bar',
      currentQuantity: 2,
      active: true,
    },
    proposedAction: 'link_existing',
    quantityProposal: {
      status: 'requires_policy',
      currentOneQuantity: 2,
      sourceStorage: 4,
      sourceBar: 1,
      proposedQuantity: null,
      calculationRule: null,
    },
    locationProposal: {
      status: 'not_applicable',
      currentOneLocation: 'Bar',
      proposedStorageLocation: null,
      rule: null,
    },
    metadataProposal: {
      sourceCategory: 'Vodka',
      proposedCategory: null,
      sourceUnit: null,
      proposedUnit: null,
      proposedActive: true,
    },
    warnings: [],
    blockers: [],
    ...overrides,
  }
}

function readyCreate(overrides = {}) {
  return {
    source: {
      category: null,
      productName: 'Brand New Spirit',
      storage: 'Cellar',
      bar: null,
      weekdays: null,
      order: null,
      stockControl: null,
    },
    match: {
      status: 'new_product',
      matchedStockItem: null,
      candidates: [],
      evidence: [],
    },
    existingOne: null,
    proposedAction: 'create_new',
    quantityProposal: {
      status: 'requires_policy',
      currentOneQuantity: null,
      sourceStorage: 'Cellar',
      sourceBar: null,
      proposedQuantity: null,
      calculationRule: null,
    },
    locationProposal: {
      status: 'requires_policy',
      currentOneLocation: null,
      proposedStorageLocation: 'Main Storage',
      rule: 'mapped',
    },
    metadataProposal: {
      sourceCategory: null,
      proposedCategory: 'Other',
      sourceUnit: null,
      proposedUnit: 'Bottle 700ml',
      proposedActive: true,
    },
    draft: {
      productName: 'Brand New Spirit',
      category: 'Other',
      unit: 'Bottle 700ml',
      storage: 'Main Storage',
      valid: true,
    },
    resolvedStorageLocation: 'Main Storage',
    warnings: [],
    blockers: [],
    ...overrides,
  }
}

function readyEligibility(overrides = {}) {
  return {
    isReady: true,
    blockingReasons: [],
    warningReasons: [],
    counts: { totalRows: 1, applicable: 1, create: 1, link: 0, skip: 0 },
    ...overrides,
  }
}

function policy(overrides = {}) {
  return {
    quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE,
    existingQuantityOverwriteConfirmed: false,
    newProductLocationFallback: null,
    ...overrides,
  }
}

describe('mapReviewedActionToStagedAction', () => {
  it('maps wizard actions to schema actions', () => {
    expect(mapReviewedActionToStagedAction('create_new')).toBe('create')
    expect(mapReviewedActionToStagedAction('link_existing')).toBe('link')
    expect(mapReviewedActionToStagedAction('skip')).toBe('skip')
    expect(mapReviewedActionToStagedAction('skip_invalid')).toBe('skip')
    expect(mapReviewedActionToStagedAction('requires_resolution')).toBe('manual_review')
    expect(mapReviewedActionToStagedAction('blocked')).toBe('manual_review')
    expect(mapReviewedActionToStagedAction('update')).toBe('update')
  })
})

describe('buildInventoryImportStagingPayload — session', () => {
  it('maps source metadata, review status, confirmations, and derived counters', () => {
    const preview = { rows: [readyCreate(), baseLink()] }
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      selectedWorksheetName: 'Sheet1',
      headerRowNumber: 2,
      preview,
      policy: policy(),
      eligibility: readyEligibility({
        counts: { totalRows: 2, applicable: 2, create: 1, link: 1, skip: 0 },
      }),
      parserVersion: 'operational_sheet_parser_v1',
      normalizationVersion: 'norm_v1',
      validationVersion: 'val_v1',
      contractVersion: 'import_v1.0',
    })

    expect(result.stagingVersion).toBe(INVENTORY_IMPORT_STAGING_VERSION)
    expect(result.session.status).toBe('review')
    expect(result.session.workspace_id).toBe('ws-1')
    expect(result.session.source_filename).toBe('weekly-stock.xlsx')
    expect(result.session.source_format).toBe('xlsx')
    expect(result.session.source_file_size_bytes).toBe(2048)
    expect(result.session.source_fingerprint).toBe('fp-abc')
    expect(result.session.selected_sheet).toBe('Sheet1')
    expect(result.session.header_row_number).toBe(2)
    expect(result.session.parser_version).toBe('operational_sheet_parser_v1')
    expect(result.session.normalization_version).toBe('norm_v1')
    expect(result.session.validation_version).toBe('val_v1')
    expect(result.session.contract_version).toBe('import_v1.0')
    expect(result.session.confirmations.quantityPolicy).toBe('no_change')
    expect(result.session.confirmations.existingQuantityOverwriteConfirmed).toBe(false)
    expect(result.session.confirmations.newProductLocationFallback).toBeNull()
    expect(result.session.confirmations.eligibilitySummary.isReady).toBe(true)
    expect(result.session.source_metadata.stagingVersion).toBe(INVENTORY_IMPORT_STAGING_VERSION)
    expect(result.session.source_metadata.totalReviewedRows).toBe(2)
    expect(result.session.total_rows).toBe(2)
    expect(result.session.create_rows).toBe(1)
    expect(result.session.link_rows).toBe(1)
    expect(result.session.update_rows).toBe(0)
    expect(result.session.skip_rows).toBe(0)
    expect(result.session).not.toHaveProperty('id')
    expect(result.session).not.toHaveProperty('created_by')
    expect(result.session).not.toHaveProperty('created_at')
    expect(result.session).not.toHaveProperty('apply_result')
    expect(result.session).not.toHaveProperty('apply_started_at')
  })

  it('stores session fallback evidence without timestamps or user ids', () => {
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: {
        rows: [readyCreate({
          draft: {
            productName: 'Brand New Spirit',
            category: 'Other',
            unit: 'Bottle 700ml',
            storage: null,
          },
          resolvedStorageLocation: null,
          locationProposal: {
            status: 'requires_policy',
            currentOneLocation: null,
            proposedStorageLocation: null,
            rule: null,
          },
        })],
      },
      policy: policy({ newProductLocationFallback: 'Wine Cellar' }),
      eligibility: readyEligibility(),
    })

    expect(result.session.confirmations.newProductLocationFallback).toBe('Wine Cellar')
    expect(result.rows[0].confirm_location_fallback).toBe(true)
    expect(result.rows[0].normalized_payload.locationKey).toBe('Wine Cellar')
    expect(JSON.stringify(result.session.confirmations)).not.toMatch(/created_by|timestamp|userId/i)
  })
})

describe('create rows', () => {
  it('serializes name/category/unit/storage and preserves custom workspace Storage', () => {
    const row = readyCreate({
      draft: {
        productName: 'Sparkling Water',
        category: 'Water',
        unit: 'Bottle 1L',
        storage: 'Apothiki 2',
        supplier: 'Malakakos AE',
        supplierId: SUPPLIER_UUID,
      },
      resolvedStorageLocation: 'Apothiki 2',
    })
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: { rows: [row] },
      policy: policy(),
      eligibility: readyEligibility(),
    })

    const staged = result.rows[0]
    expect(staged.selected_action).toBe('create')
    expect(staged.normalized_payload.name).toBe('Sparkling Water')
    expect(staged.normalized_payload.category).toBe('Water')
    expect(staged.normalized_payload.unit).toBe('Bottle 1L')
    expect(staged.normalized_payload.storageLocation).toBe('Apothiki 2')
    expect(staged.normalized_payload.locationKey).toBe('Apothiki 2')
    expect(staged.normalized_payload.supplier).toBe('Malakakos AE')
    expect(staged.normalized_payload.supplierId).toBe(SUPPLIER_UUID)
    expect(staged.confirm_location_fallback).toBe(false)
    expect(staged.confirm_quantity_update).toBe(false)
    expect(staged.normalized_payload).not.toHaveProperty('resolvedQuantity')
  })

  it('preserves no-supplier as empty text + null UUID', () => {
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: {
        rows: [readyCreate({
          draft: {
            productName: 'Brand New Spirit',
            category: 'Other',
            unit: 'Bottle 700ml',
            storage: 'Kitchen Freezer',
            supplier: '',
            supplierId: null,
          },
          resolvedStorageLocation: 'Kitchen Freezer',
        })],
      },
      policy: policy(),
      eligibility: readyEligibility(),
    })

    expect(result.rows[0].normalized_payload.supplier).toBe('')
    expect(result.rows[0].normalized_payload.supplierId).toBeNull()
  })

  it('opening_stock includes valid resolved quantity; explicit Storage wins over fallback', () => {
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: {
        rows: [readyCreate({
          resolvedQuantity: 0,
          draft: {
            productName: 'Brand New Spirit',
            category: 'Other',
            unit: 'Bottle 700ml',
            storage: 'Water Storage',
          },
          resolvedStorageLocation: 'Water Storage',
        })],
      },
      policy: policy({
        quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
        newProductLocationFallback: 'Main Storage',
      }),
      eligibility: readyEligibility(),
    })

    expect(result.rows[0].normalized_payload.resolvedQuantity).toBe(0)
    expect(result.rows[0].normalized_payload.locationKey).toBe('Water Storage')
    expect(result.rows[0].confirm_location_fallback).toBe(false)
  })
})

describe('link rows', () => {
  it('requires matched item id and excludes metadata mutations', () => {
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: { rows: [baseLink()] },
      policy: policy(),
      eligibility: readyEligibility({
        counts: { totalRows: 1, applicable: 1, create: 0, link: 1, skip: 0 },
      }),
    })

    const staged = result.rows[0]
    expect(staged.selected_action).toBe('link')
    expect(staged.matched_stock_item_id).toBe('item-1')
    expect(staged.confirm_quantity_update).toBe(false)
    expect(staged.normalized_payload).not.toHaveProperty('name')
    expect(staged.normalized_payload).not.toHaveProperty('category')
    expect(staged.normalized_payload).not.toHaveProperty('unit')
    expect(staged.normalized_payload).not.toHaveProperty('storageLocation')
    expect(staged.normalized_payload).not.toHaveProperty('supplier')
    expect(staged.normalized_payload).not.toHaveProperty('active')
    expect(staged.raw_payload.sourceLocationEvidence.storage).toBe(4)
  })

  it('opening_stock stores quantity and confirm_quantity_update', () => {
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: { rows: [baseLink({ resolvedQuantity: 12 })] },
      policy: policy({
        quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
        existingQuantityOverwriteConfirmed: true,
      }),
      eligibility: readyEligibility(),
    })

    expect(result.rows[0].normalized_payload.resolvedQuantity).toBe(12)
    expect(result.rows[0].confirm_quantity_update).toBe(true)
  })
})

describe('skip rows', () => {
  it('stages explicit skip and skip_invalid without mutation payloads', () => {
    const result = buildInventoryImportStagingPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: {
        rows: [
          {
            ...readyCreate({ proposedAction: 'skip' }),
            proposedAction: 'skip',
            draft: undefined,
            blockers: [],
            warnings: [],
          },
          {
            source: { productName: '', category: null, storage: null, bar: null },
            match: { status: 'invalid_source', matchedStockItem: null, candidates: [], evidence: [] },
            existingOne: null,
            proposedAction: 'skip_invalid',
            quantityProposal: {},
            locationProposal: {},
            metadataProposal: {},
            warnings: [],
            blockers: ['invalid_source_name'],
          },
        ],
      },
      policy: policy(),
      eligibility: readyEligibility({
        counts: { totalRows: 2, applicable: 0, create: 0, link: 0, skip: 2 },
      }),
    })

    expect(result.session.skip_rows).toBe(2)
    expect(result.session.create_rows).toBe(0)
    expect(result.rows[0].selected_action).toBe('skip')
    expect(result.rows[0].normalized_payload.skipReason).toBe('explicit_skip')
    expect(result.rows[0].validation_state).toBe('valid')
    expect(result.rows[1].selected_action).toBe('skip')
    expect(result.rows[1].normalized_payload.skipReason).toBe('skip_invalid')
    expect(result.rows[1].validation_state).toBe('error')
    expect(result.rows[0].normalized_payload).not.toHaveProperty('resolvedQuantity')
    expect(result.rows[0].apply_state).toBe('pending')
  })
})

describe('defensive rejection', () => {
  it('rejects eligibility not ready / unresolved / update / missing fields / bad quantity / duplicates', () => {
    const baseInput = {
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      preview: { rows: [readyCreate()] },
      policy: policy(),
      eligibility: readyEligibility(),
    }

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      eligibility: { isReady: false, blockingReasons: ['x'] },
    })).toThrow(InventoryImportStagingPayloadError)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: { rows: [{ ...readyCreate(), proposedAction: 'requires_resolution' }] },
    })).toThrowError(/unresolved/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: { rows: [{ ...readyCreate(), proposedAction: 'update' }] },
    })).toThrowError(/update/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: {
        rows: [readyCreate({
          draft: {
            productName: '',
            category: 'Other',
            unit: 'Bottle 700ml',
            storage: 'Bar',
          },
        })],
      },
    })).toThrowError(/product name/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: {
        rows: [readyCreate({
          draft: {
            productName: 'X',
            category: 'Other',
            unit: '',
            storage: 'Bar',
          },
        })],
      },
    })).toThrowError(/unit/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: {
        rows: [readyCreate({
          draft: {
            productName: 'X',
            category: 'Other',
            unit: 'Bottle 700ml',
            storage: null,
          },
          resolvedStorageLocation: null,
          locationProposal: {
            status: 'requires_policy',
            proposedStorageLocation: null,
            resolvedStorageLocation: null,
            rule: null,
          },
        })],
      },
      policy: policy({ newProductLocationFallback: null }),
    })).toThrowError(/storage/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: { rows: [readyCreate({ resolvedQuantity: -1 })] },
      policy: policy({ quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK }),
    })).toThrowError(/quantity/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: { rows: [baseLink({ resolvedQuantity: 5 })] },
      policy: policy({
        quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
        existingQuantityOverwriteConfirmed: false,
      }),
    })).toThrowError(/overwrite/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: {
        rows: [
          baseLink({ resolvedQuantity: 1 }),
          baseLink({
            source: { ...baseLink().source, productName: 'Ketel One Duplicate' },
            resolvedQuantity: 2,
          }),
        ],
      },
      policy: policy({
        quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
        existingQuantityOverwriteConfirmed: true,
      }),
    })).toThrowError(/duplicate/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      preview: {
        rows: [baseLink({
          existingOne: null,
          match: { status: 'exact_match', matchedStockItem: null, candidates: [], evidence: [] },
        })],
      },
    })).toThrowError(/matched stock item/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      workspaceId: '',
    })).toThrowError(/workspaceId/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      selectedFile: { extension: 'xlsx' },
    })).toThrowError(/selectedFile/i)

    expect(() => buildInventoryImportStagingPayload({
      ...baseInput,
      policy: policy({ quantityPolicy: 'unset' }),
    })).toThrowError(/quantityPolicy/i)

    try {
      buildInventoryImportStagingPayload({
        ...baseInput,
        eligibility: { isReady: false },
      })
    } catch (error) {
      expect(error.code).toBe(INVENTORY_IMPORT_STAGING_ERROR.ELIGIBILITY_NOT_READY)
    }
  })
})

describe('determinism and immutability', () => {
  it('produces stable order, surrogate row numbers, identical output, and does not mutate inputs', () => {
    const preview = {
      rows: [
        readyCreate({ draft: { ...readyCreate().draft, productName: 'A', storage: 'Bar' }, resolvedStorageLocation: 'Bar' }),
        baseLink(),
        {
          source: { productName: 'Skip Me', category: null, storage: null, bar: null },
          match: { status: 'new_product', matchedStockItem: null, candidates: [], evidence: [] },
          existingOne: null,
          proposedAction: 'skip',
          quantityProposal: {},
          locationProposal: {},
          metadataProposal: {},
          warnings: [],
          blockers: [],
        },
      ],
    }
    const input = {
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      selectedWorksheetName: 'Ops',
      headerRowNumber: 1,
      preview,
      policy: policy(),
      eligibility: readyEligibility({
        counts: { totalRows: 3, applicable: 2, create: 1, link: 1, skip: 1 },
      }),
    }
    const previewSnapshot = JSON.stringify(preview)
    const policySnapshot = JSON.stringify(input.policy)
    const fileSnapshot = JSON.stringify(input.selectedFile)

    const first = buildInventoryImportStagingPayload(input)
    const second = buildInventoryImportStagingPayload(input)

    expect(first).toEqual(second)
    expect(first.rows.map((row) => row.source_row_number)).toEqual([1, 2, 3])
    expect(first.rows.map((row) => row.selected_action)).toEqual(['create', 'link', 'skip'])
    expect(first.session.total_rows).toBe(3)
    expect(first.session.create_rows
      + first.session.link_rows
      + first.session.skip_rows).toBe(3)
    expect(JSON.stringify(preview)).toBe(previewSnapshot)
    expect(JSON.stringify(input.policy)).toBe(policySnapshot)
    expect(JSON.stringify(input.selectedFile)).toBe(fileSnapshot)
    expect(JSON.stringify(first)).not.toMatch(/"file":/)
    expect(typeof first.session.source_metadata.stagingVersion).toBe('string')
  })
})

describe('buildInventoryImportRowPayload / session helpers', () => {
  it('allows single-row manual_review helper for tests but keeps apply pending', () => {
    const staged = buildInventoryImportRowPayload({
      workspaceId: 'ws-1',
      index: 0,
      policy: policy(),
      row: {
        ...readyCreate(),
        proposedAction: 'requires_resolution',
        match: {
          status: 'possible_match',
          matchedStockItem: null,
          candidates: [{ stockItem: { id: 'item-9' }, evidence: [] }],
          evidence: [],
        },
        blockers: ['possible_match_unresolved'],
      },
    })
    expect(staged.selected_action).toBe(INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW)
    expect(staged.apply_state).toBe('pending')
    expect(staged.conflict_state).toBe('possible_match')
  })

  it('session counters are derived from row payloads, not preview summary', () => {
    const rows = [
      buildInventoryImportRowPayload({
        workspaceId: 'ws-1',
        index: 0,
        policy: policy(),
        row: readyCreate(),
      }),
      buildInventoryImportRowPayload({
        workspaceId: 'ws-1',
        index: 1,
        policy: policy(),
        row: { ...readyCreate(), proposedAction: 'skip' },
      }),
    ]
    const session = buildInventoryImportSessionPayload({
      workspaceId: 'ws-1',
      selectedFile: selectedFile(),
      policy: policy(),
      eligibility: readyEligibility({
        counts: { totalRows: 99, create: 99, link: 99, skip: 99 },
      }),
      rowPayloads: rows,
    })
    expect(session.total_rows).toBe(2)
    expect(session.create_rows).toBe(1)
    expect(session.skip_rows).toBe(1)
    expect(session.link_rows).toBe(0)
  })
})

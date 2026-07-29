// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  INVENTORY_IMPORT_ELIGIBILITY_BLOCKER,
  INVENTORY_IMPORT_ELIGIBILITY_WARNING,
  INVENTORY_IMPORT_QUANTITY_POLICY,
  INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION,
  evaluateInventoryImportReadyEligibility,
  getResolvedImportQuantity,
  getResolvedImportStorageLocation,
  isCanonicalStockLocation,
  normalizeCanonicalStockLocation,
  normalizeInventoryImportQuantityPolicy,
  normalizeInventoryImportSessionPolicy,
} from './inventoryImportEligibility.js'
import { STOCK_LOCATIONS } from './stockCatalog.js'

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
      matchedStockItem: { id: 'item-1', name: 'Ketel One', category: 'Vodka', unit: 'Bottle', sku: null, active: true },
      candidates: [],
      evidence: [],
    },
    existingOne: {
      id: 'item-1',
      name: 'Ketel One',
      category: 'Vodka',
      unit: 'Bottle',
      sku: null,
      storageLocation: null,
      currentQuantity: null,
      active: true,
    },
    proposedAction: 'link_existing',
    quantityProposal: {
      status: 'requires_policy',
      currentOneQuantity: null,
      sourceStorage: 4,
      sourceBar: 1,
      proposedQuantity: null,
      calculationRule: null,
    },
    locationProposal: {
      status: 'not_applicable',
      currentOneLocation: null,
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
    warnings: ['source_quantity_requires_policy'],
    blockers: ['quantity_policy_unset'],
    ...overrides,
  }
}

function baseCreate(overrides = {}) {
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
      proposedStorageLocation: null,
      rule: null,
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
      valid: true,
    },
    warnings: [
      'category_defaulted_to_other',
      'source_location_requires_policy',
      'source_quantity_requires_policy',
    ],
    blockers: ['quantity_policy_unset', 'location_policy_unset'],
    ...overrides,
  }
}

function preview(rows) {
  return { previewVersion: 1, rows, summary: {} }
}

function policy(partial = {}) {
  return {
    quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE,
    existingQuantityOverwriteConfirmed: false,
    newProductLocationFallback: null,
    ...partial,
  }
}

function readyCreate(overrides = {}) {
  return baseCreate({
    resolvedStorageLocation: 'Bar',
    ...overrides,
  })
}

describe('inventoryImportEligibility — policy normalization', () => {
  it('keeps explicit no_change and opening_stock', () => {
    expect(normalizeInventoryImportQuantityPolicy('no_change'))
      .toBe(INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.NO_CHANGE)
    expect(normalizeInventoryImportQuantityPolicy('opening_stock'))
      .toBe(INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.OPENING_STOCK)
  })

  it('does not silently enable opening stock or product default for missing/unknown', () => {
    expect(normalizeInventoryImportQuantityPolicy(undefined))
      .toBe(INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET)
    expect(normalizeInventoryImportQuantityPolicy(null))
      .toBe(INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET)
    expect(normalizeInventoryImportQuantityPolicy(''))
      .toBe(INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET)
    expect(normalizeInventoryImportQuantityPolicy('add_to_existing'))
      .toBe(INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET)
  })

  it('normalizes session policy without inventing persistence evidence', () => {
    expect(normalizeInventoryImportSessionPolicy({
      quantityPolicy: 'opening_stock',
      existingQuantityOverwriteConfirmed: true,
      newProductLocationFallback: 'Kitchen',
    })).toEqual({
      quantityPolicy: 'opening_stock',
      existingQuantityOverwriteConfirmed: true,
      newProductLocationFallback: 'Kitchen',
    })
  })
})

describe('inventoryImportEligibility — resolved quantity/location helpers', () => {
  it('reads narrow resolved quantity fields and rejects negative/malformed', () => {
    expect(getResolvedImportQuantity({})).toEqual({ status: 'missing', value: null })
    expect(getResolvedImportQuantity({ resolvedQuantity: 0 }))
      .toEqual({ status: 'valid', value: 0 })
    expect(getResolvedImportQuantity({ resolvedQuantity: 12.5 }))
      .toEqual({ status: 'valid', value: 12.5 })
    expect(getResolvedImportQuantity({ quantityProposal: { proposedQuantity: '3' } }))
      .toEqual({ status: 'valid', value: 3 })
    expect(getResolvedImportQuantity({ resolvedQuantity: -1 }))
      .toEqual({ status: 'invalid', value: null })
    expect(getResolvedImportQuantity({ resolvedQuantity: 'abc' }))
      .toEqual({ status: 'invalid', value: null })
    expect(getResolvedImportQuantity({
      source: { storage: 9 },
      quantityProposal: { sourceStorage: 9, proposedQuantity: null },
    })).toEqual({ status: 'missing', value: null })
  })

  it('accepts only canonical locations and never remaps to Main Storage', () => {
    expect(STOCK_LOCATIONS).toContain('Main Storage')
    expect(isCanonicalStockLocation('Bar')).toBe(true)
    expect(normalizeCanonicalStockLocation('Cellar')).toBeNull()
    expect(getResolvedImportStorageLocation({
      locationProposal: { proposedStorageLocation: 'Main Storage' },
    })).toBe('Main Storage')
    expect(getResolvedImportStorageLocation({
      locationProposal: { proposedStorageLocation: 'Cellar' },
    })).toBeNull()
    expect(getResolvedImportStorageLocation({
      source: { storage: 'Main Storage' },
    })).toBeNull()
  })
})

describe('inventoryImportEligibility — default quantity policy', () => {
  it('allows missing quantities and does not require overwrite confirmation', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([
        baseLink({ blockers: ['quantity_policy_unset'] }),
        readyCreate({ blockers: ['quantity_policy_unset', 'location_policy_unset'] }),
      ]),
      policy: policy({ quantityPolicy: 'no_change' }),
    })

    expect(result.isReady).toBe(true)
    expect(result.quantity.overwriteConfirmationRequired).toBe(false)
    expect(result.quantity.overwriteConfirmationMissing).toBe(false)
    expect(result.quantity.missingQuantity).toBe(0)
    expect(result.blockingReasons).not.toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.QUANTITY_POLICY_UNSET,
    )
    expect(result.blockingReasons).not.toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_OPENING_QUANTITY,
    )
  })

  it('reconciles quantity_policy_unset when no_change is explicitly selected', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([baseLink()]),
      policy: policy({ quantityPolicy: 'no_change' }),
    })
    expect(result.isReady).toBe(true)
    expect(result.blockingReasons).toEqual([])
  })

  it('blocks when quantity policy remains unset', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([baseLink()]),
      policy: policy({ quantityPolicy: undefined }),
    })
    expect(result.isReady).toBe(false)
    expect(result.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.QUANTITY_POLICY_UNSET,
    )
  })

  it('still requires create name, unit, and location under no_change', () => {
    const missingFields = evaluateInventoryImportReadyEligibility({
      preview: preview([baseCreate({
        draft: { productName: '', category: 'Other', unit: null, valid: false },
        metadataProposal: {
          sourceCategory: null,
          proposedCategory: 'Other',
          sourceUnit: null,
          proposedUnit: null,
          proposedActive: true,
        },
        blockers: ['unit_missing', 'quantity_policy_unset', 'location_policy_unset'],
      })]),
      policy: policy({ quantityPolicy: 'no_change' }),
    })

    expect(missingFields.isReady).toBe(false)
    expect(missingFields.blockingReasons).toEqual(expect.arrayContaining([
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_NAME,
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_UNIT,
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION,
    ]))
  })
})

describe('inventoryImportEligibility — opening-stock policy', () => {
  it('allows valid positive and zero quantities when overwrite is confirmed', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([
        baseLink({ resolvedQuantity: 12 }),
        readyCreate({ resolvedQuantity: 0 }),
      ]),
      policy: policy({
        quantityPolicy: 'opening_stock',
        existingQuantityOverwriteConfirmed: true,
      }),
    })
    expect(result.isReady).toBe(true)
    expect(result.quantity.linkedItemsAffectedByOpeningStock).toBe(1)
    expect(result.quantity.overwriteConfirmationRequired).toBe(true)
    expect(result.quantity.overwriteConfirmationMissing).toBe(false)
  })

  it('blocks missing, negative, and malformed opening quantities', () => {
    const missing = evaluateInventoryImportReadyEligibility({
      preview: preview([readyCreate()]),
      policy: policy({ quantityPolicy: 'opening_stock' }),
    })
    expect(missing.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_OPENING_QUANTITY,
    )

    const negative = evaluateInventoryImportReadyEligibility({
      preview: preview([readyCreate({ resolvedQuantity: -2 })]),
      policy: policy({ quantityPolicy: 'opening_stock' }),
    })
    expect(negative.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.INVALID_OPENING_QUANTITY,
    )

    const malformed = evaluateInventoryImportReadyEligibility({
      preview: preview([readyCreate({ resolvedQuantity: 'twelve' })]),
      policy: policy({ quantityPolicy: 'opening_stock' }),
    })
    expect(malformed.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.INVALID_OPENING_QUANTITY,
    )
  })

  it('requires overwrite confirmation for linked existing items and clears when confirmed', () => {
    const unconfirmed = evaluateInventoryImportReadyEligibility({
      preview: preview([baseLink({ resolvedQuantity: 5 })]),
      policy: policy({
        quantityPolicy: 'opening_stock',
        existingQuantityOverwriteConfirmed: false,
      }),
    })
    expect(unconfirmed.isReady).toBe(false)
    expect(unconfirmed.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.EXISTING_QUANTITY_OVERWRITE_UNCONFIRMED,
    )
    expect(unconfirmed.quantity.overwriteConfirmationMissing).toBe(true)

    const confirmed = evaluateInventoryImportReadyEligibility({
      preview: preview([baseLink({ resolvedQuantity: 5 })]),
      policy: policy({
        quantityPolicy: 'opening_stock',
        existingQuantityOverwriteConfirmed: true,
      }),
    })
    expect(confirmed.isReady).toBe(true)
    expect(confirmed.blockingReasons).not.toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.EXISTING_QUANTITY_OVERWRITE_UNCONFIRMED,
    )
  })
})

describe('inventoryImportEligibility — locations', () => {
  it('passes resolved canonical create location and blocks unresolved', () => {
    const resolved = evaluateInventoryImportReadyEligibility({
      preview: preview([readyCreate()]),
      policy: policy(),
    })
    expect(resolved.isReady).toBe(true)
    expect(resolved.location.unresolvedCreateLocationCount).toBe(0)

    const unresolved = evaluateInventoryImportReadyEligibility({
      preview: preview([baseCreate()]),
      policy: policy(),
    })
    expect(unresolved.isReady).toBe(false)
    expect(unresolved.location.unresolvedCreateLocationCount).toBe(1)
    expect(unresolved.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION,
    )
  })

  it('applies valid fallback only to unresolved create rows', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([
        readyCreate({ resolvedStorageLocation: 'Bar' }),
        baseCreate({ source: { ...baseCreate().source, productName: 'Second' }, draft: {
          productName: 'Second',
          category: 'Other',
          unit: 'Bottle 700ml',
          valid: true,
        } }),
      ]),
      policy: policy({ newProductLocationFallback: 'Kitchen' }),
    })
    expect(result.isReady).toBe(true)
    expect(result.location.fallbackAffectedRowCount).toBe(1)
    expect(result.location.fallbackLocation).toBe('Kitchen')
  })

  it('blocks invalid fallback and never silently uses Main Storage', () => {
    const invalid = evaluateInventoryImportReadyEligibility({
      preview: preview([baseCreate()]),
      policy: policy({ newProductLocationFallback: 'Cellar Closet' }),
    })
    expect(invalid.isReady).toBe(false)
    expect(invalid.location.fallbackInvalid).toBe(true)
    expect(invalid.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.INVALID_LOCATION_FALLBACK,
    )
    expect(invalid.location.fallbackLocation).toBeNull()

    const noFallback = evaluateInventoryImportReadyEligibility({
      preview: preview([baseCreate()]),
      policy: policy({ newProductLocationFallback: null }),
    })
    expect(noFallback.location.fallbackLocation).toBeNull()
    expect(noFallback.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION,
    )
  })

  it('treats linked existing location conflict as warning-only', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([baseLink({
        existingOne: {
          id: 'item-1',
          name: 'Ketel One',
          category: 'Vodka',
          unit: 'Bottle',
          sku: null,
          storageLocation: 'Bar',
          currentQuantity: null,
          active: true,
        },
        resolvedStorageLocation: 'Kitchen',
      })]),
      policy: policy(),
    })
    expect(result.isReady).toBe(true)
    expect(result.warningReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_WARNING.EXISTING_LOCATION_CONFLICT,
    )
    expect(result.blockingReasons).not.toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION,
    )
  })
})

describe('inventoryImportEligibility — actions', () => {
  it('passes resolved link and create under satisfied contracts', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([baseLink(), readyCreate()]),
      policy: policy(),
    })
    expect(result.isReady).toBe(true)
    expect(result.counts.create).toBe(1)
    expect(result.counts.link).toBe(1)
  })

  it('ignores explicit skip and skip_invalid rows', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([
        baseLink(),
        {
          ...baseCreate(),
          proposedAction: 'skip',
          blockers: [],
        },
        {
          ...baseCreate({ source: { ...baseCreate().source, productName: '' } }),
          proposedAction: 'skip_invalid',
          blockers: ['invalid_source_name'],
        },
      ]),
      policy: policy(),
    })
    expect(result.isReady).toBe(true)
    expect(result.counts.skip).toBe(2)
  })

  it('blocks unresolved/manual-review and forbidden update actions', () => {
    const unresolved = evaluateInventoryImportReadyEligibility({
      preview: preview([{
        ...baseLink(),
        proposedAction: 'requires_resolution',
        existingOne: null,
        blockers: ['possible_match_unresolved'],
      }]),
      policy: policy(),
    })
    expect(unresolved.isReady).toBe(false)
    expect(unresolved.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_MATCHES,
    )

    const update = evaluateInventoryImportReadyEligibility({
      preview: preview([{
        ...baseLink(),
        proposedAction: 'update',
        blockers: [],
      }]),
      policy: policy(),
    })
    expect(update.isReady).toBe(false)
    expect(update.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.FORBIDDEN_UPDATE_ACTION,
    )
    expect(update.forbiddenUpdateCount).toBe(1)
  })
})

describe('inventoryImportEligibility — duplicate targets', () => {
  it('blocks two non-skipped links to the same stock item with deterministic evidence', () => {
    const result = evaluateInventoryImportReadyEligibility({
      preview: preview([
        baseLink({
          source: { ...baseLink().source, productName: 'Ketel One A' },
        }),
        baseLink({
          source: { ...baseLink().source, productName: 'Ketel One B' },
        }),
      ]),
      policy: policy(),
    })
    expect(result.isReady).toBe(false)
    expect(result.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.DUPLICATE_EXISTING_TARGET,
    )
    expect(result.duplicateTargets.groupCount).toBe(1)
    expect(result.duplicateTargets.rowCount).toBe(2)
    expect(result.duplicateTargets.stockItemIds).toEqual(['item-1'])
    expect(result.duplicateTargets.groups[0].rowKeys).toEqual([
      '0::Vodka::Ketel One A',
      '1::Vodka::Ketel One B',
    ])
  })

  it('does not block when a duplicate peer is skipped or targets differ', () => {
    const skippedPeer = evaluateInventoryImportReadyEligibility({
      preview: preview([
        baseLink(),
        {
          ...baseLink({
            source: { ...baseLink().source, productName: 'Ketel One B' },
          }),
          proposedAction: 'skip',
          blockers: [],
        },
      ]),
      policy: policy(),
    })
    expect(skippedPeer.isReady).toBe(true)
    expect(skippedPeer.duplicateTargets.groupCount).toBe(0)

    const differentTargets = evaluateInventoryImportReadyEligibility({
      preview: preview([
        baseLink(),
        baseLink({
          source: { ...baseLink().source, productName: 'Grey Goose' },
          existingOne: {
            id: 'item-2',
            name: 'Grey Goose',
            category: 'Vodka',
            unit: 'Bottle',
            sku: null,
            storageLocation: null,
            currentQuantity: null,
            active: true,
          },
          match: {
            status: 'exact_match',
            matchedStockItem: { id: 'item-2', name: 'Grey Goose', category: 'Vodka', unit: 'Bottle', sku: null, active: true },
            candidates: [],
            evidence: [],
          },
        }),
      ]),
      policy: policy(),
    })
    expect(differentTargets.isReady).toBe(true)
    expect(differentTargets.duplicateTargets.groupCount).toBe(0)
  })
})

describe('inventoryImportEligibility — drafts', () => {
  it('blocks missing create name or unit and allows accepted Other category', () => {
    const missingName = evaluateInventoryImportReadyEligibility({
      preview: preview([readyCreate({
        draft: { productName: '   ', category: 'Other', unit: 'Bottle 700ml', valid: false },
      })]),
      policy: policy(),
    })
    expect(missingName.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_NAME,
    )

    const missingUnit = evaluateInventoryImportReadyEligibility({
      preview: preview([readyCreate({
        draft: { productName: 'Spirit', category: 'Other', unit: null, valid: false },
        metadataProposal: {
          sourceCategory: null,
          proposedCategory: 'Other',
          sourceUnit: null,
          proposedUnit: null,
          proposedActive: true,
        },
        blockers: ['unit_missing', 'quantity_policy_unset', 'location_policy_unset'],
      })]),
      policy: policy(),
    })
    expect(missingUnit.blockingReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_UNIT,
    )

    const otherCategory = evaluateInventoryImportReadyEligibility({
      preview: preview([readyCreate()]),
      policy: policy(),
    })
    expect(otherCategory.isReady).toBe(true)
    expect(otherCategory.warningReasons).toContain(
      INVENTORY_IMPORT_ELIGIBILITY_WARNING.CATEGORY_DEFAULTED_TO_OTHER,
    )
  })
})

describe('inventoryImportEligibility — determinism', () => {
  it('returns deeply equal results for the same inputs and does not mutate them', () => {
    const rows = [
      baseLink({ resolvedQuantity: 2 }),
      readyCreate({ resolvedQuantity: 1, resolvedStorageLocation: 'Bar' }),
    ]
    const inputPreview = preview(rows)
    const inputPolicy = policy({
      quantityPolicy: 'opening_stock',
      existingQuantityOverwriteConfirmed: true,
    })
    const previewSnapshot = structuredClone(inputPreview)
    const policySnapshot = structuredClone(inputPolicy)

    const first = evaluateInventoryImportReadyEligibility({
      preview: inputPreview,
      policy: inputPolicy,
    })
    const second = evaluateInventoryImportReadyEligibility({
      preview: inputPreview,
      policy: inputPolicy,
    })

    expect(first).toEqual(second)
    expect(inputPreview).toEqual(previewSnapshot)
    expect(inputPolicy).toEqual(policySnapshot)
    expect(Object.isFrozen(first)).toBe(true)
  })
})

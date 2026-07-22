/**
 * P8.16.13 — Operational possible-match resolution domain tests.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  matchInventoryOperationalProducts,
} from './inventoryOperationalProductMatcher.js'
import {
  buildInventoryOperationalImportPreview,
} from './inventoryOperationalImportPreview.js'
import {
  INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION,
  INVENTORY_OPERATIONAL_MATCH_RESOLUTION_SKIP_ACTION,
  InventoryOperationalMatchResolutionError,
  applyInventoryOperationalMatchResolutions,
  getOperationalMatchResolutionRowKey,
} from './inventoryOperationalMatchResolutions.js'

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'inventoryOperationalMatchResolutions.js'),
  'utf8',
)

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? null,
    unit: partial.unit ?? 'Bottle',
    sku: partial.sku ?? null,
    active: partial.active ?? true,
  }
}

function product(name, extras = {}) {
  return {
    name,
    storage: Object.prototype.hasOwnProperty.call(extras, 'storage') ? extras.storage : null,
    bar: Object.prototype.hasOwnProperty.call(extras, 'bar') ? extras.bar : null,
    weekdays: extras.weekdays ?? null,
    order: extras.order ?? null,
    stockControl: extras.stockControl ?? null,
  }
}

function buildPreview(operationalModel, existingStockItems) {
  const matchingResult = matchInventoryOperationalProducts({
    operationalModel,
    existingStockItems,
  })
  return buildInventoryOperationalImportPreview({
    operationalModel,
    matchingResult,
    existingStockItems,
  })
}

function ketelPreview() {
  return buildPreview(
    {
      categories: [{
        name: 'VODKA',
        products: [
          product('Ketel One 70cl', { storage: 4, bar: 1 }),
          product('Ketel One 1lt', { storage: 2, bar: 0 }),
          product('Belvedere', { storage: 1, bar: 1 }),
          product(''),
        ],
      }],
    },
    [
      stock({ id: 'ko', name: 'KETEL ONE', category: 'Vodka', unit: 'Bottle 0.7L', active: true }),
      stock({ id: 'bv', name: 'Belvedere', category: 'Vodka', unit: 'Bottle', active: true }),
    ],
  )
}

describe('applyInventoryOperationalMatchResolutions', () => {
  it('1. unresolved possible match stays unresolved', () => {
    const preview = ketelPreview()
    const key0 = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    expect(preview.rows[0].proposedAction).toBe('requires_resolution')

    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {},
    })

    expect(derived.rows[0].proposedAction).toBe('requires_resolution')
    expect(derived.rows[0].blockers).toContain('possible_match_unresolved')
    expect(derived.rows[0].existingOne).toBeNull()
    expect(derived.summary.unresolvedPossibleMatches).toBeGreaterThanOrEqual(1)
    expect(key0).toContain('Ketel One 70cl')
  })

  it('2–5. valid candidate link resolves with policy-gated quantity', () => {
    const preview = ketelPreview()
    const key = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {
        [key]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
          selectedStockItemId: 'ko',
        },
      },
    })

    expect(derived.rows[0].proposedAction).toBe('link_existing')
    expect(derived.rows[0].existingOne?.id).toBe('ko')
    expect(derived.rows[0].existingOne?.name).toBe('KETEL ONE')
    expect(derived.rows[0].blockers).not.toContain('possible_match_unresolved')
    expect(derived.rows[0].blockers).toContain('quantity_policy_unset')
    expect(derived.rows[0].quantityProposal.status).toBe('requires_policy')
    expect(derived.rows[0].quantityProposal.proposedQuantity).toBeNull()
    expect(derived.rows[0].resolution?.manuallyResolved).toBe(true)
    expect(derived.summary.resolvedLinks).toBe(1)
  })

  it('6–7. invalid candidate ID is rejected without silent link', () => {
    const preview = ketelPreview()
    const key = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {
        [key]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
          selectedStockItemId: 'not-a-candidate',
        },
      },
    })

    expect(derived.rows[0].proposedAction).toBe('requires_resolution')
    expect(derived.rows[0].existingOne).toBeNull()
    expect(derived.rows[0].blockers).toContain('possible_match_unresolved')
    expect(derived.rows[0].blockers).toContain('selected_match_candidate_invalid')
    expect(derived.summary.resolvedLinks).toBe(0)
  })

  it('8–12. create-new resolution applies safe new-product rules', () => {
    const preview = buildPreview(
      {
        categories: [{
          name: null,
          products: [product('Ketel One 70cl', { storage: 1, bar: 1 })],
        }],
      },
      [stock({ id: 'ko', name: 'KETEL ONE' })],
    )
    const key = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {
        [key]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW,
          selectedStockItemId: null,
        },
      },
    })

    expect(derived.rows[0].proposedAction).toBe('create_new')
    expect(derived.rows[0].source.productName).toBe('Ketel One 70cl')
    expect(derived.rows[0].source.storage).toBe(1)
    expect(derived.rows[0].metadataProposal.proposedCategory).toBe('Other')
    expect(derived.rows[0].warnings).toContain('category_defaulted_to_other')
    expect(derived.rows[0].blockers).toEqual(expect.arrayContaining([
      'unit_missing',
      'quantity_policy_unset',
      'location_policy_unset',
    ]))
    expect(derived.rows[0].blockers).not.toContain('possible_match_unresolved')
    expect(derived.rows[0].quantityProposal.status).toBe('requires_policy')
    expect(derived.rows[0].locationProposal.status).toBe('requires_policy')
    expect(derived.summary.resolvedCreateNew).toBe(1)
  })

  it('13–14. skip keeps row and makes quantity/location not applicable', () => {
    const preview = ketelPreview()
    const key = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {
        [key]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP,
          selectedStockItemId: null,
        },
      },
    })

    expect(derived.rows).toHaveLength(preview.rows.length)
    expect(derived.rows[0].proposedAction).toBe(INVENTORY_OPERATIONAL_MATCH_RESOLUTION_SKIP_ACTION)
    expect(derived.rows[0].source.productName).toBe('Ketel One 70cl')
    expect(derived.rows[0].match.candidates.length).toBeGreaterThan(0)
    expect(derived.rows[0].quantityProposal.status).toBe('not_applicable')
    expect(derived.rows[0].locationProposal.status).toBe('not_applicable')
    expect(derived.rows[0].blockers).not.toContain('possible_match_unresolved')
    expect(derived.summary.resolvedSkipped).toBe(1)
  })

  it('15–17. exact, new-product, and invalid rows stay unaffected', () => {
    const preview = ketelPreview()
    const belvedere = preview.rows.find((row) => row.source.productName === 'Belvedere')
    const invalid = preview.rows.find((row) => row.proposedAction === 'skip_invalid')
    expect(belvedere?.proposedAction).toBe('link_existing')
    expect(invalid?.proposedAction).toBe('skip_invalid')

    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {},
    })

    const derivedBelvedere = derived.rows.find((row) => row.source.productName === 'Belvedere')
    const derivedInvalid = derived.rows.find((row) => row.proposedAction === 'skip_invalid')
    expect(derivedBelvedere?.proposedAction).toBe('link_existing')
    expect(derivedBelvedere?.existingOne?.id).toBe('bv')
    expect(derivedInvalid?.proposedAction).toBe('skip_invalid')
  })

  it('18–21. summary resolution counts', () => {
    const preview = ketelPreview()
    const key0 = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    const key1 = getOperationalMatchResolutionRowKey(preview.rows[1], 1)

    // Force a third possible via duplicate catalog names for Absolut
    const multi = buildPreview(
      {
        categories: [{
          name: 'VODKA',
          products: [
            product('Ketel One 70cl'),
            product('Ketel One 1lt'),
            product('Dup Name'),
          ],
        }],
      },
      [
        stock({ id: 'ko', name: 'KETEL ONE' }),
        stock({ id: 'd1', name: 'Dup Name' }),
        stock({ id: 'd2', name: 'DUP NAME' }),
      ],
    )
    const k0 = getOperationalMatchResolutionRowKey(multi.rows[0], 0)
    const k1 = getOperationalMatchResolutionRowKey(multi.rows[1], 1)
    const k2 = getOperationalMatchResolutionRowKey(multi.rows[2], 2)

    const derived = applyInventoryOperationalMatchResolutions({
      preview: multi,
      resolutions: {
        [k0]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
          selectedStockItemId: 'ko',
        },
        [k1]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW,
          selectedStockItemId: null,
        },
        [k2]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP,
          selectedStockItemId: null,
        },
      },
    })

    expect(derived.summary.resolvedLinks).toBe(1)
    expect(derived.summary.resolvedCreateNew).toBe(1)
    expect(derived.summary.resolvedSkipped).toBe(1)
    expect(derived.summary.unresolvedPossibleMatches).toBe(0)
    expect(key0).not.toBe(key1)
  })

  it('21b. duplicate source names remain independently keyable', () => {
    const preview = buildPreview(
      {
        categories: [{
          name: 'VODKA',
          products: [
            product('Ketel One 70cl', { storage: 1 }),
            product('Ketel One 70cl', { storage: 9 }),
          ],
        }],
      },
      [stock({ id: 'ko', name: 'KETEL ONE' })],
    )

    const key0 = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    const key1 = getOperationalMatchResolutionRowKey(preview.rows[1], 1)
    expect(key0).not.toBe(key1)

    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {
        [key0]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
          selectedStockItemId: 'ko',
        },
        [key1]: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW,
          selectedStockItemId: null,
        },
      },
    })

    expect(derived.rows[0].proposedAction).toBe('link_existing')
    expect(derived.rows[1].proposedAction).toBe('create_new')
    expect(derived.rows[0].source.storage).toBe(1)
    expect(derived.rows[1].source.storage).toBe(9)
  })

  it('22–25. immutability, freeze, determinism', () => {
    const preview = ketelPreview()
    const key = getOperationalMatchResolutionRowKey(preview.rows[0], 0)
    const resolutions = {
      [key]: {
        decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP,
        selectedStockItemId: null,
      },
    }
    const previewBefore = JSON.stringify(preview)
    const resolutionsBefore = JSON.stringify(resolutions)

    const first = applyInventoryOperationalMatchResolutions({ preview, resolutions })
    const second = applyInventoryOperationalMatchResolutions({ preview, resolutions })

    expect(JSON.stringify(preview)).toBe(previewBefore)
    expect(JSON.stringify(resolutions)).toBe(resolutionsBefore)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.rows[0])).toBe(true)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('26. unknown resolution keys are ignored safely', () => {
    const preview = ketelPreview()
    const derived = applyInventoryOperationalMatchResolutions({
      preview,
      resolutions: {
        '999\u0000ghost\u0000row': {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP,
          selectedStockItemId: null,
        },
      },
    })

    expect(derived.summary.resolvedSkipped).toBe(0)
    expect(derived.rows.some((row) => row.proposedAction === 'requires_resolution')).toBe(true)
  })

  it('27. invalid top-level contract throws typed error', () => {
    expect(() => applyInventoryOperationalMatchResolutions({
      preview: null,
      resolutions: {},
    })).toThrow(InventoryOperationalMatchResolutionError)

    expect(() => applyInventoryOperationalMatchResolutions({
      preview: { rows: [] },
      resolutions: null,
    })).toThrow(InventoryOperationalMatchResolutionError)
  })

  it('has no forbidden imports', () => {
    expect(SOURCE).not.toMatch(/from ['"]react['"]/)
    expect(SOURCE).not.toMatch(/from ['"][^'"]*supabase/i)
    expect(SOURCE).not.toMatch(/from ['"][^'"]*\/services\//)
    expect(SOURCE).not.toMatch(/Math\.random/)
  })
})

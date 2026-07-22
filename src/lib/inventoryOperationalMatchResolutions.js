/**
 * P8.16.13 — Operational possible-match local resolution layer.
 *
 * Pure, deterministic overlay on an import preview model. No UI, network,
 * database access, services, or Apply. Does not mutate the base preview or resolutions.
 *
 * Row-key strategy: preview row index + exact source category + productName.
 * Index distinguishes duplicate source names; source identity guards against
 * accidental mis-application if row order drifts. Source parser indices are
 * not exposed on preview rows, so position is the preview flatten index.
 * Delimiter is the printable token `::` — deterministic and DOM-safe
 * for HTML name attributes and CSS attribute selectors.
 */

import {
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS,
} from './inventoryOperationalImportPreview.js'
import { INVENTORY_OPERATIONAL_MATCH_STATUS } from './inventoryOperationalProductMatcher.js'

export const INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION = Object.freeze({
  LINK_EXISTING: 'link_existing',
  CREATE_NEW: 'create_new',
  SKIP: 'skip',
})

/** Derived action for skipped possible matches (not part of base preview builder). */
export const INVENTORY_OPERATIONAL_MATCH_RESOLUTION_SKIP_ACTION = 'skip'

export class InventoryOperationalMatchResolutionError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryOperationalMatchResolutionError'
    this.code = code
  }
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value
  if (Object.isFrozen(value)) return value

  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry)
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze(/** @type {Record<string, unknown>} */ (value)[key])
    }
  }

  return Object.freeze(value)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMeaningfullyPopulated(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  return false
}

/**
 * Deterministic stable key for a preview row.
 *
 * @param {object} row
 * @param {number} index
 * @returns {string}
 */
export function getOperationalMatchResolutionRowKey(row, index) {
  const category = row?.source?.category == null
    ? '__null__'
    : String(row.source.category)
  const productName = row?.source?.productName === undefined
    ? '__undefined__'
    : row?.source?.productName === null
      ? '__null__'
      : String(row.source.productName)
  return `${index}::${category}::${productName}`
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>|null}
 */
function copyWeekdays(value) {
  if (value == null) return null
  if (!isPlainObject(value)) return value
  return { ...value }
}

/**
 * @param {object} source
 * @returns {object}
 */
function copySource(source) {
  return {
    category: source?.category ?? null,
    productName: source?.productName,
    storage: source?.storage,
    bar: source?.bar,
    weekdays: copyWeekdays(source?.weekdays),
    order: source?.order,
    stockControl: source?.stockControl,
  }
}

/**
 * @param {object|null|undefined} item
 * @returns {object|null}
 */
function snapshotExistingOne(item) {
  if (!isPlainObject(item)) return null
  return {
    id: item.id ?? null,
    name: typeof item.name === 'string' ? item.name : `${item.name ?? ''}`,
    category: item.category == null
      ? null
      : typeof item.category === 'string'
        ? item.category
        : String(item.category),
    unit: typeof item.unit === 'string'
      ? item.unit
      : item.unit == null
        ? null
        : String(item.unit),
    sku: Object.prototype.hasOwnProperty.call(item, 'sku') ? item.sku ?? null : null,
    storageLocation: null,
    currentQuantity: null,
    active: item.active ?? null,
  }
}

/**
 * @param {unknown[]} candidates
 * @returns {object[]}
 */
function copyCandidates(candidates) {
  if (!Array.isArray(candidates)) return []
  return candidates.map((candidate) => {
    if (!isPlainObject(candidate)) return candidate
    return {
      stockItem: isPlainObject(candidate.stockItem)
        ? {
            id: candidate.stockItem.id,
            name: candidate.stockItem.name,
            category: candidate.stockItem.category,
            unit: candidate.stockItem.unit,
            sku: candidate.stockItem.sku,
            active: candidate.stockItem.active,
          }
        : candidate.stockItem,
      evidence: Array.isArray(candidate.evidence) ? [...candidate.evidence] : [],
    }
  })
}

/**
 * @param {object} source
 * @param {string[]} warnings
 */
function appendSourceFieldWarnings(source, warnings) {
  if (isMeaningfullyPopulated(source.storage) || isMeaningfullyPopulated(source.bar)) {
    warnings.push('source_quantity_requires_policy')
  }
  if (
    isPlainObject(source.weekdays)
    && Object.values(source.weekdays).some((value) => isMeaningfullyPopulated(value))
  ) {
    warnings.push('source_weekdays_unmapped')
  }
  if (isMeaningfullyPopulated(source.order)) {
    warnings.push('source_order_unmapped')
  }
  if (isMeaningfullyPopulated(source.stockControl)) {
    warnings.push('source_stock_control_unmapped')
  }
}

/**
 * @param {object} row
 * @returns {object}
 */
function cloneUnaffectedRow(row) {
  return {
    source: copySource(row.source),
    match: {
      status: row.match?.status,
      matchedStockItem: snapshotExistingOne(row.match?.matchedStockItem),
      candidates: copyCandidates(row.match?.candidates),
      evidence: Array.isArray(row.match?.evidence) ? [...row.match.evidence] : [],
    },
    existingOne: snapshotExistingOne(row.existingOne),
    proposedAction: row.proposedAction,
    quantityProposal: { ...row.quantityProposal },
    locationProposal: { ...row.locationProposal },
    metadataProposal: { ...row.metadataProposal },
    warnings: Array.isArray(row.warnings) ? [...row.warnings] : [],
    blockers: Array.isArray(row.blockers) ? [...row.blockers] : [],
    resolution: null,
  }
}

/**
 * @param {object} row
 * @param {object} resolution
 * @returns {object}
 */
function applyPossibleMatchResolution(row, resolution) {
  const source = copySource(row.source)
  const candidates = copyCandidates(row.match?.candidates)
  const match = {
    status: INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH,
    matchedStockItem: null,
    candidates,
    evidence: Array.isArray(row.match?.evidence) ? [...row.match.evidence] : [],
  }

  const decision = resolution?.decision
  const selectedStockItemId = resolution?.selectedStockItemId ?? null

  if (decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING) {
    const selected = candidates.find(
      (candidate) => String(candidate?.stockItem?.id ?? '') === String(selectedStockItemId ?? ''),
    )

    if (!selected || selectedStockItemId == null || selectedStockItemId === '') {
      const warnings = []
      appendSourceFieldWarnings(source, warnings)
      return {
        source,
        match,
        existingOne: null,
        proposedAction: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION,
        quantityProposal: {
          status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
          currentOneQuantity: null,
          sourceStorage: source.storage,
          sourceBar: source.bar,
          proposedQuantity: null,
          calculationRule: null,
        },
        locationProposal: {
          status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
          currentOneLocation: null,
          proposedStorageLocation: null,
          rule: null,
        },
        metadataProposal: {
          sourceCategory: source.category,
          proposedCategory: null,
          sourceUnit: null,
          proposedUnit: null,
          proposedActive: null,
        },
        warnings,
        blockers: ['possible_match_unresolved', 'selected_match_candidate_invalid'],
        resolution: {
          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
          selectedStockItemId: selectedStockItemId == null ? null : String(selectedStockItemId),
          manuallyResolved: false,
        },
      }
    }

    const existingOne = snapshotExistingOne(selected.stockItem)
    const warnings = []
    if (existingOne?.active === false) warnings.push('matched_item_inactive')
    appendSourceFieldWarnings(source, warnings)

    return {
      source,
      match: {
        ...match,
        matchedStockItem: existingOne,
      },
      existingOne,
      proposedAction: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING,
      quantityProposal: {
        status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
        currentOneQuantity: null,
        sourceStorage: source.storage,
        sourceBar: source.bar,
        proposedQuantity: null,
        calculationRule: null,
      },
      locationProposal: {
        status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
        currentOneLocation: null,
        proposedStorageLocation: null,
        rule: null,
      },
      metadataProposal: {
        sourceCategory: source.category,
        proposedCategory: null,
        sourceUnit: null,
        proposedUnit: null,
        proposedActive: existingOne?.active ?? null,
      },
      warnings,
      blockers: ['quantity_policy_unset'],
      resolution: {
        decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
        selectedStockItemId: String(selectedStockItemId),
        manuallyResolved: true,
      },
    }
  }

  if (decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW) {
    const blankCategory = !isMeaningfullyPopulated(source.category)
    const proposedCategory = blankCategory ? 'Other' : source.category
    const warnings = []
    if (blankCategory) warnings.push('category_defaulted_to_other')
    warnings.push('source_location_requires_policy')
    appendSourceFieldWarnings(source, warnings)

    return {
      source,
      match,
      existingOne: null,
      proposedAction: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW,
      quantityProposal: {
        status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
        currentOneQuantity: null,
        sourceStorage: source.storage,
        sourceBar: source.bar,
        proposedQuantity: null,
        calculationRule: null,
      },
      locationProposal: {
        status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
        currentOneLocation: null,
        proposedStorageLocation: null,
        rule: null,
      },
      metadataProposal: {
        sourceCategory: source.category,
        proposedCategory,
        sourceUnit: null,
        proposedUnit: null,
        proposedActive: true,
      },
      warnings,
      blockers: ['unit_missing', 'quantity_policy_unset', 'location_policy_unset'],
      resolution: {
        decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW,
        selectedStockItemId: null,
        manuallyResolved: true,
      },
    }
  }

  if (decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP) {
    const warnings = []
    appendSourceFieldWarnings(source, warnings)

    return {
      source,
      match,
      existingOne: null,
      proposedAction: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_SKIP_ACTION,
      quantityProposal: {
        status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
        currentOneQuantity: null,
        sourceStorage: source.storage,
        sourceBar: source.bar,
        proposedQuantity: null,
        calculationRule: null,
      },
      locationProposal: {
        status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
        currentOneLocation: null,
        proposedStorageLocation: null,
        rule: null,
      },
      metadataProposal: {
        sourceCategory: source.category,
        proposedCategory: null,
        sourceUnit: null,
        proposedUnit: null,
        proposedActive: null,
      },
      warnings,
      blockers: [],
      resolution: {
        decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP,
        selectedStockItemId: null,
        manuallyResolved: true,
      },
    }
  }

  // No resolution / unknown decision → keep unresolved.
  const warnings = []
  appendSourceFieldWarnings(source, warnings)
  return {
    source,
    match,
    existingOne: null,
    proposedAction: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION,
    quantityProposal: {
      status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
      currentOneQuantity: null,
      sourceStorage: source.storage,
      sourceBar: source.bar,
      proposedQuantity: null,
      calculationRule: null,
    },
    locationProposal: {
      status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
      currentOneLocation: null,
      proposedStorageLocation: null,
      rule: null,
    },
    metadataProposal: {
      sourceCategory: source.category,
      proposedCategory: null,
      sourceUnit: null,
      proposedUnit: null,
      proposedActive: null,
    },
    warnings,
    blockers: ['possible_match_unresolved'],
    resolution: null,
  }
}

/**
 * Apply local possible-match resolutions onto a base import preview.
 *
 * Unknown resolution keys are ignored safely (documented).
 *
 * @param {{
 *   preview?: unknown,
 *   resolutions?: unknown,
 * }} [input]
 */
export function applyInventoryOperationalMatchResolutions({
  preview,
  resolutions = {},
} = {}) {
  if (!isPlainObject(preview)) {
    throw new InventoryOperationalMatchResolutionError(
      'INVALID_PREVIEW',
      'Match resolution expects a preview object.',
    )
  }
  if (!Array.isArray(preview.rows)) {
    throw new InventoryOperationalMatchResolutionError(
      'INVALID_PREVIEW',
      'Match resolution expects preview.rows to be an array.',
    )
  }
  if (!isPlainObject(resolutions)) {
    throw new InventoryOperationalMatchResolutionError(
      'INVALID_RESOLUTIONS',
      'Match resolution expects resolutions to be a plain object map.',
    )
  }

  /** @type {object[]} */
  const rows = []
  let unresolvedPossibleMatches = 0
  let resolvedLinks = 0
  let resolvedCreateNew = 0
  let resolvedSkipped = 0

  for (let index = 0; index < preview.rows.length; index += 1) {
    const row = preview.rows[index]
    if (!isPlainObject(row)) {
      throw new InventoryOperationalMatchResolutionError(
        'INVALID_PREVIEW',
        `Match resolution expects preview row at index ${index} to be an object.`,
      )
    }

    const isPossible = row.match?.status === INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH
      || row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION

    if (!isPossible) {
      rows.push(cloneUnaffectedRow(row))
      continue
    }

    const key = getOperationalMatchResolutionRowKey(row, index)
    const resolution = resolutions[key]
    const derived = applyPossibleMatchResolution(
      row,
      isPlainObject(resolution) ? resolution : null,
    )
    rows.push(derived)

    if (derived.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION) {
      unresolvedPossibleMatches += 1
    } else if (
      derived.resolution?.decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING
      && derived.resolution?.manuallyResolved
    ) {
      resolvedLinks += 1
    } else if (
      derived.resolution?.decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW
      && derived.resolution?.manuallyResolved
    ) {
      resolvedCreateNew += 1
    } else if (
      derived.resolution?.decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP
      && derived.resolution?.manuallyResolved
    ) {
      resolvedSkipped += 1
    }
  }

  const summary = {
    total: 0,
    linkExisting: 0,
    createNew: 0,
    requiresResolution: 0,
    blocked: 0,
    skippedInvalid: 0,
    skipped: 0,
    inactiveMatches: 0,
    missingUnits: 0,
    quantityPolicyRequired: 0,
    locationPolicyRequired: 0,
    unmappedWeekdayRows: 0,
    unmappedOrderRows: 0,
    unmappedStockControlRows: 0,
    unresolvedPossibleMatches,
    resolvedLinks,
    resolvedCreateNew,
    resolvedSkipped,
  }

  for (const row of rows) {
    summary.total += 1
    if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING) {
      summary.linkExisting += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW) {
      summary.createNew += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION) {
      summary.requiresResolution += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED) {
      summary.blocked += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID) {
      summary.skippedInvalid += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_SKIP_ACTION) {
      summary.skipped += 1
    }

    if (row.warnings.includes('matched_item_inactive')) summary.inactiveMatches += 1
    if (row.blockers.includes('unit_missing')) summary.missingUnits += 1
    if (row.quantityProposal.status === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY) {
      summary.quantityPolicyRequired += 1
    }
    if (row.locationProposal.status === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY) {
      summary.locationPolicyRequired += 1
    }
    if (row.warnings.includes('source_weekdays_unmapped')) summary.unmappedWeekdayRows += 1
    if (row.warnings.includes('source_order_unmapped')) summary.unmappedOrderRows += 1
    if (row.warnings.includes('source_stock_control_unmapped')) summary.unmappedStockControlRows += 1
  }

  return /** @type {ReturnType<typeof applyInventoryOperationalMatchResolutions>} */ (
    deepFreeze({
      previewVersion: preview.previewVersion ?? 1,
      rows,
      summary,
    })
  )
}

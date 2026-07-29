/**
 * P8.25.9 — Import Policy & Eligibility Model Foundation.
 *
 * Pure, deterministic Ready-eligibility evaluator for Spreadsheet Import V1
 * under the P8.25.8 product contract.
 *
 * No UI, network, Supabase, SQL, persistence, Apply, or mutation of inputs.
 *
 * Quantity-policy selection note:
 * - Product default behavior is `no_change` (create at 0, link without qty mutation).
 * - Ready eligibility requires an explicit session selection.
 * - Missing / unknown policy normalizes to `unset` and does NOT silently become
 *   `opening_stock` or `no_change`. Pass `quantityPolicy: 'no_change'` when the
 *   manager has selected (or the product default is explicitly applied).
 */

import {
  buildInventoryLocationQuantities,
  buildOperationalInventoryLocationQuantities,
  INVENTORY_LOCATION_QUANTITY_BLOCKER,
} from './inventoryLocationColumnBindings.js'
import {
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION,
} from './inventoryOperationalImportPreview.js'
import {
  INVENTORY_OPERATIONAL_MATCH_RESOLUTION_SKIP_ACTION,
  getOperationalMatchResolutionRowKey,
} from './inventoryOperationalMatchResolutions.js'
import { STOCK_LOCATIONS } from './stockCatalog.js'

export const INVENTORY_IMPORT_QUANTITY_POLICY = Object.freeze({
  NO_CHANGE: 'no_change',
  OPENING_STOCK: 'opening_stock',
})

/**
 * Selection state for session quantity policy.
 * `unset` is distinct from the approved product default (`no_change`).
 */
export const INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION = Object.freeze({
  UNSET: 'unset',
  NO_CHANGE: INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE,
  OPENING_STOCK: INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
})

export const INVENTORY_IMPORT_ELIGIBILITY_BLOCKER = Object.freeze({
  QUANTITY_POLICY_UNSET: 'quantity_policy_unset',
  UNRESOLVED_MATCHES: 'unresolved_matches',
  FORBIDDEN_UPDATE_ACTION: 'forbidden_update_action',
  MISSING_CREATE_NAME: 'missing_create_name',
  MISSING_CREATE_UNIT: 'missing_create_unit',
  UNRESOLVED_CREATE_LOCATION: 'unresolved_create_location',
  INVALID_LOCATION_FALLBACK: 'invalid_location_fallback',
  MISSING_OPENING_QUANTITY: 'missing_opening_quantity',
  INVALID_OPENING_QUANTITY: 'invalid_opening_quantity',
  EXISTING_QUANTITY_OVERWRITE_UNCONFIRMED: 'existing_quantity_overwrite_unconfirmed',
  DUPLICATE_EXISTING_TARGET: 'duplicate_existing_target',
  REMAINING_OPERATIONAL_BLOCKER: 'remaining_operational_blocker',
  LOCATION_QUANTITY_MALFORMED: INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_QUANTITY_MALFORMED,
  LOCATION_QUANTITY_NEGATIVE: INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_QUANTITY_NEGATIVE,
  LOCATION_BINDING_UNMAPPED: INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED,
  LOCATION_BINDING_AMBIGUOUS: INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_AMBIGUOUS,
  DUPLICATE_LOCATION_DESTINATION: INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION,
})

export const INVENTORY_IMPORT_ELIGIBILITY_WARNING = Object.freeze({
  CATEGORY_DEFAULTED_TO_OTHER: 'category_defaulted_to_other',
  EXISTING_LOCATION_CONFLICT: 'existing_location_conflict',
  MATCHED_ITEM_INACTIVE: 'matched_item_inactive',
  SOURCE_QUANTITY_EVIDENCE_ONLY: 'source_quantity_evidence_only',
  SOURCE_LOCATION_EVIDENCE_ONLY: 'source_location_evidence_only',
})

/** Preview blockers reconciled by an explicit session quantity policy. */
const RECONCILED_QUANTITY_POLICY_BLOCKERS = Object.freeze(new Set([
  'quantity_policy_unset',
]))

/** Preview blockers reconciled when create location is resolved or fallback applies. */
const RECONCILED_LOCATION_POLICY_BLOCKERS = Object.freeze(new Set([
  'location_policy_unset',
]))

/** Preview blockers that are informational after skip classification. */
const SKIP_ROW_OPERATIONAL_BLOCKERS = Object.freeze(new Set([
  'invalid_source_name',
]))

const CANONICAL_LOCATION_SET = Object.freeze(new Set(STOCK_LOCATIONS))

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * Normalize quantity-policy selection.
 *
 * Explicit `no_change` / `opening_stock` are kept.
 * Missing, blank, or unknown values become `unset` — never opening stock,
 * and never silently the product default unless the caller already selected it.
 *
 * @param {unknown} value
 * @returns {'unset'|'no_change'|'opening_stock'}
 */
export function normalizeInventoryImportQuantityPolicy(value) {
  const normalized = asTrimmedString(value)
  if (normalized === INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE) {
    return INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.NO_CHANGE
  }
  if (normalized === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK) {
    return INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.OPENING_STOCK
  }
  return INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeCanonicalStockLocation(value) {
  const normalized = asTrimmedString(value)
  if (!normalized) return null
  if (!CANONICAL_LOCATION_SET.has(normalized)) return null
  return normalized
}

/**
 * Normalize fallback / workspace storage location keys for Import Ready.
 * Accepts STOCK_LOCATIONS and exact workspace keys (trimmed, ≤80).
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeImportFallbackStorageLocation(value) {
  const trimmed = asTrimmedString(value)
  if (!trimmed || trimmed.length > 80) return null
  return normalizeCanonicalStockLocation(trimmed) ?? trimmed
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCanonicalStockLocation(value) {
  return normalizeCanonicalStockLocation(value) != null
}

/**
 * Normalize session policy input for eligibility evaluation.
 *
 * @param {unknown} policy
 * @returns {{
 *   quantityPolicy: 'unset'|'no_change'|'opening_stock',
 *   existingQuantityOverwriteConfirmed: boolean,
 *   newProductLocationFallback: string|null,
 *   workspaceStorages: unknown[]|null,
 *   locationColumnBindings: unknown[]|null,
 *   barDestination: object|null,
 * }}
 */
export function normalizeInventoryImportSessionPolicy(policy) {
  const input = isPlainObject(policy) ? policy : {}
  const quantityPolicy = normalizeInventoryImportQuantityPolicy(input.quantityPolicy)
  const existingQuantityOverwriteConfirmed = input.existingQuantityOverwriteConfirmed === true
  const fallbackRaw = input.newProductLocationFallback
  const newProductLocationFallback = fallbackRaw == null || asTrimmedString(fallbackRaw) === ''
    ? null
    : asTrimmedString(fallbackRaw)
  const workspaceStorages = Array.isArray(input.workspaceStorages)
    ? input.workspaceStorages
    : null
  const locationColumnBindings = Array.isArray(input.locationColumnBindings)
    ? input.locationColumnBindings
    : null
  const barDestination = isPlainObject(input.barDestination) ? input.barDestination : null
  const existingStockItems = Array.isArray(input.existingStockItems)
    ? input.existingStockItems
    : null

  return {
    quantityPolicy,
    existingQuantityOverwriteConfirmed,
    newProductLocationFallback,
    workspaceStorages,
    locationColumnBindings,
    barDestination,
    existingStockItems,
  }
}

/**
 * @param {object} row
 * @param {ReturnType<typeof normalizeInventoryImportSessionPolicy>} normalizedPolicy
 * @returns {boolean}
 */
function hasLocationQuantityBindingContext(row, normalizedPolicy) {
  if (Array.isArray(row?.locationQuantities)) return true
  if (Array.isArray(normalizedPolicy.locationColumnBindings)) return true
  if (Array.isArray(normalizedPolicy.workspaceStorages)) return true
  return false
}

/**
 * Build locationQuantities for a preview row using policy bindings / storages.
 *
 * @param {object} row
 * @param {ReturnType<typeof normalizeInventoryImportSessionPolicy>} normalizedPolicy
 */
export function resolveImportRowLocationQuantities(row, normalizedPolicy) {
  if (Array.isArray(row?.locationQuantities) && row.locationQuantities.length > 0) {
    /** @type {string[]} */
    const blockers = []
    /** @type {string[]} */
    const warnings = []
    let aggregateQuantity = null
    let sawValid = false
    for (const entry of row.locationQuantities) {
      if (!isPlainObject(entry)) continue
      if (entry.validationState === 'blocker') {
        for (const code of Array.isArray(entry.warnings) ? entry.warnings : []) {
          if (
            typeof code === 'string'
            && Object.values(INVENTORY_LOCATION_QUANTITY_BLOCKER).includes(code)
            && !blockers.includes(code)
          ) {
            blockers.push(code)
          }
        }
        continue
      }
      for (const code of Array.isArray(entry.warnings) ? entry.warnings : []) {
        if (code === 'expression_summed' && !warnings.includes(code)) warnings.push(code)
      }
      if (
        entry.parsedQuantity != null
        && Number.isFinite(Number(entry.parsedQuantity))
        && entry.parseStatus !== 'empty'
        && entry.destinationStorageId
      ) {
        sawValid = true
        aggregateQuantity = (aggregateQuantity ?? 0) + Number(entry.parsedQuantity)
      }
    }
    return Object.freeze({
      locationQuantities: Object.freeze([...row.locationQuantities]),
      blockers: Object.freeze(blockers),
      warnings: Object.freeze(warnings),
      aggregateQuantity: sawValid ? aggregateQuantity : null,
    })
  }

  const matchedId = isImportEligibilityLinkAction(getImportEligibilityRowAction(row))
    ? getImportEligibilityMatchedStockItemId(row)
    : null
  /** @type {string|null} */
  let catalogStorageLocation = null
  if (matchedId && Array.isArray(normalizedPolicy.existingStockItems)) {
    const matched = normalizedPolicy.existingStockItems.find((item) => (
      isPlainObject(item) && asTrimmedString(item.id) === matchedId
    ))
    if (matched) {
      catalogStorageLocation = normalizeImportFallbackStorageLocation(
        matched.storageLocation ?? matched.storage_location,
      )
    }
  }

  const storageLocationKey = getResolvedImportStorageLocation(row)
    ?? catalogStorageLocation
    ?? (
      matchedId
        ? normalizeImportFallbackStorageLocation(
          row?.existingOne?.storageLocation
            ?? row?.match?.matchedStockItem?.storageLocation
            ?? row?.match?.matchedStockItem?.storage_location,
        )
        : null
    )
    ?? normalizeImportFallbackStorageLocation(normalizedPolicy.newProductLocationFallback)

  if (Array.isArray(normalizedPolicy.locationColumnBindings)
    && normalizedPolicy.locationColumnBindings.length > 0
  ) {
    return buildInventoryLocationQuantities({
      source: row?.source,
      bindings: normalizedPolicy.locationColumnBindings,
    })
  }

  return buildOperationalInventoryLocationQuantities({
    source: row?.source,
    workspaceStorages: normalizedPolicy.workspaceStorages,
    storageLocationKey,
    barDestination: normalizedPolicy.barDestination,
  })
}

/**
 * Narrow resolved-quantity contract.
 * Does not parse source.storage / source.bar (evidence only).
 *
 * Accepted sources (first match):
 * - row.resolvedQuantity
 * - row.quantityProposal.resolvedQuantity
 * - row.quantityProposal.proposedQuantity
 *
 * @param {object} row
 * @returns {{
 *   status: 'missing'|'invalid'|'valid',
 *   value: number|null,
 * }}
 */
export function getResolvedImportQuantity(row) {
  const candidates = [
    row?.resolvedQuantity,
    row?.quantityProposal?.resolvedQuantity,
    row?.quantityProposal?.proposedQuantity,
  ]

  let sawPresent = false
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue
    sawPresent = true

    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate) || candidate < 0) {
        return { status: 'invalid', value: null }
      }
      return { status: 'valid', value: candidate }
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (!trimmed) continue
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return { status: 'invalid', value: null }
      }
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return { status: 'invalid', value: null }
      }
      return { status: 'valid', value: parsed }
    }

    return { status: 'invalid', value: null }
  }

  return {
    status: sawPresent ? 'invalid' : 'missing',
    value: null,
  }
}

/**
 * Narrow resolved storage-location contract for create rows.
 * Does not silently fall back to Main Storage.
 *
 * Accepted sources (first usable match):
 * - row.draft.storage (explicit new-product row storage)
 * - row.resolvedStorageLocation
 * - row.locationProposal.resolvedStorageLocation
 * - row.locationProposal.proposedStorageLocation
 *
 * STOCK_LOCATIONS remain preferred when present. Other exact workspace keys
 * (trimmed, ≤80) are accepted for P8.26 workspace storages.
 *
 * @param {object} row
 * @returns {string|null}
 */
export function getResolvedImportStorageLocation(row) {
  const candidates = [
    isPlainObject(row?.draft) ? row.draft.storage : null,
    row?.resolvedStorageLocation,
    row?.locationProposal?.resolvedStorageLocation,
    row?.locationProposal?.proposedStorageLocation,
  ]

  for (const candidate of candidates) {
    const trimmed = asTrimmedString(candidate)
    if (!trimmed || trimmed.length > 80) continue
    const canonical = normalizeCanonicalStockLocation(trimmed)
    if (canonical) return canonical
    // Exact workspace storage key (not remapped / not fuzzy).
    return trimmed
  }
  return null
}

/**
 * @param {object} row
 * @returns {string}
 */
export function getImportEligibilityRowAction(row) {
  const selected = asTrimmedString(row?.selectedAction)
  if (selected) return selected
  return asTrimmedString(row?.proposedAction)
}

/**
 * @param {string} action
 * @returns {boolean}
 */
export function isImportEligibilitySkippedAction(action) {
  return (
    action === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_SKIP_ACTION
    || action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID
  )
}

/**
 * @param {string} action
 * @returns {boolean}
 */
export function isImportEligibilityCreateAction(action) {
  return action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW
}

/**
 * @param {string} action
 * @returns {boolean}
 */
export function isImportEligibilityLinkAction(action) {
  return action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING
}

/**
 * @param {string} action
 * @returns {boolean}
 */
export function isImportEligibilityUnresolvedAction(action) {
  return (
    action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION
    || action === 'manual_review'
  )
}

/**
 * @param {string} action
 * @returns {boolean}
 */
export function isImportEligibilityForbiddenUpdateAction(action) {
  return action === 'update'
}

/**
 * @param {object} row
 * @returns {string|null}
 */
export function getImportEligibilityMatchedStockItemId(row) {
  const candidates = [
    row?.existingOne?.id,
    row?.match?.matchedStockItem?.id,
    row?.resolution?.selectedStockItemId,
    row?.matchedStockItemId,
  ]
  for (const candidate of candidates) {
    const id = asTrimmedString(candidate)
    if (id) return id
  }
  return null
}

/**
 * @param {object} row
 * @returns {string}
 */
function getCreateProductName(row) {
  if (isPlainObject(row?.draft) && row.draft.productName !== undefined) {
    return asTrimmedString(row.draft.productName)
  }
  return asTrimmedString(row?.source?.productName)
}

/**
 * @param {object} row
 * @returns {string}
 */
function getCreateUnit(row) {
  if (isPlainObject(row?.draft) && Object.prototype.hasOwnProperty.call(row.draft, 'unit')) {
    return asTrimmedString(row.draft.unit)
  }
  const proposed = asTrimmedString(row?.metadataProposal?.proposedUnit)
  if (proposed) return proposed
  return ''
}

/**
 * @param {object} row
 * @returns {string|null}
 */
function getLinkExistingLocation(row) {
  return normalizeCanonicalStockLocation(
    row?.existingOne?.storageLocation
    ?? row?.locationProposal?.currentOneLocation
    ?? null,
  )
}

/**
 * @param {object} row
 * @returns {string|null}
 */
function getLinkSourceLocationEvidence(row) {
  const candidates = [
    row?.resolvedStorageLocation,
    row?.locationProposal?.proposedStorageLocation,
    row?.source?.storage,
  ]
  for (const candidate of candidates) {
    const canonical = normalizeCanonicalStockLocation(candidate)
    if (canonical) return canonical
  }
  return null
}

/**
 * @param {string[]} codes
 * @param {string} code
 */
function pushUnique(codes, code) {
  if (!codes.includes(code)) codes.push(code)
}

/**
 * Evaluate Ready eligibility for a resolved operational import preview.
 *
 * @param {{
 *   preview?: unknown,
 *   policy?: unknown,
 * }} [input]
 */
export function evaluateInventoryImportReadyEligibility({
  preview,
  policy,
} = {}) {
  const normalizedPolicy = normalizeInventoryImportSessionPolicy(policy)
  const rows = Array.isArray(preview?.rows) ? preview.rows : []

  /** @type {string[]} */
  const blockingReasons = []
  /** @type {string[]} */
  const warningReasons = []

  let createCount = 0
  let linkCount = 0
  let skipCount = 0
  let unresolvedMatchCount = 0
  let forbiddenUpdateCount = 0
  let missingNameCount = 0
  let missingUnitCount = 0
  let blockedActionCount = 0

  let applicableQuantityRows = 0
  let missingQuantityCount = 0
  let invalidQuantityCount = 0
  let linkedItemsAffectedByOpeningStock = 0

  let unresolvedCreateLocationCount = 0
  let fallbackAffectedRowCount = 0

  /** @type {Map<string, string[]>} */
  const linkTargets = new Map()

  const fallbackCanonical = normalizeImportFallbackStorageLocation(
    normalizedPolicy.newProductLocationFallback,
  )
  const fallbackProvided = normalizedPolicy.newProductLocationFallback != null
  const fallbackInvalid = fallbackProvided && fallbackCanonical == null

  if (fallbackInvalid) {
    pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.INVALID_LOCATION_FALLBACK)
  }

  if (normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET) {
    pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.QUANTITY_POLICY_UNSET)
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (!isPlainObject(row)) continue

    const action = getImportEligibilityRowAction(row)
    const rowKey = getOperationalMatchResolutionRowKey(row, index)
    const blockers = Array.isArray(row.blockers) ? row.blockers : []
    const warnings = Array.isArray(row.warnings) ? row.warnings : []

    if (isImportEligibilitySkippedAction(action)) {
      skipCount += 1
      continue
    }

    if (isImportEligibilityForbiddenUpdateAction(action)) {
      forbiddenUpdateCount += 1
      pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.FORBIDDEN_UPDATE_ACTION)
      continue
    }

    if (isImportEligibilityUnresolvedAction(action)) {
      unresolvedMatchCount += 1
      pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_MATCHES)
      continue
    }

    if (action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED) {
      blockedActionCount += 1
      pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.REMAINING_OPERATIONAL_BLOCKER)
      continue
    }

    const isCreate = isImportEligibilityCreateAction(action)
    const isLink = isImportEligibilityLinkAction(action)

    if (!isCreate && !isLink) {
      pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.REMAINING_OPERATIONAL_BLOCKER)
      continue
    }

    if (isCreate) createCount += 1
    if (isLink) linkCount += 1

    if (isCreate) {
      if (!getCreateProductName(row)) {
        missingNameCount += 1
        pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_NAME)
      }
      if (!getCreateUnit(row)) {
        missingUnitCount += 1
        pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_UNIT)
      }

      const resolvedLocation = getResolvedImportStorageLocation(row)
      if (resolvedLocation) {
        // Deterministic canonical location — ready for this row.
      } else if (fallbackCanonical) {
        fallbackAffectedRowCount += 1
      } else {
        unresolvedCreateLocationCount += 1
        pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION)
      }

      if (warnings.includes('category_defaulted_to_other')) {
        pushUnique(warningReasons, INVENTORY_IMPORT_ELIGIBILITY_WARNING.CATEGORY_DEFAULTED_TO_OTHER)
      }
    }

    if (isLink) {
      const matchedId = getImportEligibilityMatchedStockItemId(row)
      if (matchedId) {
        const group = linkTargets.get(matchedId) ?? []
        group.push(rowKey)
        linkTargets.set(matchedId, group)
      }

      const existingLocation = getLinkExistingLocation(row)
      const sourceLocation = getLinkSourceLocationEvidence(row)
      if (
        existingLocation
        && sourceLocation
        && existingLocation !== sourceLocation
      ) {
        pushUnique(warningReasons, INVENTORY_IMPORT_ELIGIBILITY_WARNING.EXISTING_LOCATION_CONFLICT)
      }

      if (warnings.includes('matched_item_inactive')) {
        pushUnique(warningReasons, INVENTORY_IMPORT_ELIGIBILITY_WARNING.MATCHED_ITEM_INACTIVE)
      }
    }

    if (normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK) {
      applicableQuantityRows += 1
      const useLocationQuantities = hasLocationQuantityBindingContext(row, normalizedPolicy)
      if (useLocationQuantities) {
        const locationResult = resolveImportRowLocationQuantities(row, normalizedPolicy)
        for (const code of locationResult.blockers) {
          pushUnique(blockingReasons, code)
          if (
            code === INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.LOCATION_QUANTITY_MALFORMED
            || code === INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.LOCATION_QUANTITY_NEGATIVE
          ) {
            invalidQuantityCount += 1
          }
        }
    if (locationResult.blockers.length === 0
      && isLink
      && locationResult.aggregateQuantity != null
    ) {
      linkedItemsAffectedByOpeningStock += 1
    }
      } else {
        const quantity = getResolvedImportQuantity(row)
        if (quantity.status === 'missing') {
          missingQuantityCount += 1
          pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_OPENING_QUANTITY)
        } else if (quantity.status === 'invalid') {
          invalidQuantityCount += 1
          pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.INVALID_OPENING_QUANTITY)
        } else if (isLink) {
          linkedItemsAffectedByOpeningStock += 1
        }
      }
    } else if (
      normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE
      && warnings.includes('source_quantity_requires_policy')
    ) {
      pushUnique(warningReasons, INVENTORY_IMPORT_ELIGIBILITY_WARNING.SOURCE_QUANTITY_EVIDENCE_ONLY)
    }

    if (
      isCreate
      && warnings.includes('source_location_requires_policy')
      && !getResolvedImportStorageLocation(row)
      && !fallbackCanonical
    ) {
      pushUnique(warningReasons, INVENTORY_IMPORT_ELIGIBILITY_WARNING.SOURCE_LOCATION_EVIDENCE_ONLY)
    }

    // Remaining operational blockers after policy reconciliation.
    const createLocationResolved = isCreate && (
      getResolvedImportStorageLocation(row) != null
      || Boolean(fallbackCanonical)
    )
    for (const code of blockers) {
      if (typeof code !== 'string' || !code) continue
      if (SKIP_ROW_OPERATIONAL_BLOCKERS.has(code)) continue
      if (
        RECONCILED_QUANTITY_POLICY_BLOCKERS.has(code)
        && normalizedPolicy.quantityPolicy !== INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET
      ) {
        continue
      }
      if (
        RECONCILED_LOCATION_POLICY_BLOCKERS.has(code)
        && createLocationResolved
      ) {
        continue
      }
      if (code === 'unit_missing' && isCreate && getCreateUnit(row)) continue
      if (code === 'possible_match_unresolved') {
        pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_MATCHES)
        continue
      }
      if (code === 'unit_missing') {
        // Create-unit absence is already counted above when the draft/metadata unit is empty.
        pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_UNIT)
        continue
      }
      pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.REMAINING_OPERATIONAL_BLOCKER)
    }
  }

  /** @type {Array<{ stockItemId: string, rowKeys: string[], rowCount: number }>} */
  const duplicateGroups = []
  let duplicateRowCount = 0
  for (const [stockItemId, rowKeys] of [...linkTargets.entries()].sort(
    (a, b) => a[0].localeCompare(b[0]),
  )) {
    if (rowKeys.length < 2) continue
    const sortedKeys = [...rowKeys].sort((a, b) => a.localeCompare(b))
    duplicateGroups.push({
      stockItemId,
      rowKeys: sortedKeys,
      rowCount: sortedKeys.length,
    })
    duplicateRowCount += sortedKeys.length
  }

  if (duplicateGroups.length > 0) {
    pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.DUPLICATE_EXISTING_TARGET)
  }

  const overwriteRequired = (
    normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
    && linkedItemsAffectedByOpeningStock > 0
  )
  const overwriteMissing = overwriteRequired && !normalizedPolicy.existingQuantityOverwriteConfirmed
  if (overwriteMissing) {
    pushUnique(
      blockingReasons,
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.EXISTING_QUANTITY_OVERWRITE_UNCONFIRMED,
    )
  }

  if (unresolvedCreateLocationCount > 0 && !fallbackInvalid) {
    pushUnique(blockingReasons, INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION)
  }

  const applicableCount = createCount + linkCount
  const isReady = blockingReasons.length === 0

  return deepFreeze({
    isReady,
    policy: normalizedPolicy,
    counts: {
      totalRows: rows.length,
      applicable: applicableCount,
      create: createCount,
      link: linkCount,
      skip: skipCount,
      unresolvedMatches: unresolvedMatchCount,
      forbiddenUpdate: forbiddenUpdateCount,
      missingCreateName: missingNameCount,
      missingCreateUnit: missingUnitCount,
      blockedAction: blockedActionCount,
    },
    blockingReasons: Object.freeze([...blockingReasons]),
    warningReasons: Object.freeze([...warningReasons]),
    quantity: Object.freeze({
      policy: normalizedPolicy.quantityPolicy,
      applicableRowsRequiringQuantity: applicableQuantityRows,
      missingQuantity: missingQuantityCount,
      invalidQuantity: invalidQuantityCount,
      linkedItemsAffectedByOpeningStock,
      overwriteConfirmationRequired: overwriteRequired,
      overwriteConfirmationMissing: overwriteMissing,
    }),
    location: Object.freeze({
      unresolvedCreateLocationCount,
      fallbackAffectedRowCount,
      fallbackLocation: fallbackCanonical,
      fallbackInvalid,
    }),
    duplicateTargets: Object.freeze({
      groupCount: duplicateGroups.length,
      rowCount: duplicateRowCount,
      stockItemIds: Object.freeze(duplicateGroups.map((group) => group.stockItemId)),
      groups: Object.freeze(duplicateGroups.map((group) => Object.freeze({
        stockItemId: group.stockItemId,
        rowKeys: Object.freeze([...group.rowKeys]),
        rowCount: group.rowCount,
      }))),
    }),
    unresolvedMatchCount,
    forbiddenUpdateCount,
    missingUnitCount,
    missingNameCount,
  })
}

/**
 * P8.27.0 — Spreadsheet Import Staging Payload Foundation.
 *
 * Pure, deterministic client serializer: reviewed operational import model →
 * inventory_import_sessions + inventory_import_rows staging shapes.
 *
 * No UI, network, Supabase, SQL, persistence, Apply, or input mutation.
 */

import {
  INVENTORY_IMPORT_QUANTITY_POLICY,
  INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION,
  getImportEligibilityMatchedStockItemId,
  getImportEligibilityRowAction,
  getResolvedImportQuantity,
  getResolvedImportStorageLocation,
  isImportEligibilityCreateAction,
  isImportEligibilityForbiddenUpdateAction,
  isImportEligibilityLinkAction,
  isImportEligibilitySkippedAction,
  isImportEligibilityUnresolvedAction,
  normalizeInventoryImportSessionPolicy,
  resolveImportRowLocationQuantities,
} from './inventoryImportEligibility.js'
import {
  INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE,
} from './inventoryLocationQuantityParser.js'
import {
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_VERSION,
} from './inventoryOperationalImportPreview.js'
import { getOperationalMatchResolutionRowKey } from './inventoryOperationalMatchResolutions.js'
import { INVENTORY_OPERATIONAL_MATCH_STATUS } from './inventoryOperationalProductMatcher.js'
import { INVENTORY_OPERATIONAL_SHEET_PARSER_VERSION } from './inventoryOperationalSheetParser.js'
import { normalizeSupplierId } from './stockSupplierUtils.js'

export const INVENTORY_IMPORT_STAGING_VERSION = 'import_staging_payload_v1'

export const INVENTORY_IMPORT_STAGED_ACTION = Object.freeze({
  CREATE: 'create',
  LINK: 'link',
  UPDATE: 'update',
  SKIP: 'skip',
  MANUAL_REVIEW: 'manual_review',
})

export const INVENTORY_IMPORT_STAGING_ERROR = Object.freeze({
  WORKSPACE_MISSING: 'workspace_missing',
  FILE_METADATA_MISSING: 'file_metadata_missing',
  PREVIEW_MISSING: 'preview_missing',
  ELIGIBILITY_NOT_READY: 'eligibility_not_ready',
  QUANTITY_POLICY_UNSET: 'quantity_policy_unset',
  UNSUPPORTED_UPDATE_ACTION: 'unsupported_update_action',
  UNRESOLVED_ROW: 'unresolved_row',
  MISSING_CREATE_NAME: 'missing_create_name',
  MISSING_CREATE_UNIT: 'missing_create_unit',
  MISSING_CREATE_STORAGE: 'missing_create_storage',
  INVALID_OPENING_QUANTITY: 'invalid_opening_quantity',
  INVALID_LOCATION_QUANTITY: 'invalid_location_quantity',
  MISSING_OVERWRITE_CONFIRMATION: 'missing_overwrite_confirmation',
  DUPLICATE_EXISTING_TARGET: 'duplicate_existing_target',
  MISSING_LINK_TARGET: 'missing_link_target',
})

export class InventoryImportStagingPayloadError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryImportStagingPayloadError'
    this.code = code
  }
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
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {never}
 */
function throwStagingError(code, message) {
  throw new InventoryImportStagingPayloadError(code, message)
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function cloneJsonValue(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((entry) => cloneJsonValue(entry))
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') continue
    // Never serialize File / Blob / binary handles.
    if (typeof File !== 'undefined' && entry instanceof File) continue
    if (typeof Blob !== 'undefined' && entry instanceof Blob) continue
    out[key] = cloneJsonValue(entry)
  }
  return out
}

/**
 * Serialize locationQuantities for Apply.
 *
 * Empty cells are omitted (no opening balance).
 * Blocker entries must never be serialized into a Ready payload.
 * Expression warnings are emitted with validationState "valid" so the current
 * Apply RPC (which applies only validationState=valid) still writes balances,
 * while parseStatus/warnings/evidence preserve expression evidence.
 *
 * @param {ReadonlyArray<object>|object[]} entries
 * @returns {object[]}
 */
export function serializeLocationQuantitiesForApply(entries) {
  const list = Array.isArray(entries) ? entries : []
  /** @type {object[]} */
  const out = []
  for (const entry of list) {
    if (!isPlainObject(entry)) continue
    if (entry.validationState === INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER) {
      continue
    }
    if (entry.parseStatus === 'empty' || entry.parsedQuantity == null) {
      continue
    }
    if (!asTrimmedString(entry.destinationStorageId)
      || !asTrimmedString(entry.destinationLocationKey)
    ) {
      continue
    }
    out.push({
      sourceColumnIndex: entry.sourceColumnIndex ?? null,
      sourceHeader: entry.sourceHeader ?? null,
      destinationStorageId: String(entry.destinationStorageId),
      destinationLocationKey: String(entry.destinationLocationKey),
      operatorLabel: asTrimmedString(entry.operatorLabel) || null,
      rawEvidence: entry.rawEvidence ?? null,
      parsedQuantity: entry.parsedQuantity,
      parseStatus: entry.parseStatus,
      // Apply consumes only validationState === 'valid' (P8.29.9 SQL).
      validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID,
      warnings: Array.isArray(entry.warnings) ? [...entry.warnings] : [],
      evidence: isPlainObject(entry.evidence) ? { ...entry.evidence } : {},
    })
  }
  return out
}

/**
 * Map wizard/preview actions → schema staged actions.
 *
 * @param {string} reviewedAction
 * @returns {'create'|'link'|'update'|'skip'|'manual_review'|null}
 */
export function mapReviewedActionToStagedAction(reviewedAction) {
  const action = asTrimmedString(reviewedAction)
  if (!action) return null
  if (isImportEligibilityCreateAction(action)) return INVENTORY_IMPORT_STAGED_ACTION.CREATE
  if (isImportEligibilityLinkAction(action)) return INVENTORY_IMPORT_STAGED_ACTION.LINK
  if (isImportEligibilitySkippedAction(action)) return INVENTORY_IMPORT_STAGED_ACTION.SKIP
  if (isImportEligibilityUnresolvedAction(action)) return INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW
  if (action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED) {
    return INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW
  }
  if (isImportEligibilityForbiddenUpdateAction(action) || action === 'update') {
    return INVENTORY_IMPORT_STAGED_ACTION.UPDATE
  }
  if (
    action === INVENTORY_IMPORT_STAGED_ACTION.CREATE
    || action === INVENTORY_IMPORT_STAGED_ACTION.LINK
    || action === INVENTORY_IMPORT_STAGED_ACTION.SKIP
    || action === INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW
    || action === INVENTORY_IMPORT_STAGED_ACTION.UPDATE
  ) {
    return action
  }
  return null
}

/**
 * @param {object} row
 * @returns {'none'|'exact_match'|'possible_match'|'duplicate_in_file'|'ambiguous'}
 */
function mapConflictState(row, stagedAction) {
  const matchStatus = asTrimmedString(row?.match?.status)
  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.LINK) {
    if (matchStatus === INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH) {
      return 'exact_match'
    }
    if (matchStatus === INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH) {
      return 'possible_match'
    }
    return 'exact_match'
  }
  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.CREATE) {
    return 'none'
  }
  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.SKIP) {
    if (matchStatus === INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE) {
      return 'none'
    }
    return 'none'
  }
  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW) {
    if (matchStatus === INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH) {
      return 'possible_match'
    }
    return 'ambiguous'
  }
  return 'none'
}

/**
 * @param {object} row
 * @param {'create'|'link'|'skip'|'manual_review'} stagedAction
 * @returns {'pending'|'valid'|'warning'|'error'}
 */
function mapValidationState(row, stagedAction) {
  const warnings = Array.isArray(row?.warnings) ? row.warnings : []
  const blockers = Array.isArray(row?.blockers) ? row.blockers : []
  const reviewedAction = getImportEligibilityRowAction(row)

  if (reviewedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID) {
    return 'error'
  }
  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW) {
    return blockers.length > 0 ? 'error' : 'pending'
  }
  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.SKIP) {
    return warnings.length > 0 ? 'warning' : 'valid'
  }
  if (warnings.length > 0) return 'warning'
  return 'valid'
}

/**
 * @param {object} row
 * @returns {{ productName: string, category: string, unit: string, supplier: string, supplierId: string|null }}
 */
function getCreateDraftFields(row) {
  const draft = isPlainObject(row?.draft) ? row.draft : {}
  const productName = draft.productName !== undefined
    ? asTrimmedString(draft.productName)
    : asTrimmedString(row?.source?.productName)
  const category = draft.category !== undefined
    ? asTrimmedString(draft.category)
    : asTrimmedString(row?.metadataProposal?.proposedCategory)
      || asTrimmedString(row?.source?.category)
      || 'Other'
  const unit = draft.unit !== undefined
    ? asTrimmedString(draft.unit)
    : asTrimmedString(row?.metadataProposal?.proposedUnit)

  const supplierText = draft.supplier !== undefined
    ? asTrimmedString(draft.supplier)
    : asTrimmedString(row?.supplier ?? row?.metadataProposal?.proposedSupplier)
  const supplierId = normalizeSupplierId(
    draft.supplierId ?? draft.supplier_id ?? row?.supplierId ?? row?.supplier_id ?? null,
  )

  return {
    productName,
    category,
    unit,
    supplier: supplierText,
    supplierId,
  }
}

/**
 * @param {object} row
 * @param {{ newProductLocationFallback: string|null }} policy
 * @returns {{ locationKey: string|null, usedFallback: boolean }}
 */
function resolveCreateStorageForStaging(row, policy) {
  const explicit = getResolvedImportStorageLocation(row)
  if (explicit) {
    return { locationKey: explicit, usedFallback: false }
  }
  const fallback = asTrimmedString(policy.newProductLocationFallback)
  if (fallback && fallback.length <= 80) {
    return { locationKey: fallback, usedFallback: true }
  }
  return { locationKey: null, usedFallback: false }
}

/**
 * @param {unknown} selectedFile
 * @returns {{
 *   source_filename: string,
 *   source_format: 'csv'|'xlsx'|null,
 *   source_file_size_bytes: number|null,
 *   source_fingerprint: string|null,
 *   extension: string,
 * }}
 */
function readSelectedFileMetadata(selectedFile) {
  if (!isPlainObject(selectedFile)) {
    throwStagingError(
      INVENTORY_IMPORT_STAGING_ERROR.FILE_METADATA_MISSING,
      'selectedFile metadata is required',
    )
  }

  const sourceFilename = asTrimmedString(selectedFile.name ?? selectedFile.sourceFilename)
  if (!sourceFilename) {
    throwStagingError(
      INVENTORY_IMPORT_STAGING_ERROR.FILE_METADATA_MISSING,
      'selectedFile.name is required',
    )
  }

  const extension = asTrimmedString(
    selectedFile.extension
    ?? selectedFile.sourceFormat
    ?? sourceFilename.split('.').pop(),
  ).toLowerCase()

  let sourceFormat = null
  if (extension === 'csv') sourceFormat = 'csv'
  else if (extension === 'xlsx' || extension === 'xls') sourceFormat = 'xlsx'

  const sizeCandidates = [
    selectedFile.sizeBytes,
    selectedFile.sourceFileSizeBytes,
    selectedFile.size,
    selectedFile.file && typeof selectedFile.file === 'object'
      ? selectedFile.file.size
      : null,
  ]
  let sourceFileSizeBytes = null
  for (const candidate of sizeCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue
    const numeric = typeof candidate === 'number' ? candidate : Number(candidate)
    if (Number.isFinite(numeric) && numeric >= 0) {
      sourceFileSizeBytes = numeric
      break
    }
  }

  const fingerprint = asTrimmedString(
    selectedFile.fingerprint
    ?? selectedFile.sourceFingerprint
    ?? selectedFile.source_fingerprint
    ?? '',
  )

  return {
    source_filename: sourceFilename,
    source_format: sourceFormat,
    source_file_size_bytes: sourceFileSizeBytes,
    source_fingerprint: fingerprint || null,
    extension,
  }
}

/**
 * Build one staged row payload (schema-shaped, no server IDs).
 *
 * Narrow helper: may represent manual_review for tests. Top-level Ready
 * serialization rejects unresolved rows.
 *
 * @param {{
 *   row: object,
 *   index: number,
 *   workspaceId: string,
 *   policy?: unknown,
 *   validationVersion?: string|null,
 * }} input
 */
export function buildInventoryImportRowPayload({
  row,
  index,
  workspaceId,
  policy,
  validationVersion = null,
} = {}) {
  if (!isPlainObject(row)) {
    throwStagingError(INVENTORY_IMPORT_STAGING_ERROR.PREVIEW_MISSING, 'row must be an object')
  }
  const normalizedWorkspaceId = asTrimmedString(workspaceId)
  if (!normalizedWorkspaceId) {
    throwStagingError(INVENTORY_IMPORT_STAGING_ERROR.WORKSPACE_MISSING, 'workspaceId is required')
  }

  const normalizedPolicy = normalizeInventoryImportSessionPolicy(policy)
  const reviewedAction = getImportEligibilityRowAction(row)
  const stagedAction = mapReviewedActionToStagedAction(reviewedAction)

  if (stagedAction == null) {
    throwStagingError(
      INVENTORY_IMPORT_STAGING_ERROR.UNRESOLVED_ROW,
      `unsupported reviewed action: ${reviewedAction || '<empty>'}`,
    )
  }
  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.UPDATE) {
    throwStagingError(
      INVENTORY_IMPORT_STAGING_ERROR.UNSUPPORTED_UPDATE_ACTION,
      'update action is forbidden in Import V1',
    )
  }

  const rowKey = getOperationalMatchResolutionRowKey(row, index)
  const sourceRowNumber = Number.isFinite(Number(row?.sourceRowNumber))
    && Number(row.sourceRowNumber) > 0
    ? Math.floor(Number(row.sourceRowNumber))
    : index + 1

  const rawPayload = {
    category: row?.source?.category ?? null,
    productName: row?.source?.productName ?? null,
    storage: row?.source?.storage ?? null,
    bar: row?.source?.bar ?? null,
    weekdays: row?.source?.weekdays ?? null,
    order: row?.source?.order ?? null,
    stockControl: row?.source?.stockControl ?? null,
    sourceQuantityEvidence: {
      sourceStorage: row?.quantityProposal?.sourceStorage ?? row?.source?.storage ?? null,
      sourceBar: row?.quantityProposal?.sourceBar ?? row?.source?.bar ?? null,
      proposedQuantity: row?.quantityProposal?.proposedQuantity ?? null,
    },
    sourceLocationEvidence: {
      storage: row?.source?.storage ?? null,
      proposedStorageLocation: row?.locationProposal?.proposedStorageLocation ?? null,
      resolvedStorageLocation: row?.resolvedStorageLocation
        ?? row?.locationProposal?.resolvedStorageLocation
        ?? null,
    },
  }

  /** @type {Record<string, unknown>} */
  const normalizedPayload = {
    quantityPolicy: normalizedPolicy.quantityPolicy,
    operationalRowKey: rowKey,
    reviewedAction,
  }

  let matchedStockItemId = null
  let confirmQuantityUpdate = false
  let confirmLocationFallback = false

  const hasLocationBindingContext = Array.isArray(normalizedPolicy.workspaceStorages)
    || Array.isArray(normalizedPolicy.locationColumnBindings)
    || Array.isArray(row?.locationQuantities)
  const locationResult = (
    stagedAction === INVENTORY_IMPORT_STAGED_ACTION.CREATE
    || stagedAction === INVENTORY_IMPORT_STAGED_ACTION.LINK
  ) && hasLocationBindingContext
    ? resolveImportRowLocationQuantities(row, normalizedPolicy)
    : null

  if (
    locationResult
    && locationResult.blockers.length > 0
    && normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
  ) {
    throwStagingError(
      INVENTORY_IMPORT_STAGING_ERROR.INVALID_LOCATION_QUANTITY,
      `row locationQuantities blocked: ${locationResult.blockers.join(',')}`,
    )
  }

  if (locationResult) {
    const serialized = serializeLocationQuantitiesForApply(locationResult.locationQuantities)
    normalizedPayload.locationQuantities = normalizedPolicy.quantityPolicy
      === INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE
      ? cloneJsonValue(locationResult.locationQuantities)
      : serialized
  }

  if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.CREATE) {
    const fields = getCreateDraftFields(row)
    if (!fields.productName) {
      throwStagingError(
        INVENTORY_IMPORT_STAGING_ERROR.MISSING_CREATE_NAME,
        'create row missing product name',
      )
    }
    if (!fields.unit) {
      throwStagingError(
        INVENTORY_IMPORT_STAGING_ERROR.MISSING_CREATE_UNIT,
        'create row missing unit',
      )
    }
    const storage = resolveCreateStorageForStaging(row, normalizedPolicy)
    if (!storage.locationKey) {
      throwStagingError(
        INVENTORY_IMPORT_STAGING_ERROR.MISSING_CREATE_STORAGE,
        'create row missing storage locationKey',
      )
    }
    confirmLocationFallback = storage.usedFallback === true

    normalizedPayload.name = fields.productName
    normalizedPayload.category = fields.category
    normalizedPayload.unit = fields.unit
    normalizedPayload.storageLocation = storage.locationKey
    normalizedPayload.locationKey = storage.locationKey
    normalizedPayload.supplier = fields.supplier
    normalizedPayload.supplierId = fields.supplierId
    normalizedPayload.active = true
    normalizedPayload.storageResolution = storage.usedFallback
      ? 'session_fallback'
      : 'explicit_or_mapped'

    if (normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK) {
      const quantity = getResolvedImportQuantity(row)
      if (quantity.status === 'valid' && quantity.value != null) {
        normalizedPayload.resolvedQuantity = quantity.value
      } else if (locationResult && locationResult.aggregateQuantity != null) {
        normalizedPayload.resolvedQuantity = locationResult.aggregateQuantity
      } else if (locationResult && Array.isArray(normalizedPayload.locationQuantities)) {
        // Multi-location path: empty cells → no opening balances; legacy field optional.
      } else {
        throwStagingError(
          INVENTORY_IMPORT_STAGING_ERROR.INVALID_OPENING_QUANTITY,
          'create row opening_stock requires finite quantity >= 0',
        )
      }
    }
  } else if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.LINK) {
    matchedStockItemId = getImportEligibilityMatchedStockItemId(row)
    if (!matchedStockItemId) {
      throwStagingError(
        INVENTORY_IMPORT_STAGING_ERROR.MISSING_LINK_TARGET,
        'link row missing matched stock item id',
      )
    }
    normalizedPayload.matchedStockItemId = matchedStockItemId
    normalizedPayload.sourceEvidence = {
      productName: row?.source?.productName ?? null,
      category: row?.source?.category ?? null,
      storage: row?.source?.storage ?? null,
      bar: row?.source?.bar ?? null,
    }

    if (normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK) {
      const quantity = getResolvedImportQuantity(row)
      if (quantity.status === 'valid' && quantity.value != null) {
        normalizedPayload.resolvedQuantity = quantity.value
      } else if (locationResult && locationResult.aggregateQuantity != null) {
        normalizedPayload.resolvedQuantity = locationResult.aggregateQuantity
      } else if (locationResult && Array.isArray(normalizedPayload.locationQuantities)) {
        // Multi-location path present.
      } else {
        throwStagingError(
          INVENTORY_IMPORT_STAGING_ERROR.INVALID_OPENING_QUANTITY,
          'link row opening_stock requires finite quantity >= 0',
        )
      }
      if (!normalizedPolicy.existingQuantityOverwriteConfirmed) {
        throwStagingError(
          INVENTORY_IMPORT_STAGING_ERROR.MISSING_OVERWRITE_CONFIRMATION,
          'opening_stock link requires existingQuantityOverwriteConfirmed',
        )
      }
      confirmQuantityUpdate = true
    }
  } else if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.SKIP) {
    normalizedPayload.skipReason = reviewedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID
      ? 'skip_invalid'
      : 'explicit_skip'
    normalizedPayload.blockers = Array.isArray(row?.blockers) ? [...row.blockers] : []
    normalizedPayload.warnings = Array.isArray(row?.warnings) ? [...row.warnings] : []
  } else if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW) {
    normalizedPayload.blockers = Array.isArray(row?.blockers) ? [...row.blockers] : []
    normalizedPayload.warnings = Array.isArray(row?.warnings) ? [...row.warnings] : []
  }

  const conflictState = mapConflictState(row, stagedAction)
  const validationState = mapValidationState(row, stagedAction)

  const mappingEvidence = {
    operationalRowKey: rowKey,
    reviewedAction,
    stagedAction,
    matchStatus: row?.match?.status ?? null,
    matchEvidence: Array.isArray(row?.match?.evidence)
      ? cloneJsonValue(row.match.evidence)
      : [],
    resolution: row?.resolution ? cloneJsonValue(row.resolution) : null,
    warnings: Array.isArray(row?.warnings) ? [...row.warnings] : [],
    blockers: Array.isArray(row?.blockers) ? [...row.blockers] : [],
  }

  const conflictEvidence = {
    matchStatus: row?.match?.status ?? null,
    matchedStockItemId,
    candidates: Array.isArray(row?.match?.candidates)
      ? cloneJsonValue(row.match.candidates)
      : [],
  }

  const rowFingerprint = asTrimmedString(
    row?.sourceFingerprint ?? row?.source_fingerprint ?? '',
  )

  return {
    workspace_id: normalizedWorkspaceId,
    source_row_number: sourceRowNumber,
    raw_payload: cloneJsonValue(rawPayload),
    normalized_payload: cloneJsonValue(normalizedPayload),
    mapping_evidence: mappingEvidence,
    source_fingerprint: rowFingerprint,
    validation_state: validationState,
    validation_messages: Array.isArray(row?.warnings) || Array.isArray(row?.blockers)
      ? cloneJsonValue([
        ...(Array.isArray(row?.blockers) ? row.blockers.map((code) => ({ severity: 'error', code })) : []),
        ...(Array.isArray(row?.warnings) ? row.warnings.map((code) => ({ severity: 'warning', code })) : []),
      ])
      : [],
    validation_version: validationVersion ? asTrimmedString(validationVersion) || null : null,
    conflict_state: conflictState,
    conflict_evidence: conflictEvidence,
    matched_stock_item_id: matchedStockItemId,
    proposed_action: stagedAction,
    selected_action: stagedAction,
    confirm_quantity_update: confirmQuantityUpdate,
    confirm_location_fallback: confirmLocationFallback,
    apply_state: 'pending',
  }
}

/**
 * @param {object[]} rowPayloads
 */
function deriveSessionCounters(rowPayloads) {
  let validRows = 0
  let warningRows = 0
  let errorRows = 0
  let createRows = 0
  let linkRows = 0
  let updateRows = 0
  let skipRows = 0
  let manualReviewRows = 0

  for (const row of rowPayloads) {
    if (row.validation_state === 'valid') validRows += 1
    else if (row.validation_state === 'warning') warningRows += 1
    else if (row.validation_state === 'error') errorRows += 1

    if (row.selected_action === INVENTORY_IMPORT_STAGED_ACTION.CREATE) createRows += 1
    else if (row.selected_action === INVENTORY_IMPORT_STAGED_ACTION.LINK) linkRows += 1
    else if (row.selected_action === INVENTORY_IMPORT_STAGED_ACTION.UPDATE) updateRows += 1
    else if (row.selected_action === INVENTORY_IMPORT_STAGED_ACTION.SKIP) skipRows += 1
    else if (row.selected_action === INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW) {
      manualReviewRows += 1
    }
  }

  return {
    total_rows: rowPayloads.length,
    valid_rows: validRows,
    warning_rows: warningRows,
    error_rows: errorRows,
    manual_review_rows: manualReviewRows,
    create_rows: createRows,
    link_rows: linkRows,
    update_rows: updateRows,
    skip_rows: skipRows,
  }
}

/**
 * Build session envelope payload (no server-generated fields).
 *
 * @param {{
 *   workspaceId: string,
 *   selectedFile: object,
 *   selectedWorksheetName?: string,
 *   headerRowNumber?: number|null,
 *   sourceFormat?: string|null,
 *   policy?: unknown,
 *   eligibility?: unknown,
 *   rowPayloads?: object[],
 *   parserVersion?: string|null,
 *   normalizationVersion?: string|null,
 *   validationVersion?: string|null,
 *   contractVersion?: string|null,
 *   mapping?: object,
 * }} input
 */
export function buildInventoryImportSessionPayload({
  workspaceId,
  selectedFile,
  selectedWorksheetName = '',
  headerRowNumber = null,
  sourceFormat = null,
  policy,
  eligibility,
  rowPayloads = [],
  parserVersion = null,
  normalizationVersion = null,
  validationVersion = null,
  contractVersion = 'import_v1.0',
  mapping = {},
} = {}) {
  const normalizedWorkspaceId = asTrimmedString(workspaceId)
  if (!normalizedWorkspaceId) {
    throwStagingError(INVENTORY_IMPORT_STAGING_ERROR.WORKSPACE_MISSING, 'workspaceId is required')
  }

  const fileMeta = readSelectedFileMetadata(selectedFile)
  const normalizedPolicy = normalizeInventoryImportSessionPolicy(policy)
  const counters = deriveSessionCounters(Array.isArray(rowPayloads) ? rowPayloads : [])

  const resolvedSourceFormat = fileMeta.source_format
    ?? (asTrimmedString(sourceFormat) === 'csv'
      ? 'csv'
      : asTrimmedString(sourceFormat) === 'xlsx' || asTrimmedString(sourceFormat) === 'xls'
        ? 'xlsx'
        : null)

  const header = headerRowNumber == null || headerRowNumber === ''
    ? null
    : Number(headerRowNumber)
  const safeHeader = Number.isFinite(header) && header > 0 ? Math.floor(header) : null

  const eligibilitySummary = isPlainObject(eligibility)
    ? {
        isReady: eligibility.isReady === true,
        blockingReasons: Array.isArray(eligibility.blockingReasons)
          ? [...eligibility.blockingReasons]
          : [],
        warningReasons: Array.isArray(eligibility.warningReasons)
          ? [...eligibility.warningReasons]
          : [],
        counts: isPlainObject(eligibility.counts)
          ? cloneJsonValue(eligibility.counts)
          : null,
      }
    : null

  return {
    workspace_id: normalizedWorkspaceId,
    source_filename: fileMeta.source_filename,
    source_format: resolvedSourceFormat,
    source_file_size_bytes: fileMeta.source_file_size_bytes,
    source_fingerprint: fileMeta.source_fingerprint,
    selected_sheet: asTrimmedString(selectedWorksheetName),
    header_row_number: safeHeader,
    parser_version: asTrimmedString(parserVersion) || INVENTORY_OPERATIONAL_SHEET_PARSER_VERSION,
    normalization_version: asTrimmedString(normalizationVersion) || null,
    validation_version: asTrimmedString(validationVersion) || null,
    contract_version: asTrimmedString(contractVersion) || 'import_v1.0',
    mapping: isPlainObject(mapping) ? cloneJsonValue(mapping) : {},
    confirmations: {
      quantityPolicy: normalizedPolicy.quantityPolicy,
      existingQuantityOverwriteConfirmed: normalizedPolicy.existingQuantityOverwriteConfirmed,
      newProductLocationFallback: normalizedPolicy.newProductLocationFallback,
      eligibilitySummary,
    },
    source_metadata: {
      fileExtension: fileMeta.extension || null,
      worksheetName: asTrimmedString(selectedWorksheetName) || null,
      operationalParserVersion: INVENTORY_OPERATIONAL_SHEET_PARSER_VERSION,
      operationalPreviewVersion: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_VERSION,
      stagingVersion: INVENTORY_IMPORT_STAGING_VERSION,
      totalReviewedRows: counters.total_rows,
    },
    status: 'review',
    ...counters,
  }
}

/**
 * Top-level Ready staging serializer.
 *
 * @param {{
 *   workspaceId: string,
 *   selectedFile: object,
 *   selectedWorksheetName?: string,
 *   headerRowNumber?: number|null,
 *   sourceFormat?: string|null,
 *   preview: object,
 *   policy: unknown,
 *   eligibility: object,
 *   parserVersion?: string|null,
 *   normalizationVersion?: string|null,
 *   validationVersion?: string|null,
 *   contractVersion?: string|null,
 *   mapping?: object,
 * }} input
 */
export function buildInventoryImportStagingPayload({
  workspaceId,
  selectedFile,
  selectedWorksheetName = '',
  headerRowNumber = null,
  sourceFormat = null,
  preview,
  policy,
  eligibility,
  parserVersion = null,
  normalizationVersion = null,
  validationVersion = null,
  contractVersion = 'import_v1.0',
  mapping = {},
} = {}) {
  const normalizedWorkspaceId = asTrimmedString(workspaceId)
  if (!normalizedWorkspaceId) {
    throwStagingError(INVENTORY_IMPORT_STAGING_ERROR.WORKSPACE_MISSING, 'workspaceId is required')
  }
  if (!isPlainObject(preview) || !Array.isArray(preview.rows)) {
    throwStagingError(INVENTORY_IMPORT_STAGING_ERROR.PREVIEW_MISSING, 'preview.rows is required')
  }
  if (!isPlainObject(eligibility)) {
    throwStagingError(INVENTORY_IMPORT_STAGING_ERROR.ELIGIBILITY_NOT_READY, 'eligibility is required')
  }
  if (eligibility.isReady !== true) {
    throwStagingError(INVENTORY_IMPORT_STAGING_ERROR.ELIGIBILITY_NOT_READY, 'eligibility.isReady must be true')
  }

  const normalizedPolicy = normalizeInventoryImportSessionPolicy(policy)
  if (normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY_SELECTION.UNSET) {
    throwStagingError(
      INVENTORY_IMPORT_STAGING_ERROR.QUANTITY_POLICY_UNSET,
      'quantityPolicy must be explicitly selected',
    )
  }

  const rows = preview.rows
  /** @type {Map<string, number[]>} */
  const linkTargets = new Map()
  /** @type {object[]} */
  const rowPayloads = []

  rows.forEach((row, index) => {
    const reviewedAction = getImportEligibilityRowAction(row)
    const stagedAction = mapReviewedActionToStagedAction(reviewedAction)

    if (stagedAction === INVENTORY_IMPORT_STAGED_ACTION.UPDATE) {
      throwStagingError(
        INVENTORY_IMPORT_STAGING_ERROR.UNSUPPORTED_UPDATE_ACTION,
        `row ${index + 1}: update action is forbidden`,
      )
    }
    if (
      stagedAction === INVENTORY_IMPORT_STAGED_ACTION.MANUAL_REVIEW
      || isImportEligibilityUnresolvedAction(reviewedAction)
      || reviewedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED
    ) {
      throwStagingError(
        INVENTORY_IMPORT_STAGING_ERROR.UNRESOLVED_ROW,
        `row ${index + 1}: unresolved or blocked action`,
      )
    }

    if (isImportEligibilityLinkAction(reviewedAction)) {
      const matchedId = getImportEligibilityMatchedStockItemId(row)
      if (!matchedId) {
        throwStagingError(
          INVENTORY_IMPORT_STAGING_ERROR.MISSING_LINK_TARGET,
          `row ${index + 1}: link missing matched stock item id`,
        )
      }
      const indexes = linkTargets.get(matchedId) ?? []
      indexes.push(index + 1)
      linkTargets.set(matchedId, indexes)
    }

    rowPayloads.push(buildInventoryImportRowPayload({
      row,
      index,
      workspaceId: normalizedWorkspaceId,
      policy: normalizedPolicy,
      validationVersion,
    }))
  })

  for (const [stockItemId, indexes] of linkTargets.entries()) {
    if (indexes.length > 1) {
      throwStagingError(
        INVENTORY_IMPORT_STAGING_ERROR.DUPLICATE_EXISTING_TARGET,
        `duplicate link target ${stockItemId} on rows ${indexes.join(',')}`,
      )
    }
  }

  if (
    normalizedPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
    && rowPayloads.some((row) => row.selected_action === INVENTORY_IMPORT_STAGED_ACTION.LINK)
    && !normalizedPolicy.existingQuantityOverwriteConfirmed
  ) {
    throwStagingError(
      INVENTORY_IMPORT_STAGING_ERROR.MISSING_OVERWRITE_CONFIRMATION,
      'opening_stock with link rows requires existingQuantityOverwriteConfirmed',
    )
  }

  const session = buildInventoryImportSessionPayload({
    workspaceId: normalizedWorkspaceId,
    selectedFile,
    selectedWorksheetName,
    headerRowNumber,
    sourceFormat,
    policy: normalizedPolicy,
    eligibility,
    rowPayloads,
    parserVersion,
    normalizationVersion,
    validationVersion,
    contractVersion,
    mapping,
  })

  return {
    stagingVersion: INVENTORY_IMPORT_STAGING_VERSION,
    session,
    rows: rowPayloads,
  }
}

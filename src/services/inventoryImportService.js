/**
 * P8.27.1–P8.27.3 — Inventory Import session staging, Ready, and Apply service.
 *
 * Thin RPC wrappers for create / stage / cancel / mark ready / apply.
 * No UI.
 */

import { supabase } from '../lib/supabaseClient'

export const CREATE_INVENTORY_IMPORT_SESSION_RPC = 'create_inventory_import_session'
export const STAGE_INVENTORY_IMPORT_ROWS_RPC = 'stage_inventory_import_rows'
export const CANCEL_INVENTORY_IMPORT_SESSION_RPC = 'cancel_inventory_import_session'
export const MARK_INVENTORY_IMPORT_SESSION_READY_RPC = 'mark_inventory_import_session_ready'
export const APPLY_INVENTORY_IMPORT_SESSION_RPC = 'apply_inventory_import_session'
export const INVENTORY_IMPORT_UNDO_ELIGIBILITY_RPC = 'inventory_import_undo_eligibility'
export const UNDO_INVENTORY_IMPORT_SESSION_RPC = 'undo_inventory_import_session'

/**
 * @param {unknown} workspaceId
 * @param {string} [message]
 * @returns {string}
 */
function requireWorkspaceId(workspaceId, message = 'Workspace is required.') {
  const normalized = `${workspaceId ?? ''}`.trim()
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

/**
 * @param {unknown} sessionId
 * @returns {string}
 */
function requireSessionId(sessionId) {
  const normalized = `${sessionId ?? ''}`.trim()
  if (!normalized) {
    throw new Error('Import session is required.')
  }
  return normalized
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>|null}
 */
function firstRpcPayload(data) {
  if (Array.isArray(data)) {
    const first = data[0]
    return first && typeof first === 'object' ? /** @type {Record<string, unknown>} */ (first) : null
  }
  if (data && typeof data === 'object') {
    return /** @type {Record<string, unknown>} */ (data)
  }
  return null
}

/**
 * @param {Record<string, unknown>|null|undefined} record
 */
export function mapInventoryImportSessionResult(record) {
  if (!record || typeof record !== 'object') return null

  const countersRaw = record.counters && typeof record.counters === 'object'
    ? /** @type {Record<string, unknown>} */ (record.counters)
    : null

  return {
    sessionId: record.session_id ?? record.sessionId ?? null,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    status: record.status ?? null,
    sourceFilename: record.source_filename ?? record.sourceFilename ?? null,
    sourceFormat: record.source_format ?? record.sourceFormat ?? null,
    sourceFileSizeBytes: record.source_file_size_bytes ?? record.sourceFileSizeBytes ?? null,
    sourceFingerprint: record.source_fingerprint ?? record.sourceFingerprint ?? null,
    selectedSheet: record.selected_sheet ?? record.selectedSheet ?? null,
    headerRowNumber: record.header_row_number ?? record.headerRowNumber ?? null,
    contractVersion: record.contract_version ?? record.contractVersion ?? null,
    parserVersion: record.parser_version ?? record.parserVersion ?? null,
    normalizationVersion: record.normalization_version ?? record.normalizationVersion ?? null,
    validationVersion: record.validation_version ?? record.validationVersion ?? null,
    mapping: record.mapping ?? {},
    confirmations: record.confirmations ?? {},
    sourceMetadata: record.source_metadata ?? record.sourceMetadata ?? {},
    totalRows: record.total_rows ?? record.totalRows ?? null,
    validRows: record.valid_rows ?? record.validRows ?? null,
    warningRows: record.warning_rows ?? record.warningRows ?? null,
    errorRows: record.error_rows ?? record.errorRows ?? null,
    manualReviewRows: record.manual_review_rows ?? record.manualReviewRows ?? null,
    createRows: record.create_rows ?? record.createRows ?? null,
    linkRows: record.link_rows ?? record.linkRows ?? null,
    updateRows: record.update_rows ?? record.updateRows ?? null,
    skipRows: record.skip_rows ?? record.skipRows ?? null,
    stagedRowCount: record.staged_row_count ?? record.stagedRowCount ?? null,
    counters: countersRaw
      ? {
          totalRows: countersRaw.total_rows ?? countersRaw.totalRows ?? 0,
          validRows: countersRaw.valid_rows ?? countersRaw.validRows ?? 0,
          warningRows: countersRaw.warning_rows ?? countersRaw.warningRows ?? 0,
          errorRows: countersRaw.error_rows ?? countersRaw.errorRows ?? 0,
          manualReviewRows: countersRaw.manual_review_rows ?? countersRaw.manualReviewRows ?? 0,
          createRows: countersRaw.create_rows ?? countersRaw.createRows ?? 0,
          linkRows: countersRaw.link_rows ?? countersRaw.linkRows ?? 0,
          updateRows: countersRaw.update_rows ?? countersRaw.updateRows ?? 0,
          skipRows: countersRaw.skip_rows ?? countersRaw.skipRows ?? 0,
        }
      : null,
    createdBy: record.created_by ?? record.createdBy ?? null,
    updatedBy: record.updated_by ?? record.updatedBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
    cancelledAt: record.cancelled_at ?? record.cancelledAt ?? null,
    readyAt: record.ready_at ?? record.readyAt ?? null,
    quantityPolicy: record.quantity_policy ?? record.quantityPolicy ?? null,
    applyIdempotencyKey: record.apply_idempotency_key
      ?? record.idempotency_key
      ?? record.applyIdempotencyKey
      ?? record.idempotencyKey
      ?? null,
    idempotencyResult: record.idempotency_result ?? record.idempotencyResult ?? null,
    eligibleRowCount: record.eligible_row_count ?? record.eligibleRowCount ?? null,
    createdCount: record.created_count ?? record.createdCount ?? null,
    linkedCount: record.linked_count ?? record.linkedCount ?? null,
    updatedCount: record.updated_count ?? record.updatedCount ?? null,
    skippedCount: record.skipped_count ?? record.skippedCount ?? null,
    failedCount: record.failed_count ?? record.failedCount ?? null,
    movementCount: record.movement_count ?? record.movementCount ?? null,
    createdStockItemIds: record.created_stock_item_ids ?? record.createdStockItemIds ?? null,
    linkedStockItemIds: record.linked_stock_item_ids ?? record.linkedStockItemIds ?? null,
    applyStartedAt: record.started_at ?? record.apply_started_at ?? record.applyStartedAt ?? null,
    applyCompletedAt: record.completed_at
      ?? record.apply_completed_at
      ?? record.applyCompletedAt
      ?? null,
    operatorUserId: record.operator_user_id ?? record.operatorUserId ?? null,
    idempotent: record.idempotent === true,
  }
}

/**
 * Propagate useful server exception messages; do not replace with a generic opaque error.
 * @param {unknown} error
 * @param {string} fallbackMessage
 * @returns {Error}
 */
export function mapInventoryImportRpcError(error, fallbackMessage) {
  const message = `${error?.message ?? ''}`.trim()
  if (message) {
    const mapped = new Error(message)
    mapped.cause = error
    return mapped
  }
  return new Error(fallbackMessage)
}

/**
 * Plain message for the import wizard. Missing functions and permission
 * failures stay on the review step instead of showing a database error.
 * @param {unknown} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatInventoryImportWizardError(error, fallback = 'Failed to apply inventory import.') {
  const message = `${error?.message ?? error ?? ''}`.trim()
  const code = `${error?.code ?? error?.cause?.code ?? ''}`.trim()
  const combined = `${code} ${message}`.toLowerCase()

  if (
    code === 'PGRST202'
    || combined.includes('schema cache')
    || combined.includes('could not find the function')
    || /function .* does not exist/.test(combined)
  ) {
    return 'Import is not available yet. The import session functions have not been installed.'
  }

  if (combined.includes('inventory_import_session_forbidden')) {
    return 'Only an owner, general manager, or manager can import stock.'
  }

  if (combined.includes('inventory_import_session_unauthenticated')) {
    return 'Sign in again, then retry the import.'
  }

  return message || fallback
}

/**
 * True when PostgREST cannot see the function yet.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isInventoryImportFunctionMissing(error) {
  const message = `${error?.message ?? error ?? ''}`.trim()
  const code = `${error?.code ?? error?.cause?.code ?? ''}`.trim()
  const combined = `${code} ${message}`.toLowerCase()
  return code === 'PGRST202'
    || combined.includes('schema cache')
    || combined.includes('could not find the function')
    || /function .* does not exist/.test(combined)
}

/**
 * @param {{
 *   workspaceId: string,
 *   sourceFilename: string,
 *   sourceFormat?: string|null,
 *   sourceFileSizeBytes?: number|null,
 *   sourceFingerprint?: string|null,
 *   selectedSheet?: string,
 *   headerRowNumber?: number|null,
 *   parserVersion?: string|null,
 *   normalizationVersion?: string|null,
 *   validationVersion?: string|null,
 *   contractVersion?: string|null,
 *   mapping?: object,
 *   confirmations?: object,
 *   sourceMetadata?: object,
 *   stagingVersion?: string|null,
 * }} input
 */
export async function createInventoryImportSession(input = {}) {
  const workspaceId = requireWorkspaceId(input.workspaceId, 'Workspace is required to create an import session.')
  const sourceFilename = `${input.sourceFilename ?? ''}`.trim()
  if (!sourceFilename) {
    throw new Error('Source filename is required.')
  }

  const { data, error } = await supabase.rpc(CREATE_INVENTORY_IMPORT_SESSION_RPC, {
    p_workspace_id: workspaceId,
    p_source_filename: sourceFilename,
    p_source_format: input.sourceFormat ?? null,
    p_source_file_size_bytes: input.sourceFileSizeBytes ?? null,
    p_source_fingerprint: input.sourceFingerprint ?? null,
    p_selected_sheet: input.selectedSheet ?? '',
    p_header_row_number: input.headerRowNumber ?? null,
    p_parser_version: input.parserVersion ?? null,
    p_normalization_version: input.normalizationVersion ?? null,
    p_validation_version: input.validationVersion ?? null,
    p_contract_version: input.contractVersion ?? 'import_v1.0',
    p_mapping: input.mapping ?? {},
    p_confirmations: input.confirmations ?? {},
    p_source_metadata: input.sourceMetadata ?? {},
    p_staging_version: input.stagingVersion ?? null,
  })

  if (error) {
    throw mapInventoryImportRpcError(error, 'Failed to create inventory import session.')
  }

  const mapped = mapInventoryImportSessionResult(firstRpcPayload(data))
  if (!mapped?.sessionId) {
    throw new Error('Create inventory import session returned no session.')
  }
  return mapped
}

/**
 * @param {{
 *   workspaceId: string,
 *   sessionId: string,
 *   rows: unknown[],
 * }} input
 */
export async function stageInventoryImportRows(input = {}) {
  const workspaceId = requireWorkspaceId(input.workspaceId, 'Workspace is required to stage import rows.')
  const sessionId = requireSessionId(input.sessionId)
  if (!Array.isArray(input.rows)) {
    throw new Error('Import rows payload must be an array.')
  }

  const { data, error } = await supabase.rpc(STAGE_INVENTORY_IMPORT_ROWS_RPC, {
    p_workspace_id: workspaceId,
    p_session_id: sessionId,
    p_rows: input.rows,
  })

  if (error) {
    throw mapInventoryImportRpcError(error, 'Failed to stage inventory import rows.')
  }

  const mapped = mapInventoryImportSessionResult(firstRpcPayload(data))
  if (!mapped?.sessionId) {
    throw new Error('Stage inventory import rows returned no session.')
  }
  return mapped
}

/**
 * @param {{
 *   workspaceId: string,
 *   sessionId: string,
 * }} input
 */
export async function cancelInventoryImportSession(input = {}) {
  const workspaceId = requireWorkspaceId(input.workspaceId, 'Workspace is required to cancel an import session.')
  const sessionId = requireSessionId(input.sessionId)

  const { data, error } = await supabase.rpc(CANCEL_INVENTORY_IMPORT_SESSION_RPC, {
    p_workspace_id: workspaceId,
    p_session_id: sessionId,
  })

  if (error) {
    throw mapInventoryImportRpcError(error, 'Failed to cancel inventory import session.')
  }

  const mapped = mapInventoryImportSessionResult(firstRpcPayload(data))
  if (!mapped?.sessionId) {
    throw new Error('Cancel inventory import session returned no session.')
  }
  return mapped
}

/**
 * Mark a reviewed import session Ready (server-authoritative eligibility).
 *
 * @param {{
 *   workspaceId: string,
 *   sessionId: string,
 * }} input
 */
export async function markInventoryImportSessionReady(input = {}) {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    'Workspace is required to mark an import session ready.',
  )
  const sessionId = requireSessionId(input.sessionId)

  const { data, error } = await supabase.rpc(MARK_INVENTORY_IMPORT_SESSION_READY_RPC, {
    p_workspace_id: workspaceId,
    p_session_id: sessionId,
  })

  if (error) {
    throw mapInventoryImportRpcError(error, 'Failed to mark inventory import session ready.')
  }

  const mapped = mapInventoryImportSessionResult(firstRpcPayload(data))
  if (!mapped?.sessionId) {
    throw new Error('Mark inventory import session ready returned no session.')
  }
  return mapped
}

/**
 * Apply a Ready import session transactionally.
 *
 * @param {{
 *   workspaceId: string,
 *   sessionId: string,
 *   applyIdempotencyKey: string,
 * }} input
 */
export async function applyInventoryImportSession(input = {}) {
  const workspaceId = requireWorkspaceId(
    input.workspaceId,
    'Workspace is required to apply an import session.',
  )
  const sessionId = requireSessionId(input.sessionId)
  const applyIdempotencyKey = `${input.applyIdempotencyKey ?? ''}`.trim()
  if (!applyIdempotencyKey) {
    throw new Error('Apply idempotency key is required.')
  }

  const { data, error } = await supabase.rpc(APPLY_INVENTORY_IMPORT_SESSION_RPC, {
    p_workspace_id: workspaceId,
    p_session_id: sessionId,
    p_apply_idempotency_key: applyIdempotencyKey,
  })

  if (error) {
    throw mapInventoryImportRpcError(error, 'Failed to apply inventory import session.')
  }

  const mapped = mapInventoryImportSessionResult(firstRpcPayload(data))
  if (!mapped?.sessionId) {
    throw new Error('Apply inventory import session returned no result.')
  }
  return mapped
}

/**
 * Read-only. Missing function and any other failure are for the caller to hide.
 * @param {{ workspaceId: string, sessionId: string }} input
 */
export async function checkInventoryImportUndoEligibility(input = {}) {
  const workspaceId = requireWorkspaceId(input.workspaceId, 'Workspace is required to check import undo.')
  const sessionId = requireSessionId(input.sessionId)
  if (!supabase) {
    throw new Error('Import undo is not available yet.')
  }

  const { data, error } = await supabase.rpc(INVENTORY_IMPORT_UNDO_ELIGIBILITY_RPC, {
    p_workspace_id: workspaceId,
    p_session_id: sessionId,
  })

  if (error) {
    throw mapInventoryImportRpcError(error, 'Failed to check whether this import can be undone.')
  }

  const payload = firstRpcPayload(data) ?? {}
  const reasons = Array.isArray(payload.reasons) ? payload.reasons.map((reason) => `${reason}`) : []
  return {
    allowed: payload.allowed === true,
    reasons,
    sessionId: payload.session_id ?? payload.sessionId ?? sessionId,
    status: payload.status ?? null,
  }
}

/**
 * Undo a completed import. The server re-checks every refusal.
 * @param {{ workspaceId: string, sessionId: string }} input
 */
export async function undoInventoryImportSession(input = {}) {
  const workspaceId = requireWorkspaceId(input.workspaceId, 'Workspace is required to undo an import.')
  const sessionId = requireSessionId(input.sessionId)
  if (!supabase) {
    throw new Error('Import undo is not available yet.')
  }

  const { data, error } = await supabase.rpc(UNDO_INVENTORY_IMPORT_SESSION_RPC, {
    p_workspace_id: workspaceId,
    p_session_id: sessionId,
  })

  if (error) {
    const hint = `${error.hint ?? ''}`.trim()
    const message = `${error.message ?? ''}`.trim()
    throw mapInventoryImportRpcError(
      { ...error, message: hint || message },
      'Failed to undo this import.',
    )
  }

  const mapped = mapInventoryImportSessionResult(firstRpcPayload(data))
  if (!mapped?.sessionId) {
    throw new Error('Undo inventory import session returned no result.')
  }
  return mapped
}

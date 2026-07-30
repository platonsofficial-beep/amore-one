/**
 * P8.29.7 — Service Dual-Write Foundation
 *
 * Internal routing layer for stock quantity mutations.
 * Callers keep using stockMovementService.recordStockMovement — this module
 * chooses legacy vs location-aware engines.
 *
 * Capability (hardcoded; not a UI/workspace setting):
 *   supportsLocationBalances === false → 100% legacy path (production default)
 *   supportsLocationBalances === true  → location RPC path only (no double-write)
 */

import { applyStockMovementQuantity } from '../lib/stockUtils'
import { supabase } from '../lib/supabaseClient'
import { updateStockItemQuantity } from './stockItemService'

const STOCK_MOVEMENTS_TABLE = 'stock_movements'

const VALID_MOVEMENT_TYPES = new Set(['receive', 'usage', 'adjustment', 'stock_count'])

const LOCATION_RPC_BY_TYPE = Object.freeze({
  receive: 'record_location_receive',
  usage: 'record_location_usage',
  adjustment: 'record_location_adjustment',
  stock_count: 'record_location_stock_count',
})

/** Hardcoded internal capability. Default FALSE = legacy production path. */
let supportsLocationBalances = false

export function getSupportsLocationBalances() {
  return supportsLocationBalances === true
}

/**
 * Test-only capability override. Not a runtime/UI/workspace setting.
 * @param {boolean} value
 */
export function __setSupportsLocationBalancesForTests(value) {
  supportsLocationBalances = value === true
}

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapStockMovement(record) {
  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    itemId: record.item_id ?? record.itemId ?? '',
    type: record.type ?? '',
    quantity: Number(record.quantity ?? 0),
    note: record.note ?? '',
    createdBy: record.created_by ?? record.createdBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
  }
}

function firstRpcPayload(data) {
  if (data == null) return null
  if (Array.isArray(data)) return data[0] ?? null
  return data
}

function normalizeMutationInput({
  workspaceId,
  itemId,
  type,
  quantity,
  note = '',
  createdBy = null,
  currentQuantity = 0,
  workspaceStorageId = null,
  expectedQuantityVersion = null,
  originWorkflow = 'manual',
  originRefId = null,
}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedItemId = `${itemId ?? ''}`.trim()
  const normalizedType = `${type ?? ''}`.trim()
  const normalizedNote = `${note ?? ''}`.trim()
  const movementQuantity = Number(quantity)

  if (!normalizedWorkspaceId || !normalizedItemId) {
    throw new Error('Workspace and item are required for stock movements.')
  }

  if (!VALID_MOVEMENT_TYPES.has(normalizedType)) {
    throw new Error('Invalid stock movement type.')
  }

  if (normalizedType === 'stock_count') {
    if (!Number.isFinite(movementQuantity) || movementQuantity < 0) {
      throw new Error('Count must be zero or greater.')
    }
  } else if (!Number.isFinite(movementQuantity) || movementQuantity === 0) {
    throw new Error('Quantity must be a non-zero number.')
  }

  return {
    workspaceId: normalizedWorkspaceId,
    itemId: normalizedItemId,
    type: normalizedType,
    quantity: movementQuantity,
    note: normalizedNote,
    createdBy,
    currentQuantity,
    workspaceStorageId: workspaceStorageId == null ? null : `${workspaceStorageId}`.trim(),
    expectedQuantityVersion,
    originWorkflow: `${originWorkflow ?? 'manual'}`.trim() || 'manual',
    originRefId: originRefId ?? null,
  }
}

/**
 * Legacy path — identical to pre-P8.29.7 recordStockMovement behavior.
 * Direct stock_movements insert + stock_items.current_quantity patch.
 * Never calls location balance RPCs.
 */
export async function recordStockMutationLegacy(input) {
  const {
    workspaceId,
    itemId,
    type,
    quantity,
    note,
    createdBy,
    currentQuantity,
  } = normalizeMutationInput(input)

  const nextQuantity = applyStockMovementQuantity(currentQuantity, type, quantity)

  const { data, error } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .insert([{
      workspace_id: workspaceId,
      item_id: itemId,
      type,
      quantity,
      note,
      created_by: createdBy,
    }])
    .select('*')
    .single()

  if (error) {
    console.error('[stockMutationService] recordStockMutationLegacy error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Stock movement tables are not ready yet. Run stock_movements_schema.sql in Supabase.')
    }
    throw new Error(error.message || 'Unable to record stock movement right now.')
  }

  await updateStockItemQuantity(itemId, workspaceId, nextQuantity)

  return mapStockMovement(data)
}

/**
 * Location-aware path — routes ONLY through balance mutation RPCs.
 * Never inserts movements or patches current_quantity directly (RPC owns both).
 */
export async function recordStockMutationLocationAware(input) {
  const normalized = normalizeMutationInput(input)
  const {
    workspaceId,
    itemId,
    type,
    quantity,
    note,
    workspaceStorageId,
    expectedQuantityVersion,
    originWorkflow,
    originRefId,
  } = normalized

  if (!workspaceStorageId) {
    throw new Error('Workspace storage is required for location balance mutations.')
  }

  const version = Number(expectedQuantityVersion)
  if (!Number.isFinite(version) || version < 1) {
    throw new Error('Expected quantity version is required for location balance mutations.')
  }

  const rpcName = LOCATION_RPC_BY_TYPE[type]
  if (!rpcName) {
    throw new Error('Invalid stock movement type.')
  }

  const { data, error } = await supabase.rpc(rpcName, {
    p_workspace_id: workspaceId,
    p_stock_item_id: itemId,
    p_workspace_storage_id: workspaceStorageId,
    p_quantity: quantity,
    p_expected_quantity_version: version,
    p_note: note,
    p_origin_workflow: originWorkflow,
    p_origin_ref_id: originRefId,
  })

  if (error) {
    console.error('[stockMutationService] recordStockMutationLocationAware error:', error)
    throw new Error(error.message || 'Unable to record location stock movement right now.')
  }

  const payload = firstRpcPayload(data)
  const movementId = payload?.movement_id ?? payload?.movementId ?? null
  if (!movementId) {
    throw new Error('Location stock mutation response was empty.')
  }

  const { data: movementRow, error: movementError } = await supabase
    .from(STOCK_MOVEMENTS_TABLE)
    .select('*')
    .eq('id', movementId)
    .eq('workspace_id', workspaceId)
    .single()

  if (movementError) {
    console.error('[stockMutationService] load movement after location RPC error:', movementError)
    throw new Error(movementError.message || 'Unable to load stock movement after location mutation.')
  }

  return mapStockMovement(movementRow)
}

const TRANSFER_RPC = 'transfer_stock_between_locations'

const TRANSFER_ERROR_MESSAGES = Object.freeze({
  stock_transfer_unauthenticated: 'Sign in to transfer stock.',
  stock_transfer_workspace_required: 'Workspace is required to transfer stock.',
  stock_transfer_item_required: 'Product is required to transfer stock.',
  stock_transfer_storage_required: 'Source and destination storages are required.',
  stock_transfer_same_storage: 'Choose a different destination storage.',
  stock_transfer_version_required: 'Balance versions are required to transfer stock.',
  stock_transfer_quantity_invalid: 'Enter a valid transfer quantity.',
  stock_transfer_quantity_zero: 'Transfer quantity must be greater than zero.',
  stock_transfer_quantity_negative: 'Transfer quantity must be positive.',
  stock_transfer_workspace_not_found: 'Workspace was not found.',
  stock_transfer_forbidden: 'You do not have permission to transfer stock.',
  stock_transfer_item_not_found: 'Product was not found in this workspace.',
  stock_transfer_storage_not_found: 'Storage was not found in this workspace.',
  stock_transfer_storage_inactive: 'Inactive storages cannot be used for transfers.',
  stock_transfer_source_balance_not_found: 'Source storage has no balance for this product.',
  stock_transfer_destination_balance_not_found: 'Destination storage has no balance for this product yet.',
  stock_transfer_insufficient_source: 'Not enough quantity in the source storage.',
  stock_transfer_source_version_mismatch: 'Source quantity changed. Refresh and try again.',
  stock_transfer_destination_version_mismatch: 'Destination quantity changed. Refresh and try again.',
})

/**
 * Map transfer RPC errors to operator-facing messages.
 * @param {unknown} error
 * @returns {Error}
 */
export function mapStockTransferRpcError(error) {
  const raw = `${error?.message ?? error?.code ?? ''}`.trim()
  for (const [code, message] of Object.entries(TRANSFER_ERROR_MESSAGES)) {
    if (raw.includes(code)) return new Error(message)
  }
  return new Error(raw || 'Unable to transfer stock right now.')
}

/**
 * P8.30.6 — Thin wrapper around production transfer_stock_between_locations.
 * No direct quantity patches or movement inserts.
 *
 * @param {{
 *   workspaceId?: string,
 *   stockItemId?: string,
 *   sourceWorkspaceStorageId?: string,
 *   destinationWorkspaceStorageId?: string,
 *   quantity?: number,
 *   expectedSourceQuantityVersion?: number,
 *   expectedDestinationQuantityVersion?: number,
 *   note?: string,
 *   originRefId?: string|null,
 * }} [input]
 */
export async function transferStockBetweenLocations({
  workspaceId = '',
  stockItemId = '',
  sourceWorkspaceStorageId = '',
  destinationWorkspaceStorageId = '',
  quantity,
  expectedSourceQuantityVersion,
  expectedDestinationQuantityVersion,
  note = '',
  originRefId = null,
} = {}) {
  const p_workspace_id = `${workspaceId ?? ''}`.trim()
  const p_stock_item_id = `${stockItemId ?? ''}`.trim()
  const p_source_workspace_storage_id = `${sourceWorkspaceStorageId ?? ''}`.trim()
  const p_destination_workspace_storage_id = `${destinationWorkspaceStorageId ?? ''}`.trim()
  const p_quantity = Number(quantity)
  const p_expected_source_quantity_version = Number(expectedSourceQuantityVersion)
  const p_expected_destination_quantity_version = Number(expectedDestinationQuantityVersion)

  if (!p_workspace_id) throw new Error('Workspace is required to transfer stock.')
  if (!p_stock_item_id) throw new Error('Product is required to transfer stock.')
  if (!p_source_workspace_storage_id || !p_destination_workspace_storage_id) {
    throw new Error('Source and destination storages are required.')
  }
  if (p_source_workspace_storage_id === p_destination_workspace_storage_id) {
    throw new Error('Choose a different destination storage.')
  }
  if (!Number.isFinite(p_quantity) || p_quantity <= 0) {
    throw new Error('Enter a positive quantity to transfer.')
  }
  if (!Number.isFinite(p_expected_source_quantity_version) || p_expected_source_quantity_version < 1) {
    throw new Error('Source balance version is required to transfer stock.')
  }
  if (!Number.isFinite(p_expected_destination_quantity_version) || p_expected_destination_quantity_version < 1) {
    throw new Error('Destination balance version is required to transfer stock.')
  }

  const { data, error } = await supabase.rpc(TRANSFER_RPC, {
    p_workspace_id,
    p_stock_item_id,
    p_source_workspace_storage_id,
    p_destination_workspace_storage_id,
    p_quantity,
    p_expected_source_quantity_version: Math.floor(p_expected_source_quantity_version),
    p_expected_destination_quantity_version: Math.floor(p_expected_destination_quantity_version),
    p_note: `${note ?? ''}`,
    p_origin_ref_id: originRefId,
  })

  if (error) {
    console.error('[stockMutationService] transferStockBetweenLocations error:', error)
    throw mapStockTransferRpcError(error)
  }

  const payload = firstRpcPayload(data)
  if (payload == null) {
    throw new Error('Transfer response was empty.')
  }

  return payload
}

/**
 * Single internal routing entry. Not a UI API.
 * Chooses exactly one path — never both.
 *
 * P8.30.5 — when a caller supplies workspaceStorageId (Storage Receive),
 * use the existing location-aware mutation path so destination balances update.
 * Dashboard callers without storage id keep the production legacy default.
 */
export async function recordStockMutation(input) {
  const storageId = `${input?.workspaceStorageId ?? ''}`.trim()
  if (getSupportsLocationBalances() || storageId) {
    return recordStockMutationLocationAware(input)
  }
  return recordStockMutationLegacy(input)
}

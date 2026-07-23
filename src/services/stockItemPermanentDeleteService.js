/**
 * P8.16.24 — Permanent Stock item delete execution service.
 *
 * Calls SECURITY DEFINER RPC delete_stock_item_permanently.
 * No UI formatting, password logic, or retries.
 */
import { supabase } from '../lib/supabaseClient'

const DELETE_RPC = 'delete_stock_item_permanently'

export class StockItemPermanentDeleteError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'StockItemPermanentDeleteError'
    this.code = code
  }
}

function requireId(value, code, message) {
  const normalized = `${value ?? ''}`.trim()
  if (!normalized) {
    throw new StockItemPermanentDeleteError(code, message)
  }
  return normalized
}

function mapDeleteRpcError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const details = `${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  const combined = `${message} ${details}`

  if (combined.includes('stock_item_permanent_delete_unauthenticated')) {
    return new StockItemPermanentDeleteError(
      'UNAUTHENTICATED',
      'Sign in required to permanently delete a stock product.',
    )
  }
  if (combined.includes('stock_item_permanent_delete_forbidden')) {
    return new StockItemPermanentDeleteError(
      'FORBIDDEN',
      'Only owner, general manager, or manager can permanently delete a stock product.',
    )
  }
  if (combined.includes('stock_item_permanent_delete_workspace_required')) {
    return new StockItemPermanentDeleteError('WORKSPACE_REQUIRED', 'Workspace is required.')
  }
  if (combined.includes('stock_item_permanent_delete_workspace_not_found')) {
    return new StockItemPermanentDeleteError('WORKSPACE_NOT_FOUND', 'Workspace was not found.')
  }
  if (combined.includes('stock_item_permanent_delete_item_required')) {
    return new StockItemPermanentDeleteError('ITEM_REQUIRED', 'Stock item is required.')
  }
  if (combined.includes('stock_item_permanent_delete_item_not_found')) {
    return new StockItemPermanentDeleteError(
      'ITEM_NOT_FOUND',
      'Stock item was not found in this workspace.',
    )
  }
  if (combined.includes('stock_item_permanent_delete_blocked_draft_order')) {
    return new StockItemPermanentDeleteError(
      'BLOCKED_DRAFT_ORDER',
      'Product is referenced by a draft purchase order.',
    )
  }
  if (combined.includes('stock_item_permanent_delete_blocked_sent_order')) {
    return new StockItemPermanentDeleteError(
      'BLOCKED_SENT_ORDER',
      'Product is referenced by a sent purchase order.',
    )
  }
  if (combined.includes('stock_item_permanent_delete_blocked_open_count')) {
    return new StockItemPermanentDeleteError(
      'BLOCKED_OPEN_COUNT',
      'Product is referenced by an open inventory count session.',
    )
  }

  return new StockItemPermanentDeleteError(
    'RPC_FAILED',
    error?.message || 'Unable to permanently delete stock product right now.',
  )
}

/**
 * Permanently delete one stock product via RPC.
 * Returns the RPC JSON payload unchanged (snake_case keys).
 *
 * @param {string} workspaceId
 * @param {string} stockItemId
 */
export async function deleteStockItemPermanently(workspaceId, stockItemId) {
  const p_workspace_id = requireId(
    workspaceId,
    'WORKSPACE_REQUIRED',
    'Workspace is required to permanently delete a stock product.',
  )
  const p_stock_item_id = requireId(
    stockItemId,
    'ITEM_REQUIRED',
    'Stock item is required to permanently delete a stock product.',
  )

  const { data, error } = await supabase.rpc(DELETE_RPC, {
    p_workspace_id,
    p_stock_item_id,
  })

  if (error) {
    console.error('[stockItemPermanentDeleteService] delete error:', error)
    throw mapDeleteRpcError(error)
  }

  if (!data || typeof data !== 'object' || data.success !== true) {
    throw new StockItemPermanentDeleteError(
      'INVALID_RESPONSE',
      'Permanent stock delete response was empty or invalid.',
    )
  }

  return data
}

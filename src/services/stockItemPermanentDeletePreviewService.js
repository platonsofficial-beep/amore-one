/**
 * P8.16.23 — Permanent Stock item delete preview service (READ-ONLY).
 *
 * Calls SECURITY DEFINER RPC preview_stock_item_permanent_delete.
 * Never deletes, updates, or inserts. No UI formatting.
 */
import { supabase } from '../lib/supabaseClient'

const PREVIEW_RPC = 'preview_stock_item_permanent_delete'

export class StockItemPermanentDeletePreviewError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'StockItemPermanentDeletePreviewError'
    this.code = code
  }
}

function requireId(value, code, message) {
  const normalized = `${value ?? ''}`.trim()
  if (!normalized) {
    throw new StockItemPermanentDeletePreviewError(code, message)
  }
  return normalized
}

function mapPreviewRpcError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const details = `${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  const combined = `${message} ${details}`

  if (combined.includes('stock_item_permanent_delete_preview_unauthenticated')) {
    return new StockItemPermanentDeletePreviewError(
      'UNAUTHENTICATED',
      'Sign in required to preview permanent stock deletion.',
    )
  }
  if (combined.includes('stock_item_permanent_delete_preview_forbidden')) {
    return new StockItemPermanentDeletePreviewError(
      'FORBIDDEN',
      'Only owner, general manager, or manager can preview permanent stock deletion.',
    )
  }
  if (combined.includes('stock_item_permanent_delete_preview_workspace_required')) {
    return new StockItemPermanentDeletePreviewError('WORKSPACE_REQUIRED', 'Workspace is required.')
  }
  if (combined.includes('stock_item_permanent_delete_preview_workspace_not_found')) {
    return new StockItemPermanentDeletePreviewError('WORKSPACE_NOT_FOUND', 'Workspace was not found.')
  }
  if (combined.includes('stock_item_permanent_delete_preview_item_required')) {
    return new StockItemPermanentDeletePreviewError('ITEM_REQUIRED', 'Stock item is required.')
  }
  if (combined.includes('stock_item_permanent_delete_preview_item_not_found')) {
    return new StockItemPermanentDeletePreviewError(
      'ITEM_NOT_FOUND',
      'Stock item was not found in this workspace.',
    )
  }

  return new StockItemPermanentDeletePreviewError(
    'RPC_FAILED',
    error?.message || 'Unable to preview permanent stock deletion right now.',
  )
}

/**
 * Read-only dependency preview for permanent deletion of one stock product.
 * Returns the RPC JSON payload unchanged (snake_case keys).
 *
 * @param {string} workspaceId
 * @param {string} stockItemId
 */
export async function previewStockItemPermanentDelete(workspaceId, stockItemId) {
  const p_workspace_id = requireId(
    workspaceId,
    'WORKSPACE_REQUIRED',
    'Workspace is required to preview permanent stock deletion.',
  )
  const p_stock_item_id = requireId(
    stockItemId,
    'ITEM_REQUIRED',
    'Stock item is required to preview permanent stock deletion.',
  )

  const { data, error } = await supabase.rpc(PREVIEW_RPC, {
    p_workspace_id,
    p_stock_item_id,
  })

  if (error) {
    console.error('[stockItemPermanentDeletePreviewService] preview error:', error)
    throw mapPreviewRpcError(error)
  }

  if (!data || typeof data !== 'object') {
    throw new StockItemPermanentDeletePreviewError(
      'INVALID_RESPONSE',
      'Permanent stock delete preview response was empty or invalid.',
    )
  }

  return data
}

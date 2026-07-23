/**
 * P8.16.20 — Purchase Order document cleanup service (preview + execute).
 *
 * Calls SECURITY DEFINER RPC cleanup_purchase_order_documents.
 * Document-only: never mutates stock_items / stock_movements / quantities.
 * UI: StockOrderCleanupDialog (P8.16.21).
 */
import { supabase } from '../lib/supabaseClient'

const CLEANUP_RPC = 'cleanup_purchase_order_documents'

export class StockOrderCleanupError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'StockOrderCleanupError'
    this.code = code
  }
}

function requireWorkspaceId(workspaceId) {
  const normalized = `${workspaceId ?? ''}`.trim()
  if (!normalized) {
    throw new StockOrderCleanupError(
      'WORKSPACE_REQUIRED',
      'Workspace is required to preview or clean up purchase orders.',
    )
  }
  return normalized
}

function mapCleanupRpcError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const details = `${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  const combined = `${message} ${details}`

  if (combined.includes('stock_order_cleanup_unauthenticated')) {
    return new StockOrderCleanupError('UNAUTHENTICATED', 'Sign in required to clean up purchase orders.')
  }
  if (combined.includes('stock_order_cleanup_forbidden')) {
    return new StockOrderCleanupError(
      'FORBIDDEN',
      'Only owner, general manager, or manager can clean up purchase orders.',
    )
  }
  if (combined.includes('stock_order_cleanup_workspace_required')) {
    return new StockOrderCleanupError('WORKSPACE_REQUIRED', 'Workspace is required.')
  }
  if (combined.includes('stock_order_cleanup_workspace_not_found')) {
    return new StockOrderCleanupError('WORKSPACE_NOT_FOUND', 'Workspace was not found.')
  }

  return new StockOrderCleanupError(
    'RPC_FAILED',
    error?.message || 'Unable to run purchase order cleanup right now.',
  )
}

/**
 * @param {Record<string, unknown>|null|undefined} payload
 */
export function mapPurchaseOrderCleanupResult(payload) {
  if (!payload || typeof payload !== 'object') return null

  const toCount = (value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : 0
  }

  return {
    workspaceId: `${payload.workspace_id ?? payload.workspaceId ?? ''}`.trim(),
    previewOnly: payload.preview_only === true || payload.previewOnly === true,
    totalOrders: toCount(payload.total_orders ?? payload.totalOrders),
    draftOrders: toCount(payload.draft_orders ?? payload.draftOrders),
    sentOrders: toCount(payload.sent_orders ?? payload.sentOrders),
    receivedOrders: toCount(payload.received_orders ?? payload.receivedOrders),
    cancelledOrders: toCount(payload.cancelled_orders ?? payload.cancelledOrders),
    totalOrderItems: toCount(payload.total_order_items ?? payload.totalOrderItems),
    linesWithReceive: toCount(payload.lines_with_receive ?? payload.linesWithReceive),
    ordersWithReceive: toCount(payload.orders_with_receive ?? payload.ordersWithReceive),
    hasReceiveFootprint: Boolean(
      payload.has_receive_footprint ?? payload.hasReceiveFootprint ?? false,
    ),
    deletedOrders: toCount(payload.deleted_orders ?? payload.deletedOrders),
    deletedOrderItems: toCount(payload.deleted_order_items ?? payload.deletedOrderItems),
    preservesStockMovements: payload.preserves_stock_movements !== false
      && payload.preservesStockMovements !== false,
    preservesStockQuantities: payload.preserves_stock_quantities !== false
      && payload.preservesStockQuantities !== false,
  }
}

async function callPurchaseOrderCleanupRpc(workspaceId, previewOnly) {
  const p_workspace_id = requireWorkspaceId(workspaceId)

  const { data, error } = await supabase.rpc(CLEANUP_RPC, {
    p_workspace_id,
    p_preview_only: previewOnly === true,
  })

  if (error) {
    console.error('[stockOrderCleanupService] cleanup_purchase_order_documents error:', error)
    throw mapCleanupRpcError(error)
  }

  const mapped = mapPurchaseOrderCleanupResult(data)
  if (!mapped || !mapped.workspaceId) {
    throw new StockOrderCleanupError('INVALID_RESPONSE', 'Purchase order cleanup response was empty or invalid.')
  }

  return mapped
}

/** Preview-only. Never deletes. */
export async function previewPurchaseOrderCleanup(workspaceId) {
  return callPurchaseOrderCleanupRpc(workspaceId, true)
}

/**
 * Execute document-only cleanup for the workspace.
 * Deletes stock_orders (+ cascaded stock_order_items). Leaves movements/qty untouched.
 */
export async function cleanupPurchaseOrderDocuments(workspaceId) {
  return callPurchaseOrderCleanupRpc(workspaceId, false)
}

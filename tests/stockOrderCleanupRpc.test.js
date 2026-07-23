/**
 * @vitest-environment node
 * P8.16.20 — Purchase Order cleanup RPC + service foundation.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(HERE, '../supabase/stock_order_cleanup_rpc.sql'), 'utf8')
const SERVICE_SOURCE = readFileSync(
  join(HERE, '../src/services/stockOrderCleanupService.js'),
  'utf8',
)
const ORDER_SERVICE_SOURCE = readFileSync(
  join(HERE, '../src/services/stockOrderService.js'),
  'utf8',
)
const APP_SOURCE = readFileSync(join(HERE, '../src/App.jsx'), 'utf8')

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}))

import {
  StockOrderCleanupError,
  cleanupPurchaseOrderDocuments,
  mapPurchaseOrderCleanupResult,
  previewPurchaseOrderCleanup,
} from '../src/services/stockOrderCleanupService.js'

describe('cleanup_purchase_order_documents SQL contract (P8.16.20)', () => {
  const functionBody = SQL.slice(
    SQL.indexOf('create or replace function public.cleanup_purchase_order_documents'),
    SQL.indexOf('comment on function public.cleanup_purchase_order_documents'),
  )

  it('defines a SECURITY DEFINER RPC with locked search_path and authenticated grant', () => {
    expect(SQL).toContain('create or replace function public.cleanup_purchase_order_documents(')
    expect(SQL).toContain('p_workspace_id uuid')
    expect(SQL).toContain('p_preview_only boolean')
    expect(SQL).toContain('returns jsonb')
    expect(SQL).toMatch(/security definer/i)
    expect(SQL).toContain('set search_path = public')
    expect(SQL).toContain('grant execute on function public.cleanup_purchase_order_documents(')
    expect(SQL).toContain('to authenticated')
    expect(SQL).toContain('revoke all on function public.cleanup_purchase_order_documents(')
  })

  it('enforces auth and stock-manager authorization only', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('stock_order_cleanup_unauthenticated')
    expect(functionBody).toContain('stock_order_cleanup_workspace_required')
    expect(functionBody).toContain('stock_order_cleanup_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('stock_order_cleanup_forbidden')
    expect(functionBody).toContain('owner / general_manager / manager')
    expect(functionBody).toContain('host / staff')
  })

  it('scopes all reads and deletes to the supplied workspace_id', () => {
    expect(functionBody).toContain('where so.workspace_id = p_workspace_id')
    expect(functionBody).toContain('delete from public.stock_orders so')
    expect(functionBody).toContain('where so.workspace_id = p_workspace_id')
    expect(functionBody).not.toMatch(/delete from public\.stock_orders\s*;/)
  })

  it('previews status counts, item counts, and receive footprint warning', () => {
    expect(functionBody).toContain("'total_orders'")
    expect(functionBody).toContain("'draft_orders'")
    expect(functionBody).toContain("'sent_orders'")
    expect(functionBody).toContain("'received_orders'")
    expect(functionBody).toContain("'cancelled_orders'")
    expect(functionBody).toContain("'total_order_items'")
    expect(functionBody).toContain("'lines_with_receive'")
    expect(functionBody).toContain("'orders_with_receive'")
    expect(functionBody).toContain("'has_receive_footprint'")
    expect(functionBody).toContain('received_quantity')
    expect(functionBody).toContain('v_preview_only')
  })

  it('deletes only stock_orders documents and never mutates stock qty or movements', () => {
    expect(functionBody).toContain('delete from public.stock_orders')
    expect(functionBody).toMatch(/stock_order_items\.order_id ON DELETE CASCADE|Items cascade via/i)
    expect(functionBody).not.toMatch(/delete from public\.stock_order_items/i)
    expect(functionBody).not.toMatch(/update\s+public\.stock_items/i)
    expect(functionBody).not.toMatch(/delete\s+from\s+public\.stock_items/i)
    expect(functionBody).not.toMatch(/update\s+public\.stock_movements/i)
    expect(functionBody).not.toMatch(/delete\s+from\s+public\.stock_movements/i)
    expect(functionBody).not.toMatch(/insert\s+into\s+public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update\s+public\.suppliers/i)
    expect(functionBody).not.toMatch(/inventory_count|inventory_import|inventory_migration|bar_refill/i)
    expect(functionBody).toContain("'preserves_stock_movements', true")
    expect(functionBody).toContain("'preserves_stock_quantities', true")
  })

  it('runs cleanup only when preview_only is false inside one plpgsql body (transactional)', () => {
    expect(functionBody).toContain('if not v_preview_only then')
    expect(functionBody).toContain('get diagnostics v_deleted_orders = row_count')
    expect(functionBody).toContain("'deleted_orders'")
    expect(functionBody).toContain("'deleted_order_items'")
  })
})

describe('stockOrderCleanupService (P8.16.20)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('maps preview payload including receive warning', () => {
    const mapped = mapPurchaseOrderCleanupResult({
      workspace_id: 'ws-1',
      preview_only: true,
      total_orders: 11,
      draft_orders: 0,
      sent_orders: 0,
      received_orders: 2,
      cancelled_orders: 9,
      total_order_items: 14,
      lines_with_receive: 3,
      orders_with_receive: 2,
      has_receive_footprint: true,
      deleted_orders: 0,
      deleted_order_items: 0,
      preserves_stock_movements: true,
      preserves_stock_quantities: true,
    })

    expect(mapped).toMatchObject({
      workspaceId: 'ws-1',
      previewOnly: true,
      totalOrders: 11,
      receivedOrders: 2,
      cancelledOrders: 9,
      hasReceiveFootprint: true,
      deletedOrders: 0,
      preservesStockMovements: true,
      preservesStockQuantities: true,
    })
  })

  it('previewPurchaseOrderCleanup calls RPC with preview_only true', async () => {
    rpcMock.mockResolvedValue({
      data: {
        workspace_id: 'ws-1',
        preview_only: true,
        total_orders: 0,
        draft_orders: 0,
        sent_orders: 0,
        received_orders: 0,
        cancelled_orders: 0,
        total_order_items: 0,
        lines_with_receive: 0,
        orders_with_receive: 0,
        has_receive_footprint: false,
        deleted_orders: 0,
        deleted_order_items: 0,
        preserves_stock_movements: true,
        preserves_stock_quantities: true,
      },
      error: null,
    })

    const result = await previewPurchaseOrderCleanup('ws-1')

    expect(rpcMock).toHaveBeenCalledWith('cleanup_purchase_order_documents', {
      p_workspace_id: 'ws-1',
      p_preview_only: true,
    })
    expect(result.previewOnly).toBe(true)
    expect(result.totalOrders).toBe(0)
    expect(result.hasReceiveFootprint).toBe(false)
  })

  it('cleanupPurchaseOrderDocuments calls RPC with preview_only false', async () => {
    rpcMock.mockResolvedValue({
      data: {
        workspace_id: 'ws-1',
        preview_only: false,
        total_orders: 11,
        cancelled_orders: 9,
        received_orders: 2,
        draft_orders: 0,
        sent_orders: 0,
        total_order_items: 14,
        lines_with_receive: 3,
        orders_with_receive: 2,
        has_receive_footprint: true,
        deleted_orders: 11,
        deleted_order_items: 14,
        preserves_stock_movements: true,
        preserves_stock_quantities: true,
      },
      error: null,
    })

    const result = await cleanupPurchaseOrderDocuments('ws-1')

    expect(rpcMock).toHaveBeenCalledWith('cleanup_purchase_order_documents', {
      p_workspace_id: 'ws-1',
      p_preview_only: false,
    })
    expect(result.deletedOrders).toBe(11)
    expect(result.deletedOrderItems).toBe(14)
    expect(result.preservesStockMovements).toBe(true)
    expect(result.preservesStockQuantities).toBe(true)
  })

  it('rejects empty workspace and maps forbidden errors', async () => {
    await expect(previewPurchaseOrderCleanup('')).rejects.toMatchObject({
      code: 'WORKSPACE_REQUIRED',
    })

    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'stock_order_cleanup_forbidden' },
    })

    await expect(cleanupPurchaseOrderDocuments('ws-1')).rejects.toBeInstanceOf(StockOrderCleanupError)
    await expect(cleanupPurchaseOrderDocuments('ws-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('P8.16.20 regression: no UI / no order-service mutation', () => {
  it('does not wire cleanup into App UI yet', () => {
    expect(APP_SOURCE).not.toContain('previewPurchaseOrderCleanup')
    expect(APP_SOURCE).not.toContain('cleanupPurchaseOrderDocuments')
    expect(APP_SOURCE).not.toContain('stockOrderCleanupService')
  })

  it('leaves existing order create/send/receive/cancel service paths intact', () => {
    expect(ORDER_SERVICE_SOURCE).toContain('export async function createStockOrder')
    expect(ORDER_SERVICE_SOURCE).toContain('export async function updateStockOrderStatus')
    expect(ORDER_SERVICE_SOURCE).toContain('export async function receiveStockOrderPartial')
    expect(ORDER_SERVICE_SOURCE).toContain("type: 'receive'")
    expect(ORDER_SERVICE_SOURCE).not.toContain('cleanup_purchase_order_documents')
    expect(SERVICE_SOURCE).toContain('cleanup_purchase_order_documents')
  })
})

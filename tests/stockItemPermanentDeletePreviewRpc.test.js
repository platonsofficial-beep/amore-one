/**
 * @vitest-environment node
 * P8.16.23 — Permanent Stock item delete preview RPC + service foundation.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(
  join(HERE, '../supabase/stock_item_permanent_delete_preview_rpc.sql'),
  'utf8',
)
const SERVICE_SOURCE = readFileSync(
  join(HERE, '../src/services/stockItemPermanentDeletePreviewService.js'),
  'utf8',
)
const STOCK_ITEM_SERVICE_SOURCE = readFileSync(
  join(HERE, '../src/services/stockItemService.js'),
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
  previewStockItemPermanentDelete,
} from '../src/services/stockItemPermanentDeletePreviewService.js'

const FUNCTION_BODY = SQL.slice(
  SQL.indexOf('create or replace function public.preview_stock_item_permanent_delete'),
  SQL.indexOf('comment on function public.preview_stock_item_permanent_delete'),
)

describe('preview_stock_item_permanent_delete SQL contract (P8.16.23)', () => {
  it('defines a SECURITY DEFINER read-only RPC with authenticated grant', () => {
    expect(SQL).toContain('create or replace function public.preview_stock_item_permanent_delete(')
    expect(SQL).toContain('p_workspace_id uuid')
    expect(SQL).toContain('p_stock_item_id uuid')
    expect(SQL).toContain('returns jsonb')
    expect(SQL).toMatch(/security definer/i)
    expect(SQL).toContain('set search_path = public')
    expect(SQL).toContain('grant execute on function public.preview_stock_item_permanent_delete(')
    expect(SQL).toContain('to authenticated')
    expect(SQL).toContain('revoke all on function public.preview_stock_item_permanent_delete(')
  })

  it('enforces auth and stock-manager authorization only', () => {
    expect(FUNCTION_BODY).toContain('auth.uid()')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_preview_unauthenticated')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_preview_workspace_required')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_preview_item_required')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_preview_workspace_not_found')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_preview_item_not_found')
    expect(FUNCTION_BODY).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_preview_forbidden')
    expect(FUNCTION_BODY).toContain('owner / general_manager / manager')
    expect(FUNCTION_BODY).toContain('host / staff')
  })

  it('scopes the product lookup to workspace_id + stock_item_id', () => {
    expect(FUNCTION_BODY).toContain('s.id = p_stock_item_id')
    expect(FUNCTION_BODY).toContain('s.workspace_id = p_workspace_id')
    expect(FUNCTION_BODY).toContain('m.workspace_id = p_workspace_id')
    expect(FUNCTION_BODY).toContain('m.item_id = p_stock_item_id')
    expect(FUNCTION_BODY).toContain('o.workspace_id = p_workspace_id')
    expect(FUNCTION_BODY).toContain('oi.stock_item_id = p_stock_item_id')
  })

  it('aggregates movements by type', () => {
    expect(FUNCTION_BODY).toContain("'receive'")
    expect(FUNCTION_BODY).toContain("'usage'")
    expect(FUNCTION_BODY).toContain("'adjustment'")
    expect(FUNCTION_BODY).toContain("'stock_count'")
    expect(FUNCTION_BODY).toContain("'movements'")
    expect(FUNCTION_BODY).toContain('from public.stock_movements m')
  })

  it('aggregates order references by status', () => {
    expect(FUNCTION_BODY).toContain("'orders'")
    expect(FUNCTION_BODY).toContain("o.status = 'draft'")
    expect(FUNCTION_BODY).toContain("o.status = 'sent'")
    expect(FUNCTION_BODY).toContain("o.status = 'received'")
    expect(FUNCTION_BODY).toContain("o.status = 'cancelled'")
    expect(FUNCTION_BODY).toContain('from public.stock_order_items oi')
  })

  it('aggregates inventory count posted and open references', () => {
    expect(FUNCTION_BODY).toContain("'inventory_count'")
    expect(FUNCTION_BODY).toContain("'posted_references'")
    expect(FUNCTION_BODY).toContain("'open_references'")
    expect(FUNCTION_BODY).toContain("cs.status = 'posted'")
    expect(FUNCTION_BODY).toContain("'in_progress', 'paused', 'counting_complete'")
    expect(FUNCTION_BODY).toContain('from public.inventory_count_session_items csi')
  })

  it('aggregates import and migration references', () => {
    expect(FUNCTION_BODY).toContain("'import'")
    expect(FUNCTION_BODY).toContain("'matched_refs'")
    expect(FUNCTION_BODY).toContain("'applied_refs'")
    expect(FUNCTION_BODY).toContain('matched_stock_item_id')
    expect(FUNCTION_BODY).toContain('applied_stock_item_id')
    expect(FUNCTION_BODY).toContain("'migration'")
    expect(FUNCTION_BODY).toContain("'map_refs'")
    expect(FUNCTION_BODY).toContain('from public.inventory_stock_item_map m')
  })

  it('returns product and supplier fields without mutating data', () => {
    expect(FUNCTION_BODY).toContain("'product'")
    expect(FUNCTION_BODY).toContain("'id'")
    expect(FUNCTION_BODY).toContain("'name'")
    expect(FUNCTION_BODY).toContain("'active'")
    expect(FUNCTION_BODY).toContain("'current_quantity'")
    expect(FUNCTION_BODY).toContain("'unit'")
    expect(FUNCTION_BODY).toContain("'storage_location'")
    expect(FUNCTION_BODY).toContain("'supplier'")
    expect(FUNCTION_BODY).toContain("'supplier_id'")
    expect(FUNCTION_BODY).toContain("'supplier_name'")
    expect(FUNCTION_BODY).toContain("'preview_only', true")
    expect(FUNCTION_BODY).toContain("'deletes_records', false")
    expect(FUNCTION_BODY).toContain("'updates_records', false")
    expect(FUNCTION_BODY).toContain("'inserts_records', false")

    expect(FUNCTION_BODY).not.toMatch(/\bdelete\s+from\b/i)
    expect(FUNCTION_BODY).not.toMatch(/\bupdate\s+public\./i)
    expect(FUNCTION_BODY).not.toMatch(/\binsert\s+into\b/i)
  })
})

describe('stockItemPermanentDeletePreviewService (P8.16.23)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('calls preview RPC and returns the payload unchanged', async () => {
    const payload = {
      workspace_id: 'ws-1',
      preview_only: true,
      product: {
        id: 'item-1',
        name: 'KETEL ONE',
        active: false,
        current_quantity: 2,
        unit: 'btl',
        storage_location: 'Bar',
      },
      movements: {
        receive: 1,
        usage: 0,
        adjustment: 2,
        stock_count: 0,
        total: 3,
      },
      orders: {
        draft: 0,
        sent: 0,
        received: 1,
        cancelled: 0,
        total: 1,
      },
      inventory_count: {
        posted_references: 1,
        open_references: 0,
      },
      import: {
        matched_refs: 1,
        applied_refs: 0,
      },
      migration: {
        map_refs: 1,
      },
      supplier: {
        supplier_id: 9,
        supplier_name: 'Demo Supplier',
      },
      mutation: {
        deletes_records: false,
        updates_records: false,
        inserts_records: false,
      },
    }

    rpcMock.mockResolvedValueOnce({ data: payload, error: null })

    const result = await previewStockItemPermanentDelete('ws-1', 'item-1')

    expect(rpcMock).toHaveBeenCalledWith('preview_stock_item_permanent_delete', {
      p_workspace_id: 'ws-1',
      p_stock_item_id: 'item-1',
    })
    expect(result).toEqual(payload)
    expect(result.movements.total).toBe(3)
    expect(result.orders.received).toBe(1)
    expect(result.import.matched_refs).toBe(1)
    expect(result.migration.map_refs).toBe(1)
    expect(result.inventory_count.posted_references).toBe(1)
  })

  it('requires workspace and stock item ids before calling RPC', async () => {
    await expect(previewStockItemPermanentDelete('', 'item-1')).rejects.toMatchObject({
      name: 'StockItemPermanentDeletePreviewError',
      code: 'WORKSPACE_REQUIRED',
    })
    await expect(previewStockItemPermanentDelete('ws-1', '')).rejects.toMatchObject({
      name: 'StockItemPermanentDeletePreviewError',
      code: 'ITEM_REQUIRED',
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('maps forbidden and not-found RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'stock_item_permanent_delete_preview_forbidden' },
    })
    await expect(previewStockItemPermanentDelete('ws-1', 'item-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'stock_item_permanent_delete_preview_item_not_found' },
    })
    await expect(previewStockItemPermanentDelete('ws-1', 'item-1')).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND',
    })
  })

  it('does not introduce delete APIs or App wiring in this sprint', () => {
    expect(SERVICE_SOURCE).toContain('previewStockItemPermanentDelete')
    expect(SERVICE_SOURCE).not.toContain('export async function delete')
    expect(SERVICE_SOURCE).not.toMatch(/\.from\([^)]+\)\s*\.delete\(/)
    expect(SERVICE_SOURCE).not.toContain('cleanup_purchase_order_documents')
    expect(APP_SOURCE).not.toContain('previewStockItemPermanentDelete')
    expect(APP_SOURCE).not.toContain('preview_stock_item_permanent_delete')
    expect(STOCK_ITEM_SERVICE_SOURCE).toContain('updateStockItemActive')
  })
})

/**
 * @vitest-environment node
 * P8.16.24 — Single product permanent delete RPC + service.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(
  join(HERE, '../supabase/stock_item_permanent_delete_rpc.sql'),
  'utf8',
)
const PREVIEW_SQL = readFileSync(
  join(HERE, '../supabase/stock_item_permanent_delete_preview_rpc.sql'),
  'utf8',
)
const SERVICE_SOURCE = readFileSync(
  join(HERE, '../src/services/stockItemPermanentDeleteService.js'),
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

import { deleteStockItemPermanently } from '../src/services/stockItemPermanentDeleteService.js'

const FUNCTION_BODY = SQL.slice(
  SQL.indexOf('create or replace function public.delete_stock_item_permanently'),
  SQL.indexOf('comment on function public.delete_stock_item_permanently'),
)

describe('delete_stock_item_permanently SQL contract (P8.16.24)', () => {
  it('defines SECURITY DEFINER RPC with manager authorization', () => {
    expect(SQL).toContain('create or replace function public.delete_stock_item_permanently(')
    expect(SQL).toContain('p_workspace_id uuid')
    expect(SQL).toContain('p_stock_item_id uuid')
    expect(SQL).toContain('returns jsonb')
    expect(SQL).toMatch(/security definer/i)
    expect(SQL).toContain('set search_path = public')
    expect(SQL).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(SQL).toContain('stock_item_permanent_delete_forbidden')
    expect(SQL).toContain('owner / general_manager / manager')
    expect(SQL).toContain('grant execute on function public.delete_stock_item_permanently(')
    expect(SQL).toContain('to authenticated')
  })

  it('scopes lookup and delete to workspace + item with FOR UPDATE lock', () => {
    expect(FUNCTION_BODY).toContain('s.id = p_stock_item_id')
    expect(FUNCTION_BODY).toContain('s.workspace_id = p_workspace_id')
    expect(FUNCTION_BODY).toContain('for update')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_item_not_found')
    expect(FUNCTION_BODY).toContain('delete from public.stock_items s')
    expect(FUNCTION_BODY).toContain('where s.id = p_stock_item_id')
    expect(FUNCTION_BODY).toContain('and s.workspace_id = p_workspace_id')
  })

  it('blocks draft orders, sent orders, and open count sessions', () => {
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_blocked_draft_order')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_blocked_sent_order')
    expect(FUNCTION_BODY).toContain('stock_item_permanent_delete_blocked_open_count')
    expect(FUNCTION_BODY).toContain("o.status = 'draft'")
    expect(FUNCTION_BODY).toContain("o.status = 'sent'")
    expect(FUNCTION_BODY).toContain("'in_progress', 'paused', 'counting_complete'")
  })

  it('collects movement/order/count/import/migration stats before delete', () => {
    expect(FUNCTION_BODY).toContain('from public.stock_movements m')
    expect(FUNCTION_BODY).toContain("'receive'")
    expect(FUNCTION_BODY).toContain("'usage'")
    expect(FUNCTION_BODY).toContain("'adjustment'")
    expect(FUNCTION_BODY).toContain("'stock_count'")
    expect(FUNCTION_BODY).toContain("o.status = 'received'")
    expect(FUNCTION_BODY).toContain("o.status = 'cancelled'")
    expect(FUNCTION_BODY).toContain("'posted_refs'")
    expect(FUNCTION_BODY).toContain('matched_stock_item_id')
    expect(FUNCTION_BODY).toContain('applied_stock_item_id')
    expect(FUNCTION_BODY).toContain('from public.inventory_stock_item_map m')
    expect(FUNCTION_BODY).toContain("'supplier_id'")
    expect(FUNCTION_BODY).toContain("'supplier_name'")
  })

  it('never reads supplier_id via %rowtype (P8.16.26b)', () => {
    expect(FUNCTION_BODY).not.toContain('stock_items%rowtype')
    expect(FUNCTION_BODY).not.toContain('v_item.supplier_id')
    expect(FUNCTION_BODY).not.toMatch(/v_item\s+public\.stock_items%rowtype/i)
    expect(FUNCTION_BODY).toContain('information_schema.columns')
    expect(FUNCTION_BODY).toContain("column_name = 'supplier_id'")
    expect(FUNCTION_BODY).toContain('v_item_supplier_text')
    expect(FUNCTION_BODY).toContain('s.supplier')
    expect(FUNCTION_BODY).toContain('for update')
  })

  it('deletes only stock_items and relies on movement CASCADE; preserves snapshots', () => {
    expect(FUNCTION_BODY).toContain('delete from public.stock_items')
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.stock_movements/i)
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.stock_orders/i)
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.stock_order_items/i)
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.inventory_count/i)
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.inventory_import/i)
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.inventory_stock_item_map/i)
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.suppliers/i)
    expect(FUNCTION_BODY).not.toMatch(/delete\s+from\s+public\.inventory_items/i)
    expect(FUNCTION_BODY).not.toMatch(/bar_refill/i)
    expect(FUNCTION_BODY).toContain("'manual_movement_delete', false")
    expect(FUNCTION_BODY).toContain("'stock_movements', true")
    expect(FUNCTION_BODY).toContain("'preserved'")
    expect(FUNCTION_BODY).toContain("'purchase_orders'")
    expect(FUNCTION_BODY).toContain("'inventory_count_snapshots'")
    expect(FUNCTION_BODY).toContain("'import_rows'")
    expect(FUNCTION_BODY).toContain("'migration_rows'")
  })

  it('coexists with the P8.16.23 preview RPC and does not alter preview mutability', () => {
    expect(PREVIEW_SQL).toContain('preview_stock_item_permanent_delete')
    expect(PREVIEW_SQL).toContain("'deletes_records', false")
    expect(PREVIEW_SQL).not.toMatch(/\bdelete\s+from\b/i)
  })
})

describe('stockItemPermanentDeleteService (P8.16.24 / P8.16.26b)', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('calls delete RPC and returns payload unchanged on success', async () => {
    const payload = {
      success: true,
      workspace_id: 'ws-1',
      deleted: {
        product: { id: 'item-1', name: 'KETEL ONE' },
        movements: {
          receive: 1,
          usage: 0,
          adjustment: 2,
          stock_count: 0,
          total: 3,
        },
        stock_items_rows: 1,
      },
      preserved: {
        purchase_orders: { received_line_refs: 1, cancelled_line_refs: 0 },
        inventory_count_snapshots: { posted_refs: 2, cancelled_refs: 0, open_refs: 0 },
        import_rows: { matched_refs: 1, applied_refs: 0 },
        migration_rows: { map_refs: 1 },
        supplier: { supplier_id: 9, supplier_name: 'Demo Supplier' },
      },
      cascade: {
        stock_movements: true,
        manual_movement_delete: false,
      },
    }

    rpcMock.mockResolvedValueOnce({ data: payload, error: null })

    const result = await deleteStockItemPermanently('ws-1', 'item-1')

    expect(rpcMock).toHaveBeenCalledWith('delete_stock_item_permanently', {
      p_workspace_id: 'ws-1',
      p_stock_item_id: 'item-1',
    })
    expect(result).toEqual(payload)
    expect(result.deleted.movements.total).toBe(3)
    expect(result.preserved.import_rows.matched_refs).toBe(1)
    expect(result.preserved.migration_rows.map_refs).toBe(1)
    expect(result.preserved.inventory_count_snapshots.posted_refs).toBe(2)
    expect(result.preserved.purchase_orders.received_line_refs).toBe(1)
    expect(result.cascade.stock_movements).toBe(true)
  })

  it('accepts install WITH supplier_id and WITH legacy/null supplier payloads', async () => {
    const withFk = {
      success: true,
      workspace_id: 'ws-1',
      deleted: {
        product: { id: 'item-1', name: 'KETEL ONE', active: false, current_quantity: 2, unit: 'btl', storage_location: 'Bar' },
        movements: { receive: 1, usage: 0, adjustment: 0, stock_count: 0, total: 1 },
        stock_items_rows: 1,
      },
      preserved: {
        purchase_orders: { received_line_refs: 0, cancelled_line_refs: 0 },
        inventory_count_snapshots: { posted_refs: 0, cancelled_refs: 0, open_refs: 0 },
        import_rows: { matched_refs: 0, applied_refs: 0 },
        migration_rows: { map_refs: 0 },
        supplier: { supplier_id: 42, supplier_name: 'Malakakos' },
      },
      cascade: { stock_movements: true, manual_movement_delete: false },
    }
    rpcMock.mockResolvedValueOnce({ data: withFk, error: null })
    await expect(deleteStockItemPermanently('ws-1', 'item-1')).resolves.toEqual(withFk)

    const withoutFk = {
      ...withFk,
      deleted: {
        ...withFk.deleted,
        product: { ...withFk.deleted.product, id: 'item-2', name: 'LIME' },
      },
      preserved: {
        ...withFk.preserved,
        supplier: { supplier_id: null, supplier_name: null },
      },
    }
    rpcMock.mockResolvedValueOnce({ data: withoutFk, error: null })
    await expect(deleteStockItemPermanently('ws-1', 'item-2')).resolves.toMatchObject({
      success: true,
      preserved: { supplier: { supplier_id: null, supplier_name: null } },
      cascade: { stock_movements: true },
    })

    const legacyText = {
      ...withFk,
      deleted: {
        ...withFk.deleted,
        product: { ...withFk.deleted.product, id: 'item-3', name: 'MIONENTO' },
        movements: { receive: 2, usage: 1, adjustment: 0, stock_count: 0, total: 3 },
      },
      preserved: {
        ...withFk.preserved,
        supplier: { supplier_id: null, supplier_name: 'Legacy Text Supplier' },
      },
    }
    rpcMock.mockResolvedValueOnce({ data: legacyText, error: null })
    const legacyResult = await deleteStockItemPermanently('ws-1', 'item-3')
    expect(legacyResult.preserved.supplier).toEqual({
      supplier_id: null,
      supplier_name: 'Legacy Text Supplier',
    })
    expect(legacyResult.deleted.movements.total).toBe(3)
  })

  it('maps missing product and authorization errors', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'stock_item_permanent_delete_item_not_found' },
    })
    await expect(deleteStockItemPermanently('ws-1', 'missing')).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND',
    })

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'stock_item_permanent_delete_forbidden' },
    })
    await expect(deleteStockItemPermanently('ws-1', 'item-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('maps blocked draft, sent, and open-count errors', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'stock_item_permanent_delete_blocked_draft_order' },
    })
    await expect(deleteStockItemPermanently('ws-1', 'item-1')).rejects.toMatchObject({
      code: 'BLOCKED_DRAFT_ORDER',
    })

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'stock_item_permanent_delete_blocked_sent_order' },
    })
    await expect(deleteStockItemPermanently('ws-1', 'item-1')).rejects.toMatchObject({
      code: 'BLOCKED_SENT_ORDER',
    })

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'stock_item_permanent_delete_blocked_open_count' },
    })
    await expect(deleteStockItemPermanently('ws-1', 'item-1')).rejects.toMatchObject({
      code: 'BLOCKED_OPEN_COUNT',
    })
  })

  it('requires ids and does not wire App or alter deactivate CRUD', async () => {
    await expect(deleteStockItemPermanently('', 'item-1')).rejects.toMatchObject({
      code: 'WORKSPACE_REQUIRED',
    })
    await expect(deleteStockItemPermanently('ws-1', '')).rejects.toMatchObject({
      code: 'ITEM_REQUIRED',
    })
    expect(rpcMock).not.toHaveBeenCalled()

    expect(SERVICE_SOURCE).toContain('deleteStockItemPermanently')
    expect(SERVICE_SOURCE).not.toContain('signInWithPassword')
    expect(APP_SOURCE).not.toContain('deleteStockItemPermanently')
    expect(APP_SOURCE).not.toContain('delete_stock_item_permanently')
    expect(STOCK_ITEM_SERVICE_SOURCE).toContain('updateStockItemActive')
  })
})

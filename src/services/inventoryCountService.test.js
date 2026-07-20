import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}))

import {
  getInventoryCountSessionItems,
  mapInventoryCountSessionItemRow,
  updateInventoryCountItem,
} from './inventoryCountService'

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: undefined,
  }

  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return query
}

describe('mapInventoryCountSessionItemRow', () => {
  it('maps session item columns to the workspace read model', () => {
    const mapped = mapInventoryCountSessionItemRow({
      id: 'line-1',
      session_id: 'session-1',
      workspace_id: 'workspace-1',
      item_id: 'item-1',
      item_name: 'Coca-Cola',
      category: 'Beverage',
      item_type: 'Soft Drink',
      unit: 'case',
      storage_location: 'Main Storage',
      expected_snapshot: '12.500',
      counted_quantity: null,
      line_status: 'pending',
      note: 'check fridge',
    })

    expect(mapped).toEqual({
      id: 'line-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      itemId: 'item-1',
      itemName: 'Coca-Cola',
      category: 'Beverage',
      itemType: 'Soft Drink',
      unit: 'case',
      storageLocation: 'Main Storage',
      expectedSnapshot: 12.5,
      countedQuantity: null,
      lineStatus: 'pending',
      note: 'check fridge',
    })
  })

  it('returns null for incomplete rows', () => {
    expect(mapInventoryCountSessionItemRow(null)).toBeNull()
    expect(mapInventoryCountSessionItemRow({ id: 'line-1' })).toBeNull()
  })
})

describe('getInventoryCountSessionItems', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('queries session items for workspace and session with display order', async () => {
    const query = createQuery({
      data: [
        {
          id: 'line-1',
          session_id: 'session-1',
          workspace_id: 'workspace-1',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          category: 'Beverage',
          item_type: 'Soft Drink',
          unit: 'case',
          storage_location: 'Main Storage',
          expected_snapshot: 10,
          counted_quantity: 8,
          line_status: 'counted',
          note: '',
        },
      ],
      error: null,
    })
    fromMock.mockReturnValue(query)

    const items = await getInventoryCountSessionItems({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    expect(fromMock).toHaveBeenCalledWith('inventory_count_session_items')
    expect(query.select).toHaveBeenCalled()
    expect(query.eq).toHaveBeenCalledWith('workspace_id', 'workspace-1')
    expect(query.eq).toHaveBeenCalledWith('session_id', 'session-1')
    expect(query.order).toHaveBeenCalledWith('storage_location', { ascending: true })
    expect(query.order).toHaveBeenCalledWith('item_name', { ascending: true })
    expect(items).toHaveLength(1)
    expect(items[0].itemName).toBe('Coca-Cola')
    expect(items[0].expectedSnapshot).toBe(10)
    expect(items[0].countedQuantity).toBe(8)
    expect(items[0].lineStatus).toBe('counted')
  })

  it('returns an empty list when the session has no items', async () => {
    const query = createQuery({ data: [], error: null })
    fromMock.mockReturnValue(query)

    const items = await getInventoryCountSessionItems({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    expect(items).toEqual([])
  })

  it('surfaces query failures', async () => {
    const query = createQuery({
      data: null,
      error: { message: 'network down' },
    })
    fromMock.mockReturnValue(query)

    await expect(
      getInventoryCountSessionItems({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('network down')
  })

  it('requires workspace and session ids', async () => {
    await expect(getInventoryCountSessionItems({ sessionId: 'session-1' }))
      .rejects.toThrow('Workspace is required.')
    await expect(getInventoryCountSessionItems({ workspaceId: 'workspace-1' }))
      .rejects.toThrow('Session is required.')
  })
})

describe('updateInventoryCountItem', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('calls the update RPC with session item id and quantity only', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: 'line-1',
        session_id: 'session-1',
        workspace_id: 'workspace-1',
        item_id: 'item-1',
        counted_quantity: 8.5,
        counted_at: '2026-07-20T12:00:00.000Z',
        line_status: 'counted',
        updated_at: '2026-07-20T12:00:00.000Z',
      }],
      error: null,
    })

    const saved = await updateInventoryCountItem({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      sessionItemId: 'line-1',
      countedQuantity: 8.5,
    })

    expect(fromMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledWith('update_inventory_count_session_item', {
      p_workspace_id: 'workspace-1',
      p_session_id: 'session-1',
      p_session_item_id: 'line-1',
      p_counted_quantity: 8.5,
    })
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('counted_at')
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('line_status')
    expect(saved.id).toBe('line-1')
    expect(saved.countedQuantity).toBe(8.5)
    expect(saved.lineStatus).toBe('counted')
  })

  it('clears counted quantity with null and accepts zero', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        id: 'line-1',
        session_id: 'session-1',
        workspace_id: 'workspace-1',
        item_id: 'item-1',
        counted_quantity: null,
        counted_at: null,
        line_status: 'pending',
        updated_at: '2026-07-20T12:00:00.000Z',
      }],
      error: null,
    })

    const cleared = await updateInventoryCountItem({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      sessionItemId: 'line-1',
      countedQuantity: null,
    })

    expect(rpcMock).toHaveBeenCalledWith('update_inventory_count_session_item', {
      p_workspace_id: 'workspace-1',
      p_session_id: 'session-1',
      p_session_item_id: 'line-1',
      p_counted_quantity: null,
    })
    expect(cleared.countedQuantity).toBeNull()
    expect(cleared.lineStatus).toBe('pending')

    rpcMock.mockResolvedValueOnce({
      data: [{
        id: 'line-1',
        session_id: 'session-1',
        workspace_id: 'workspace-1',
        item_id: 'item-1',
        counted_quantity: 0,
        counted_at: '2026-07-20T12:01:00.000Z',
        line_status: 'counted',
        updated_at: '2026-07-20T12:01:00.000Z',
      }],
      error: null,
    })

    const zeroed = await updateInventoryCountItem({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      sessionItemId: 'line-1',
      countedQuantity: 0,
    })

    expect(rpcMock).toHaveBeenLastCalledWith('update_inventory_count_session_item', {
      p_workspace_id: 'workspace-1',
      p_session_id: 'session-1',
      p_session_item_id: 'line-1',
      p_counted_quantity: 0,
    })
    expect(zeroed.countedQuantity).toBe(0)
    expect(zeroed.lineStatus).toBe('counted')
  })

  it('rejects negative quantities before calling the RPC', async () => {
    await expect(
      updateInventoryCountItem({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        sessionItemId: 'line-1',
        countedQuantity: -1,
      }),
    ).rejects.toThrow('Counted quantity must be a valid non-negative number.')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('maps lifecycle and auth RPC failures', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_item_session_not_in_progress' },
    })

    await expect(
      updateInventoryCountItem({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        sessionItemId: 'line-1',
        countedQuantity: 3,
      }),
    ).rejects.toThrow('Inventory count session must be in progress to update counted quantities.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_item_forbidden' },
    })

    await expect(
      updateInventoryCountItem({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        sessionItemId: 'line-1',
        countedQuantity: 3,
      }),
    ).rejects.toThrow('You do not have permission to manage inventory counts for this workspace.')
  })
})

describe('update_inventory_count_session_item SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_update_session_item_rpc.sql'),
    'utf8',
  )

  it('defines a SECURITY DEFINER RPC with restricted search_path and authenticated grant', () => {
    expect(sql).toContain('create or replace function public.update_inventory_count_session_item(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('p_session_item_id uuid')
    expect(sql).toContain('p_counted_quantity numeric')
    expect(sql).toMatch(/security definer/i)
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('grant execute on function public.update_inventory_count_session_item(')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('revoke all on function public.update_inventory_count_session_item(')
  })

  it('enforces auth, manager authorization, lifecycle lock, and session-item identity', () => {
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_count_item_unauthenticated')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_count_item_forbidden')
    expect(sql).toContain('for update')
    expect(sql).toContain("v_session.status is distinct from 'in_progress'")
    expect(sql).toContain('inventory_count_item_session_not_in_progress')
    expect(sql).toContain('inventory_count_item_session_not_found')
    expect(sql).toContain('inventory_count_item_workspace_mismatch')
    expect(sql).toContain('inventory_count_item_not_found')
    expect(sql).toContain('inventory_count_item_session_mismatch')
    expect(sql).toContain('where i.id = p_session_item_id')
    expect(sql).not.toMatch(/where i\.item_id = p_session_item_id/)
  })

  it('lets the database own counted_at and line_status without client-supplied values', () => {
    const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)
    expect(sql).toContain('inventory_count_item_invalid_quantity')
    expect(sql).toContain("line_status = 'counted'")
    expect(sql).toContain("line_status = 'pending'")
    expect(sql).toContain('counted_at = v_now')
    expect(sql).toContain('counted_at = null')
    expect(sql).toContain('updated_at = v_now')
    expect(sql).not.toMatch(/p_counted_at|p_line_status/)
    expect(functionBody).not.toMatch(/from public\.stock_items|update public\.stock_items|from public\.stock_movements|insert into public\.stock_movements/i)
  })
})

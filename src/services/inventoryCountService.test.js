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
  completeInventoryCountLocation,
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

describe('completeInventoryCountLocation', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('calls the complete-location RPC with session location id', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        session_id: 'session-1',
        completed_location_id: 'loc-1',
        next_location_id: 'loc-2',
        session_status: 'in_progress',
        all_locations_completed: false,
      }],
      error: null,
    })

    const result = await completeInventoryCountLocation({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      locationId: 'loc-1',
    })

    expect(fromMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledWith('complete_inventory_count_location', {
      p_workspace_id: 'workspace-1',
      p_session_id: 'session-1',
      p_location_id: 'loc-1',
    })
    expect(result).toEqual({
      sessionId: 'session-1',
      completedLocationId: 'loc-1',
      nextLocationId: 'loc-2',
      sessionStatus: 'in_progress',
      allLocationsCompleted: false,
    })
  })

  it('maps final-location completion to counting_complete', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        session_id: 'session-1',
        completed_location_id: 'loc-3',
        next_location_id: null,
        session_status: 'counting_complete',
        all_locations_completed: true,
      }],
      error: null,
    })

    const result = await completeInventoryCountLocation({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      locationId: 'loc-3',
    })

    expect(result.nextLocationId).toBeNull()
    expect(result.sessionStatus).toBe('counting_complete')
    expect(result.allLocationsCompleted).toBe(true)
  })

  it('maps pending-items and lifecycle RPC failures', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_location_items_pending' },
    })

    await expect(
      completeInventoryCountLocation({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        locationId: 'loc-1',
      }),
    ).rejects.toThrow('Count or skip all items in this location before completing it.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_location_session_not_in_progress' },
    })

    await expect(
      completeInventoryCountLocation({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        locationId: 'loc-1',
      }),
    ).rejects.toThrow('Inventory count session must be in progress to complete a location.')
  })
})

describe('complete_inventory_count_location SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_complete_location_rpc.sql'),
    'utf8',
  )

  it('defines a SECURITY DEFINER RPC with auth, manager checks, and authenticated grant', () => {
    expect(sql).toContain('create or replace function public.complete_inventory_count_location(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('p_location_id uuid')
    expect(sql).toMatch(/security definer/i)
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_count_location_unauthenticated')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_count_location_forbidden')
    expect(sql).toContain('grant execute on function public.complete_inventory_count_location(')
    expect(sql).toContain('to authenticated')
  })

  it('enforces session lifecycle, current location, and no pending items', () => {
    expect(sql).toContain('for update')
    expect(sql).toContain("v_session.status is distinct from 'in_progress'")
    expect(sql).toContain('inventory_count_location_session_not_in_progress')
    expect(sql).toContain("v_location.status is distinct from 'current'")
    expect(sql).toContain('inventory_count_location_not_current')
    expect(sql).toContain('inventory_count_location_items_pending')
    expect(sql).toContain("and i.line_status not in ('counted', 'skipped')")
    expect(sql).toContain("set status = 'completed'")
    expect(sql).toContain("set status = 'current'")
    expect(sql).toContain("status = 'counting_complete'")
    expect(sql).toContain('all_locations_completed')
  })

  it('does not mutate stock tables', () => {
    const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)
    expect(functionBody).not.toMatch(/from public\.stock_items|update public\.stock_items|from public\.stock_movements|insert into public\.stock_movements/i)
  })
})

describe('create_inventory_count_session location bootstrap SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_create_session_rpc.sql'),
    'utf8',
  )
  const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)

  it('inserts the first input location as current and remaining as not_started', () => {
    expect(functionBody).toContain('unnest(p_locations) with ordinality')
    expect(functionBody).toContain('(ordinality - 1)::integer')
    expect(functionBody).toContain("when ordinality = 1 then 'current'")
    expect(functionBody).toContain("else 'not_started'")
    expect(functionBody).not.toMatch(
      /insert into public\.inventory_count_session_locations[\s\S]*'not_started'\s*from unnest\(p_locations\)/,
    )
  })

  it('keeps duplicate-location validation and atomic session+location insert', () => {
    expect(functionBody).toContain('inventory_count_session_duplicate_locations')
    expect(functionBody).toContain('inventory_count_session_locations_required')
    expect(functionBody).toContain('insert into public.inventory_count_sessions')
    expect(functionBody).toContain('insert into public.inventory_count_session_locations')
    expect(functionBody).not.toMatch(/update public\.inventory_count_session_locations/)
  })

  it('does not add a frontend lifecycle write path in the service', () => {
    const serviceSource = readFileSync(
      resolve(process.cwd(), 'src/services/inventoryCountService.js'),
      'utf8',
    )
    expect(serviceSource).toContain('create_inventory_count_session')
    expect(serviceSource).toContain('complete_inventory_count_location')
    expect(serviceSource).not.toMatch(
      /\.from\(\s*['"]inventory_count_session_locations['"]\s*\)[\s\S]*\.update\(/,
    )
  })
})

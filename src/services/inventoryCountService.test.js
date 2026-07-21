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
  previewInventoryCountFinish,
  setInventoryCountSessionPauseState,
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

describe('setInventoryCountSessionPauseState', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('calls the pause RPC with mapped parameters and maps the pause response', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: 'session-1',
        workspace_id: 'workspace-1',
        status: 'paused',
        paused_at: '2026-07-20T15:00:00.000Z',
        updated_at: '2026-07-20T15:00:00.000Z',
      }],
      error: null,
    })

    const result = await setInventoryCountSessionPauseState({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      pause: true,
    })

    expect(fromMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledWith('set_inventory_count_session_pause_state', {
      p_workspace_id: 'workspace-1',
      p_session_id: 'session-1',
      p_pause: true,
    })
    expect(result).toEqual({
      id: 'session-1',
      workspaceId: 'workspace-1',
      status: 'paused',
      pausedAt: '2026-07-20T15:00:00.000Z',
      updatedAt: '2026-07-20T15:00:00.000Z',
    })
  })

  it('maps the resume response and clears pausedAt', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: 'session-1',
        workspace_id: 'workspace-1',
        status: 'in_progress',
        paused_at: null,
        updated_at: '2026-07-20T15:05:00.000Z',
      }],
      error: null,
    })

    const result = await setInventoryCountSessionPauseState({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      pause: false,
    })

    expect(rpcMock).toHaveBeenCalledWith('set_inventory_count_session_pause_state', {
      p_workspace_id: 'workspace-1',
      p_session_id: 'session-1',
      p_pause: false,
    })
    expect(result).toEqual({
      id: 'session-1',
      workspaceId: 'workspace-1',
      status: 'in_progress',
      pausedAt: null,
      updatedAt: '2026-07-20T15:05:00.000Z',
    })
  })

  it('rejects empty or invalid pause responses', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })

    await expect(
      setInventoryCountSessionPauseState({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        pause: true,
      }),
    ).rejects.toThrow('Pause state response was empty or invalid.')

    rpcMock.mockResolvedValueOnce({
      data: [{ id: 'session-1', workspace_id: 'workspace-1' }],
      error: null,
    })

    await expect(
      setInventoryCountSessionPauseState({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        pause: true,
      }),
    ).rejects.toThrow('Pause state response was empty or invalid.')
  })

  it('normalizes known pause/resume RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_pause_cannot_pause' },
    })

    await expect(
      setInventoryCountSessionPauseState({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        pause: true,
      }),
    ).rejects.toThrow('Inventory count session must be in progress to pause.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_pause_cannot_resume' },
    })

    await expect(
      setInventoryCountSessionPauseState({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        pause: false,
      }),
    ).rejects.toThrow('Inventory count session must be paused to resume.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_pause_forbidden' },
    })

    await expect(
      setInventoryCountSessionPauseState({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        pause: true,
      }),
    ).rejects.toThrow('You do not have permission to manage inventory counts for this workspace.')
  })

  it('does not write pause state through direct table updates', async () => {
    const serviceSource = readFileSync(
      resolve(process.cwd(), 'src/services/inventoryCountService.js'),
      'utf8',
    )
    expect(serviceSource).toContain('set_inventory_count_session_pause_state')
    expect(serviceSource).toContain('setInventoryCountSessionPauseState')
    expect(serviceSource).not.toMatch(
      /\.from\(\s*['"]inventory_count_sessions['"]\s*\)[\s\S]*\.update\(/,
    )
  })
})

describe('set_inventory_count_session_pause_state SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_set_pause_state_rpc.sql'),
    'utf8',
  )
  const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)

  it('defines a SECURITY DEFINER RPC with restricted search_path and authenticated grant', () => {
    expect(sql).toContain('create or replace function public.set_inventory_count_session_pause_state(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('p_pause boolean')
    expect(sql).toMatch(/security definer/i)
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_count_pause_unauthenticated')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_count_pause_forbidden')
    expect(sql).toContain('grant execute on function public.set_inventory_count_session_pause_state(')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('revoke all on function public.set_inventory_count_session_pause_state(')
  })

  it('locks the session, rejects workspace mismatch, and owns paused_at', () => {
    expect(functionBody).toContain('for update')
    expect(functionBody).toContain('s.workspace_id = p_workspace_id')
    expect(functionBody).toContain('inventory_count_pause_workspace_mismatch')
    expect(functionBody).toContain('inventory_count_pause_session_not_found')
    expect(functionBody).toContain('paused_at = v_now')
    expect(functionBody).toContain('paused_at = null')
    expect(functionBody).not.toMatch(/p_paused_at/)
  })

  it('enforces pause and resume transitions and rejects invalid statuses', () => {
    expect(functionBody).toContain("v_session.status is distinct from 'in_progress'")
    expect(functionBody).toContain('inventory_count_pause_cannot_pause')
    expect(functionBody).toContain("status = 'paused'")
    expect(functionBody).toContain("v_session.status is distinct from 'paused'")
    expect(functionBody).toContain('inventory_count_pause_cannot_resume')
    expect(functionBody).toContain("status = 'in_progress'")
  })

  it('preserves locations and items and does not mutate stock', () => {
    expect(functionBody).not.toMatch(/inventory_count_session_locations/i)
    expect(functionBody).not.toMatch(/inventory_count_session_items/i)
    expect(functionBody).not.toMatch(/from public\.stock_items|update public\.stock_items|from public\.stock_movements|insert into public\.stock_movements/i)
  })
})

describe('previewInventoryCountFinish', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  function previewPayload(overrides = {}) {
    return {
      session_id: 'session-1',
      workspace_id: 'workspace-1',
      session_status: 'counting_complete',
      snapshot_at: '2026-07-21T10:00:00.000Z',
      preview_generated_at: '2026-07-21T12:00:00.000Z',
      can_post: true,
      summary: {
        total_lines: 1,
        counted_lines: 1,
        skipped_lines: 0,
        changed_items: 1,
        unchanged_items: 0,
        positive_variances: 0,
        negative_variances: 1,
        zero_variances: 0,
        blocking_issue_count: 0,
        can_post: true,
      },
      lines: [],
      skipped: [],
      blocking_issues: [],
      ...overrides,
    }
  }

  it('maps Strategy 4 no-intervening-movement scenario without JS calculation', async () => {
    rpcMock.mockResolvedValue({
      data: previewPayload({
        summary: {
          total_lines: 1,
          counted_lines: 1,
          skipped_lines: 0,
          changed_items: 1,
          unchanged_items: 0,
          positive_variances: 0,
          negative_variances: 1,
          zero_variances: 0,
          blocking_issue_count: 0,
          can_post: true,
        },
        lines: [{
          session_item_id: 'line-1',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: 0,
          expected_at_count: 10,
          counted_quantity: 8,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: -2,
          current_live_quantity: 10,
          resulting_quantity_after_post: 8,
        }],
      }),
      error: null,
    })

    const result = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    expect(fromMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledWith('preview_inventory_count_finish', {
      p_workspace_id: 'workspace-1',
      p_session_id: 'session-1',
    })
    expect(result.snapshotAt).toBe('2026-07-21T10:00:00.000Z')
    expect(result.lines[0]).toMatchObject({
      expectedSnapshot: 10,
      movementDeltaSinceSnapshot: 0,
      expectedAtCount: 10,
      countedQuantity: 8,
      varianceQuantity: -2,
      currentLiveQuantity: 10,
      resultingQuantityAfterPost: 8,
    })
    expect(result.canPost).toBe(true)
  })

  it('maps signed positive/negative adjustments, mixed and zero-movement lines', async () => {
    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        lines: [{
          session_item_id: 'line-adj-pos',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: 3,
          expected_at_count: 13,
          counted_quantity: 12,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: -1,
          current_live_quantity: 13,
          resulting_quantity_after_post: 12,
        }],
      }),
      error: null,
    })

    const positiveAdj = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(positiveAdj.lines[0]).toMatchObject({
      movementDeltaSinceSnapshot: 3,
      expectedAtCount: 13,
      varianceQuantity: -1,
      resultingQuantityAfterPost: 12,
    })

    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        lines: [{
          session_item_id: 'line-adj-neg',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: -4,
          expected_at_count: 6,
          counted_quantity: 6,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: 0,
          current_live_quantity: 6,
          resulting_quantity_after_post: 6,
        }],
      }),
      error: null,
    })

    const negativeAdj = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(negativeAdj.lines[0]).toMatchObject({
      movementDeltaSinceSnapshot: -4,
      expectedAtCount: 6,
      varianceQuantity: 0,
      resultingQuantityAfterPost: 6,
    })

    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        lines: [{
          session_item_id: 'line-mixed',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: 1,
          expected_at_count: 11,
          counted_quantity: 9,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: -2,
          current_live_quantity: 11,
          resulting_quantity_after_post: 9,
        }],
      }),
      error: null,
    })

    const mixed = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(mixed.lines[0]).toMatchObject({
      movementDeltaSinceSnapshot: 1,
      expectedAtCount: 11,
      varianceQuantity: -2,
      resultingQuantityAfterPost: 9,
    })

    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        lines: [{
          session_item_id: 'line-zero-move',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: 0,
          expected_at_count: 10,
          counted_quantity: 0,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: -10,
          current_live_quantity: 10,
          resulting_quantity_after_post: 0,
        }],
      }),
      error: null,
    })

    const countedZero = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(countedZero.lines[0]).toMatchObject({
      countedQuantity: 0,
      movementDeltaSinceSnapshot: 0,
      varianceQuantity: -10,
      resultingQuantityAfterPost: 0,
    })
  })

  it('maps stock_count blocker responses without inventing reconciliation values', async () => {
    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        can_post: false,
        lines: [],
        blocking_issues: [{
          code: 'unsupported_stock_count_in_window',
      session_item_id: 'line-1',
      item_id: 'item-1',
      item_name: 'Coca-Cola',
      message: 'A stock_count movement exists between snapshot and counted_at. Absolute-set movements cannot be reconciled as deltas.',
    }],
        summary: {
          total_lines: 1,
          counted_lines: 0,
          skipped_lines: 0,
          changed_items: 0,
          unchanged_items: 0,
          positive_variances: 0,
          negative_variances: 0,
          zero_variances: 0,
          blocking_issue_count: 1,
          can_post: false,
        },
      }),
      error: null,
    })

    const blocked = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(blocked.canPost).toBe(false)
    expect(blocked.lines).toEqual([])
    expect(blocked.blockingIssues[0].code).toBe('unsupported_stock_count_in_window')
    expect(blocked.snapshotAt).toBe('2026-07-21T10:00:00.000Z')
  })

  it('maps sale-before-counting and receipt-before-counting scenarios', async () => {
    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        lines: [{
          session_item_id: 'line-sale',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: -2,
          expected_at_count: 8,
          counted_quantity: 8,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: 0,
          current_live_quantity: 8,
          resulting_quantity_after_post: 8,
        }],
        summary: {
          total_lines: 1,
          counted_lines: 1,
          skipped_lines: 0,
          changed_items: 0,
          unchanged_items: 1,
          positive_variances: 0,
          negative_variances: 0,
          zero_variances: 1,
          blocking_issue_count: 0,
          can_post: true,
        },
      }),
      error: null,
    })

    const sale = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(sale.lines[0]).toMatchObject({
      movementDeltaSinceSnapshot: -2,
      expectedAtCount: 8,
      varianceQuantity: 0,
      resultingQuantityAfterPost: 8,
    })

    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        lines: [{
          session_item_id: 'line-receipt',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: 5,
          expected_at_count: 15,
          counted_quantity: 14,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: -1,
          current_live_quantity: 15,
          resulting_quantity_after_post: 14,
        }],
        summary: {
          total_lines: 1,
          counted_lines: 1,
          skipped_lines: 0,
          changed_items: 1,
          unchanged_items: 0,
          positive_variances: 0,
          negative_variances: 1,
          zero_variances: 0,
          blocking_issue_count: 0,
          can_post: true,
        },
      }),
      error: null,
    })

    const receipt = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(receipt.lines[0]).toMatchObject({
      movementDeltaSinceSnapshot: 5,
      expectedAtCount: 15,
      varianceQuantity: -1,
      currentLiveQuantity: 15,
      resultingQuantityAfterPost: 14,
    })
  })

  it('maps movement-after-counting and skipped/blocking readiness', async () => {
    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        lines: [{
          session_item_id: 'line-after',
          item_id: 'item-1',
          item_name: 'Coca-Cola',
          storage_location: 'Main Storage',
          unit: 'case',
          expected_snapshot: 10,
          movement_delta_since_snapshot: 0,
          expected_at_count: 10,
          counted_quantity: 10,
          counted_at: '2026-07-21T11:00:00.000Z',
          variance_quantity: 0,
          current_live_quantity: 15,
          resulting_quantity_after_post: 15,
        }],
        summary: {
          total_lines: 1,
          counted_lines: 1,
          skipped_lines: 0,
          changed_items: 0,
          unchanged_items: 1,
          positive_variances: 0,
          negative_variances: 0,
          zero_variances: 1,
          blocking_issue_count: 0,
          can_post: true,
        },
      }),
      error: null,
    })

    const after = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(after.lines[0]).toMatchObject({
      expectedAtCount: 10,
      varianceQuantity: 0,
      currentLiveQuantity: 15,
      resultingQuantityAfterPost: 15,
    })

    rpcMock.mockResolvedValueOnce({
      data: previewPayload({
        can_post: false,
        lines: [],
        skipped: [{
          session_item_id: 'skip-1',
          item_id: 'item-2',
          item_name: 'Oat Milk',
          storage_location: 'Coffee Station',
          unit: 'litre',
          line_status: 'skipped',
          warning: 'Skipped lines are not posted and keep live quantity unchanged.',
        }],
        blocking_issues: [{
          code: 'skipped_lines_present',
          session_item_id: null,
          item_id: null,
          item_name: null,
          message: '1 skipped line(s) must be counted before posting. Skipped lines are not treated as zero.',
        }, {
          code: 'missing_counted_at',
          session_item_id: 'line-bad',
          item_id: 'item-3',
          item_name: 'Olive Oil',
          message: 'Counted line is missing counted_at and cannot be reconciled.',
        }, {
          code: 'missing_stock_item',
          session_item_id: 'line-orphan',
          item_id: null,
          item_name: 'Ghost Item',
          message: 'Counted line is missing a linked stock item and cannot be posted.',
        }],
        summary: {
          total_lines: 3,
          counted_lines: 0,
          skipped_lines: 1,
          changed_items: 0,
          unchanged_items: 0,
          positive_variances: 0,
          negative_variances: 0,
          zero_variances: 0,
          blocking_issue_count: 3,
          can_post: false,
        },
      }),
      error: null,
    })

    const blocked = await previewInventoryCountFinish({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    expect(blocked.canPost).toBe(false)
    expect(blocked.summary.canPost).toBe(false)
    expect(blocked.skipped).toHaveLength(1)
    expect(blocked.blockingIssues.map((issue) => issue.code)).toEqual([
      'skipped_lines_present',
      'missing_counted_at',
      'missing_stock_item',
    ])
  })

  it('rejects empty or invalid preview responses and performs no table reads', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })

    await expect(
      previewInventoryCountFinish({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('Finish count preview response was empty or invalid.')

    expect(fromMock).not.toHaveBeenCalled()
    const serviceSource = readFileSync(
      resolve(process.cwd(), 'src/services/inventoryCountService.js'),
      'utf8',
    )
    expect(serviceSource).toContain("const PREVIEW_FINISH_RPC = 'preview_inventory_count_finish'")
    expect(serviceSource).toContain('mapInventoryCountFinishPreviewResult')
    expect(serviceSource).not.toMatch(
      /previewInventoryCountFinish[\s\S]*expectedSnapshot\s*\+|previewInventoryCountFinish[\s\S]*countedQuantity\s*-/,
    )
  })

  it('normalizes known preview authorization and status errors', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_preview_forbidden' },
    })

    await expect(
      previewInventoryCountFinish({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('You do not have permission to manage inventory counts for this workspace.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_preview_session_not_complete' },
    })

    await expect(
      previewInventoryCountFinish({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('Inventory count session must be counting complete to preview finish.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_preview_workspace_mismatch' },
    })

    await expect(
      previewInventoryCountFinish({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('Inventory count session does not belong to this workspace.')

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'inventory_count_preview_snapshot_missing' },
    })

    await expect(
      previewInventoryCountFinish({
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('Inventory count snapshot was not found for this session.')
  })
})

describe('preview_inventory_count_finish SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_preview_finish_rpc.sql'),
    'utf8',
  )
  const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)

  it('defines a read-only SECURITY DEFINER RPC with auth and authenticated grant', () => {
    expect(sql).toContain('create or replace function public.preview_inventory_count_finish(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('returns jsonb')
    expect(sql).toMatch(/security definer/i)
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_count_preview_unauthenticated')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_count_preview_forbidden')
    expect(sql).toContain('grant execute on function public.preview_inventory_count_finish(')
    expect(sql).toContain('to authenticated')
  })

  it('is a thin wrapper that delegates Strategy 4 to the shared reconcile function', () => {
    expect(functionBody).toContain("v_session.status is distinct from 'counting_complete'")
    expect(functionBody).toContain('inventory_count_preview_session_not_complete')
    expect(functionBody).toContain('inventory_count_preview_snapshot_missing')
    expect(functionBody).toContain('public.reconcile_inventory_count_finish(p_workspace_id, p_session_id)')
    expect(functionBody).not.toContain('v_snapshot_at := v_session.snapshot_at')
    expect(functionBody).not.toContain('select min(i.created_at)')
    expect(functionBody).not.toContain('min(i.created_at)')
    expect(functionBody).not.toContain("when 'receive' then abs(m.quantity)")
    expect(functionBody).not.toContain("'expected_at_count', (i.expected_snapshot + coalesce(deltas.net_delta, 0))")
    expect(functionBody).not.toContain("'variance_quantity', (i.counted_quantity - (i.expected_snapshot + coalesce(deltas.net_delta, 0)))")
    expect(functionBody).not.toContain('resulting_quantity_after_post')
    expect(functionBody).not.toMatch(/\binsert\b/i)
    expect(functionBody).not.toMatch(/\bupdate\b/i)
    expect(functionBody).not.toMatch(/\bdelete\b/i)
    expect(functionBody).not.toMatch(/\bmerge\b/i)
  })
})

describe('reconcile_inventory_count_finish SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_reconcile_finish.sql'),
    'utf8',
  )
  const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)

  it('defines an internal read-only shared reconciliation function without client execute grant', () => {
    expect(sql).toContain('create or replace function public.reconcile_inventory_count_finish(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('returns jsonb')
    expect(sql).toMatch(/security invoker/i)
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.reconcile_inventory_count_finish(uuid, uuid) from authenticated',
    )
    expect(sql).toContain(
      'revoke all on function public.reconcile_inventory_count_finish(uuid, uuid) from anon',
    )
    expect(sql).not.toMatch(
      /grant execute on function public\.reconcile_inventory_count_finish\([^)]*\)\s+to authenticated/i,
    )
  })

  it('implements Strategy 4 using sessions.snapshot_at with no item-created_at fallback', () => {
    expect(functionBody).toContain('v_snapshot_at := v_session.snapshot_at')
    expect(functionBody).toContain('inventory_count_reconcile_snapshot_missing')
    expect(functionBody).not.toContain('select min(i.created_at)')
    expect(functionBody).not.toContain('min(i.created_at)')
    expect(functionBody).toContain('m.created_at > v_snapshot_at')
    expect(functionBody).toContain('m.created_at <= i.counted_at')
    expect(functionBody).toContain("when 'receive' then abs(m.quantity)")
    expect(functionBody).toContain("when 'usage' then -abs(m.quantity)")
    expect(functionBody).toContain("when 'adjustment' then m.quantity")
    expect(functionBody).toContain("m.type in ('receive', 'usage', 'adjustment')")
    expect(functionBody).toContain("m.type = 'stock_count'")
    expect(functionBody).toContain('unsupported_stock_count_in_window')
    expect(functionBody).toContain("'expected_at_count', (i.expected_snapshot + coalesce(deltas.net_delta, 0))")
    expect(functionBody).toContain("'variance_quantity', (i.counted_quantity - (i.expected_snapshot + coalesce(deltas.net_delta, 0)))")
    expect(functionBody).toContain('si.current_quantity')
    expect(functionBody).toContain('+ (i.counted_quantity - (i.expected_snapshot + coalesce(deltas.net_delta, 0)))')
    expect(functionBody).not.toContain("'resulting_quantity_after_post', i.counted_quantity")
    expect(functionBody).not.toContain('(i.counted_quantity - i.expected_snapshot)')
  })

  it('preserves blockers and remains write-free with no dynamic SQL', () => {
    expect(functionBody).toContain("i.line_status = 'skipped'")
    expect(functionBody).toContain('skipped_lines_present')
    expect(functionBody).toContain('pending_lines_present')
    expect(functionBody).toContain('missing_counted_at')
    expect(functionBody).toContain('missing_stock_item')
    expect(functionBody).toContain('can_post')
    expect(functionBody).not.toMatch(/\binsert\b/i)
    expect(functionBody).not.toMatch(/\bupdate\b/i)
    expect(functionBody).not.toMatch(/\bdelete\b/i)
    expect(functionBody).not.toMatch(/\bmerge\b/i)
    expect(functionBody).not.toMatch(/\bexecute\s+/i)
    expect(functionBody).not.toMatch(/format\s*\(\s*'[^']*(insert|update|delete)/i)
  })
})

describe('inventory_count_snapshot_at_hardening SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_snapshot_at_hardening.sql'),
    'utf8',
  )

  it('adds snapshot_at, backfills from item created_at, and revokes authenticated writes', () => {
    expect(sql).toContain('add column if not exists snapshot_at timestamptz')
    expect(sql).toContain('min(i.created_at) as min_created_at')
    expect(sql).toContain('and s.snapshot_at is null')
    expect(sql).toContain(
      'revoke insert, update, delete on table public.inventory_count_session_items from authenticated',
    )
    expect(sql).toContain(
      'grant select on table public.inventory_count_session_items to authenticated',
    )
    expect(sql).not.toMatch(/revoke\s+select\b/i)
  })

  it('defines freeze-field and snapshot_at immutability triggers', () => {
    expect(sql).toContain('protect_inventory_count_session_item_freeze_fields')
    expect(sql).toContain('inventory_count_session_items_protect_freeze_fields')
    expect(sql).toContain('before update on public.inventory_count_session_items')
    expect(sql).toContain('inventory_count_item_frozen_field')
    expect(sql).toContain('new.expected_snapshot is distinct from old.expected_snapshot')
    expect(sql).toContain('new.created_at is distinct from old.created_at')
    expect(sql).toContain('protect_inventory_count_session_snapshot_at')
    expect(sql).toContain('inventory_count_sessions_protect_snapshot_at')
    expect(sql).toContain('before update on public.inventory_count_sessions')
    expect(sql).toContain('inventory_count_session_snapshot_at_immutable')
    expect(sql).toContain('old.snapshot_at is not null')
    expect(sql).toContain('new.snapshot_at is distinct from old.snapshot_at')
  })
})

describe('build_inventory_count_snapshot SQL contract (P8.3.9c)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_build_snapshot_rpc.sql'),
    'utf8',
  )
  const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)

  it('uses one v_snapshot_created_at for item rows and session.snapshot_at', () => {
    expect(functionBody).toContain('v_snapshot_created_at timestamptz := now()')
    expect((functionBody.match(/v_snapshot_created_at\s+timestamptz\s*:=\s*now\(\)/g) || []).length).toBe(1)
    expect(functionBody).toContain('v_session.snapshot_at is not null')
    expect(functionBody).toContain('inventory_count_snapshot_already_exists')
    expect(functionBody).toContain('snapshot_at = v_snapshot_created_at')
    expect(functionBody).toContain('and s.snapshot_at is null')
  })
})

describe('post_inventory_count_finish SQL contract (P8.5.2 foundation)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_post_finish_rpc.sql'),
    'utf8',
  )
  const functionBody = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3)

  it('defines a SECURITY DEFINER RPC with search_path, auth, and authenticated grant', () => {
    expect(sql).toContain('create or replace function public.post_inventory_count_finish(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('returns jsonb')
    expect(sql).toMatch(/security definer/i)
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_count_post_unauthenticated')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_count_post_forbidden')
    expect(sql).toContain('grant execute on function public.post_inventory_count_finish(')
    expect(sql).toContain('to authenticated')
  })

  it('validates session state, snapshot, and can_post via shared reconciliation', () => {
    expect(functionBody).toContain('inventory_count_post_session_cancelled')
    expect(functionBody).toContain('inventory_count_post_already_posted')
    expect(functionBody).toContain("v_session.status is distinct from 'counting_complete'")
    expect(functionBody).toContain('inventory_count_post_session_not_complete')
    expect(functionBody).toContain('v_session.snapshot_at is null')
    expect(functionBody).toContain('inventory_count_post_snapshot_missing')
    expect(functionBody).toContain('public.reconcile_inventory_count_finish(p_workspace_id, p_session_id)')
    expect(functionBody).toContain("v_reconcile ->> 'can_post'")
    expect(functionBody).toContain('inventory_count_post_blocked')
    expect(functionBody).toContain("'posting_enabled', false")
    expect(functionBody).toContain('Posting engine foundation complete. Stock mutations not implemented.')
  })

  it('contains no writes, stock mutations, or movement creation', () => {
    expect(functionBody).not.toMatch(/\binsert\b/i)
    expect(functionBody).not.toMatch(/\bupdate\b/i)
    expect(functionBody).not.toMatch(/\bdelete\b/i)
    expect(functionBody).not.toMatch(/\bmerge\b/i)
    expect(functionBody).not.toMatch(/\bfor update\b/i)
    expect(functionBody).not.toContain('stock_movements')
    expect(functionBody).not.toContain('current_quantity')
    expect(functionBody).not.toContain('set status')
    expect(functionBody).not.toContain('posted_at =')
    expect(functionBody).not.toContain('posted_movement_id')
    expect(functionBody).toContain("v_session.status = 'posted'")
    expect(functionBody).not.toMatch(/\bexecute\s+/i)
  })
})

describe('inventory_count_posted_by_foundation SQL contract (P8.5.2a)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_posted_by_foundation.sql'),
    'utf8',
  )
  const postRpc = readFileSync(
    resolve(process.cwd(), 'supabase/inventory_count_post_finish_rpc.sql'),
    'utf8',
  )
  const workspaceSource = readFileSync(
    resolve(process.cwd(), 'src/components/stock/InventoryCountSessionWorkspace.jsx'),
    'utf8',
  )

  it('adds nullable posted_by uuid referencing auth.users with ON DELETE SET NULL', () => {
    expect(sql).toContain('alter table public.inventory_count_sessions')
    expect(sql).toContain('add column if not exists posted_by uuid')
    expect(sql).toContain('references auth.users(id) on delete set null')
    expect(sql).not.toMatch(/posted_by[^\n]*not null/i)
    expect(sql).not.toMatch(/posted_by[^\n]*default\s+auth\.uid\(\)/i)
    expect(sql).not.toMatch(/default\s+auth\.uid\(\)/i)
  })

  it('does not fabricate backfill or change stock / posting mutation surfaces', () => {
    const executableSql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')

    expect(executableSql).not.toMatch(/\bupdate\b/i)
    expect(executableSql).not.toMatch(/\binsert\b/i)
    expect(executableSql).not.toMatch(/\bbackfill\b/i)
    expect(executableSql).not.toContain('stock_items')
    expect(executableSql).not.toContain('stock_movements')
    expect(executableSql).not.toContain('create index')
    expect(postRpc).toContain("'posting_enabled', false")
    expect(postRpc).not.toMatch(/\binsert into\b/i)
    expect(postRpc).not.toMatch(/\bupdate\s+public\./i)
    expect(workspaceSource).toContain('inventory-count-finish-preview-confirm')
    expect(workspaceSource).toMatch(
      /inventory-count-finish-preview-confirm[\s\S]*?\bdisabled\b[\s\S]*?aria-disabled="true"/,
    )
  })
})

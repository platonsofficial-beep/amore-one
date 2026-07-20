import { beforeEach, describe, expect, it, vi } from 'vitest'

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
} from './inventoryCountService'

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
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

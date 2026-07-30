import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, rpcMock, updateStockItemQuantityMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  updateStockItemQuantityMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}))

vi.mock('./stockItemService', () => ({
  updateStockItemQuantity: (...args) => updateStockItemQuantityMock(...args),
  getStockItems: vi.fn(),
}))

import {
  __setSupportsLocationBalancesForTests,
  getSupportsLocationBalances,
  mapStockTransferRpcError,
  recordStockMutation,
  recordStockMutationLegacy,
  recordStockMutationLocationAware,
  transferStockBetweenLocations,
} from './stockMutationService'
import { recordStockMovement } from './stockMovementService'

function createInsertQuery(result) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
  }
  return query
}

function createSelectByIdQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => result),
  }
  return query
}

describe('stockMutationService — P8.29.7 dual-write foundation', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
    updateStockItemQuantityMock.mockReset()
    __setSupportsLocationBalancesForTests(false)
    updateStockItemQuantityMock.mockResolvedValue({ id: 'item-1', currentQuantity: 12 })
  })

  it('defaults supportsLocationBalances to false (legacy production path)', () => {
    expect(getSupportsLocationBalances()).toBe(false)
  })

  it('legacy path inserts movement and patches current_quantity; never calls RPCs', async () => {
    const insertQuery = createInsertQuery({
      data: {
        id: 'mov-1',
        workspace_id: 'ws-1',
        item_id: 'item-1',
        type: 'receive',
        quantity: 2,
        note: 'Restock',
        created_by: 'user-1',
        created_at: '2026-07-29T10:00:00Z',
      },
      error: null,
    })
    fromMock.mockReturnValue(insertQuery)

    const result = await recordStockMutation({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'receive',
      quantity: 2,
      note: 'Restock',
      createdBy: 'user-1',
      currentQuantity: 10,
    })

    expect(rpcMock).not.toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('stock_movements')
    expect(insertQuery.insert).toHaveBeenCalledWith([{
      workspace_id: 'ws-1',
      item_id: 'item-1',
      type: 'receive',
      quantity: 2,
      note: 'Restock',
      created_by: 'user-1',
    }])
    expect(updateStockItemQuantityMock).toHaveBeenCalledWith('item-1', 'ws-1', 12)
    expect(result).toEqual({
      id: 'mov-1',
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'receive',
      quantity: 2,
      note: 'Restock',
      createdBy: 'user-1',
      createdAt: '2026-07-29T10:00:00Z',
    })
  })

  it('routes Storage Receive through location RPC when workspaceStorageId is provided', async () => {
    expect(getSupportsLocationBalances()).toBe(false)

    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        movement_id: 'mov-storage-1',
        quantity_after: 6,
        quantity_version: 2,
        current_quantity: 6,
      },
      error: null,
    })

    const loadQuery = createSelectByIdQuery({
      data: {
        id: 'mov-storage-1',
        workspace_id: 'ws-1',
        item_id: 'item-1',
        type: 'receive',
        quantity: 2,
        note: 'Storage receive',
        created_by: 'user-1',
        created_at: '2026-07-30T10:00:00Z',
      },
      error: null,
    })
    fromMock.mockReturnValue(loadQuery)

    await recordStockMutation({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'receive',
      quantity: 2,
      note: 'Storage receive',
      createdBy: 'user-1',
      currentQuantity: 4,
      workspaceStorageId: 'stor-main',
      expectedQuantityVersion: 1,
    })

    expect(rpcMock).toHaveBeenCalledWith('record_location_receive', expect.objectContaining({
      p_workspace_id: 'ws-1',
      p_stock_item_id: 'item-1',
      p_workspace_storage_id: 'stor-main',
      p_quantity: 2,
      p_expected_quantity_version: 1,
    }))
    expect(updateStockItemQuantityMock).not.toHaveBeenCalled()
  })

  it('location path routes only through balance RPC and does not double-write', async () => {
    __setSupportsLocationBalancesForTests(true)

    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        movement_id: 'mov-loc-1',
        quantity_after: 7,
        quantity_version: 2,
        current_quantity: 7,
      },
      error: null,
    })

    const loadQuery = createSelectByIdQuery({
      data: {
        id: 'mov-loc-1',
        workspace_id: 'ws-1',
        item_id: 'item-1',
        type: 'usage',
        quantity: 3,
        note: 'Service',
        created_by: 'user-2',
        created_at: '2026-07-29T11:00:00Z',
      },
      error: null,
    })
    fromMock.mockReturnValue(loadQuery)

    const result = await recordStockMutation({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'usage',
      quantity: 3,
      note: 'Service',
      workspaceStorageId: 'storage-1',
      expectedQuantityVersion: 1,
      originWorkflow: 'manual',
      currentQuantity: 10,
    })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('record_location_usage', {
      p_workspace_id: 'ws-1',
      p_stock_item_id: 'item-1',
      p_workspace_storage_id: 'storage-1',
      p_quantity: 3,
      p_expected_quantity_version: 1,
      p_note: 'Service',
      p_origin_workflow: 'manual',
      p_origin_ref_id: null,
    })
    expect(updateStockItemQuantityMock).not.toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('stock_movements')
    expect(loadQuery.insert).toBeUndefined()
    expect(result).toEqual({
      id: 'mov-loc-1',
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'usage',
      quantity: 3,
      note: 'Service',
      createdBy: 'user-2',
      createdAt: '2026-07-29T11:00:00Z',
    })
  })

  it('routes receive/adjustment/stock_count to the matching location RPCs', async () => {
    __setSupportsLocationBalancesForTests(true)

    const cases = [
      ['receive', 'record_location_receive'],
      ['adjustment', 'record_location_adjustment'],
      ['stock_count', 'record_location_stock_count'],
    ]

    for (const [type, rpcName] of cases) {
      rpcMock.mockReset()
      fromMock.mockReset()
      rpcMock.mockResolvedValue({
        data: { movement_id: `mov-${type}` },
        error: null,
      })
      fromMock.mockReturnValue(createSelectByIdQuery({
        data: {
          id: `mov-${type}`,
          workspace_id: 'ws-1',
          item_id: 'item-1',
          type,
          quantity: type === 'adjustment' ? -1 : 1,
          note: '',
          created_by: null,
          created_at: '2026-07-29T12:00:00Z',
        },
        error: null,
      }))

      await recordStockMutationLocationAware({
        workspaceId: 'ws-1',
        itemId: 'item-1',
        type,
        quantity: type === 'adjustment' ? -1 : 1,
        workspaceStorageId: 'storage-9',
        expectedQuantityVersion: 4,
      })

      expect(rpcMock).toHaveBeenCalledWith(rpcName, expect.objectContaining({
        p_workspace_storage_id: 'storage-9',
        p_expected_quantity_version: 4,
      }))
      expect(updateStockItemQuantityMock).not.toHaveBeenCalled()
    }
  })

  it('does not execute both paths for a single mutation', async () => {
    __setSupportsLocationBalancesForTests(false)
    const insertQuery = createInsertQuery({
      data: {
        id: 'mov-legacy',
        workspace_id: 'ws-1',
        item_id: 'item-1',
        type: 'receive',
        quantity: 1,
        note: '',
        created_by: null,
        created_at: '2026-07-29T13:00:00Z',
      },
      error: null,
    })
    fromMock.mockReturnValue(insertQuery)
    await recordStockMutation({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'receive',
      quantity: 1,
      currentQuantity: 0,
    })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(updateStockItemQuantityMock).toHaveBeenCalledTimes(1)

    __setSupportsLocationBalancesForTests(true)
    updateStockItemQuantityMock.mockClear()
    rpcMock.mockResolvedValue({ data: { movement_id: 'mov-loc' }, error: null })
    fromMock.mockReturnValue(createSelectByIdQuery({
      data: {
        id: 'mov-loc',
        workspace_id: 'ws-1',
        item_id: 'item-1',
        type: 'receive',
        quantity: 1,
        note: '',
        created_by: null,
        created_at: '2026-07-29T13:01:00Z',
      },
      error: null,
    }))
    await recordStockMutation({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'receive',
      quantity: 1,
      workspaceStorageId: 'st-1',
      expectedQuantityVersion: 1,
      currentQuantity: 0,
    })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(updateStockItemQuantityMock).not.toHaveBeenCalled()
  })

  it('location path requires storage id and expected quantity version', async () => {
    __setSupportsLocationBalancesForTests(true)

    await expect(recordStockMutation({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'receive',
      quantity: 1,
      expectedQuantityVersion: 1,
    })).rejects.toThrow(/workspace storage is required/i)

    await expect(recordStockMutation({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'receive',
      quantity: 1,
      workspaceStorageId: 'st-1',
    })).rejects.toThrow(/expected quantity version is required/i)

    expect(rpcMock).not.toHaveBeenCalled()
    expect(updateStockItemQuantityMock).not.toHaveBeenCalled()
  })

  it('stockMovementService.recordStockMovement delegates to the router', async () => {
    const insertQuery = createInsertQuery({
      data: {
        id: 'mov-delegate',
        workspace_id: 'ws-1',
        item_id: 'item-1',
        type: 'adjustment',
        quantity: 5,
        note: 'Fix',
        created_by: 'user-9',
        created_at: '2026-07-29T14:00:00Z',
      },
      error: null,
    })
    fromMock.mockReturnValue(insertQuery)

    const result = await recordStockMovement({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'adjustment',
      quantity: 5,
      note: 'Fix',
      createdBy: 'user-9',
      currentQuantity: 1,
    })

    expect(result.id).toBe('mov-delegate')
    expect(result.quantity).toBe(5)
    expect(updateStockItemQuantityMock).toHaveBeenCalledWith('item-1', 'ws-1', 6)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('legacy helper remains callable and identical in return shape', async () => {
    const insertQuery = createInsertQuery({
      data: {
        id: 'mov-direct',
        workspace_id: 'ws-1',
        item_id: 'item-1',
        type: 'stock_count',
        quantity: 8,
        note: '',
        created_by: null,
        created_at: '2026-07-29T15:00:00Z',
      },
      error: null,
    })
    fromMock.mockReturnValue(insertQuery)

    const result = await recordStockMutationLegacy({
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'stock_count',
      quantity: 8,
      currentQuantity: 3,
    })

    expect(result).toEqual({
      id: 'mov-direct',
      workspaceId: 'ws-1',
      itemId: 'item-1',
      type: 'stock_count',
      quantity: 8,
      note: '',
      createdBy: null,
      createdAt: '2026-07-29T15:00:00Z',
    })
    expect(updateStockItemQuantityMock).toHaveBeenCalledWith('item-1', 'ws-1', 8)
  })
})

describe('transferStockBetweenLocations — P8.30.6', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
    updateStockItemQuantityMock.mockReset()
  })

  it('calls transfer_stock_between_locations and never patches quantities directly', async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        transfer_out_movement_id: 'mov-out',
        transfer_in_movement_id: 'mov-in',
      },
      error: null,
    })

    const result = await transferStockBetweenLocations({
      workspaceId: 'ws-1',
      stockItemId: 'item-1',
      sourceWorkspaceStorageId: 'stor-a',
      destinationWorkspaceStorageId: 'stor-b',
      quantity: 3,
      expectedSourceQuantityVersion: 2,
      expectedDestinationQuantityVersion: 4,
      note: 'Bar restock',
    })

    expect(rpcMock).toHaveBeenCalledWith('transfer_stock_between_locations', {
      p_workspace_id: 'ws-1',
      p_stock_item_id: 'item-1',
      p_source_workspace_storage_id: 'stor-a',
      p_destination_workspace_storage_id: 'stor-b',
      p_quantity: 3,
      p_expected_source_quantity_version: 2,
      p_expected_destination_quantity_version: 4,
      p_note: 'Bar restock',
      p_origin_ref_id: null,
    })
    expect(updateStockItemQuantityMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true })
  })

  it('maps RPC error codes and rejects same-storage / invalid quantity locally', async () => {
    expect(mapStockTransferRpcError({ message: 'stock_transfer_insufficient_source' }).message)
      .toMatch(/Not enough quantity/i)

    await expect(transferStockBetweenLocations({
      workspaceId: 'ws-1',
      stockItemId: 'item-1',
      sourceWorkspaceStorageId: 'stor-a',
      destinationWorkspaceStorageId: 'stor-a',
      quantity: 1,
      expectedSourceQuantityVersion: 1,
      expectedDestinationQuantityVersion: 1,
    })).rejects.toThrow(/different destination/i)

    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'stock_transfer_destination_balance_not_found' },
    })
    await expect(transferStockBetweenLocations({
      workspaceId: 'ws-1',
      stockItemId: 'item-1',
      sourceWorkspaceStorageId: 'stor-a',
      destinationWorkspaceStorageId: 'stor-b',
      quantity: 1,
      expectedSourceQuantityVersion: 1,
      expectedDestinationQuantityVersion: 1,
    })).rejects.toThrow(/no balance for this product/i)
  })
})

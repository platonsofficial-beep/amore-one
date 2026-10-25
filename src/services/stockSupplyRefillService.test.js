import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import { loadSupplyRefillCatalog, takeRefillLines } from './stockSupplyRefillService'

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

describe('loadSupplyRefillCatalog', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('does not select cost and returns supply balances', async () => {
    const storages = createQuery({
      data: [
        { id: 'soft', name: 'Soft drinks', active: true, sort_order: 1, is_supply: true, location_key: 'Soft drinks' },
        { id: 'bar', name: 'Back bar', active: true, sort_order: 2, is_supply: false, location_key: 'Back bar' },
      ],
      error: null,
    })
    const balances = createQuery({
      data: [{
        stock_item_id: 'cola',
        workspace_storage_id: 'soft',
        quantity: 6,
        quantity_version: 3,
      }],
      error: null,
    })
    const items = createQuery({
      data: [{ id: 'cola', name: 'Coca-Cola', unit: 'bt', brand: '', size: '' }],
      error: null,
    })
    fromMock
      .mockReturnValueOnce(storages)
      .mockReturnValueOnce(balances)
      .mockReturnValueOnce(items)

    const catalog = await loadSupplyRefillCatalog('ws-1')
    expect(storages.select).toHaveBeenCalledWith(expect.not.stringContaining('cost'))
    expect(items.select).toHaveBeenCalledWith('id, name, unit, brand, size')
    expect(balances.in).toHaveBeenCalledWith('workspace_storage_id', ['soft'])
    expect(catalog.supplyReady).toBe(true)
    expect(catalog.balances).toEqual([
      { stockItemId: 'cola', storageId: 'soft', quantity: 6, quantityVersion: 3 },
    ])
    expect(catalog.itemsById.get('cola')).toEqual({ name: 'Coca-Cola', unit: 'bt' })
  })

  it('reports supply as unavailable when is_supply is missing', async () => {
    fromMock.mockReturnValue(createQuery({
      data: null,
      error: { code: '42703', message: 'column workspace_storages.is_supply does not exist' },
    }))
    await expect(loadSupplyRefillCatalog('ws-1')).resolves.toMatchObject({
      supplyReady: false,
      storages: [],
      balances: [],
    })
  })
})

describe('takeRefillLines', () => {
  it('transfers selected lines and keeps going after one failure', async () => {
    const transfer = vi.fn(async ({ stockItemId }) => {
      if (stockItemId === 'vodka') throw new Error('Not enough quantity in the source storage.')
      return { ok: true }
    })
    const lines = [
      {
        stockItemId: 'cola',
        selected: true,
        transferable: true,
        quantity: 4,
        sourceStorageId: 'soft',
        sourceQuantityVersion: 3,
        destinationQuantityVersion: 2,
      },
      {
        stockItemId: 'vodka',
        selected: true,
        transferable: true,
        quantity: 2,
        sourceStorageId: 'spirits',
        sourceQuantityVersion: 5,
        destinationQuantityVersion: 1,
      },
      {
        stockItemId: 'skipped',
        selected: false,
        transferable: true,
        quantity: 1,
        sourceStorageId: 'soft',
        sourceQuantityVersion: 1,
        destinationQuantityVersion: 1,
      },
    ]

    const results = await takeRefillLines({
      workspaceId: 'ws-1',
      destinationStorageId: 'back-bar',
      lines,
      note: 'Refill from supply storage',
      transfer,
    })

    expect(transfer).toHaveBeenCalledTimes(2)
    expect(transfer).toHaveBeenNthCalledWith(1, expect.objectContaining({
      workspaceId: 'ws-1',
      stockItemId: 'cola',
      sourceWorkspaceStorageId: 'soft',
      destinationWorkspaceStorageId: 'back-bar',
      quantity: 4,
      expectedSourceQuantityVersion: 3,
      expectedDestinationQuantityVersion: 2,
      note: 'Refill from supply storage',
    }))
    expect(results).toEqual([
      { stockItemId: 'cola', ok: true, error: '' },
      { stockItemId: 'vodka', ok: false, error: 'Not enough quantity in the source storage.' },
    ])

    transfer.mockClear()
    const retry = await takeRefillLines({
      workspaceId: 'ws-1',
      destinationStorageId: 'back-bar',
      lines: [lines[1]],
      transfer,
    })
    expect(transfer).toHaveBeenCalledTimes(1)
    expect(retry[0].stockItemId).toBe('vodka')
  })
})

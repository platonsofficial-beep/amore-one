import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_PAR_UNAVAILABLE_MESSAGE } from '../lib/stockStoragePar.js'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import {
  clearStockItemStoragePar,
  setStockItemStoragePar,
} from './stockItemStorageParService.js'

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    upsert: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

describe('stockItemStorageParService', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('upserts a shelf par and does not write a catalog quantity', async () => {
    const query = createQuery({
      data: {
        id: 'p-1',
        workspace_id: 'ws-1',
        stock_item_id: 'cola',
        workspace_storage_id: 'soft',
        par_quantity: 10,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await expect(setStockItemStoragePar('ws-1', 'cola', 'soft', 10)).resolves.toMatchObject({
      parQuantity: 10,
    })
    expect(fromMock).toHaveBeenCalledWith('stock_item_storage_pars')
    expect(query.upsert).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      stock_item_id: 'cola',
      workspace_storage_id: 'soft',
      par_quantity: 10,
    }, {
      onConflict: 'workspace_id,stock_item_id,workspace_storage_id',
    })
    expect(JSON.stringify(query.upsert.mock.calls)).not.toMatch(/target_quantity|minimum_quantity|location_key/)
  })

  it('keeps a saved par of 0 when the row returns 0 or omits the quantity', async () => {
    const zeroQuery = createQuery({
      data: {
        id: 'p-0',
        workspace_id: 'ws-1',
        stock_item_id: 'cola',
        workspace_storage_id: 'soft',
        par_quantity: 0,
      },
      error: null,
    })
    fromMock.mockReturnValue(zeroQuery)
    await expect(setStockItemStoragePar('ws-1', 'cola', 'soft', 0)).resolves.toMatchObject({
      parQuantity: 0,
    })

    const missingQuery = createQuery({
      data: {
        id: 'p-0',
        workspace_id: 'ws-1',
        stock_item_id: 'cola',
        workspace_storage_id: 'soft',
        par_quantity: null,
      },
      error: null,
    })
    fromMock.mockReturnValue(missingQuery)
    await expect(setStockItemStoragePar('ws-1', 'cola', 'soft', 0)).resolves.toMatchObject({
      parQuantity: 0,
    })
  })

  it('clears a par by deleting the row', async () => {
    const query = createQuery({ error: null })
    fromMock.mockReturnValue(query)

    await expect(clearStockItemStoragePar('ws-1', 'cola', 'soft')).resolves.toEqual({
      stockItemId: 'cola',
      workspaceStorageId: 'soft',
      parQuantity: null,
    })
    expect(query.delete).toHaveBeenCalled()
    expect(query.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(query.eq).toHaveBeenCalledWith('stock_item_id', 'cola')
    expect(query.eq).toHaveBeenCalledWith('workspace_storage_id', 'soft')
  })

  it('explains a missing par table instead of crashing', async () => {
    fromMock.mockReturnValue(createQuery({
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.stock_item_storage_pars' in the schema cache",
      },
    }))

    await expect(setStockItemStoragePar('ws-1', 'cola', 'soft', 4)).rejects.toThrow(
      STORAGE_PAR_UNAVAILABLE_MESSAGE,
    )
  })
})

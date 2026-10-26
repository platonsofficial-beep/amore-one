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

import { prepareSupplyOrderDrafts, loadSupplyOrderSource } from './stockSupplyOrderDraftService.js'
import { WORKSPACE_STORAGE_DEPARTMENT_COLUMNS } from './stockStorageCenterService.js'

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

const source = {
  parsReady: true,
  buyingAvailable: false,
  storages: [{ id: 'soft', active: true, isSupply: true }],
  balances: [{ stock_item_id: 'cola', workspace_storage_id: 'soft', quantity: 1 }],
  pars: [{ stock_item_id: 'cola', workspace_storage_id: 'soft', par_quantity: 4 }],
}

describe('prepareSupplyOrderDrafts', () => {
  it('creates a draft and does not write when pars are unavailable', async () => {
    const createOrder = vi.fn(async () => ({ id: 'created' }))
    const updateDraft = vi.fn()
    const ready = await prepareSupplyOrderDrafts('ws-1', {
      items: [{
        id: 'cola',
        name: 'Cola',
        active: true,
        unit: 'btl',
        costPrice: 2,
        supplierId: 'sup-1',
        supplier: 'Wine',
      }],
      suppliers: [{ id: 'sup-1', companyName: 'Wine House' }],
      existingOrders: [],
      createdBy: 'user-1',
      loadSource: async () => source,
      createOrder,
      updateDraft,
    })

    expect(ready.created).toEqual([{ id: 'created' }])
    expect(ready.updated).toEqual([])
    expect(createOrder).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      supplier: 'Wine House',
      supplierId: 'sup-1',
      status: 'draft',
      items: [expect.objectContaining({ stockItemId: 'cola', quantity: 3 })],
    }), { createdBy: 'user-1' })
    expect(updateDraft).not.toHaveBeenCalled()

    createOrder.mockClear()
    const blocked = await prepareSupplyOrderDrafts('ws-1', {
      items: [],
      loadSource: async () => ({ parsReady: false, storages: [], balances: [], pars: [] }),
      createOrder,
      updateDraft,
    })
    expect(blocked.unavailable).toBe(true)
    expect(blocked.message).toBe(STORAGE_PAR_UNAVAILABLE_MESSAGE)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('loads supply storages when is_buying is not in the database yet', async () => {
    const storages = {
      select: vi.fn((columns) => (
        `${columns}`.includes('is_buying')
          ? createQuery({
            data: null,
            error: { code: '42703', message: 'column workspace_storages.is_buying does not exist' },
          })
          : createQuery({
            data: [{
              id: 'soft',
              workspace_id: 'ws-1',
              location_key: 'Soft drinks',
              name: 'Soft drinks',
              active: true,
              sort_order: 1,
              is_supply: true,
            }],
            error: null,
          })
      )),
    }
    const balances = createQuery({ data: [], error: null })
    const pars = createQuery({
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.stock_item_storage_pars' in the schema cache",
      },
    })
    fromMock.mockImplementation((table) => {
      if (table === 'workspace_storages') return storages
      if (table === 'stock_item_location_balances') return balances
      if (table === 'stock_item_storage_pars') return pars
      throw new Error(`unexpected table ${table}`)
    })

    const loaded = await loadSupplyOrderSource('ws-1')
    expect(loaded.parsReady).toBe(false)
    expect(loaded.buyingAvailable).toBe(false)
    expect(loaded.storages[0]).toMatchObject({ id: 'soft', isSupply: true })
    expect(storages.select).toHaveBeenCalledWith(WORKSPACE_STORAGE_DEPARTMENT_COLUMNS)
  })
})

describe('loadSupplyOrderSource guards', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('requires a workspace', async () => {
    await expect(loadSupplyOrderSource('')).rejects.toThrow(/Workspace is required/)
  })
})

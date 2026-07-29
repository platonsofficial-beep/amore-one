/**
 * @vitest-environment node
 * P8.29.12 — Stock location balance read service.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, listWorkspaceStoragesMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  listWorkspaceStoragesMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

vi.mock('./workspaceStorageService', () => ({
  listWorkspaceStorages: (...args) => listWorkspaceStoragesMock(...args),
}))

import {
  STOCK_LOCATION_BALANCE_LIST_COLUMNS,
  enrichStockLocationBalancesWithStorages,
  getStockItemLocationBalances,
} from './stockLocationBalanceService.js'

function createBalanceQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: undefined,
  }
  // Final eq returns promise-like via thenable resolution pattern used by supabase client mock:
  query.eq = vi.fn(() => query)
  // After both eq calls, awaiting the query resolves via Promise.resolve if we make it thenable.
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return query
}

describe('enrichStockLocationBalancesWithStorages', () => {
  it('attaches storage catalog fields by workspace_storage_id', () => {
    const enriched = enrichStockLocationBalancesWithStorages(
      [{ id: 'b1', workspace_storage_id: 'stor-bar', location_key: 'Bar', quantity: 66 }],
      [{ id: 'stor-bar', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 1 }],
    )
    expect(enriched[0].workspace_storages).toEqual({
      id: 'stor-bar',
      location_key: 'Bar',
      name: 'Bar',
      active: true,
      sort_order: 1,
    })
  })
})

describe('getStockItemLocationBalances', () => {
  beforeEach(() => {
    fromMock.mockReset()
    listWorkspaceStoragesMock.mockReset()
  })

  it('returns sorted visible balances and uses cached-total-friendly display list', async () => {
    const query = createBalanceQuery({
      data: [
        {
          id: 'b1',
          workspace_id: 'ws-1',
          stock_item_id: 'item-1',
          workspace_storage_id: 'stor-bar',
          location_key: 'Bar',
          quantity: 66,
          quantity_version: 1,
        },
        {
          id: 'b2',
          workspace_id: 'ws-1',
          stock_item_id: 'item-1',
          workspace_storage_id: 'stor-water',
          location_key: 'Water Storage',
          quantity: 468,
          quantity_version: 1,
        },
        {
          id: 'b3',
          workspace_id: 'ws-1',
          stock_item_id: 'item-1',
          workspace_storage_id: 'stor-zero',
          location_key: 'Kitchen',
          quantity: 0,
          quantity_version: 1,
        },
      ],
      error: null,
    })
    fromMock.mockReturnValue(query)
    listWorkspaceStoragesMock.mockResolvedValue([
      { id: 'stor-water', locationKey: 'Water Storage', name: 'Water Storage', active: true, sortOrder: 0 },
      { id: 'stor-bar', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 1 },
      { id: 'stor-zero', locationKey: 'Kitchen', name: 'Kitchen', active: true, sortOrder: 2 },
    ])

    const balances = await getStockItemLocationBalances('ws-1', 'item-1')
    expect(fromMock).toHaveBeenCalledWith('stock_item_location_balances')
    expect(query.select).toHaveBeenCalledWith(STOCK_LOCATION_BALANCE_LIST_COLUMNS)
    expect(listWorkspaceStoragesMock).toHaveBeenCalledWith('ws-1')
    expect(balances.map((entry) => ({
      name: entry.locationName,
      quantity: entry.quantity,
    }))).toEqual([
      { name: 'Water Storage', quantity: 468 },
      { name: 'Bar', quantity: 66 },
    ])
  })

  it('returns [] for missing ids or unavailable table', async () => {
    await expect(getStockItemLocationBalances('', 'item-1')).resolves.toEqual([])
    await expect(getStockItemLocationBalances('ws-1', '')).resolves.toEqual([])

    const query = createBalanceQuery({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })
    fromMock.mockReturnValue(query)
    await expect(getStockItemLocationBalances('ws-1', 'item-1')).resolves.toEqual([])
  })
})

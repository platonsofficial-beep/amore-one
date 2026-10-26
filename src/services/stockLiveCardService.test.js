import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import { loadStockLiveSnapshot } from './stockLiveCardService'
import {
  STOCK_STORAGE_CENTER_BALANCE_COLUMNS,
  STOCK_STORAGE_PAR_COLUMNS,
} from './stockStorageCenterService'

function query(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return builder
}

describe('loadStockLiveSnapshot', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('counts below-par shelf lines from pars and balances', async () => {
    const pars = query({
      data: [{ workspace_storage_id: 'cellar', stock_item_id: 'cola', par_quantity: 4 }],
      error: null,
    })
    const balances = query({
      data: [{ workspace_storage_id: 'cellar', stock_item_id: 'cola', quantity: 1 }],
      error: null,
    })
    const sessions = query({
      data: [{ started_at: '2026-07-30T09:00:00.000Z' }],
      error: null,
    })
    fromMock.mockImplementation((table) => {
      if (table === 'stock_item_storage_pars') return pars
      if (table === 'inventory_count_sessions') return sessions
      return balances
    })

    await expect(loadStockLiveSnapshot('ws-1')).resolves.toEqual({
      belowParCount: 1,
      parsReady: true,
      lastInventoryCountAt: '2026-07-30T09:00:00.000Z',
    })
    expect(sessions.order).toHaveBeenCalledWith('started_at', { ascending: false })
    expect(sessions.limit).toHaveBeenCalledWith(1)
    expect(pars.select).toHaveBeenCalledWith(STOCK_STORAGE_PAR_COLUMNS)
    expect(balances.select).toHaveBeenCalledWith(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
    expect(pars.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
  })

  it('reports pars as unavailable when the pars table is missing', async () => {
    fromMock.mockImplementation((table) => query(
      table === 'stock_item_storage_pars'
        ? { data: null, error: { message: 'relation stock_item_storage_pars does not exist', code: '42P01' } }
        : { data: [], error: null },
    ))

    await expect(loadStockLiveSnapshot('ws-1')).resolves.toEqual({
      belowParCount: 0,
      parsReady: false,
      lastInventoryCountAt: null,
    })
  })
})

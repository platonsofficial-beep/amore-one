import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildStorageProductRows,
  buildWorkspaceStorageSummaries,
  filterStorageProductRows,
  getWorkspaceStorageProducts,
  getWorkspaceStorageSummaries,
  sortStorageProductRows,
  STOCK_STORAGE_CENTER_BALANCE_COLUMNS,
  STOCK_STORAGE_CENTER_COST_COLUMNS,
  STOCK_STORAGE_PRODUCT_ITEM_COLUMNS,
} from './stockStorageCenterService.js'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: undefined,
  }
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return query
}

describe('buildWorkspaceStorageSummaries', () => {
  it('orders active before archived and aggregates products/qty/value', () => {
    const result = buildWorkspaceStorageSummaries({
      storages: [
        { id: 's-arch', locationKey: 'Old Cellar', name: 'Old Cellar', active: false, sortOrder: 0 },
        { id: 's-bar', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 2 },
        { id: 's-main', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
      ],
      balances: [
        { workspace_storage_id: 's-main', stock_item_id: 'i1', quantity: 10 },
        { workspace_storage_id: 's-main', stock_item_id: 'i2', quantity: 0 },
        { workspace_storage_id: 's-bar', stock_item_id: 'i1', quantity: 3 },
        { workspace_storage_id: 's-arch', stock_item_id: 'i3', quantity: 2 },
      ],
      costByItemId: {
        i1: 5,
        i2: 2,
        i3: 4,
      },
    })

    expect(result.storages.map((storage) => storage.id)).toEqual(['s-main', 's-bar', 's-arch'])
    expect(result.activeStorages).toHaveLength(2)
    expect(result.archivedStorages).toHaveLength(1)
    expect(result.storages[0]).toMatchObject({
      productCount: 2,
      totalQuantity: 10,
      nonZeroBalanceCount: 1,
      inventoryValue: 50,
      status: 'active',
    })
    expect(result.summary).toEqual({
      activeStorageCount: 2,
      archivedStorageCount: 1,
      totalProductsWithBalances: 3,
      totalQuantity: 15,
    })
  })

  it('returns graceful empty aggregates', () => {
    const result = buildWorkspaceStorageSummaries({ storages: [], balances: [] })
    expect(result.storages).toEqual([])
    expect(result.summary.totalQuantity).toBe(0)
  })
})

describe('getWorkspaceStorageSummaries', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('queries workspace-scoped storages, balances, and costs without mutations', async () => {
    const storagesQuery = createQuery({
      data: [
        {
          id: 's-main',
          workspace_id: 'ws-1',
          location_key: 'Main Storage',
          name: 'Main Storage',
          active: true,
          sort_order: 1,
        },
      ],
      error: null,
    })
    const balancesQuery = createQuery({
      data: [
        {
          stock_item_id: 'i1',
          workspace_storage_id: 's-main',
          location_key: 'Main Storage',
          quantity: 4,
        },
      ],
      error: null,
    })
    const costsQuery = createQuery({
      data: [{ id: 'i1', cost_price: 2.5 }],
      error: null,
    })

    fromMock.mockImplementation((table) => {
      if (table === 'workspace_storages') return storagesQuery
      if (table === 'stock_item_location_balances') return balancesQuery
      if (table === 'stock_items') return costsQuery
      throw new Error(`unexpected table ${table}`)
    })

    const result = await getWorkspaceStorageSummaries('ws-1')
    expect(fromMock).toHaveBeenCalledWith('workspace_storages')
    expect(fromMock).toHaveBeenCalledWith('stock_item_location_balances')
    expect(fromMock).toHaveBeenCalledWith('stock_items')
    expect(storagesQuery.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(balancesQuery.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(balancesQuery.select).toHaveBeenCalledWith(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
    expect(costsQuery.select).toHaveBeenCalledWith(STOCK_STORAGE_CENTER_COST_COLUMNS)
    expect(result.storages[0]).toMatchObject({
      id: 's-main',
      productCount: 1,
      totalQuantity: 4,
      inventoryValue: 10,
    })
    expect(fromMock.mock.calls.every(([table]) => (
      table === 'workspace_storages'
      || table === 'stock_item_location_balances'
      || table === 'stock_items'
    ))).toBe(true)
  })

  it('requires workspace id and propagates server errors', async () => {
    await expect(getWorkspaceStorageSummaries('')).rejects.toThrow(/Workspace is required/i)

    const failing = createQuery({
      data: null,
      error: { message: 'permission denied' },
    })
    fromMock.mockReturnValue(failing)
    await expect(getWorkspaceStorageSummaries('ws-1')).rejects.toThrow(/permission denied/i)
  })
})

describe('buildStorageProductRows', () => {
  it('uses THIS storage quantity only and keeps catalog item for the drawer', () => {
    const rows = buildStorageProductRows({
      balances: [
        { stock_item_id: 'i1', workspace_storage_id: 's-main', quantity: 4 },
        { stock_item_id: 'i2', workspace_storage_id: 's-main', quantity: 0 },
      ],
      items: [
        {
          id: 'i1',
          name: 'Vodka',
          category: 'Spirits',
          item_type: 'Spirit',
          unit: 'btl',
          active: true,
          current_quantity: 20,
          minimum_quantity: 2,
          cost_price: 12,
        },
        {
          id: 'i2',
          name: 'Old Syrup',
          category: 'Syrups & Purées',
          unit: 'L',
          active: false,
          current_quantity: 5,
          minimum_quantity: 1,
          cost_price: 3,
        },
      ],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      stockItemId: 'i1',
      name: 'Vodka',
      category: 'Spirits',
      quantity: 4,
      quantityVersion: 1,
      unit: 'btl',
      active: true,
      lineValue: 48,
    })
    expect(rows[0].item.currentQuantity).toBe(20)
    expect(rows[1]).toMatchObject({
      stockItemId: 'i2',
      quantity: 0,
      active: false,
    })
  })

  it('filters and sorts with Stock-style search haystack', () => {
    const rows = buildStorageProductRows({
      balances: [
        { stock_item_id: 'i1', quantity: 2 },
        { stock_item_id: 'i2', quantity: 9 },
        { stock_item_id: 'i3', quantity: 1 },
      ],
      items: [
        { id: 'i1', name: 'Vodka', category: 'Spirits', unit: 'btl', active: true, cost_price: 1 },
        { id: 'i2', name: 'Lime Juice', category: 'Fresh', unit: 'L', active: true, cost_price: 1 },
        { id: 'i3', name: 'Gin', category: 'Spirits', unit: 'btl', active: true, cost_price: 1 },
      ],
    })

    expect(filterStorageProductRows(rows, 'lime').map((row) => row.name)).toEqual(['Lime Juice'])
    expect(sortStorageProductRows(rows, 'qty-desc').map((row) => row.name))
      .toEqual(['Lime Juice', 'Vodka', 'Gin'])
    expect(sortStorageProductRows(rows, 'name-asc').map((row) => row.name))
      .toEqual(['Gin', 'Lime Juice', 'Vodka'])
  })
})

describe('getWorkspaceStorageProducts', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('queries balances for one storage and catalog items without mutations', async () => {
    const balancesQuery = createQuery({
      data: [
        {
          stock_item_id: 'i1',
          workspace_storage_id: 's-main',
          location_key: 'Main Storage',
          quantity: 4,
        },
      ],
      error: null,
    })
    const itemsQuery = createQuery({
      data: [{
        id: 'i1',
        name: 'Vodka',
        category: 'Spirits',
        item_type: 'Spirit',
        unit: 'btl',
        active: true,
        current_quantity: 11,
        minimum_quantity: 2,
        cost_price: 5,
      }],
      error: null,
    })

    fromMock.mockImplementation((table) => {
      if (table === 'stock_item_location_balances') return balancesQuery
      if (table === 'stock_items') return itemsQuery
      throw new Error(`unexpected table ${table}`)
    })

    const result = await getWorkspaceStorageProducts('ws-1', 's-main')
    expect(balancesQuery.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(balancesQuery.eq).toHaveBeenCalledWith('workspace_storage_id', 's-main')
    expect(balancesQuery.select).toHaveBeenCalledWith(STOCK_STORAGE_CENTER_BALANCE_COLUMNS)
    expect(itemsQuery.select).toHaveBeenCalledWith(STOCK_STORAGE_PRODUCT_ITEM_COLUMNS)
    expect(itemsQuery.in).toHaveBeenCalledWith('id', ['i1'])
    expect(result.products[0]).toMatchObject({
      stockItemId: 'i1',
      quantity: 4,
      name: 'Vodka',
    })
    expect(result.summary).toEqual({
      productCount: 1,
      totalQuantity: 4,
      nonZeroBalanceCount: 1,
      inventoryValue: 20,
    })
    expect(fromMock.mock.calls.every(([table]) => (
      table === 'stock_item_location_balances' || table === 'stock_items'
    ))).toBe(true)
  })

  it('requires workspace and storage ids', async () => {
    await expect(getWorkspaceStorageProducts('', 's-main')).rejects.toThrow(/Workspace is required/i)
    await expect(getWorkspaceStorageProducts('ws-1', '')).rejects.toThrow(/Storage is required/i)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

import {
  WORKSPACE_STOCK_CATALOG_COLUMNS,
  WorkspaceStockCatalogError,
  getWorkspaceStockCatalogItems,
  mapWorkspaceStockCatalogItem,
} from './stockItemService'

function createCatalogQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

describe('mapWorkspaceStockCatalogItem', () => {
  it('maps only id, name, category, unit, sku, active', () => {
    const mapped = mapWorkspaceStockCatalogItem({
      id: 'item-1',
      name: 'Belvedere',
      category: 'Vodka',
      unit: 'Bottle 0.7L',
      active: true,
      current_quantity: 99,
      cost_price: 40,
    })

    expect(mapped).toEqual({
      id: 'item-1',
      name: 'Belvedere',
      category: 'Vodka',
      unit: 'Bottle 0.7L',
      sku: null,
      active: true,
    })
    expect(mapped).not.toHaveProperty('current_quantity')
    expect(mapped).not.toHaveProperty('cost_price')
  })
})

describe('getWorkspaceStockCatalogItems', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('requires a workspace id', async () => {
    await expect(getWorkspaceStockCatalogItems('')).rejects.toBeInstanceOf(
      WorkspaceStockCatalogError,
    )
    await expect(getWorkspaceStockCatalogItems('   ')).rejects.toMatchObject({
      code: 'WORKSPACE_REQUIRED',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('loads only catalog columns for the requested workspace', async () => {
    const query = createCatalogQuery({
      data: [
        {
          id: 'a',
          name: 'Absolut Blue',
          category: 'Vodka',
          unit: 'Bottle',
          active: true,
        },
      ],
      error: null,
    })
    fromMock.mockReturnValue(query)

    const items = await getWorkspaceStockCatalogItems('ws-1')

    expect(fromMock).toHaveBeenCalledWith('stock_items')
    expect(query.select).toHaveBeenCalledWith(WORKSPACE_STOCK_CATALOG_COLUMNS)
    expect(query.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(query.order).toHaveBeenCalledWith('name', { ascending: true })
    expect(items).toEqual([
      {
        id: 'a',
        name: 'Absolut Blue',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
      },
    ])
  })

  it('returns an empty list when the workspace has no stock items', async () => {
    fromMock.mockReturnValue(createCatalogQuery({ data: [], error: null }))
    await expect(getWorkspaceStockCatalogItems('ws-empty')).resolves.toEqual([])
  })

  it('throws a typed error when the query fails', async () => {
    fromMock.mockReturnValue(createCatalogQuery({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    }))

    await expect(getWorkspaceStockCatalogItems('ws-1')).rejects.toMatchObject({
      name: 'WorkspaceStockCatalogError',
      code: 'LOAD_FAILED',
    })
  })

  it('does not call insert, update, delete, or rpc', async () => {
    const query = createCatalogQuery({ data: [], error: null })
    fromMock.mockReturnValue(query)

    await getWorkspaceStockCatalogItems('ws-1')

    expect(query).not.toHaveProperty('insert')
    expect(Object.keys(query)).toEqual(['select', 'eq', 'order'])
  })
})

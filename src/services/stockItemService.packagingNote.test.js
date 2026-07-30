/**
 * P8.31.3 — packaging_note product save/load via stock item service
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

vi.mock('./supplierService', () => ({
  getSuppliers: vi.fn(async () => []),
}))

import { createStockItem, getStockItems, updateStockItem } from './stockItemService'

function createSelectQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

function createInsertQuery(result) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

function createUpdateQuery(result) {
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

describe('stock item packaging_note persistence', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('maps packaging_note from catalog rows', async () => {
    const query = createSelectQuery({
      data: [{
        id: 'item-1',
        workspace_id: 'ws-1',
        name: 'Belvedere Vodka',
        category: 'Spirits',
        item_type: 'Vodka',
        supplier: '',
        supplier_id: null,
        unit: 'Bottle',
        packaging_note: '  Usually supplied in cases.  ',
        current_quantity: 42,
        minimum_quantity: 6,
        target_quantity: null,
        order_quantity: null,
        cost_price: 30,
        storage_location: 'Main Storage',
        active: true,
      }],
      error: null,
    })
    fromMock.mockReturnValue(query)

    const items = await getStockItems('ws-1')
    expect(items).toHaveLength(1)
    expect(items[0].packagingNote).toBe('Usually supplied in cases.')
    expect(items[0].unit).toBe('Bottle')
    expect(items[0].currentQuantity).toBe(42)
  })

  it('maps missing packaging_note as null', async () => {
    const query = createSelectQuery({
      data: [{
        id: 'item-2',
        workspace_id: 'ws-1',
        name: 'Item',
        category: 'Spirits',
        item_type: 'Vodka',
        unit: 'Bottle',
        current_quantity: 1,
        minimum_quantity: 0,
        cost_price: 0,
        storage_location: 'Main Storage',
        active: true,
      }],
      error: null,
    })
    fromMock.mockReturnValue(query)

    const [item] = await getStockItems('ws-1')
    expect(item.packagingNote).toBeNull()
  })

  it('creates with packaging_note and returns mapped product', async () => {
    const query = createInsertQuery({
      data: {
        id: 'new-1',
        workspace_id: 'ws-1',
        name: 'Belvedere Vodka',
        category: 'Spirits',
        item_type: 'Vodka',
        supplier: '',
        supplier_id: null,
        unit: 'Bottle',
        packaging_note: 'Usually supplied in cases.',
        current_quantity: 42,
        minimum_quantity: 6,
        target_quantity: null,
        order_quantity: null,
        cost_price: 30,
        storage_location: 'Main Storage',
        active: true,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    const created = await createStockItem('ws-1', {
      name: 'Belvedere Vodka',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle',
      packagingNote: '  Usually supplied in cases.  ',
      currentQuantity: 42,
      minimumQuantity: 6,
      costPrice: 30,
      storageLocation: 'Main Storage',
    })

    expect(query.insert).toHaveBeenCalled()
    const inserted = query.insert.mock.calls[0][0]
    expect(inserted).toEqual([expect.objectContaining({
      packaging_note: 'Usually supplied in cases.',
      current_quantity: 42,
      unit: 'Bottle',
    })])
    expect(created.packagingNote).toBe('Usually supplied in cases.')
  })

  it('updates packaging_note without changing quantity payload semantics', async () => {
    const query = createUpdateQuery({
      data: {
        id: 'item-1',
        workspace_id: 'ws-1',
        name: 'Belvedere Vodka',
        category: 'Spirits',
        item_type: 'Vodka',
        supplier: '',
        supplier_id: null,
        unit: 'Bottle',
        packaging_note: 'Loose bottles accepted.',
        current_quantity: 42,
        minimum_quantity: 6,
        target_quantity: null,
        order_quantity: null,
        cost_price: 30,
        storage_location: 'Main Storage',
        active: true,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await updateStockItem('item-1', {
      name: 'Belvedere Vodka',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle',
      packagingNote: 'Loose bottles accepted.',
      currentQuantity: 42,
      minimumQuantity: 6,
      costPrice: 30,
      storageLocation: 'Main Storage',
      active: true,
    }, 'ws-1')

    const payload = query.update.mock.calls[0][0]
    expect(payload.packaging_note).toBe('Loose bottles accepted.')
    expect(payload.current_quantity).toBe(42)
    expect(payload.unit).toBe('Bottle')
  })
})

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
  updateStockItem,
  updateStockItemActive,
  updateStockItemQuantity,
} from './stockItemService'

function createUpdateQuery(result) {
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

describe('updateStockItemActive (P8.16.14k)', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('writes only active=false and scopes by id + workspace', async () => {
    const query = createUpdateQuery({
      data: {
        id: 'ko',
        workspace_id: 'ws-1',
        name: 'KETEL ONE',
        category: 'Vodka',
        item_type: 'Spirit',
        supplier: 'Supplier',
        supplier_id: 10,
        unit: 'Bottle',
        current_quantity: 2,
        minimum_quantity: 5,
        target_quantity: 10,
        order_quantity: null,
        cost_price: 20,
        storage_location: 'Main Storage',
        active: false,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await updateStockItemActive('ko', 'ws-1', false)

    expect(fromMock).toHaveBeenCalledWith('stock_items')
    expect(query.update).toHaveBeenCalledTimes(1)
    expect(query.update).toHaveBeenCalledWith({ active: false })

    const payload = query.update.mock.calls[0][0]
    expect(payload).toEqual({ active: false })
    expect(payload).not.toHaveProperty('supplier_id')
    expect(payload).not.toHaveProperty('supplier')
    expect(payload).not.toHaveProperty('category')
    expect(payload).not.toHaveProperty('current_quantity')
    expect(payload).not.toHaveProperty('minimum_quantity')
    expect(payload).not.toHaveProperty('target_quantity')
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('unit')
    expect(payload).not.toHaveProperty('cost_price')

    expect(query.eq).toHaveBeenCalledWith('id', 'ko')
    expect(query.eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
  })

  it('does not call serializeStockItem or touch supplier columns', async () => {
    const query = createUpdateQuery({
      data: {
        id: 'ko',
        workspace_id: 'ws-1',
        name: 'KETEL ONE',
        category: 'Vodka',
        item_type: 'Other',
        supplier: '',
        unit: '',
        current_quantity: 0,
        minimum_quantity: 0,
        cost_price: 0,
        storage_location: 'Main Storage',
        active: false,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await updateStockItemActive('ko', 'ws-1', false)

    const payloadKeys = Object.keys(query.update.mock.calls[0][0])
    expect(payloadKeys).toEqual(['active'])
  })
})

describe('updateStockItemQuantity remains a narrow patch', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('writes only current_quantity', async () => {
    const query = createUpdateQuery({
      data: {
        id: 'ko',
        workspace_id: 'ws-1',
        name: 'KETEL ONE',
        category: 'Vodka',
        item_type: 'Other',
        supplier: '',
        unit: 'Bottle',
        current_quantity: 9,
        minimum_quantity: 0,
        cost_price: 0,
        storage_location: 'Main Storage',
        active: true,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await updateStockItemQuantity('ko', 'ws-1', 9)

    expect(query.update).toHaveBeenCalledWith({ current_quantity: 9 })
    expect(Object.keys(query.update.mock.calls[0][0])).toEqual(['current_quantity'])
  })
})

describe('updateStockItem catalog contract remains full serialize', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('still includes catalog fields including supplier_id on full update', async () => {
    const query = createUpdateQuery({
      data: {
        id: 'ko',
        workspace_id: 'ws-1',
        name: 'KETEL ONE',
        category: 'Vodka',
        item_type: 'Spirit',
        supplier: 'Supplier',
        supplier_id: 10,
        unit: 'Bottle',
        current_quantity: 2,
        minimum_quantity: 5,
        target_quantity: 10,
        order_quantity: null,
        cost_price: 20,
        storage_location: 'Main Storage',
        active: true,
      },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await updateStockItem('ko', {
      name: 'KETEL ONE',
      category: 'Vodka',
      itemType: 'Spirit',
      supplier: 'Supplier',
      supplierId: 10,
      unit: 'Bottle',
      currentQuantity: 2,
      minimumQuantity: 5,
      targetQuantity: 10,
      orderQuantity: null,
      costPrice: 20,
      storageLocation: 'Main Storage',
      active: true,
    }, 'ws-1')

    const payload = query.update.mock.calls[0][0]
    expect(payload).toMatchObject({
      name: 'KETEL ONE',
      supplier: 'Supplier',
      supplier_id: '10',
      active: true,
    })
    expect(payload).toHaveProperty('category')
    expect(payload).toHaveProperty('current_quantity')
  })
})

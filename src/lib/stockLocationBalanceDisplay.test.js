/**
 * @vitest-environment node
 * P8.29.12 — Stock location balance display helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  buildStockLocationBalanceDisplayList,
  mapStockLocationBalanceDisplay,
  selectVisibleStockLocationBalances,
  sortStockLocationBalancesForDisplay,
} from './stockLocationBalanceDisplay.js'

describe('mapStockLocationBalanceDisplay', () => {
  it('maps balance + storage catalog fields', () => {
    expect(mapStockLocationBalanceDisplay({
      id: 'bal-1',
      workspace_id: 'ws-1',
      stock_item_id: 'item-1',
      workspace_storage_id: 'stor-bar',
      location_key: 'Bar',
      quantity: 66,
      quantity_version: 2,
      workspace_storages: {
        id: 'stor-bar',
        location_key: 'Bar',
        name: 'Bar',
        active: true,
        sort_order: 1,
      },
    })).toMatchObject({
      id: 'bal-1',
      stockItemId: 'item-1',
      workspaceStorageId: 'stor-bar',
      locationKey: 'Bar',
      locationName: 'Bar',
      quantity: 66,
      storageActive: true,
      sortOrder: 1,
    })
  })
})

describe('selectVisibleStockLocationBalances', () => {
  it('hides zero balances and keeps positive inactive balances', () => {
    const visible = selectVisibleStockLocationBalances([
      { locationName: 'Bar', quantity: 66, storageActive: true, sortOrder: 1 },
      { locationName: 'Main Storage', quantity: 0, storageActive: true, sortOrder: 0 },
      { locationName: 'Old Cellar', quantity: 2, storageActive: false, sortOrder: 9 },
      { locationName: 'Kitchen', quantity: 0, storageActive: false, sortOrder: 2 },
    ])
    expect(visible.map((entry) => entry.locationName)).toEqual(['Bar', 'Old Cellar'])
  })
})

describe('sortStockLocationBalancesForDisplay', () => {
  it('orders by sort_order then location name', () => {
    const sorted = sortStockLocationBalancesForDisplay([
      { locationName: 'Zebra', quantity: 1, sortOrder: 2 },
      { locationName: 'Alpha', quantity: 1, sortOrder: 2 },
      { locationName: 'Main Storage', quantity: 1, sortOrder: 0 },
      { locationName: 'Bar', quantity: 1, sortOrder: 1 },
    ])
    expect(sorted.map((entry) => entry.locationName)).toEqual([
      'Main Storage',
      'Bar',
      'Alpha',
      'Zebra',
    ])
  })
})

describe('buildStockLocationBalanceDisplayList', () => {
  it('maps, hides zeros, and sorts without mutating input', () => {
    const input = Object.freeze([
      Object.freeze({
        id: 'b1',
        workspace_id: 'ws',
        stock_item_id: 'i1',
        workspace_storage_id: 's-bar',
        location_key: 'Bar',
        quantity: 66,
        quantity_version: 1,
        workspace_storages: Object.freeze({
          id: 's-bar', name: 'Bar', location_key: 'Bar', active: true, sort_order: 1,
        }),
      }),
      Object.freeze({
        id: 'b2',
        workspace_id: 'ws',
        stock_item_id: 'i1',
        workspace_storage_id: 's-water',
        location_key: 'Water Storage',
        quantity: 468,
        quantity_version: 1,
        workspace_storages: Object.freeze({
          id: 's-water', name: 'Water Storage', location_key: 'Water Storage', active: true, sort_order: 0,
        }),
      }),
      Object.freeze({
        id: 'b3',
        workspace_id: 'ws',
        stock_item_id: 'i1',
        workspace_storage_id: 's-zero',
        location_key: 'Kitchen',
        quantity: 0,
        quantity_version: 1,
        workspace_storages: Object.freeze({
          id: 's-zero', name: 'Kitchen', location_key: 'Kitchen', active: true, sort_order: 2,
        }),
      }),
      Object.freeze({
        id: 'b4',
        workspace_id: 'ws',
        stock_item_id: 'i1',
        workspace_storage_id: 's-old',
        location_key: 'Old Cellar',
        quantity: 3,
        quantity_version: 1,
        workspace_storages: Object.freeze({
          id: 's-old', name: 'Old Cellar', location_key: 'Old Cellar', active: false, sort_order: 5,
        }),
      }),
    ])

    const snapshot = JSON.stringify(input)
    const list = buildStockLocationBalanceDisplayList(input)
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(list.map((entry) => entry.locationName)).toEqual([
      'Water Storage',
      'Bar',
      'Old Cellar',
    ])
    expect(list[0].quantity).toBe(468)
    expect(list[1].quantity).toBe(66)
    expect(list[2].storageActive).toBe(false)
  })
})

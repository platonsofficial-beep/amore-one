/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  describeOtherLocationStock,
  readLastUsedStockMovementStorage,
  rememberLastUsedStockMovementStorage,
  resolveStockMovementStorage,
  stockMovementStorageActionLabel,
} from './stockMovementStorage'

const storages = [
  { id: 'stor-bar', name: 'Main Bar', locationKey: 'Main Bar', active: true, sortOrder: 0 },
  { id: 'stor-main', name: 'Main Storage', locationKey: 'Main Storage', active: true, sortOrder: 1 },
  { id: 'stor-old', name: 'Old Cellar', locationKey: 'Old Cellar', active: false, sortOrder: 2 },
]

const balances = [
  { workspaceStorageId: 'stor-bar', locationKey: 'Main Bar', locationName: 'Main Bar', quantity: 2, quantityVersion: 4, storageActive: true },
  { workspaceStorageId: 'stor-main', locationKey: 'Main Storage', locationName: 'Main Storage', quantity: 0, quantityVersion: 1, storageActive: true },
]

describe('resolveStockMovementStorage', () => {
  it('prefers the session storage when that storage is still active', () => {
    const resolved = resolveStockMovementStorage({
      item: { storageLocation: 'Main Storage' },
      balances,
      storages,
      lastUsedStorageId: 'stor-main',
    })
    expect(resolved.source).toBe('session')
    expect(resolved.storage).toMatchObject({ id: 'stor-main', name: 'Main Storage' })
    expect(resolved.quantityVersion).toBe(1)
    expect(resolved.balanceQuantity).toBe(0)
    expect(resolved.requiresPicker).toBe(false)
  })

  it('skips an inactive or unknown last-used storage and uses the only positive balance', () => {
    const resolved = resolveStockMovementStorage({
      item: { storageLocation: 'Main Storage' },
      balances,
      storages,
      lastUsedStorageId: 'stor-old',
    })
    expect(resolved.source).toBe('sole_positive')
    expect(resolved.storage?.id).toBe('stor-bar')
    expect(resolved.quantityVersion).toBe(4)
    expect(resolved.balanceQuantity).toBe(2)
  })

  it('uses the catalog location when more than one balance is positive', () => {
    const resolved = resolveStockMovementStorage({
      item: { storage_location: 'Main Storage' },
      balances: [
        balances[0],
        { ...balances[1], quantity: 5, quantityVersion: 3 },
      ],
      storages,
    })
    expect(resolved.source).toBe('catalog')
    expect(resolved.storage?.id).toBe('stor-main')
    expect(resolved.quantityVersion).toBe(3)
  })

  it('keeps catalog receive on location_key after the display name changes', () => {
    const resolved = resolveStockMovementStorage({
      item: { storage_location: 'Main Storage' },
      balances: [
        { workspaceStorageId: 'stor-bar', locationKey: 'Bar', quantity: 4, quantityVersion: 2, storageActive: true },
        { workspaceStorageId: 'stor-main', locationKey: 'Main Storage', quantity: 4, quantityVersion: 3, storageActive: true },
      ],
      storages: [
        { id: 'stor-bar', name: 'Main Storage', locationKey: 'Bar', active: true },
        { id: 'stor-main', name: 'Cellar', locationKey: 'Main Storage', active: true },
      ],
    })
    expect(resolved.source).toBe('catalog')
    expect(resolved.storage).toMatchObject({ id: 'stor-main', locationKey: 'Main Storage', name: 'Cellar' })
  })

  it('matches storage_location exactly and does not fold case', () => {
    const resolved = resolveStockMovementStorage({
      item: { storageLocation: 'main bar' },
      balances: [],
      storages,
    })
    expect(resolved.storage).toBeNull()
    expect(resolved.requiresPicker).toBe(true)
    expect(resolved.quantityVersion).toBeNull()
  })

  it('requires a picker when more than one balance is positive and the catalog location does not match', () => {
    const resolved = resolveStockMovementStorage({
      item: { storageLocation: 'Wine' },
      balances: [
        { ...balances[0], quantity: 1 },
        { ...balances[1], quantity: 1 },
      ],
      storages,
    })
    expect(resolved.storage).toBeNull()
    expect(resolved.source).toBeNull()
    expect(resolved.requiresPicker).toBe(true)
  })

  it('selects the catalog storage even when that shelf has no balance row yet', () => {
    const resolved = resolveStockMovementStorage({
      item: { storageLocation: 'Main Bar' },
      balances: [],
      storages,
    })
    expect(resolved.source).toBe('catalog')
    expect(resolved.storage?.id).toBe('stor-bar')
    expect(resolved.quantityVersion).toBeNull()
    expect(resolved.balanceQuantity).toBeNull()
  })
})

describe('describeOtherLocationStock', () => {
  it('names the other shelf, and stays quiet when this is the only stock', () => {
    expect(describeOtherLocationStock(balances, 'stor-bar', (quantity, unit) => `${quantity} ${unit}` , 'btl'))
      .toBe('')
    expect(describeOtherLocationStock([
      balances[0],
      { ...balances[1], quantity: 3 },
    ], 'stor-bar', (quantity, unit) => `${quantity} ${unit}`, 'btl')).toBe('Main Storage keeps 3 btl')
  })
})

describe('session last-used storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('remembers one storage per item for this browser session', () => {
    rememberLastUsedStockMovementStorage('ws-1', 'item-1', 'stor-bar')
    expect(readLastUsedStockMovementStorage('ws-1', 'item-1')).toBe('stor-bar')
    expect(readLastUsedStockMovementStorage('ws-1', 'item-2')).toBe('')
    expect(stockMovementStorageActionLabel('receive', 'Main Bar')).toBe('Receive into Main Bar')
    expect(stockMovementStorageActionLabel('usage', 'Main Bar')).toBe('Use from Main Bar')
    expect(stockMovementStorageActionLabel('adjustment', 'Main Bar')).toBe('Adjust Main Bar')
    expect(stockMovementStorageActionLabel('stock_count', 'Main Bar')).toBe('Count Main Bar')
    expect(stockMovementStorageActionLabel('receive', '')).toBe('Choose a storage')
  })
})

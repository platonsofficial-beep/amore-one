/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockSupplyRefillSheet } from './StockSupplyRefillSheet'
import { NEEDS_SUPPLIER_ORDER_LABEL, NO_SUPPLY_STORAGE_HINT } from '../../lib/stockSupplyRefill'

const catalog = {
  supplyReady: true,
  storages: [
    { id: 'soft', name: 'Soft drinks', isSupply: true, active: true },
    { id: 'spirits', name: 'Spirits', isSupply: true, active: true },
  ],
  balances: [
    { stockItemId: 'cola', storageId: 'soft', quantity: 4, quantityVersion: 2 },
    { stockItemId: 'cola', storageId: 'spirits', quantity: 9, quantityVersion: 3 },
    { stockItemId: 'vodka', storageId: 'spirits', quantity: 1, quantityVersion: 4 },
  ],
  itemsById: new Map([
    ['cola', { name: 'Coca-Cola', unit: 'bt' }],
    ['vodka', { name: 'Vodka', unit: 'bt' }],
  ]),
}

const products = [
  { stockItemId: 'cola', name: 'Coca-Cola', unit: 'bt', quantity: 2, quantityVersion: 5, parQuantity: 10 },
  { stockItemId: 'vodka', name: 'Vodka', unit: 'bt', quantity: 0, quantityVersion: 1, parQuantity: 4 },
  { stockItemId: 'tonic', name: 'Tonic', unit: 'bt', quantity: 0, quantityVersion: 0, parQuantity: 2 },
]

describe('StockSupplyRefillSheet', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
  })

  function renderSheet(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockSupplyRefillSheet, props))
    })
  }

  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('keeps a failed line, drops the success, and does not transfer the unticked or order line twice', async () => {
    const transfer = vi.fn(async ({ stockItemId }) => {
      if (stockItemId === 'vodka') throw new Error('Not enough quantity in the source storage.')
      return { ok: true }
    })
    const loadCatalog = vi.fn(async () => catalog)
    const loadProducts = vi.fn(async () => ({
      products: [
        { ...products[0], quantity: 10, quantityVersion: 6 },
        products[1],
        products[2],
      ],
    }))
    const onCompleted = vi.fn(async () => {})

    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar', isSupply: false, active: true },
      products,
      loadCatalog,
      loadProducts,
      transfer,
      onCompleted,
    })
    await settle()

    const tonic = container.querySelector('[data-stock-item-id="tonic"]')
    expect(tonic?.textContent).toContain(NEEDS_SUPPLIER_ORDER_LABEL)
    expect(tonic?.querySelector('input[type="checkbox"]').disabled).toBe(true)

    const colaSource = container.querySelector('[data-stock-item-id="cola"] select')
    expect(colaSource?.value).toBe('spirits')

    await act(async () => {
      container.querySelector('[data-stock-item-id="vodka"] input[type="checkbox"]').click()
    })

    const take = container.querySelector('[data-testid="supply-refill-take"]')
    await act(async () => {
      take.click()
      take.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(transfer).toHaveBeenCalledTimes(1)
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({
      stockItemId: 'cola',
      sourceWorkspaceStorageId: 'spirits',
      quantity: 8,
      expectedSourceQuantityVersion: 3,
      expectedDestinationQuantityVersion: 5,
    }))
    expect(container.querySelector('[data-stock-item-id="cola"]')).toBeNull()
    expect(container.querySelector('[data-testid="supply-refill-line-error"]')).toBeNull()
    expect(onCompleted).toHaveBeenCalledTimes(1)
  })

  it('shows the failed vodka line when it stays selected', async () => {
    const transfer = vi.fn(async ({ stockItemId }) => {
      if (stockItemId === 'vodka') throw new Error('Not enough quantity in the source storage.')
      return { ok: true }
    })
    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar' },
      products,
      loadCatalog: async () => catalog,
      loadProducts: async () => ({ products: [products[1], products[2]] }),
      transfer,
      onCompleted: async () => {},
    })
    await settle()

    await act(async () => {
      container.querySelector('[data-testid="supply-refill-take"]').click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-stock-item-id="vodka"] [data-testid="supply-refill-line-error"]')?.textContent)
      .toContain('Not enough quantity')
    expect(container.querySelector('[data-stock-item-id="cola"]')).toBeNull()
    expect(transfer.mock.calls.map((call) => call[0].stockItemId).sort()).toEqual(['cola', 'vodka'])
  })

  it('tells the manager to mark a supply storage when none exist', async () => {
    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar' },
      products,
      loadCatalog: async () => ({
        supplyReady: true,
        storages: [{ id: 'bar', name: 'Back bar', isSupply: false, active: true }],
        balances: [],
        itemsById: new Map(),
      }),
      loadProducts: async () => ({ products }),
      transfer: vi.fn(),
    })
    await settle()
    expect(container.querySelector('[data-testid="supply-refill-empty-hint"]')?.textContent)
      .toBe(NO_SUPPLY_STORAGE_HINT)
    expect(container.querySelector('[data-testid="supply-refill-take"]')).toBeNull()
  })
})

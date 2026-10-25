/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockSupplyRefillSheet } from './StockSupplyRefillSheet'
import {
  NEEDS_SUPPLIER_ORDER_LABEL,
  NO_SUPPLY_STORAGE_HINT,
  SUGGESTED_BASIS_LABEL,
} from '../../lib/stockSupplyRefill'

const catalog = {
  supplyReady: true,
  storages: [
    { id: 'soft', name: 'Soft drinks', isSupply: true, active: true },
    { id: 'spirits', name: 'Spirits', isSupply: true, active: true },
  ],
  balances: [
    { stockItemId: 'cola', storageId: 'soft', quantity: 48, quantityVersion: 2 },
    { stockItemId: 'cola', storageId: 'spirits', quantity: 9, quantityVersion: 3 },
    { stockItemId: 'vodka', storageId: 'spirits', quantity: 1, quantityVersion: 4 },
    { stockItemId: 'apple', storageId: 'soft', quantity: 12, quantityVersion: 1 },
  ],
  itemsById: new Map([
    ['cola', { name: 'Coca-Cola', unit: 'bt', brand: 'Classic' }],
    ['vodka', { name: 'Vodka', unit: 'bt', brand: '' }],
    ['apple', { name: 'Apple Juice', unit: 'bt', brand: 'Fizz' }],
    ['tonic', { name: 'Tonic', unit: 'bt', brand: '' }],
  ]),
}

const products = [
  { stockItemId: 'cola', name: 'Coca-Cola', unit: 'bt', brand: 'Classic', quantity: 2, quantityVersion: 5, parQuantity: 10, costPrice: 99.99 },
  { stockItemId: 'vodka', name: 'Vodka', unit: 'bt', quantity: 0, quantityVersion: 1, parQuantity: 4 },
  { stockItemId: 'tonic', name: 'Tonic', unit: 'bt', quantity: 0, quantityVersion: 0, parQuantity: 2 },
]

function rowIds(container) {
  return [...container.querySelectorAll('[data-testid="supply-take-row"]')].map((node) => (
    node.getAttribute('data-stock-item-id')
  ))
}

function row(container, stockItemId) {
  return container.querySelector(`[data-testid="supply-take-row"][data-stock-item-id="${stockItemId}"]`)
}

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

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
      for (let step = 0; step < 8; step += 1) await Promise.resolve()
    })
  }

  it('searches shelf items first and shows each supply storage on hand', async () => {
    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar', isSupply: false },
      products,
      loadCatalog: async () => catalog,
      loadProducts: async () => ({ products }),
      transfer: vi.fn(),
    })
    await settle()

    expect(container.querySelector('#supply-refill-title')?.textContent).toContain('Από τροφοδοσία')
    expect(container.querySelector('[data-testid="supply-refill-line"]')).toBeNull()
    expect(rowIds(container)).toEqual(['cola', 'tonic', 'vodka', 'apple'])
    expect(container.textContent).not.toContain('99.99')

    const chips = [...row(container, 'cola').querySelectorAll('[data-testid="supply-take-source"]')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['Soft drinks: 48', 'Spirits: 9'])
    expect(chips[0].getAttribute('aria-pressed')).toBe('true')
    expect(chips[0].getAttribute('data-storage-id')).toBe('soft')
    expect(row(container, 'tonic')?.textContent).toContain(NEEDS_SUPPLIER_ORDER_LABEL)
    expect(row(container, 'cola')?.textContent).toContain('bt')

    const search = container.querySelector('[data-testid="supply-take-search"]')
    await act(async () => {
      setInput(search, 'fizz')
    })
    expect(rowIds(container)).toEqual(['apple'])

    await act(async () => {
      setInput(search, 'soft')
    })
    expect(rowIds(container)).toEqual(['cola', 'apple'])

    await act(async () => {
      setInput(search, '')
    })
    expect(rowIds(container)).toEqual(['cola', 'tonic', 'vodka', 'apple'])
  })

  it('caps the quantity at the chosen source and shows what remains', async () => {
    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar' },
      products,
      loadCatalog: async () => catalog,
      loadProducts: async () => ({ products }),
      transfer: vi.fn(),
    })
    await settle()

    const cola = row(container, 'cola')
    const input = cola.querySelector('[data-testid="supply-take-qty"]')
    await act(async () => {
      setInput(input, '6')
    })
    expect(cola.querySelector('[data-testid="supply-take-remaining"]')?.textContent).toBe('48 → 42')
    expect(container.querySelector('[data-testid="supply-take-list-item"]')?.textContent).toContain('Coca-Cola')

    await act(async () => {
      setInput(input, '60')
    })
    expect(input.value).toBe('48')
    expect(cola.querySelector('[data-testid="supply-take-warning"]')?.textContent).toBe('Only 48 in Soft drinks.')
    expect(cola.querySelector('[data-testid="supply-take-remaining"]')?.textContent).toBe('48 → 0')
    expect(cola.querySelector('[data-testid="supply-take-plus"]').disabled).toBe(false)

    await act(async () => {
      cola.querySelector('[data-testid="supply-take-plus"]').click()
    })
    expect(cola.querySelector('[data-testid="supply-take-warning"]')?.textContent).toBe('Only 48 in Soft drinks.')

    await act(async () => {
      cola.querySelector('[data-storage-id="spirits"]').click()
    })
    expect(cola.querySelector('[data-storage-id="spirits"]').getAttribute('aria-pressed')).toBe('true')
    expect(input.value).toBe('9')
    expect(cola.querySelector('[data-testid="supply-take-warning"]')?.textContent).toBe('Only 9 in Spirits.')
    expect(cola.querySelector('[data-testid="supply-take-remaining"]')?.textContent).toBe('9 → 0')
  })

  it('takes several lines once, then refetches supply on hand', async () => {
    const transfer = vi.fn(async () => ({ ok: true }))
    const after = {
      ...catalog,
      balances: catalog.balances.map((balance) => (
        balance.stockItemId === 'cola' && balance.storageId === 'soft'
          ? { ...balance, quantity: 42, quantityVersion: 3 }
          : balance.stockItemId === 'vodka'
            ? { ...balance, quantity: 0, quantityVersion: 5 }
            : balance
      )),
    }
    const loadCatalog = vi.fn()
      .mockResolvedValueOnce(catalog)
      .mockResolvedValue(after)
    const loadProducts = vi.fn()
      .mockResolvedValueOnce({ products })
      .mockResolvedValue({
        products: [
          { ...products[0], quantity: 8, quantityVersion: 6 },
          products[1],
          products[2],
        ],
      })
    const onCompleted = vi.fn(async () => {})

    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar' },
      products,
      loadCatalog,
      loadProducts,
      transfer,
      onCompleted,
    })
    await settle()
    expect(loadCatalog).toHaveBeenCalledTimes(1)

    await act(async () => {
      setInput(row(container, 'cola').querySelector('[data-testid="supply-take-qty"]'), '6')
      row(container, 'vodka').querySelector('[data-testid="supply-take-plus"]').click()
    })

    const submit = container.querySelector('[data-testid="supply-take-submit"]')
    expect(submit.textContent).toContain('Take / Λήψη (2)')
    await act(async () => {
      submit.click()
      submit.click()
      for (let step = 0; step < 12; step += 1) await Promise.resolve()
    })

    expect(transfer).toHaveBeenCalledTimes(2)
    expect(transfer).toHaveBeenNthCalledWith(1, expect.objectContaining({
      stockItemId: 'cola',
      sourceWorkspaceStorageId: 'soft',
      quantity: 6,
      expectedSourceQuantityVersion: 2,
      expectedDestinationQuantityVersion: 5,
    }))
    expect(transfer).toHaveBeenNthCalledWith(2, expect.objectContaining({
      stockItemId: 'vodka',
      sourceWorkspaceStorageId: 'spirits',
      quantity: 1,
      expectedSourceQuantityVersion: 4,
      expectedDestinationQuantityVersion: 1,
    }))
    expect(loadCatalog).toHaveBeenCalledTimes(2)
    expect(loadProducts).toHaveBeenCalledTimes(2)
    expect(row(container, 'cola').querySelector('[data-testid="supply-take-qty"]').value).toBe('')
    expect(row(container, 'cola').textContent).toContain('Soft drinks: 42')
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="supply-take-list-item"]')).toBeNull()
  })

  it('keeps the failed line after a partial take and does not send the batch twice', async () => {
    const transfer = vi.fn(async ({ stockItemId }) => {
      if (stockItemId === 'vodka') throw new Error('Not enough quantity in the source storage.')
      return { ok: true }
    })
    const loadCatalog = vi.fn(async () => catalog)
    const loadProducts = vi.fn()
      .mockResolvedValueOnce({ products })
      .mockResolvedValue({
        products: [
          { ...products[0], quantity: 8, quantityVersion: 6 },
          products[1],
          products[2],
        ],
      })

    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar' },
      products,
      loadCatalog,
      loadProducts,
      transfer,
      onCompleted: async () => {},
    })
    await settle()

    await act(async () => {
      setInput(row(container, 'cola').querySelector('[data-testid="supply-take-qty"]'), '6')
      row(container, 'vodka').querySelector('[data-testid="supply-take-plus"]').click()
    })
    const submit = container.querySelector('[data-testid="supply-take-submit"]')
    await act(async () => {
      submit.click()
      submit.click()
      for (let step = 0; step < 12; step += 1) await Promise.resolve()
    })

    expect(transfer).toHaveBeenCalledTimes(2)
    expect(row(container, 'cola').querySelector('[data-testid="supply-take-qty"]').value).toBe('')
    expect(row(container, 'vodka').querySelector('[data-testid="supply-take-error"]')?.textContent)
      .toContain('Not enough quantity')
    expect(row(container, 'vodka').querySelector('[data-testid="supply-take-qty"]').value).toBe('1')
    expect(container.querySelector('[data-testid="supply-refill-notice"]')?.textContent).toContain('1 moved')
  })

  it('keeps the par list as a suggestion based on the last recorded quantity', async () => {
    const transfer = vi.fn(async () => ({ ok: true }))
    const loadProducts = vi.fn()
      .mockResolvedValueOnce({ products })
      .mockResolvedValue({
        products: [
          { ...products[0], quantity: 10, quantityVersion: 6 },
          products[1],
          products[2],
        ],
      })

    renderSheet({
      workspaceId: 'ws-1',
      destinationStorage: { id: 'back-bar', name: 'Back bar' },
      products,
      loadCatalog: async () => catalog,
      loadProducts,
      transfer,
    })
    await settle()

    await act(async () => {
      container.querySelector('[data-testid="supply-suggested-tab"]').click()
    })
    expect(container.querySelector('[data-testid="supply-suggested-basis"]')?.textContent)
      .toBe(SUGGESTED_BASIS_LABEL)
    const tonic = container.querySelector('[data-stock-item-id="tonic"]')
    expect(tonic?.textContent).toContain(NEEDS_SUPPLIER_ORDER_LABEL)
    expect(tonic?.querySelector('input[type="checkbox"]').disabled).toBe(true)
    expect(container.querySelector('[data-stock-item-id="cola"] select')?.value).toBe('soft')

    await act(async () => {
      container.querySelector('[data-stock-item-id="vodka"] input[type="checkbox"]').click()
    })
    const take = container.querySelector('[data-testid="supply-refill-take"]')
    await act(async () => {
      take.click()
      take.click()
      for (let step = 0; step < 12; step += 1) await Promise.resolve()
    })

    expect(transfer).toHaveBeenCalledTimes(1)
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({
      stockItemId: 'cola',
      sourceWorkspaceStorageId: 'soft',
      quantity: 8,
      expectedSourceQuantityVersion: 2,
      expectedDestinationQuantityVersion: 5,
    }))
    expect(container.querySelector('[data-testid="supply-refill-line"][data-stock-item-id="cola"]')).toBeNull()
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
    expect(container.querySelector('[data-testid="supply-take-submit"]')).toBeNull()
  })
})

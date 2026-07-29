/**
 * @vitest-environment jsdom
 * P8.29.12 — Stock product history drawer location balances.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getStockMovementsWithAuthorsMock,
  getStockItemLocationBalancesMock,
} = vi.hoisted(() => ({
  getStockMovementsWithAuthorsMock: vi.fn(),
  getStockItemLocationBalancesMock: vi.fn(),
}))

vi.mock('../../services/stockMovementService', () => ({
  getStockMovementsWithAuthors: (...args) => getStockMovementsWithAuthorsMock(...args),
}))

vi.mock('../../services/stockLocationBalanceService', () => ({
  getStockItemLocationBalances: (...args) => getStockItemLocationBalancesMock(...args),
}))

import { StockProductHistoryDrawer } from './StockProductHistoryDrawer.jsx'

const ITEM = {
  id: 'item-1',
  name: 'Belvedere',
  category: 'Vodka',
  itemType: 'Spirits',
  unit: 'Bottle',
  currentQuantity: 534,
  minimumQuantity: 6,
  targetQuantity: 12,
  storageLocation: 'Main Storage',
  supplier: 'Pernod',
  costPrice: 20,
  status: 'ok',
  active: true,
  updatedAt: '2026-07-01T00:00:00.000Z',
}

describe('StockProductHistoryDrawer — location balances (P8.29.12)', () => {
  let container
  let root

  beforeEach(() => {
    getStockMovementsWithAuthorsMock.mockReset()
    getStockItemLocationBalancesMock.mockReset()
    getStockMovementsWithAuthorsMock.mockResolvedValue([])
    getStockItemLocationBalancesMock.mockResolvedValue([
      {
        workspaceStorageId: 'stor-water',
        locationKey: 'Water Storage',
        locationName: 'Water Storage',
        quantity: 468,
        storageActive: true,
        sortOrder: 0,
      },
      {
        workspaceStorageId: 'stor-bar',
        locationKey: 'Bar',
        locationName: 'Bar',
        quantity: 66,
        storageActive: true,
        sortOrder: 1,
      },
      {
        workspaceStorageId: 'stor-old',
        locationKey: 'Old Cellar',
        locationName: 'Old Cellar',
        quantity: 3,
        storageActive: false,
        sortOrder: 5,
      },
    ])
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  async function flush() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('shows cached total and per-location quantities including inactive label', async () => {
    act(() => {
      root.render(createElement(StockProductHistoryDrawer, {
        item: ITEM,
        workspaceId: 'ws-1',
        onClose: () => {},
      }))
    })
    await flush()

    expect(getStockItemLocationBalancesMock).toHaveBeenCalledWith('ws-1', 'item-1')
    expect(getStockMovementsWithAuthorsMock).toHaveBeenCalled()

    const section = container.querySelector('[data-testid="stock-location-balances"]')
    expect(section).toBeTruthy()
    expect(section?.textContent).toContain('Water Storage')
    expect(section?.textContent).toContain('468')
    expect(section?.textContent).toContain('Bar')
    expect(section?.textContent).toContain('66')
    expect(section?.textContent).toContain('Old Cellar')
    expect(section?.textContent).toContain('Inactive')
    expect(section?.textContent).toContain('Total')
    expect(section?.textContent).toContain('534')
    expect(container.textContent).toContain('Current stock')
    expect(container.textContent).toContain('534')
  })

  it('does not sum balances for the Total row — uses cached currentQuantity', async () => {
    getStockItemLocationBalancesMock.mockResolvedValue([
      {
        workspaceStorageId: 'stor-bar',
        locationKey: 'Bar',
        locationName: 'Bar',
        quantity: 10,
        storageActive: true,
        sortOrder: 0,
      },
    ])
    act(() => {
      root.render(createElement(StockProductHistoryDrawer, {
        item: { ...ITEM, currentQuantity: 999 },
        workspaceId: 'ws-1',
        onClose: () => {},
      }))
    })
    await flush()

    const section = container.querySelector('[data-testid="stock-location-balances"]')
    expect(section?.textContent).toMatch(/Total\s*999/)
    expect(section?.textContent).not.toMatch(/Total\s*10\b/)
  })
})

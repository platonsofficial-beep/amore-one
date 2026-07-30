/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockStorageDetailWorkspace } from './StockStorageDetailWorkspace'

vi.mock('./StockProductHistoryDrawer.jsx', () => ({
  StockProductHistoryDrawer: ({ item, canManage, onClose }) => createElement(
    'div',
    {
      'data-testid': 'stock-product-history-drawer',
      'data-can-manage': String(Boolean(canManage)),
    },
    createElement('span', null, item?.name),
    createElement('button', { type: 'button', onClick: onClose }, 'Close'),
  ),
}))

function makeRow({
  id = 'i1',
  name = 'Vodka',
  category = 'Spirits',
  unit = 'btl',
  active = true,
  quantity = 4,
} = {}) {
  return {
    stockItemId: id,
    name,
    category,
    unit,
    active,
    quantity,
    costPrice: 10,
    lineValue: quantity * 10,
    item: {
      id,
      name,
      category,
      unit,
      active,
      currentQuantity: quantity + 6,
      minimumQuantity: 1,
      status: active ? 'ok' : 'inactive',
    },
  }
}

describe('StockStorageDetailWorkspace', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  function renderWorkspace(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockStorageDetailWorkspace, props))
    })
  }

  it('loads storage-only products, searches, sorts, and opens existing drawer read-only', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      products: [
        makeRow({ id: 'i1', name: 'Vodka', quantity: 4 }),
        makeRow({ id: 'i2', name: 'Gin', category: 'Spirits', quantity: 1, active: false }),
        makeRow({ id: 'i3', name: 'Lime Juice', category: 'Fresh', unit: 'L', quantity: 8 }),
      ],
      summary: {
        productCount: 3,
        totalQuantity: 13,
        nonZeroBalanceCount: 3,
        inventoryValue: 130,
      },
    }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: {
        id: 's-main',
        name: 'Main Storage',
        locationKey: 'Main Storage',
        active: true,
        productCount: 3,
        totalQuantity: 13,
        inventoryValue: 130,
      },
      searchTerm: '',
      loadProducts,
      onBack: vi.fn(),
    })

    expect(container.querySelector('[data-testid="stock-storage-detail-loading"]')).toBeTruthy()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadProducts).toHaveBeenCalledWith('ws-1', 's-main')
    expect(container.textContent).toContain('Main Storage')
    expect(container.textContent).toContain('Products')
    expect(container.textContent).toContain('13')
    expect(container.querySelector('[data-testid="stock-storage-product-list"]')?.textContent)
      .toContain('Vodka')
    expect(container.textContent).toContain('Inactive')
    expect(container.textContent).not.toContain('Receive')
    expect(container.textContent).not.toContain('Transfer')
    expect(container.textContent).not.toContain('Fast Count')
    expect(container.textContent).not.toContain('Adjustment')

    await act(async () => {
      root.render(createElement(StockStorageDetailWorkspace, {
        workspaceId: 'ws-1',
        storage: {
          id: 's-main',
          name: 'Main Storage',
          active: true,
          productCount: 3,
          totalQuantity: 13,
          inventoryValue: 130,
        },
        searchTerm: 'lime',
        loadProducts,
      }))
      await Promise.resolve()
    })

    expect(container.querySelectorAll('[data-stock-item-id]')).toHaveLength(1)
    expect(container.textContent).toContain('Lime Juice')
    expect(container.textContent).not.toContain('Vodka')

    await act(async () => {
      root.render(createElement(StockStorageDetailWorkspace, {
        workspaceId: 'ws-1',
        storage: {
          id: 's-main',
          name: 'Main Storage',
          active: true,
          productCount: 3,
          totalQuantity: 13,
          inventoryValue: 130,
        },
        searchTerm: '',
        loadProducts,
      }))
      await Promise.resolve()
    })

    await act(async () => {
      const select = container.querySelector('select[aria-label="Sort storage products"]')
      select.value = 'qty-desc'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const names = [...container.querySelectorAll('.stock-storage-product-name')]
      .map((node) => node.textContent)
    expect(names[0]).toBe('Lime Juice')
    expect(names.at(-1)).toBe('Gin')

    await act(async () => {
      container.querySelector('[data-stock-item-id="i1"]').click()
    })
    const drawer = container.querySelector('[data-testid="stock-product-history-drawer"]')
    expect(drawer?.textContent).toContain('Vodka')
    expect(drawer?.getAttribute('data-can-manage')).toBe('false')
  })

  it('shows empty and error states without mutation controls', async () => {
    const emptyLoad = vi.fn(async () => ({
      storageId: 's-empty',
      products: [],
      summary: {
        productCount: 0,
        totalQuantity: 0,
        nonZeroBalanceCount: 0,
        inventoryValue: 0,
      },
    }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-empty', name: 'Empty Bay', active: true },
      loadProducts: emptyLoad,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="stock-storage-detail-empty"]')).toBeTruthy()
    expect(container.textContent).toContain('No products in this storage.')

    const failingLoad = vi.fn(async () => {
      throw new Error('Products failed')
    })
    await act(async () => {
      root.render(createElement(StockStorageDetailWorkspace, {
        workspaceId: 'ws-1',
        storage: { id: 's-empty', name: 'Empty Bay', active: true },
        loadProducts: failingLoad,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="stock-storage-detail-error"]')).toBeTruthy()
    expect(container.textContent).toContain('Products failed')
    expect(container.textContent).toContain('Retry')
  })
})

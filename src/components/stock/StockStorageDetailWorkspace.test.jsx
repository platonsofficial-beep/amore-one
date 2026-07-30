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

describe('StockStorageDetailWorkspace — P8.30.3 actions foundation', () => {
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

  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('shows action bar for managers and opens Fast Count placeholder only', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      products: [makeRow()],
      summary: {
        productCount: 1,
        totalQuantity: 4,
        nonZeroBalanceCount: 1,
        inventoryValue: 40,
      },
    }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: {
        id: 's-main',
        name: 'Main Storage',
        locationKey: 'Main Storage',
        active: true,
        productCount: 1,
        totalQuantity: 4,
        inventoryValue: 40,
      },
      canManage: true,
      loadProducts,
    })

    await settle()

    const actionBar = container.querySelector('[data-testid="stock-storage-detail-action-bar"]')
    expect(actionBar).toBeTruthy()
    expect(actionBar.querySelector('[data-storage-action="fast_count"]')).toBeTruthy()
    expect(actionBar.querySelector('[data-storage-action="receive"]')).toBeTruthy()
    expect(actionBar.querySelector('[data-storage-action="transfer"]')).toBeTruthy()
    expect(actionBar.querySelector('[data-storage-action="adjustment"]')).toBeTruthy()

    await act(async () => {
      actionBar.querySelector('[data-storage-action="fast_count"]').click()
    })

    const placeholder = container.querySelector('[data-testid="stock-storage-action-placeholder"]')
    expect(placeholder).toBeTruthy()
    expect(placeholder.getAttribute('data-action')).toBe('fast_count')
    expect(placeholder.textContent).toContain(
      'Fast Count for this storage will be available in the next sprint.',
    )
    expect(container.textContent).not.toContain('Create inventory count')
    expect(container.textContent).not.toContain('Confirm receive')
  })

  it('hides action bar for staff and keeps View Details only in overflow', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      products: [makeRow()],
      summary: {
        productCount: 1,
        totalQuantity: 4,
        nonZeroBalanceCount: 1,
        inventoryValue: 40,
      },
    }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-main', name: 'Main Storage', active: true },
      canManage: false,
      loadProducts,
    })

    await settle()

    expect(container.querySelector('[data-testid="stock-storage-detail-action-bar"]')).toBeNull()

    await act(async () => {
      container.querySelector('[data-storage-product-menu-trigger="true"]').click()
    })

    const menu = container.querySelector('[data-testid="stock-storage-product-menu"]')
    expect(menu).toBeTruthy()
    expect(menu.querySelector('[data-menu-action="view_details"]')).toBeTruthy()
    expect(menu.querySelector('[data-menu-action="receive"]')).toBeNull()
    expect(menu.querySelector('[data-menu-action="fast_count"]')).toBeNull()

    await act(async () => {
      menu.querySelector('[data-menu-action="view_details"]').click()
    })
    expect(container.querySelector('[data-testid="stock-product-history-drawer"]')?.textContent)
      .toContain('Vodka')
  })

  it('opens placeholder architecture from row overflow for deferred actions', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      products: [makeRow({ name: 'Gin' })],
      summary: {
        productCount: 1,
        totalQuantity: 4,
        nonZeroBalanceCount: 1,
        inventoryValue: 40,
      },
    }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-main', name: 'Main Storage', active: true },
      canManage: true,
      loadProducts,
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-product-menu-trigger="true"]').click()
    })
    await act(async () => {
      container.querySelector('[data-menu-action="transfer"]').click()
    })

    const placeholder = container.querySelector('[data-testid="stock-storage-action-placeholder"]')
    expect(placeholder?.getAttribute('data-action')).toBe('transfer')
    expect(placeholder?.textContent).toContain('Transfers for this storage will be available in a later sprint.')
    expect(placeholder?.textContent).toContain('Gin')
  })

  it('disables actions for archived storage and forwards stable callbacks when provided', async () => {
    const onStartFastCount = vi.fn()
    const onReceive = vi.fn()
    const onTransfer = vi.fn()
    const onAdjustment = vi.fn()
    const loadProducts = vi.fn(async () => ({
      storageId: 's-old',
      products: [],
      summary: {
        productCount: 0,
        totalQuantity: 0,
        nonZeroBalanceCount: 0,
        inventoryValue: 0,
      },
    }))

    const storage = {
      id: 's-old',
      name: 'Old Cellar',
      active: false,
    }

    renderWorkspace({
      workspaceId: 'ws-1',
      storage,
      canManage: true,
      loadProducts,
      onStartFastCount,
      onReceive,
      onTransfer,
      onAdjustment,
    })

    await settle()

    const actionBar = container.querySelector('[data-testid="stock-storage-detail-action-bar"]')
    expect(actionBar.querySelector('[data-storage-action="fast_count"]').disabled).toBe(true)
    expect(actionBar.querySelector('[data-storage-action="receive"]').disabled).toBe(true)

    await act(async () => {
      root.render(createElement(StockStorageDetailWorkspace, {
        workspaceId: 'ws-1',
        storage: { ...storage, active: true },
        canManage: true,
        loadProducts,
        onStartFastCount,
        onReceive,
        onTransfer,
        onAdjustment,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector('[data-storage-action="receive"]').click()
      container.querySelector('[data-storage-action="transfer"]').click()
      container.querySelector('[data-storage-action="adjustment"]').click()
      container.querySelector('[data-storage-action="fast_count"]').click()
    })

    expect(onReceive).toHaveBeenCalledWith(expect.objectContaining({ id: 's-old', active: true }))
    expect(onTransfer).toHaveBeenCalledWith(expect.objectContaining({ id: 's-old' }))
    expect(onAdjustment).toHaveBeenCalledWith(expect.objectContaining({ id: 's-old' }))
    expect(onStartFastCount).toHaveBeenCalledWith(expect.objectContaining({ id: 's-old' }))
    expect(container.querySelector('[data-testid="stock-storage-action-placeholder"]')).toBeNull()
  })

  it('preserves empty/error states and product browse behaviour', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      products: [
        makeRow({ id: 'i1', name: 'Vodka', quantity: 4 }),
        makeRow({ id: 'i2', name: 'Lime Juice', category: 'Fresh', unit: 'L', quantity: 8 }),
      ],
      summary: {
        productCount: 2,
        totalQuantity: 12,
        nonZeroBalanceCount: 2,
        inventoryValue: 120,
      },
    }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: {
        id: 's-main',
        name: 'Main Storage',
        active: true,
        productCount: 2,
        totalQuantity: 12,
        inventoryValue: 120,
      },
      searchTerm: 'lime',
      canManage: true,
      loadProducts,
    })

    await settle()
    expect(container.querySelectorAll('[data-stock-item-id]')).toHaveLength(1)
    expect(container.textContent).toContain('Lime Juice')

    const failingLoad = vi.fn(async () => {
      throw new Error('Products failed')
    })
    await act(async () => {
      root.render(createElement(StockStorageDetailWorkspace, {
        workspaceId: 'ws-1',
        storage: { id: 's-main', name: 'Main Storage', active: true },
        canManage: true,
        loadProducts: failingLoad,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="stock-storage-detail-error"]')).toBeTruthy()
    expect(container.textContent).toContain('Retry')
  })
})

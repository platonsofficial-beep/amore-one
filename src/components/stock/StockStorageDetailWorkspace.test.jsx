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
  quantityVersion = 1,
} = {}) {
  return {
    stockItemId: id,
    name,
    category,
    unit,
    active,
    quantity,
    quantityVersion,
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

describe('StockStorageDetailWorkspace — actions + Fast Count launch', () => {
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

  it('launches a normal Inventory Count for one storage and opens Active Count', async () => {
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
    let resolveStart
    const startFastCountSession = vi.fn(() => new Promise((resolve) => {
      resolveStart = resolve
    }))
    const onOpenActiveCountSession = vi.fn()

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
      startFastCountSession,
      onOpenActiveCountSession,
    })

    await settle()

    const actionBar = container.querySelector('[data-testid="stock-storage-detail-action-bar"]')
    expect(actionBar).toBeTruthy()
    expect(actionBar.querySelector('[data-storage-action="fast_count"]')).toBeTruthy()
    expect(actionBar.querySelector('[data-storage-action="receive"]')).toBeTruthy()

    await act(async () => {
      actionBar.querySelector('[data-storage-action="fast_count"]').click()
    })

    expect(container.querySelector('[data-testid="stock-storage-fast-count-loading"]')).toBeTruthy()
    expect(actionBar.querySelector('[data-storage-action="fast_count"]').textContent).toContain('Starting')

    await act(async () => {
      resolveStart({
        session: { id: 'sess-fast-1', status: 'in_progress' },
        snapshot: { sessionId: 'sess-fast-1', itemsCreated: 2 },
        locationKey: 'Main Storage',
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(startFastCountSession).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      storage: expect.objectContaining({
        id: 's-main',
        locationKey: 'Main Storage',
      }),
    })
    expect(onOpenActiveCountSession).toHaveBeenCalledWith('sess-fast-1')
    expect(container.querySelector('[data-testid="stock-storage-action-placeholder"]')).toBeNull()
    expect(container.textContent).not.toContain('Fast Count for this storage will be available')
    expect(container.textContent).not.toContain('Confirm receive')
  })

  it('shows Fast Count launch errors without creating a second count engine', async () => {
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
    const startFastCountSession = vi.fn(async () => {
      throw new Error('Select at least one location for this inventory count.')
    })

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: {
        id: 's-main',
        name: 'Main Storage',
        locationKey: 'Main Storage',
        active: true,
      },
      canManage: true,
      loadProducts,
      startFastCountSession,
      onOpenActiveCountSession: vi.fn(),
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-action="fast_count"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(container.querySelector('[data-testid="stock-storage-fast-count-error"]')?.textContent)
      .toContain('Select at least one location')
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

  it('opens Storage Receive into existing movement modal with destination locked', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      products: [makeRow({ id: 'i1', name: 'Vodka', quantityVersion: 3 })],
      summary: {
        productCount: 1,
        totalQuantity: 4,
        nonZeroBalanceCount: 1,
        inventoryValue: 40,
      },
    }))
    const onRecordReceive = vi.fn(async () => {})

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: {
        id: 'stor-main',
        name: 'Main Storage',
        locationKey: 'Main Storage',
        active: true,
      },
      canManage: true,
      loadProducts,
      onRecordReceive,
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-action="receive"]').click()
    })

    expect(container.querySelector('[data-testid="stock-storage-receive-product-picker"]')).toBeTruthy()
    expect(container.textContent).toContain('Destination: Main Storage')

    await act(async () => {
      container
        .querySelector('[data-testid="stock-storage-receive-product-picker"] [data-stock-item-id="i1"]')
        .click()
    })

    expect(container.querySelector('[data-testid="stock-movement-modal"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-receive-destination-lock"]')?.textContent)
      .toContain('Main Storage')
    expect(container.querySelector('[data-testid="stock-receive-destination-lock"]')?.textContent)
      .toContain('Locked to this storage')
    expect(container.textContent).toContain('Receive stock')
    expect(container.textContent).toContain('Vodka')

    const quantityInput = container.querySelector('[data-testid="stock-movement-modal"] input[type="number"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(quantityInput, '2')
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onRecordReceive).toHaveBeenCalledWith(expect.objectContaining({
      type: 'receive',
      quantity: 2,
      workspaceStorageId: 'stor-main',
      expectedQuantityVersion: 3,
      item: expect.objectContaining({ id: 'i1', name: 'Vodka' }),
    }))
  })

  it('opens receive modal directly from product row overflow', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      products: [makeRow({ name: 'Gin', quantityVersion: 2 })],
      summary: {
        productCount: 1,
        totalQuantity: 4,
        nonZeroBalanceCount: 1,
        inventoryValue: 40,
      },
    }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 'stor-main', name: 'Main Storage', active: true },
      canManage: true,
      loadProducts,
      onRecordReceive: vi.fn(async () => {}),
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-product-menu-trigger="true"]').click()
    })
    await act(async () => {
      container.querySelector('[data-menu-action="receive"]').click()
    })

    expect(container.querySelector('[data-testid="stock-storage-receive-product-picker"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-movement-modal"]')?.textContent).toContain('Gin')
    expect(container.querySelector('[data-testid="stock-receive-destination-lock"]')).toBeTruthy()
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

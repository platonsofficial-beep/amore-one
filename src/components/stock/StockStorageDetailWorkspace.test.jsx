/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockStorageDetailWorkspace } from './StockStorageDetailWorkspace'

vi.mock('../../services/inventoryCountService', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listInventoryCountHomeSessions: vi.fn(async () => ({ active: [], paused: [], recent: [] })),
  }
})

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

vi.mock('../../services/workspaceStorageService', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listWorkspaceStorages: vi.fn(async () => ([
      { id: 'stor-main', name: 'Main Storage', locationKey: 'Main Storage', active: true },
      { id: 'stor-bar', name: 'Bar', locationKey: 'Bar', active: true },
      { id: 'stor-freezer', name: 'Freezer', locationKey: 'Freezer', active: true },
      { id: 'stor-old', name: 'Old Cellar', locationKey: 'Old Cellar', active: false },
    ])),
  }
})

vi.mock('../../services/stockLocationBalanceService', () => ({
  getStockItemLocationBalances: vi.fn(async () => ([
    { workspaceStorageId: 'stor-bar', quantityVersion: 7, quantity: 1 },
  ])),
}))

import { listWorkspaceStorages } from '../../services/workspaceStorageService'
import { getStockItemLocationBalances } from '../../services/stockLocationBalanceService'

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
    listWorkspaceStorages.mockClear()
    getStockItemLocationBalances.mockClear()
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
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="stock-fast-count-confirm"]')?.textContent)
      .toContain('Start a fast count for Main Storage?')
    expect(startFastCountSession).not.toHaveBeenCalled()

    await act(async () => {
      container.querySelector('[data-testid="stock-fast-count-confirm-start"]').click()
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

  it('resumes an open count for this storage without a confirm step', async () => {
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
    const startFastCountSession = vi.fn()
    const onOpenActiveCountSession = vi.fn()

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
      onOpenActiveCountSession,
      loadCountHome: async () => ({
        active: [{
          id: 'open-main',
          status: 'in_progress',
          startedAt: '2026-10-26T10:00:00.000Z',
          locations: ['Main Storage'],
        }],
        paused: [],
        recent: [],
      }),
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-action="fast_count"]').click()
      await Promise.resolve()
    })

    expect(startFastCountSession).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="stock-fast-count-confirm"]')).toBeNull()
    expect(onOpenActiveCountSession).toHaveBeenCalledWith('open-main')
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
    await act(async () => {
      container.querySelector('[data-testid="stock-fast-count-confirm-start"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(container.querySelector('[data-testid="stock-storage-fast-count-error"]')?.textContent)
      .toContain('Select at least one location')
  })

  it('shows a shelf count for staff and keeps manager stock actions hidden', async () => {
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
      role: 'staff',
      canManage: false,
      loadProducts,
    })

    await settle()

    expect(container.querySelector('[data-storage-action="staff_count"]')?.textContent).toBe('Count shelf')
    expect(container.querySelector('[data-storage-action="receive"]')).toBeNull()
    expect(container.querySelector('[data-storage-action="fast_count"]')).toBeNull()

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

  it('opens Storage Transfer picker then modal with locked source and active destinations only', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 'stor-main',
      products: [makeRow({ id: 'i1', name: 'Vodka', quantity: 5, quantityVersion: 2 })],
      summary: {
        productCount: 1,
        totalQuantity: 5,
        nonZeroBalanceCount: 1,
        inventoryValue: 50,
      },
    }))
    const onRecordTransfer = vi.fn(async () => {})

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
      onRecordTransfer,
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-action="transfer"]').click()
    })

    expect(container.querySelector('[data-testid="stock-storage-transfer-product-picker"]')).toBeTruthy()
    expect(container.textContent).toContain('Source: Main Storage')

    await act(async () => {
      container
        .querySelector('[data-testid="stock-storage-transfer-product-picker"] [data-stock-item-id="i1"]')
        .click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(listWorkspaceStorages).toHaveBeenCalledWith('ws-1')
    expect(container.querySelector('[data-testid="stock-transfer-modal"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-transfer-source-lock"]')?.textContent)
      .toContain('Locked')

    const select = container.querySelector('[data-testid="stock-transfer-destination-select"]')
    const options = [...select.querySelectorAll('option')].filter((option) => option.value)
    const optionValues = options.map((option) => option.value)
    const optionLabels = options.map((option) => option.textContent)
    expect(optionValues).toContain('stor-bar')
    expect(optionValues).toContain('stor-freezer')
    expect(optionValues).not.toContain('stor-main')
    expect(optionValues).not.toContain('stor-old')
    expect(optionLabels).toContain('Bar')
    expect(optionLabels).toContain('Freezer (New)')
    expect(getStockItemLocationBalances).toHaveBeenCalledWith('ws-1', 'i1')

    await act(async () => {
      select.value = 'stor-bar'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    const quantityInput = container.querySelector('[data-testid="stock-transfer-modal"] input[type="number"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(quantityInput, '2')
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      container.querySelector('[data-testid="stock-transfer-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onRecordTransfer).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 2,
      sourceWorkspaceStorageId: 'stor-main',
      destinationWorkspaceStorageId: 'stor-bar',
      expectedSourceQuantityVersion: 2,
      expectedDestinationQuantityVersion: 7,
      item: expect.objectContaining({ id: 'i1', name: 'Vodka' }),
    }))
  })

  it('submits destination version 1 and shows helper when destination has no balance', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 'stor-main',
      products: [makeRow({ id: 'i1', name: 'Vodka', quantity: 5, quantityVersion: 2 })],
      summary: {
        productCount: 1,
        totalQuantity: 5,
        nonZeroBalanceCount: 1,
        inventoryValue: 50,
      },
    }))
    const onRecordTransfer = vi.fn(async () => {})

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
      onRecordTransfer,
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-action="transfer"]').click()
    })
    await act(async () => {
      container
        .querySelector('[data-testid="stock-storage-transfer-product-picker"] [data-stock-item-id="i1"]')
        .click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    const select = container.querySelector('[data-testid="stock-transfer-destination-select"]')
    await act(async () => {
      select.value = 'stor-freezer'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="stock-transfer-new-destination-hint"]')?.textContent)
      .toContain('automatically create its inventory balance')
    expect(container.querySelector('[data-testid="stock-transfer-submit"]')?.disabled).toBe(false)

    const quantityInput = container.querySelector('[data-testid="stock-transfer-modal"] input[type="number"]')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(quantityInput, '1')
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      container.querySelector('[data-testid="stock-transfer-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onRecordTransfer).toHaveBeenCalledWith(expect.objectContaining({
      destinationWorkspaceStorageId: 'stor-freezer',
      expectedDestinationQuantityVersion: 1,
      expectedSourceQuantityVersion: 2,
      quantity: 1,
    }))
  })

  it('launches transfer modal from row menu with source locked', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 'stor-main',
      products: [makeRow({ id: 'i1', name: 'Gin', quantity: 4, quantityVersion: 3 })],
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
      onRecordTransfer: vi.fn(async () => {}),
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-product-menu-trigger="true"]').click()
    })
    await act(async () => {
      container.querySelector('[data-menu-action="transfer"]').click()
    })
    await settle()

    expect(container.querySelector('[data-testid="stock-transfer-modal"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-transfer-source-lock"]')?.textContent)
      .toContain('Main Storage')
    expect(container.textContent).toContain('Gin')
    expect(container.querySelector('[data-testid="stock-storage-action-placeholder"]')).toBeNull()
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

  it('opens Storage Adjustment picker then locked shared modal with mandatory reason', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 'stor-main',
      products: [makeRow({ id: 'i1', name: 'Vodka', quantity: 5, quantityVersion: 4 })],
      summary: {
        productCount: 1,
        totalQuantity: 5,
        nonZeroBalanceCount: 1,
        inventoryValue: 50,
      },
    }))
    const onRecordAdjustment = vi.fn(async () => {})

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
      onRecordAdjustment,
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-action="adjustment"]').click()
    })

    expect(container.querySelector('[data-testid="stock-storage-adjustment-product-picker"]')).toBeTruthy()
    expect(container.textContent).toContain('Storage: Main Storage')

    await act(async () => {
      container
        .querySelector('[data-testid="stock-storage-adjustment-product-picker"] [data-stock-item-id="i1"]')
        .click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await settle()

    expect(container.querySelector('[data-testid="stock-movement-modal"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-storage-lock"]')?.textContent)
      .toContain('Locked')
    expect(container.querySelector('[data-testid="stock-adjustment-operation"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-reason-select"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-storage-action-placeholder"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-adjustment-submit"]')?.textContent)
      .toContain('Apply Adjustment')

    const quantityInput = container.querySelector('[data-testid="stock-adjustment-quantity"]')
    await act(async () => {
      container.querySelector('[data-testid="stock-adjustment-operation-remove"]').click()
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(quantityInput, '1')
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="stock-adjustment-preview"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-adjustment-preview"]')?.textContent)
      .toContain('Remove')

    await act(async () => {
      container.querySelector('[data-testid="stock-movement-modal"] form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onRecordAdjustment).toHaveBeenCalledWith(expect.objectContaining({
      type: 'adjustment',
      quantity: -1,
      note: '',
      workspaceStorageId: 'stor-main',
      expectedQuantityVersion: 4,
      item: expect.objectContaining({ id: 'i1', name: 'Vodka' }),
    }))
  })

  it('launches adjustment modal from row menu with storage locked', async () => {
    const loadProducts = vi.fn(async () => ({
      storageId: 'stor-main',
      products: [makeRow({ id: 'i1', name: 'Gin', quantity: 4, quantityVersion: 2 })],
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
      onRecordAdjustment: vi.fn(async () => {}),
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-product-menu-trigger="true"]').click()
    })
    await act(async () => {
      container.querySelector('[data-menu-action="adjustment"]').click()
    })

    expect(container.querySelector('[data-testid="stock-storage-adjustment-product-picker"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-movement-modal"]')?.textContent).toContain('Gin')
    expect(container.querySelector('[data-testid="stock-adjustment-storage-lock"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="stock-storage-action-placeholder"]')).toBeNull()
  })

  it('does not open placeholder for Adjustment when launch path is live', async () => {
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
      onRecordAdjustment: vi.fn(async () => {}),
    })

    await settle()

    await act(async () => {
      container.querySelector('[data-storage-action="adjustment"]').click()
    })

    expect(container.querySelector('[data-testid="stock-storage-action-placeholder"]')).toBeNull()
    expect(container.querySelector('[data-testid="stock-storage-adjustment-product-picker"]')).toBeTruthy()
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
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector('[data-testid="stock-fast-count-confirm-start"]').click()
      await Promise.resolve()
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

  it('edits per-shelf par without using the catalog par, and staff cannot write it', async () => {
    const products = [
      {
        ...makeRow({ id: 'cola', name: 'Cola', quantity: 9, quantityVersion: 2 }),
        parQuantity: 10,
        shortQuantity: 1,
        item: {
          ...makeRow({ id: 'cola', name: 'Cola', quantity: 9 }).item,
          minimumQuantity: 2,
          targetQuantity: 20,
        },
      },
      {
        ...makeRow({ id: 'gin', name: 'Gin', quantity: 4, quantityVersion: 1 }),
        parQuantity: null,
        shortQuantity: null,
        item: {
          ...makeRow({ id: 'gin', name: 'Gin', quantity: 4 }).item,
          minimumQuantity: 8,
          targetQuantity: 8,
        },
      },
    ]
    const loadProducts = vi.fn(async () => ({
      storageId: 's-main',
      parsAvailable: true,
      products,
      summary: {
        productCount: 2,
        totalQuantity: 13,
        nonZeroBalanceCount: 2,
        inventoryValue: 0,
      },
    }))
    const saveStoragePar = vi.fn(async () => ({ parQuantity: 6 }))
    const clearStoragePar = vi.fn(async () => ({ parQuantity: null }))

    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-main', name: 'Soft drinks', active: true },
      canManage: true,
      loadProducts,
      saveStoragePar,
      clearStoragePar,
    })
    await settle()

    expect(container.querySelector('[data-testid="storage-par-note"]')?.textContent)
      .toMatch(/not tracked on this shelf/)
    expect(container.textContent).toContain('On hand')
    expect(container.textContent).toContain('Short')
    const cola = container.querySelector('[data-stock-item-id="cola"]')
    const gin = container.querySelector('[data-stock-item-id="gin"]')
    expect(cola?.textContent).toContain('Short')
    expect(gin?.querySelector('[data-storage-par-input="true"]')?.value).toBe('')
    expect(gin?.textContent).toContain('—')

    await act(async () => {
      container.querySelector('[data-action="filter-below-par"]').click()
    })
    const visibleCola = container.querySelector('[data-stock-item-id="cola"]')
    expect(visibleCola).toBeTruthy()
    expect(container.querySelector('[data-stock-item-id="gin"]')).toBeNull()

    const input = visibleCola.querySelector('[data-storage-par-input="true"]')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '6')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveStoragePar).toHaveBeenCalledWith('ws-1', 'cola', 's-main', 6)

    await act(async () => {
      container.querySelector('[data-action="filter-below-par"]').click()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Cola')
    expect(container.textContent).toContain('Gin')

    await act(async () => {
      root.render(createElement(StockStorageDetailWorkspace, {
        workspaceId: 'ws-1',
        storage: { id: 's-main', name: 'Soft drinks', active: true },
        canManage: false,
        loadProducts,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-storage-par-input="true"]')).toBeNull()
    expect(container.querySelector('[data-action="clear-par"]')).toBeNull()
    expect(container.textContent).toContain('Per-shelf par')
    expect(container.textContent).toContain('Cola')
  })

  it('saves a par of 0, shows no short, and moves Enter to the next par', async () => {
    const products = [
      {
        ...makeRow({ id: 'cola', name: 'Cola', unit: 'Piece', quantity: 4 }),
        parQuantity: null,
        shortQuantity: null,
      },
      {
        ...makeRow({ id: 'gin', name: 'Gin', unit: 'Piece', quantity: 2 }),
        parQuantity: 3,
        shortQuantity: 1,
      },
    ]
    const saveStoragePar = vi.fn(async () => ({ parQuantity: null }))
    const clearStoragePar = vi.fn(async () => ({ parQuantity: null }))
    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-main', name: 'Soft drinks', active: true },
      canManage: true,
      loadProducts: async () => ({
        storageId: 's-main',
        parsAvailable: true,
        products,
        summary: {
          productCount: 2,
          totalQuantity: 6,
          nonZeroBalanceCount: 2,
          inventoryValue: 0,
        },
      }),
      saveStoragePar,
      clearStoragePar,
    })
    await settle()

    const colaInput = container.querySelector('[data-par-item-id="cola"]')
    const ginInput = container.querySelector('[data-par-item-id="gin"]')
    expect(colaInput).toBeTruthy()
    expect(ginInput.value).toBe('3')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(colaInput, '0')
      colaInput.dispatchEvent(new Event('input', { bubbles: true }))
      colaInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      colaInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveStoragePar).toHaveBeenCalledTimes(1)
    expect(saveStoragePar).toHaveBeenCalledWith('ws-1', 'cola', 's-main', 0)
    expect(clearStoragePar).not.toHaveBeenCalled()
    const savedCola = container.querySelector('[data-par-item-id="cola"]')
    expect(savedCola.value).toBe('0')
    expect(savedCola.getAttribute('placeholder')).toBe('Not tracked')
    expect(container.querySelector('[data-stock-item-id="cola"] [data-testid="storage-par-short"]')?.textContent)
      .toBe('—')
    expect(container.querySelector('[data-stock-item-id="cola"]')?.textContent).not.toContain('0 Pieces')
    expect(document.activeElement).toBe(container.querySelector('[data-par-item-id="gin"]'))
  })

  it('keeps on hand visible when shelf pars are not available yet', async () => {
    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-main', name: 'Main Storage', active: true },
      canManage: true,
      loadProducts: async () => ({
        storageId: 's-main',
        parsAvailable: false,
        products: [makeRow({ id: 'i1', name: 'Vodka', quantity: 4 })],
        summary: {
          productCount: 1,
          totalQuantity: 4,
          nonZeroBalanceCount: 1,
          inventoryValue: 40,
        },
      }),
    })
    await settle()
    expect(container.querySelector('[data-testid="storage-pars-unavailable"]')?.textContent)
      .toMatch(/On hand still shows/)
    expect(container.textContent).toContain('Vodka')
    expect(container.querySelector('[data-storage-par-input="true"]')).toBeNull()
    expect(container.querySelector('[data-action="filter-below-par"]')).toBeNull()
  })

  it('lets a manager open refill and keeps the action off a supply storage', async () => {
    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-bar', name: 'Back bar', active: true, isSupply: false },
      canManage: true,
      loadProducts: async () => ({
        storageId: 's-bar',
        parsAvailable: true,
        products: [],
        summary: { productCount: 0, totalQuantity: 0, nonZeroBalanceCount: 0, inventoryValue: 0 },
      }),
    })
    await settle()
    const open = container.querySelector('[data-testid="supply-refill-open"]')
    expect(open?.textContent).toContain('Από τροφοδοσία')
    expect(open.disabled).toBe(false)
    await act(async () => {
      open.click()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="supply-refill-sheet"]')).toBeTruthy()

    await act(async () => {
      root.render(createElement(StockStorageDetailWorkspace, {
        workspaceId: 'ws-1',
        storage: { id: 's-soft', name: 'Soft drinks', active: true, isSupply: true },
        canManage: true,
        loadProducts: async () => ({
          storageId: 's-soft',
          parsAvailable: true,
          products: [],
          summary: { productCount: 0, totalQuantity: 0, nonZeroBalanceCount: 0, inventoryValue: 0 },
        }),
      }))
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="supply-refill-open"]')).toBeNull()
  })

  it('disables refill for staff and does not show cost', async () => {
    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-bar', name: 'Back bar', active: true, isSupply: false },
      canManage: false,
      loadProducts: async () => ({
        storageId: 's-bar',
        parsAvailable: true,
        products: [makeRow({ id: 'cola', name: 'Cola', quantity: 1, costPrice: 12 })],
        summary: { productCount: 1, totalQuantity: 1, nonZeroBalanceCount: 1, inventoryValue: 12 },
      }),
    })
    await settle()
    const open = container.querySelector('[data-testid="supply-refill-open"]')
    expect(open.disabled).toBe(true)
    expect(container.querySelector('[data-testid="supply-refill-staff-note"]')?.textContent)
      .toMatch(/limited to managers/)
    expect(container.querySelector('[data-testid="supply-refill-sheet"]')).toBeNull()
    expect(container.textContent).not.toContain('Inventory value')
    expect(container.textContent).not.toContain('12')
  })

  it('lets staff open take from supply when the staff function is available', async () => {
    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-bar', name: 'Back bar', active: true, isSupply: false },
      role: 'staff',
      canManage: false,
      staffTakeAvailable: async () => true,
      loadProducts: async () => ({
        storageId: 's-bar',
        parsAvailable: true,
        products: [],
        summary: { productCount: 0, totalQuantity: 0, nonZeroBalanceCount: 0, inventoryValue: 0 },
      }),
    })
    await settle()
    const open = container.querySelector('[data-testid="supply-refill-open"]')
    expect(open.disabled).toBe(false)
    expect(container.querySelector('[data-testid="supply-refill-staff-note"]')).toBeNull()
    expect(container.querySelector('[data-storage-action="staff_count"]')?.textContent).toBe('Count shelf')
    expect(container.querySelector('[data-storage-action="receive"]')).toBeNull()
  })

  it('hides the staff shelf count from host even when stock management is off', async () => {
    renderWorkspace({
      workspaceId: 'ws-1',
      storage: { id: 's-bar', name: 'Back bar', active: true, isSupply: false },
      role: 'host',
      canManage: false,
      loadProducts: async () => ({
        storageId: 's-bar',
        products: [makeRow()],
        summary: { productCount: 1, totalQuantity: 4, nonZeroBalanceCount: 1, inventoryValue: 40 },
      }),
    })
    await settle()
    expect(container.querySelector('[data-storage-action="staff_count"]')).toBeNull()
    expect(container.querySelector('[data-testid="staff-shelf-count-sheet"]')).toBeNull()
    expect(container.querySelector('[data-storage-action="receive"]')).toBeNull()
    expect(container.querySelector('[data-storage-action="fast_count"]')).toBeNull()
  })
})

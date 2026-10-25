/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STOCK_SECTIONS, getModuleTitle, getSearchPlaceholder } from '../../lib/appNavigation'
import { StockStorageCenter } from './StockStorageCenter'

vi.mock('./StockProductHistoryDrawer.jsx', () => ({
  StockProductHistoryDrawer: ({ item, onClose }) => createElement(
    'div',
    { 'data-testid': 'stock-product-history-drawer' },
    createElement('span', null, item?.name),
    createElement('button', { type: 'button', onClick: onClose }, 'Close'),
  ),
}))

vi.mock('../../services/stockStorageCenterService', async () => {
  const actual = await vi.importActual('../../services/stockStorageCenterService')
  return {
    ...actual,
    getWorkspaceStorageProducts: vi.fn(),
  }
})

vi.mock('../../services/stockStorageFastCountService', () => ({
  startStorageFastCountSession: vi.fn(),
}))

import { getWorkspaceStorageProducts } from '../../services/stockStorageCenterService'
import { startStorageFastCountSession } from '../../services/stockStorageFastCountService'

describe('StockStorageCenter navigation contract', () => {
  it('registers Storages in Stock sections after Inventory Count', () => {
    expect(STOCK_SECTIONS.map((section) => section.id)).toEqual([
      'dashboard',
      'count',
      'storages',
      'inventory',
      'suppliers',
      'orders',
      'migration',
    ])
    expect(STOCK_SECTIONS.find((section) => section.id === 'storages')).toEqual({
      id: 'storages',
      label: 'Storages',
    })
    expect(getModuleTitle('stock', { stockSection: 'storages' })).toBe('Storages')
    expect(getSearchPlaceholder('stock', { stockSection: 'storages' })).toBe('Search storages or products')
  })

  it('mounts StockStorageCenter from the Stock workspace section switch with searchTerm', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
    expect(appSource).toContain("import { StockStorageCenter } from './components/stock/StockStorageCenter'")
    expect(appSource).toContain("stockSection === 'storages'")
    expect(appSource).toContain('<StockStorageCenter')
    expect(appSource).toContain('searchTerm={searchTerm}')
    expect(appSource).toContain('canManage={canManageStockRole}')
    expect(appSource).toContain('onOpenActiveCountSession={handleOpenInventoryCountSession}')
    expect(appSource).toContain('onRecordReceive={handleRecordStockMovement}')
    expect(appSource).toContain('onRecordTransfer={handleRecordStockTransfer}')
    expect(appSource).toContain('onRecordAdjustment={handleRecordStockMovement}')
    expect(appSource).toContain('isSavingAdjustment={isSavingStockItem}')
    expect(appSource).toContain('handleOpenInventoryCountSession')
    expect(appSource).toContain("stockSection === 'dashboard'")
    expect(appSource).toContain("stockSection === 'count'")
    expect(appSource).toContain("stockSection === 'suppliers'")
    expect(appSource).toContain("stockSection === 'orders'")
    expect(appSource).toContain("stockSection === 'migration'")
  })
})

describe('StockStorageCenter UI', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
    getWorkspaceStorageProducts.mockReset()
    startStorageFastCountSession.mockReset()
  })

  function renderCenter(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockStorageCenter, props))
    })
  }

  it('renders loading, empty, error, active/archived cards, and opens products workspace', async () => {
    let resolveLoad
    const loadSummaries = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve
    }))

    getWorkspaceStorageProducts.mockResolvedValue({
      storageId: 's-main',
      products: [
        {
          stockItemId: 'i1',
          name: 'Vodka',
          category: 'Spirits',
          unit: 'btl',
          active: true,
          quantity: 4,
          costPrice: 10,
          lineValue: 40,
          item: {
            id: 'i1',
            name: 'Vodka',
            category: 'Spirits',
            unit: 'btl',
            active: true,
            currentQuantity: 10,
            minimumQuantity: 2,
            status: 'ok',
          },
        },
      ],
      summary: {
        productCount: 1,
        totalQuantity: 4,
        nonZeroBalanceCount: 1,
        inventoryValue: 40,
      },
    })
    startStorageFastCountSession.mockResolvedValue({
      session: { id: 'sess-fast-1', status: 'in_progress' },
      snapshot: { sessionId: 'sess-fast-1', itemsCreated: 1 },
      locationKey: 'Main Storage',
    })

    const onOpenActiveCountSession = vi.fn()

    renderCenter({
      workspaceId: 'ws-1',
      loadSummaries,
      canManage: true,
      onOpenActiveCountSession,
    })
    expect(container.querySelector('[data-testid="stock-storage-center-loading"]')).toBeTruthy()

    await act(async () => {
      resolveLoad({
        storages: [
          {
            id: 's-main',
            name: 'Main Storage',
            locationKey: 'Main Storage',
            active: true,
            status: 'active',
            productCount: 2,
            totalQuantity: 12,
            nonZeroBalanceCount: 1,
            inventoryValue: 40,
          },
          {
            id: 's-old',
            name: 'Old Cellar',
            locationKey: 'Old Cellar',
            active: false,
            status: 'archived',
            productCount: 1,
            totalQuantity: 2,
            nonZeroBalanceCount: 1,
            inventoryValue: 8,
          },
        ],
        activeStorages: [{
          id: 's-main',
          name: 'Main Storage',
          locationKey: 'Main Storage',
          active: true,
          status: 'active',
          productCount: 2,
          totalQuantity: 12,
          nonZeroBalanceCount: 1,
          inventoryValue: 40,
        }],
        archivedStorages: [{
          id: 's-old',
          name: 'Old Cellar',
          locationKey: 'Old Cellar',
          active: false,
          status: 'archived',
          productCount: 1,
          totalQuantity: 2,
          nonZeroBalanceCount: 1,
          inventoryValue: 8,
        }],
        summary: {
          activeStorageCount: 1,
          archivedStorageCount: 1,
          totalProductsWithBalances: 3,
          totalQuantity: 14,
        },
      })
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Storages')
    expect(container.textContent).toContain('Main Storage')
    expect(container.textContent).toContain('Old Cellar')
    expect(container.textContent).toContain('Archived')
    expect(container.textContent).not.toContain('Create storage')
    expect(container.querySelector('button[data-action="archive"]')).toBeNull()
    expect(container.querySelector('button[data-action="create"]')).toBeNull()

    await act(async () => {
      container.querySelector('[data-storage-id="s-main"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="stock-storage-detail-workspace"]')).toBeTruthy()
    expect(getWorkspaceStorageProducts).toHaveBeenCalledWith('ws-1', 's-main')
    expect(container.textContent).toContain('Main Storage')
    expect(container.textContent).toContain('Vodka')
    expect(container.textContent).toContain('Spirits')
    expect(container.textContent).toContain('← Storages')
    expect(container.querySelector('[data-testid="stock-storage-detail-action-bar"]')).toBeTruthy()
    expect(container.textContent).not.toContain('Create storage')
    expect(container.textContent).not.toContain('Confirm Finish')
    expect(container.querySelector('button[data-action="archive"]')).toBeNull()

    await act(async () => {
      container.querySelector('[data-storage-action="fast_count"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(startStorageFastCountSession).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      storage: expect.objectContaining({
        id: 's-main',
        locationKey: 'Main Storage',
      }),
    })
    expect(onOpenActiveCountSession).toHaveBeenCalledWith('sess-fast-1')
    expect(container.querySelector('[data-testid="stock-storage-action-placeholder"]')).toBeNull()

    await act(async () => {
      container.querySelector('[data-stock-item-id="i1"] .stock-storage-product-row').click()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="stock-product-history-drawer"]')?.textContent)
      .toContain('Vodka')

    const emptyLoad = vi.fn(async () => ({
      storages: [],
      activeStorages: [],
      archivedStorages: [],
      summary: {
        activeStorageCount: 0,
        archivedStorageCount: 0,
        totalProductsWithBalances: 0,
        totalQuantity: 0,
      },
    }))
    await act(async () => {
      root.render(createElement(StockStorageCenter, {
        workspaceId: 'ws-1',
        loadSummaries: emptyLoad,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="stock-storage-center-empty"]')).toBeTruthy()
    expect(container.textContent).toContain('No storages yet.')

    const failingLoad = vi.fn(async () => {
      throw new Error('Read failed')
    })
    await act(async () => {
      root.render(createElement(StockStorageCenter, {
        workspaceId: 'ws-1',
        loadSummaries: failingLoad,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="stock-storage-center-error"]')).toBeTruthy()
    expect(container.textContent).toContain('Read failed')
    expect(container.textContent).toContain('Retry')
  })

  it('groups storages by department, marks many supply storages, and lets a manager edit', async () => {
    const storages = [
      {
        id: 'soft',
        name: 'Soft drinks',
        locationKey: 'Soft drinks',
        active: true,
        status: 'active',
        departmentId: null,
        isSupply: true,
        productCount: 1,
        totalQuantity: 9,
        nonZeroBalanceCount: 1,
        inventoryValue: 18,
      },
      {
        id: 'spirits',
        name: 'Spirits',
        locationKey: 'Spirits',
        active: true,
        status: 'active',
        departmentId: 'd-bar',
        isSupply: true,
        productCount: 1,
        totalQuantity: 4,
        nonZeroBalanceCount: 1,
        inventoryValue: 40,
      },
      {
        id: 'back',
        name: 'Back bar',
        locationKey: 'Back bar',
        active: true,
        status: 'active',
        departmentId: 'd-bar',
        isSupply: false,
        productCount: 1,
        totalQuantity: 1,
        nonZeroBalanceCount: 1,
        inventoryValue: 2,
      },
    ]
    const payload = {
      storages,
      activeStorages: storages,
      archivedStorages: [],
      departmentsAvailable: true,
      summary: {
        activeStorageCount: 3,
        archivedStorageCount: 0,
        totalProductsWithBalances: 2,
        totalQuantity: 14,
      },
    }
    const departments = {
      available: true,
      departments: [
        { id: 'd-bar', name: 'Bar', active: true, sortOrder: 0 },
        { id: 'd-kitchen', name: 'Kitchen', active: true, sortOrder: 1 },
      ],
    }
    const loadSummaries = vi.fn(async () => payload)
    const loadDepartments = vi.fn(async () => departments)
    const departmentActions = {
      createDepartment: vi.fn(async () => ({ id: 'd-new', name: 'Floor' })),
      renameDepartment: vi.fn(async () => ({ id: 'd-bar', name: 'Service bar' })),
      setDepartmentActive: vi.fn(async () => ({ id: 'd-bar', active: false })),
      assignStorageDepartment: vi.fn(async () => ({ id: 'soft', departmentId: 'd-bar' })),
      setStorageSupply: vi.fn(async () => ({ id: 'back', isSupply: true })),
    }

    renderCenter({
      workspaceId: 'ws-1',
      canManage: true,
      loadSummaries,
      loadDepartments,
      departmentActions,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Bar')
    expect(container.textContent).toContain('Kitchen')
    expect(container.textContent).toContain('Unassigned')
    expect(container.textContent).toContain('Soft drinks')
    expect(container.textContent).toContain('Spirits')
    expect(container.textContent).toContain('Back bar')
    expect(container.querySelector('[data-testid="supply-storage-pill"]')?.textContent).toBe('Supply')
    expect(container.querySelector('[data-testid="supply-storage-pill"]')?.getAttribute('title'))
      .toContain('Αποθήκη τροφοδοσίας')
    expect(container.textContent).toContain('Mark as supply')
    expect(container.textContent).toContain('Unmark supply')
    expect(container.textContent).not.toContain('Mark as supply storage')
    expect(container.querySelectorAll('[data-testid="supply-storage-pill"]')).toHaveLength(2)
    expect(container.querySelector('[data-action="new-department"]')).toBeTruthy()
    expect(container.querySelector('[data-department-group="d-bar"] [data-action="rename-department"]')).toBeTruthy()
    expect(container.querySelector('[data-department-group="d-bar"] [data-action="archive-department"]')).toBeTruthy()
    expect(container.querySelector('[data-department-group="unassigned"] [data-action="archive-department"]')).toBeNull()

    const backCard = container.querySelector('[data-storage-card="back"]')
    await act(async () => {
      backCard.querySelector('[data-action="toggle-supply"]').click()
      await Promise.resolve()
    })
    expect(departmentActions.setStorageSupply).toHaveBeenCalledWith('ws-1', 'back', true)

    const softCard = container.querySelector('[data-storage-card="soft"]')
    const softSelect = softCard.querySelector('[data-action="assign-department"]')
    await act(async () => {
      softSelect.value = 'd-bar'
      softSelect.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(departmentActions.assignStorageDepartment).toHaveBeenCalledWith('ws-1', 'soft', 'd-bar')

    await act(async () => {
      container.querySelector('[data-action="new-department"]').click()
    })
    const dialog = document.querySelector('[data-testid="stock-department-name-dialog"]')
    expect(dialog).toBeTruthy()
    const input = dialog.querySelector('input')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Floor')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(departmentActions.createDepartment).toHaveBeenCalledWith('ws-1', 'Floor')
  })

  it('shows groups and supply labels to staff without department controls', async () => {
    const storages = [
      {
        id: 'soft',
        name: 'Soft drinks',
        locationKey: 'Soft drinks',
        active: true,
        status: 'active',
        departmentId: null,
        isSupply: true,
        productCount: 1,
        totalQuantity: 9,
        nonZeroBalanceCount: 1,
        inventoryValue: 18,
      },
      {
        id: 'back',
        name: 'Back bar',
        locationKey: 'Back bar',
        active: true,
        status: 'active',
        departmentId: 'd-bar',
        isSupply: false,
        productCount: 0,
        totalQuantity: 0,
        nonZeroBalanceCount: 0,
        inventoryValue: 0,
      },
    ]
    renderCenter({
      workspaceId: 'ws-1',
      canManage: false,
      loadSummaries: async () => ({
        storages,
        activeStorages: storages,
        archivedStorages: [],
        departmentsAvailable: true,
        summary: {
          activeStorageCount: 2,
          archivedStorageCount: 0,
          totalProductsWithBalances: 1,
          totalQuantity: 9,
        },
      }),
      loadDepartments: async () => ({
        available: true,
        departments: [
          { id: 'd-bar', name: 'Bar', active: true, sortOrder: 0 },
          { id: 'd-empty', name: 'Kitchen', active: true, sortOrder: 1 },
        ],
      }),
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Bar')
    expect(container.textContent).toContain('Unassigned')
    expect(container.textContent).toContain('Soft drinks')
    expect(container.querySelector('[data-testid="supply-storage-pill"]')?.textContent).toBe('Supply')
    expect(container.querySelector('[data-testid="supply-storage-pill"]')?.getAttribute('title'))
      .toContain('Αποθήκη τροφοδοσίας')
    expect(container.textContent).not.toContain('Kitchen')
    expect(container.textContent).not.toContain('Value')
    expect(container.querySelector('[data-action="new-department"]')).toBeNull()
    expect(container.querySelector('[data-action="rename-department"]')).toBeNull()
    expect(container.querySelector('[data-action="archive-department"]')).toBeNull()
    expect(container.querySelector('[data-action="toggle-supply"]')).toBeNull()
    expect(container.querySelector('[data-action="assign-department"]')).toBeNull()
  })

  it('keeps the storage list and explains when departments are not available yet', async () => {
    renderCenter({
      workspaceId: 'ws-1',
      canManage: true,
      loadSummaries: async () => ({
        storages: [{
          id: 's-main',
          name: 'Main Storage',
          locationKey: 'Main Storage',
          active: true,
          status: 'active',
          productCount: 1,
          totalQuantity: 4,
          nonZeroBalanceCount: 1,
          inventoryValue: 10,
        }],
        activeStorages: [{
          id: 's-main',
          name: 'Main Storage',
          locationKey: 'Main Storage',
          active: true,
          status: 'active',
          productCount: 1,
          totalQuantity: 4,
          nonZeroBalanceCount: 1,
          inventoryValue: 10,
        }],
        archivedStorages: [],
        departmentsAvailable: false,
        summary: {
          activeStorageCount: 1,
          archivedStorageCount: 0,
          totalProductsWithBalances: 1,
          totalQuantity: 4,
        },
      }),
      loadDepartments: vi.fn(async () => {
        throw new Error('departments should not be queried')
      }),
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="stock-departments-unavailable"]')?.textContent)
      .toMatch(/Storages still work/)
    expect(container.textContent).toContain('Main Storage')
    expect(container.textContent).toContain('Active')
    expect(container.querySelector('[data-action="new-department"]')).toBeNull()
    expect(container.querySelector('[data-storage-id="s-main"]')).toBeTruthy()
  })

  it('shows how many items are below the per-shelf par', async () => {
    renderCenter({
      workspaceId: 'ws-1',
      canManage: true,
      loadSummaries: async () => ({
        storages: [{
          id: 's-soft',
          name: 'Soft drinks',
          locationKey: 'Soft drinks',
          active: true,
          status: 'active',
          productCount: 2,
          belowParCount: 1,
          totalQuantity: 9,
          nonZeroBalanceCount: 1,
          inventoryValue: 18,
        }],
        activeStorages: [{
          id: 's-soft',
          name: 'Soft drinks',
          locationKey: 'Soft drinks',
          active: true,
          status: 'active',
          productCount: 2,
          belowParCount: 1,
          totalQuantity: 9,
          nonZeroBalanceCount: 1,
          inventoryValue: 18,
        }],
        archivedStorages: [],
        summary: {
          activeStorageCount: 1,
          archivedStorageCount: 0,
          totalProductsWithBalances: 2,
          totalQuantity: 9,
        },
      }),
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="storage-below-par"]')?.textContent)
      .toBe('1 item below par')
    expect(container.textContent).toContain('Soft drinks')
  })

  it('refreshes below-par counts when returning from a storage', async () => {
    let belowParCount = 1
    const storage = () => ({
      id: 's-soft',
      name: 'Soft drinks',
      locationKey: 'Soft drinks',
      active: true,
      status: 'active',
      productCount: 2,
      belowParCount,
      totalQuantity: 9,
      nonZeroBalanceCount: 1,
      inventoryValue: 18,
    })
    const loadSummaries = vi.fn(async () => {
      const row = storage()
      return {
        storages: [row],
        activeStorages: [row],
        archivedStorages: [],
        departmentsAvailable: false,
        summary: {
          activeStorageCount: 1,
          archivedStorageCount: 0,
          totalProductsWithBalances: 2,
          totalQuantity: 9,
        },
      }
    })
    getWorkspaceStorageProducts.mockResolvedValue({
      storageId: 's-soft',
      parsAvailable: true,
      products: [],
      summary: {
        productCount: 0,
        totalQuantity: 0,
        nonZeroBalanceCount: 0,
        inventoryValue: 0,
      },
    })

    renderCenter({
      workspaceId: 'ws-1',
      canManage: true,
      loadSummaries,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="storage-below-par"]')?.textContent)
      .toBe('1 item below par')

    await act(async () => {
      container.querySelector('[data-storage-id="s-soft"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="stock-storage-detail-workspace"]')).toBeTruthy()

    belowParCount = 0
    await act(async () => {
      container.querySelector('.stock-storage-detail-back').click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadSummaries).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-testid="storage-below-par"]')?.textContent)
      .toBe('0 items below par')
    expect(container.querySelector('[data-testid="stock-storage-center-loading"]')).toBeNull()
  })
})

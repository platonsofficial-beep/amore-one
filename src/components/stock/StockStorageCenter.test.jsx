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
})

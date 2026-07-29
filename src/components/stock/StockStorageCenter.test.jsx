/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STOCK_SECTIONS, getModuleTitle } from '../../lib/appNavigation'
import { StockStorageCenter } from './StockStorageCenter'

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
  })

  it('mounts StockStorageCenter from the Stock workspace section switch', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
    expect(appSource).toContain("import { StockStorageCenter } from './components/stock/StockStorageCenter'")
    expect(appSource).toContain("stockSection === 'storages'")
    expect(appSource).toContain('<StockStorageCenter')
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
  })

  function renderCenter(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockStorageCenter, props))
    })
  }

  it('renders loading, empty, error, active/archived cards, and selection detail', async () => {
    let resolveLoad
    const loadSummaries = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve
    }))

    renderCenter({
      workspaceId: 'ws-1',
      loadSummaries,
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
    expect(container.textContent).toContain('Select a storage to inspect its summary.')
    expect(container.textContent).not.toContain('Create storage')
    expect(container.textContent).not.toContain('Transfer')
    expect(container.textContent).not.toContain('Fast Count')
    expect(container.querySelector('button[data-action="archive"]')).toBeNull()
    expect(container.querySelector('button[data-action="create"]')).toBeNull()

    act(() => {
      container.querySelector('[data-storage-id="s-main"]').click()
    })
    expect(container.querySelector('[data-testid="stock-storage-center-detail"]')?.textContent)
      .toContain('Main Storage')
    expect(container.querySelector('[data-testid="stock-storage-center-detail"]')?.textContent)
      .toContain('Products')
    expect(container.querySelector('[data-testid="stock-storage-center-detail"]')?.textContent)
      .toContain('12')

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

/**
 * @vitest-environment jsdom
 * P8.17.1 — Stock load failure vs empty catalog separation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockDashboardView } from './StockDashboardView'
import { MobileManagerStockView } from '../mobile/MobileManagerStockView'

function mockMatchMedia(matches = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function stock(partial = {}) {
  return {
    id: partial.id ?? 'item-1',
    name: partial.name ?? 'KETEL ONE',
    category: partial.category ?? 'Vodka',
    itemType: partial.itemType ?? 'Spirit',
    supplier: partial.supplier ?? 'Supplier',
    supplierId: partial.supplierId ?? 10,
    storageLocation: partial.storageLocation ?? 'Main Storage',
    unit: partial.unit ?? 'Bottle',
    currentQuantity: partial.currentQuantity ?? 2,
    minimumQuantity: partial.minimumQuantity ?? 5,
    targetQuantity: partial.targetQuantity ?? 10,
    orderQuantity: partial.orderQuantity ?? null,
    costPrice: partial.costPrice ?? 20,
    active: partial.active ?? true,
    lastCount: partial.lastCount ?? null,
    status: partial.status ?? 'low',
  }
}

function render(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
    rerender: (nextUi) => {
      act(() => {
        root.render(nextUi)
      })
    },
  }
}

beforeEach(() => {
  mockMatchMedia(true)
  window.localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('StockDashboardView load failure vs empty (P8.17.1)', () => {
  it('shows dedicated load-failure state with Retry and never the empty-catalog CTA', () => {
    const onRetryCatalogLoad = vi.fn()
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: true,
      onRetryCatalogLoad,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain("Stock couldn't be loaded")
    expect(container.textContent).toContain('Check your connection and try again.')
    expect(container.querySelector('.stock-catalog-load-failed')).toBeTruthy()
    expect(
      Array.from(container.querySelectorAll('.stock-catalog-load-failed button'))
        .some((node) => node.textContent === 'Retry'),
    ).toBe(true)
    expect(container.textContent).not.toContain('No products yet')
    expect(container.textContent).not.toContain('Add your first product')
    expect(
      Array.from(container.querySelectorAll('.stock-empty-state:not(.stock-catalog-load-failed) button'))
        .some((node) => node.textContent === '+ Add item'),
    ).toBe(false)

    cleanup()
  })

  it('Retry invokes the existing catalog load path and clears failure after success', async () => {
    const onRetryCatalogLoad = vi.fn(async () => {})
    const { container, cleanup, rerender } = render(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: true,
      onRetryCatalogLoad,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    const retryBtn = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Retry')
    expect(retryBtn).toBeTruthy()

    await act(async () => {
      retryBtn.click()
    })
    expect(onRetryCatalogLoad).toHaveBeenCalledTimes(1)

    rerender(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: true,
      catalogLoadFailed: false,
      onRetryCatalogLoad,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))
    expect(container.textContent).toContain('Loading stock')
    expect(container.textContent).not.toContain("Stock couldn't be loaded")
    expect(container.textContent).not.toContain('No products yet')

    rerender(createElement(StockDashboardView, {
      stockItems: [stock({ id: 'a1', name: 'ACTIVE LOW' })],
      isLoading: false,
      catalogLoadFailed: false,
      onRetryCatalogLoad,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))
    expect(container.textContent).toContain('ACTIVE LOW')
    expect(container.textContent).toContain('Total items')
    expect(container.textContent).not.toContain("Stock couldn't be loaded")
    expect(container.textContent).not.toContain('No products yet')

    cleanup()
  })

  it('keeps the failure state after a failed retry and never shows empty-catalog onboarding', async () => {
    const onRetryCatalogLoad = vi.fn(async () => {})
    const { container, cleanup, rerender } = render(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: true,
      onRetryCatalogLoad,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((node) => node.textContent === 'Retry')
        ?.click()
    })
    expect(onRetryCatalogLoad).toHaveBeenCalledTimes(1)

    rerender(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: true,
      onRetryCatalogLoad,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain("Stock couldn't be loaded")
    expect(container.textContent).toContain('Retry')
    expect(container.textContent).not.toContain('No products yet')
    expect(
      Array.from(container.querySelectorAll('.stock-empty-state:not(.stock-catalog-load-failed) button'))
        .some((node) => node.textContent === '+ Add item'),
    ).toBe(false)

    cleanup()
  })

  it('preserves true empty-catalog onboarding for managers after a successful empty load', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: false,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain('No products yet')
    expect(container.textContent).toContain('Add your first product')
    expect(
      Array.from(container.querySelectorAll('button')).some((node) => node.textContent === '+ Add item'),
    ).toBe(true)
    expect(container.textContent).not.toContain("Stock couldn't be loaded")
    expect(
      Array.from(container.querySelectorAll('button')).some((node) => node.textContent === 'Retry'),
    ).toBe(false)

    cleanup()
  })

  it('does not show Add item in the true empty state for read-only users', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: false,
      canManage: false,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain('No stock items')
    expect(
      Array.from(container.querySelectorAll('button')).some((node) => node.textContent === '+ Add item'),
    ).toBe(false)

    cleanup()
  })

  it('renders the normal dashboard for a successful non-empty catalog', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [
        stock({ id: 'a1', name: 'ACTIVE LOW', status: 'low', currentQuantity: 1 }),
        stock({ id: 'a2', name: 'ACTIVE OK', status: 'ok', currentQuantity: 20, minimumQuantity: 2 }),
      ],
      isLoading: false,
      catalogLoadFailed: false,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain('ACTIVE LOW')
    expect(container.textContent).toContain('ACTIVE OK')
    expect(container.textContent).toContain('Total items')
    expect(container.querySelector('[aria-label="Stock categories"]')).toBeTruthy()
    expect(container.textContent).not.toContain("Stock couldn't be loaded")
    expect(container.textContent).not.toContain('No products yet')

    cleanup()
  })

  it('loading does not render load-failure or successful empty-catalog states', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [],
      isLoading: true,
      catalogLoadFailed: false,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain('Loading stock')
    expect(container.textContent).not.toContain("Stock couldn't be loaded")
    expect(container.textContent).not.toContain('No products yet')
    expect(container.querySelector('.stock-empty-state')).toBeNull()

    cleanup()
  })
})

describe('MobileManagerStockView load failure (P8.17.1)', () => {
  it('shows dedicated failure with Retry instead of empty-catalog copy', async () => {
    const onRetryCatalogLoad = vi.fn(async () => {})
    const { container, cleanup } = render(createElement(MobileManagerStockView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: true,
      onRetryCatalogLoad,
      canManageStock: true,
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain("Stock couldn't be loaded")
    expect(container.textContent).toContain('Retry')
    expect(container.textContent).not.toContain('No products yet')
    expect(container.textContent).not.toContain('Add your first product')

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((node) => node.textContent === 'Retry')
        ?.click()
    })
    expect(onRetryCatalogLoad).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('preserves successful empty catalog messaging without Retry', () => {
    const { container, cleanup } = render(createElement(MobileManagerStockView, {
      stockItems: [],
      isLoading: false,
      catalogLoadFailed: false,
      canManageStock: true,
      isWorkspaceReady: true,
    }))

    expect(container.textContent).toContain('No products yet')
    expect(
      Array.from(container.querySelectorAll('button')).some((node) => node.textContent === 'Retry'),
    ).toBe(false)

    cleanup()
  })
})

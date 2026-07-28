/**
 * @vitest-environment jsdom
 * P8.16.26 — Product Visibility filter (Active / Inactive / All).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { filterStockDashboardItems } from '../../lib/stockDashboardBrowse'
import {
  persistStockBrowsePreferences,
  readStockBrowsePreferences,
} from '../../lib/stockBrowsePersistence'
import { getStockDashboardEmptyState } from '../../lib/stockInsights'
import { StockDashboardView } from './StockDashboardView'
import { StockItemMoreMenu } from './StockItemMoreMenu'

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

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
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
  }
}

const CATALOG = [
  stock({ id: 'a1', name: 'ACTIVE LOW', active: true, status: 'low', currentQuantity: 1 }),
  stock({ id: 'a2', name: 'ACTIVE OK', active: true, status: 'ok', currentQuantity: 20, minimumQuantity: 2 }),
  stock({ id: 'i1', name: 'INACTIVE LOW', active: false, status: 'low', currentQuantity: 1 }),
  stock({ id: 'i2', name: 'INACTIVE OUT', active: false, status: 'out', currentQuantity: 0 }),
]

beforeEach(() => {
  mockMatchMedia(true)
  window.localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

describe('filterStockDashboardItems visibility (P8.16.26)', () => {
  it('filters Active, Inactive, and All', () => {
    expect(filterStockDashboardItems(CATALOG, { visibilityFilter: 'active' }).map((item) => item.id))
      .toEqual(['a1', 'a2'])
    expect(filterStockDashboardItems(CATALOG, { visibilityFilter: 'inactive' }).map((item) => item.id))
      .toEqual(['i1', 'i2'])
    expect(filterStockDashboardItems(CATALOG, { visibilityFilter: 'all' }).map((item) => item.id))
      .toEqual(['a1', 'a2', 'i1', 'i2'])
  })

  it('combines Status + Visibility', () => {
    expect(filterStockDashboardItems(CATALOG, {
      statusFilter: 'low',
      visibilityFilter: 'active',
    }).map((item) => item.id)).toEqual(['a1'])

    expect(filterStockDashboardItems(CATALOG, {
      statusFilter: 'low',
      visibilityFilter: 'inactive',
    }).map((item) => item.id)).toEqual(['i1'])

    expect(filterStockDashboardItems(CATALOG, {
      statusFilter: 'out',
      visibilityFilter: 'all',
    }).map((item) => item.id)).toEqual(['i2'])

    expect(filterStockDashboardItems(CATALOG, {
      statusFilter: 'ok',
      visibilityFilter: 'inactive',
    }).map((item) => item.id)).toEqual([])

    expect(filterStockDashboardItems(CATALOG, {
      statusFilter: 'out',
      visibilityFilter: 'inactive',
    }).map((item) => item.id)).toEqual(['i2'])
  })

  it('combines Status + Search and Visibility + Search deterministically', () => {
    expect(filterStockDashboardItems(CATALOG, {
      statusFilter: 'low',
      searchTerm: 'ACTIVE',
    }).map((item) => item.id)).toEqual(['a1'])

    expect(filterStockDashboardItems(CATALOG, {
      visibilityFilter: 'inactive',
      searchTerm: 'OUT',
    }).map((item) => item.id)).toEqual(['i2'])

    expect(filterStockDashboardItems(CATALOG, {
      statusFilter: 'low',
      visibilityFilter: 'all',
      searchTerm: 'INACTIVE',
    }).map((item) => item.id)).toEqual(['i1'])
  })

  it('combines Search + Visibility', () => {
    expect(filterStockDashboardItems(CATALOG, {
      visibilityFilter: 'all',
      searchTerm: 'inactive',
    }).map((item) => item.id)).toEqual(['i1', 'i2'])

    expect(filterStockDashboardItems(CATALOG, {
      visibilityFilter: 'active',
      searchTerm: 'inactive',
    })).toEqual([])
  })

  it('defaults to Active (excludes inactive) for backward compatibility', () => {
    expect(filterStockDashboardItems(CATALOG).every((item) => item.active !== false)).toBe(true)
  })
})

describe('visibility empty states', () => {
  it('prompts switching visibility when Active has no matches but inactive exist', () => {
    const state = getStockDashboardEmptyState({
      hasNoItems: false,
      hasNoMatches: true,
      visibilityFilter: 'active',
      hasInactiveProducts: true,
      canManage: true,
    })
    expect(state.title).toBe('No active products found')
    expect(state.message).toContain('Inactive or All')
  })

  it('shows inactive empty copy', () => {
    const state = getStockDashboardEmptyState({
      hasNoItems: false,
      hasNoMatches: true,
      visibilityFilter: 'inactive',
      canManage: true,
    })
    expect(state.title).toBe('No inactive products found')
  })
})

describe('visibility persistence', () => {
  it('persists visibility with existing browse preferences', () => {
    persistStockBrowsePreferences({
      layoutMode: 'list',
      groupBy: 'category',
      sortKey: 'name-desc',
      visibilityFilter: 'inactive',
    })
    expect(readStockBrowsePreferences()).toMatchObject({
      layoutMode: 'list',
      groupBy: 'category',
      sortKey: 'name-desc',
      visibilityFilter: 'inactive',
    })
  })
})

describe('StockDashboardView visibility UI', () => {
  it('shows Visibility filter for managers and hides it for staff', () => {
    const managed = render(createElement(StockDashboardView, {
      stockItems: CATALOG,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))
    expect(managed.container.querySelector('[aria-label="Product visibility"]')).toBeTruthy()
    expect(managed.container.textContent).toContain('Visibility')
    managed.cleanup()

    const staff = render(createElement(StockDashboardView, {
      stockItems: CATALOG,
      canManage: false,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))
    expect(staff.container.querySelector('[aria-label="Product visibility"]')).toBeNull()
    expect(staff.container.textContent).toContain('ACTIVE LOW')
    expect(staff.container.textContent).not.toContain('INACTIVE LOW')
    staff.cleanup()
  })

  it('switches Active / Inactive / All chips', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: CATALOG,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
    }))

    const cardNames = () => Array.from(container.querySelectorAll('.stock-item-card .stock-item-name'))
      .map((node) => node.textContent)

    expect(cardNames()).toContain('ACTIVE LOW')
    expect(cardNames()).not.toContain('INACTIVE LOW')

    const inactiveChip = Array.from(
      container.querySelectorAll('[aria-label="Product visibility"] [role="tab"]'),
    ).find((node) => node.textContent === 'Inactive')

    act(() => {
      inactiveChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(cardNames()).toContain('INACTIVE LOW')
    expect(cardNames()).not.toContain('ACTIVE LOW')

    const allChip = Array.from(
      container.querySelectorAll('[aria-label="Product visibility"] [role="tab"]'),
    ).find((node) => node.textContent === 'All')

    act(() => {
      allChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(cardNames()).toContain('ACTIVE LOW')
    expect(cardNames()).toContain('INACTIVE LOW')

    cleanup()
  })

  it('reactivates inactive products from the menu', async () => {
    const onReactivateItem = vi.fn(async () => {})
    const item = stock({ id: 'i1', name: 'INACTIVE LOW', active: false })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      onReactivateItem,
    }))

    act(() => {
      Array.from(
        container.querySelectorAll('[aria-label="Product visibility"] [role="tab"]'),
      ).find((node) => node.textContent === 'Inactive')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const moreBtn = container.querySelector('[aria-label="More stock actions"]')
      || container.querySelector('[aria-label^="More actions for"]')
    expect(moreBtn).toBeTruthy()

    act(() => {
      moreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const reactivateBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((node) => node.textContent === 'Reactivate')
    expect(reactivateBtn).toBeTruthy()

    await act(async () => {
      reactivateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(onReactivateItem).toHaveBeenCalledWith('i1')
    cleanup()
  })

  it('keeps Permanently Delete available for inactive products', () => {
    const onPermanentlyDelete = vi.fn()
    const item = stock({ id: 'i1', name: 'INACTIVE LOW', active: false })
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const { cleanup } = render(createElement(StockItemMoreMenu, {
      isOpen: true,
      anchorEl: anchor,
      item,
      itemName: item.name,
      onClose: vi.fn(),
      onDeactivate: vi.fn(),
      onPermanentlyDelete,
    }))

    const labels = Array.from(document.querySelectorAll('[role="menuitem"]')).map((node) => node.textContent)
    expect(labels).toEqual([
      'Usage',
      'Adjust',
      'Edit',
      'Duplicate',
      'History & details',
      'Reactivate',
      'Permanently Delete…',
    ])
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(3)
    expect(labels).toContain('Permanently Delete…')
    expect(labels).toContain('Edit')

    act(() => {
      Array.from(document.querySelectorAll('[role="menuitem"]'))
        .find((node) => node.textContent === 'Permanently Delete…')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onPermanentlyDelete).toHaveBeenCalledWith(item)
    cleanup()
    anchor.remove()
  })
})

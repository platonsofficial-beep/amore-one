/**
 * @vitest-environment jsdom
 * P8.17.2 — Needs Attention density & duplication presentation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  buildStockNeedsAttentionGroups,
  sliceStockNeedsAttentionGroupItems,
  STOCK_ATTENTION_GROUPS,
  STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT,
} from '../../lib/stockInsights'
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
    name: partial.name ?? 'PRODUCT',
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
    lastCount: partial.lastCount ?? { createdAt: '2026-07-01T10:00:00.000Z' },
    status: partial.status ?? 'ok',
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

beforeEach(() => {
  mockMatchMedia(true)
  window.localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

describe('sliceStockNeedsAttentionGroupItems (P8.17.2)', () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `i${index + 1}`,
    name: `Item ${index + 1}`,
  }))

  it('limits preview deterministically and preserves order', () => {
    const preview = sliceStockNeedsAttentionGroupItems(items, {
      limit: STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT,
      expanded: false,
    })
    expect(STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT).toBe(5)
    expect(preview.visibleItems.map((item) => item.id)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5'])
    expect(preview.hiddenCount).toBe(3)
  })

  it('returns the full list when expanded', () => {
    const expanded = sliceStockNeedsAttentionGroupItems(items, {
      limit: STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT,
      expanded: true,
    })
    expect(expanded.visibleItems).toHaveLength(8)
    expect(expanded.hiddenCount).toBe(0)
  })

  it('does not change buildStockNeedsAttentionGroups severity ordering', () => {
    const now = new Date('2026-07-20T12:00:00.000Z')
    const catalog = [
      stock({ id: 'data-1', name: 'AAA DATA', status: 'ok', supplier: '', costPrice: 0, lastCount: { createdAt: '2026-07-19T10:00:00.000Z' } }),
      stock({ id: 'out-1', name: 'ZZZ OUT', status: 'out', currentQuantity: 0 }),
      stock({ id: 'low-1', name: 'MMM LOW', status: 'low', currentQuantity: 1 }),
      stock({ id: 'count-1', name: 'BBB COUNT', status: 'ok', lastCount: null }),
    ]
    const groups = buildStockNeedsAttentionGroups(catalog, { canManage: true, now })
    expect(groups.map((group) => group.id)).toEqual(['out', 'low', 'count', 'data'])
    expect(STOCK_ATTENTION_GROUPS.map((group) => group.id)).toEqual(['out', 'low', 'count', 'data'])
  })
})

describe('StockDashboardView Needs Attention density (P8.17.2)', () => {
  function buildLargeAttentionCatalog() {
    const outItems = Array.from({ length: 7 }, (_, index) => stock({
      id: `out-${index}`,
      name: `OUT ${String(index).padStart(2, '0')}`,
      status: 'out',
      currentQuantity: 0,
    }))
    const okItem = stock({
      id: 'ok-1',
      name: 'HEALTHY STOCK',
      status: 'ok',
      currentQuantity: 40,
      minimumQuantity: 5,
      lastCount: { createdAt: '2026-07-20T10:00:00.000Z' },
    })
    return [...outItems, okItem]
  }

  it('shows Needs Attention with a deterministic preview and expand control', () => {
    const catalog = buildLargeAttentionCatalog()
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: catalog,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
    }))

    const section = container.querySelector('[aria-label="Needs attention"]')
    expect(section).toBeTruthy()
    expect(section.textContent).toContain('7 products may need attention')
    expect(section.textContent).toContain('Showing top 5 per group')

    const outGroup = section.querySelector('[aria-label="Out of stock"]')
    const previewNames = Array.from(outGroup.querySelectorAll('.stock-attention-name'))
      .map((node) => node.textContent)
    expect(previewNames).toEqual(['OUT 00', 'OUT 01', 'OUT 02', 'OUT 03', 'OUT 04'])
    expect(section.textContent).toContain('+2 more in out of stock')

    const toggle = Array.from(section.querySelectorAll('button'))
      .find((node) => node.textContent === 'Show all 7')
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('Show less')
    expect(Array.from(outGroup.querySelectorAll('.stock-attention-name')).map((node) => node.textContent))
      .toEqual(['OUT 00', 'OUT 01', 'OUT 02', 'OUT 03', 'OUT 04', 'OUT 05', 'OUT 06'])
    expect(section.textContent).not.toContain('+2 more')

    cleanup()
  })

  it('keeps every product in All Products including attention items', () => {
    const catalog = buildLargeAttentionCatalog()
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: catalog,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
    }))

    const cardNames = Array.from(container.querySelectorAll('.stock-item-card .stock-item-name'))
      .map((node) => node.textContent)
    expect(cardNames).toContain('OUT 00')
    expect(cardNames).toContain('OUT 06')
    expect(cardNames).toContain('HEALTHY STOCK')
    expect(cardNames).toHaveLength(catalog.length)
    expect(container.textContent).toContain('All products')

    cleanup()
  })

  it('does not show Needs Attention when nothing needs attention', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [
        stock({
          id: 'ok-1',
          name: 'HEALTHY STOCK',
          status: 'ok',
          currentQuantity: 40,
          minimumQuantity: 5,
          lastCount: { createdAt: '2026-07-20T10:00:00.000Z' },
        }),
      ],
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
    }))

    expect(container.querySelector('[aria-label="Needs attention"]')).toBeNull()
    expect(container.textContent).toContain('HEALTHY STOCK')

    cleanup()
  })

  it('preserves empty catalog onboarding unchanged', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [],
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
    }))

    expect(container.querySelector('[aria-label="Needs attention"]')).toBeNull()
    expect(container.textContent).toContain('No products yet')
    expect(container.textContent).toContain('+ Add item')

    cleanup()
  })
})

describe('MobileManagerStockView Needs Attention (P8.17.2)', () => {
  it('does not introduce a Needs Attention section into the dedicated mobile shell', () => {
    const { container, cleanup } = render(createElement(MobileManagerStockView, {
      stockItems: [
        stock({ id: 'out-1', name: 'OUT ITEM', status: 'out', currentQuantity: 0 }),
      ],
      stockSummary: { totalItems: 1, lowStock: 0, outOfStock: 1, toOrder: 1 },
      isLoading: false,
      catalogLoadFailed: false,
      canManageStock: true,
      isWorkspaceReady: true,
    }))

    expect(container.querySelector('[aria-label="Needs attention"]')).toBeNull()
    expect(container.textContent).toContain('OUT ITEM')
    expect(container.textContent).not.toContain('Show all')

    cleanup()
  })
})

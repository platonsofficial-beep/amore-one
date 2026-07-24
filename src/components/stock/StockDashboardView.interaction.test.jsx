/**
 * @vitest-environment jsdom
 * P8.17.3 / P8.17.3a — Dashboard KPI interaction repair.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT } from '../../lib/stockInsights'
import { dismissStockSearchKeyboardOnEnter } from '../../lib/stockDashboardBrowse'
import { StockDashboardView } from './StockDashboardView'

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
    category: partial.category ?? 'Spirits',
    itemType: partial.itemType ?? 'Vodka',
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
    lastCount: partial.lastCount ?? { createdAt: '2026-07-20T10:00:00.000Z' },
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

function summaryCard(container, label) {
  return Array.from(container.querySelectorAll('.stock-summary-card'))
    .find((node) => node.textContent.includes(label))
}

function productCardNames(container) {
  return Array.from(container.querySelectorAll('.stock-item-card .stock-item-name'))
    .map((node) => node.textContent)
}

function click(node) {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  mockMatchMedia(true)
  window.localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

describe('dismissStockSearchKeyboardOnEnter (P8.17.3)', () => {
  it('blurs on Enter and leaves non-Enter keys alone', () => {
    const blur = vi.fn()
    const enterEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      currentTarget: { blur },
    }
    expect(dismissStockSearchKeyboardOnEnter(enterEvent)).toBe(true)
    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(blur).toHaveBeenCalledTimes(1)

    const otherEvent = {
      key: 'a',
      preventDefault: vi.fn(),
      currentTarget: { blur },
    }
    expect(dismissStockSearchKeyboardOnEnter(otherEvent)).toBe(false)
    expect(otherEvent.preventDefault).not.toHaveBeenCalled()
  })
})

describe('StockDashboardView KPI interaction (P8.17.3a)', () => {
  const catalog = [
    stock({
      id: 'ok-1',
      name: 'HEALTHY',
      status: 'ok',
      currentQuantity: 40,
      minimumQuantity: 5,
      targetQuantity: 30,
    }),
    stock({
      id: 'low-1',
      name: 'LOW ITEM',
      status: 'low',
      currentQuantity: 2,
      minimumQuantity: 5,
      targetQuantity: 10,
    }),
    stock({
      id: 'out-1',
      name: 'OUT ITEM',
      status: 'out',
      currentQuantity: 0,
      minimumQuantity: 5,
      targetQuantity: 10,
    }),
    stock({
      id: 'order-1',
      name: 'ORDER ITEM',
      status: 'ok',
      currentQuantity: 8,
      minimumQuantity: 5,
      targetQuantity: 20,
    }),
  ]

  function mount(extraProps = {}) {
    return render(createElement(StockDashboardView, {
      stockItems: catalog,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
      ...extraProps,
    }))
  }

  it('uses phrasing content inside interactive KPI buttons (no nested paragraphs)', () => {
    const { container, cleanup } = mount()
    const interactiveButtons = Array.from(container.querySelectorAll('button.stock-summary-card'))
    expect(interactiveButtons.length).toBeGreaterThanOrEqual(4)
    interactiveButtons.forEach((button) => {
      expect(button.querySelector('p')).toBeNull()
      expect(button.querySelector('.stock-summary-label')).toBeTruthy()
      expect(button.querySelector('.stock-summary-value')).toBeTruthy()
    })
    cleanup()
  })

  it('filters All Products when Low Stock KPI is tapped and clears on second tap', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    expect(lowCard?.tagName).toBe('BUTTON')
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')

    click(lowCard)
    expect(lowCard.getAttribute('aria-pressed')).toBe('true')
    expect(lowCard.className).toContain('is-selected')
    expect(container.querySelector('.stock-status-filter.active')?.textContent).toBe('Low')
    expect(productCardNames(container)).toEqual(['LOW ITEM'])

    click(lowCard)
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.stock-status-filter.active')?.textContent).toBe('All')
    expect(productCardNames(container)).toEqual(
      expect.arrayContaining(['HEALTHY', 'LOW ITEM', 'OUT ITEM', 'ORDER ITEM']),
    )
    expect(productCardNames(container)).toHaveLength(4)
    cleanup()
  })

  it('filters All Products when Out of Stock KPI is tapped', () => {
    const { container, cleanup } = mount()
    const outCard = summaryCard(container, 'Out of stock')
    click(outCard)
    expect(outCard.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.stock-status-filter.active')?.textContent).toBe('Out')
    expect(productCardNames(container)).toEqual(['OUT ITEM'])
    cleanup()
  })

  it('filters All Products with the existing To Order definition', () => {
    const { container, cleanup } = mount()
    const orderCard = summaryCard(container, 'To order')
    click(orderCard)
    expect(orderCard.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.stock-status-filter.active')?.textContent).toBe('To order')
    // existing itemNeedsOrder: current < target → LOW, OUT, ORDER (not HEALTHY at 40>=30)
    expect(productCardNames(container)).toEqual(
      expect.arrayContaining(['LOW ITEM', 'OUT ITEM', 'ORDER ITEM']),
    )
    expect(productCardNames(container)).not.toContain('HEALTHY')
    expect(productCardNames(container)).toHaveLength(3)
    cleanup()
  })

  it('replaces the active KPI filter when switching cards', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    const outCard = summaryCard(container, 'Out of stock')

    click(lowCard)
    expect(lowCard.getAttribute('aria-pressed')).toBe('true')
    expect(productCardNames(container)).toEqual(['LOW ITEM'])

    click(outCard)
    expect(outCard.getAttribute('aria-pressed')).toBe('true')
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelectorAll('.stock-summary-card.is-selected')).toHaveLength(1)
    expect(productCardNames(container)).toEqual(['OUT ITEM'])
    cleanup()
  })

  it('keeps search compatible with an active KPI filter', () => {
    const { container, cleanup } = mount({ searchTerm: 'OUT' })
    const outCard = summaryCard(container, 'Out of stock')
    click(outCard)
    expect(productCardNames(container)).toEqual(['OUT ITEM'])

    // Search alone already narrows; KPI must not clear search semantics.
    expect(container.querySelector('input')).toBeNull()
    cleanup()
  })

  it('leaves Total Items interactive reset and Inventory Cost non-interactive', () => {
    const { container, cleanup } = mount()
    const totalCard = summaryCard(container, 'Total items')
    const costCard = summaryCard(container, 'Inventory cost')
    const lowCard = summaryCard(container, 'Low stock')

    expect(totalCard?.tagName).toBe('BUTTON')
    expect(costCard?.tagName).toBe('ARTICLE')
    expect(costCard.className).not.toContain('is-interactive')

    click(lowCard)
    expect(productCardNames(container)).toEqual(['LOW ITEM'])
    click(totalCard)
    expect(totalCard.getAttribute('aria-pressed')).toBe('true')
    expect(productCardNames(container)).toHaveLength(4)
    cleanup()
  })
})

describe('StockDashboardView card layout collision guards (P8.17.3)', () => {
  it('keeps status badge outside the reserved action footer on cards', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [
        stock({
          id: 'long-1',
          name: 'Château Réserve Blanc — Cuvée Spéciale 2019 (Very Long Premium Wine Label For Layout Stress)',
          status: 'out',
          currentQuantity: 0,
        }),
      ],
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
    }))

    const card = container.querySelector('.stock-item-card')
    expect(card).toBeTruthy()
    expect(card.querySelector('.stock-item-card-title-block .stock-item-status-badge')).toBeTruthy()
    expect(card.querySelector('.stock-item-card-footer .stock-item-actions')).toBeTruthy()
    expect(card.querySelector('.stock-item-card-footer .stock-item-status-badge')).toBeNull()

    const attentionRow = container.querySelector('.stock-attention-row')
    expect(attentionRow).toBeTruthy()
    expect(attentionRow.querySelector('.stock-attention-copy .stock-attention-status-badge')).toBeTruthy()
    expect(attentionRow.querySelector('.stock-attention-actions .stock-item-status-badge')).toBeNull()

    cleanup()
  })

  it('preserves Needs Attention preview limit constant', () => {
    expect(STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT).toBe(5)
  })
})

/**
 * @vitest-environment jsdom
 * P8.17.3 — Dashboard interaction hardening (KPI toggle, layout, search Enter).
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

describe('StockDashboardView KPI interaction (P8.17.3)', () => {
  const catalog = [
    stock({ id: 'ok-1', name: 'HEALTHY', status: 'ok', currentQuantity: 40, minimumQuantity: 5 }),
    stock({ id: 'low-1', name: 'LOW ITEM', status: 'low', currentQuantity: 2, minimumQuantity: 5 }),
    stock({ id: 'out-1', name: 'OUT ITEM', status: 'out', currentQuantity: 0, minimumQuantity: 5 }),
  ]

  it('toggles Low / Out / To order filters on second tap and keeps selected state', () => {
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: catalog,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
    }))

    const lowCard = summaryCard(container, 'Low stock')
    const outCard = summaryCard(container, 'Out of stock')
    expect(lowCard).toBeTruthy()
    expect(outCard).toBeTruthy()
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')

    act(() => {
      lowCard.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(lowCard.getAttribute('aria-pressed')).toBe('true')
    expect(lowCard.className).toContain('is-selected')
    expect(container.querySelector('.stock-status-filter.active')?.textContent).toBe('Low')
    const cardNamesAfterLow = Array.from(container.querySelectorAll('.stock-item-card .stock-item-name'))
      .map((node) => node.textContent)
    expect(cardNamesAfterLow).toEqual(['LOW ITEM'])

    act(() => {
      lowCard.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.stock-status-filter.active')?.textContent).toBe('All')
    const cardNamesAfterClear = Array.from(container.querySelectorAll('.stock-item-card .stock-item-name'))
      .map((node) => node.textContent)
    expect(cardNamesAfterClear).toEqual(expect.arrayContaining(['HEALTHY', 'LOW ITEM', 'OUT ITEM']))
    expect(cardNamesAfterClear).toHaveLength(3)

    act(() => {
      outCard.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(outCard.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.stock-status-filter.active')?.textContent).toBe('Out')
    const cardNamesAfterOut = Array.from(container.querySelectorAll('.stock-item-card .stock-item-name'))
      .map((node) => node.textContent)
    expect(cardNamesAfterOut).toEqual(['OUT ITEM'])

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

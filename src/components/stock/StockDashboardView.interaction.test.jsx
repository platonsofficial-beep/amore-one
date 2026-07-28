/**
 * @vitest-environment jsdom
 * P8.17.3b — KPI filter pipeline: assert rendered All Products rows, not only selected state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT } from '../../lib/stockInsights'
import {
  dismissStockSearchKeyboardOnEnter,
  filterStockDashboardItems,
  getStockStatusFilterLabel,
} from '../../lib/stockDashboardBrowse'
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

/**
 * Quantity-driven fixture. Status is omitted by default so filters must use
 * resolveStockItemStatus (the same definition as KPI counts), not a pre-set field.
 */
function stock(partial = {}) {
  const {
    status,
    ...rest
  } = partial

  const item = {
    id: rest.id ?? 'item-1',
    name: rest.name ?? 'PRODUCT',
    category: rest.category ?? 'Spirits',
    itemType: rest.itemType ?? 'Vodka',
    supplier: rest.supplier ?? 'Supplier',
    supplierId: rest.supplierId ?? 10,
    storageLocation: rest.storageLocation ?? 'Main Storage',
    unit: rest.unit ?? 'Bottle',
    currentQuantity: rest.currentQuantity ?? 40,
    minimumQuantity: rest.minimumQuantity ?? 5,
    targetQuantity: rest.targetQuantity ?? 30,
    orderQuantity: rest.orderQuantity ?? null,
    costPrice: rest.costPrice ?? 20,
    active: rest.active ?? true,
    lastCount: rest.lastCount ?? { createdAt: '2026-07-20T10:00:00.000Z' },
  }

  // Only attach status when explicitly provided (stale-field regression cases).
  if (status !== undefined) item.status = status
  return item
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

function click(node) {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function summaryCard(container, label) {
  return Array.from(container.querySelectorAll('.stock-summary-card'))
    .find((node) => node.textContent.includes(label))
}

function catalogRoot(container) {
  return container.querySelector('#stock-all-products-catalog')
}

function catalogProductNames(container) {
  const root = catalogRoot(container)
  expect(root).toBeTruthy()

  const cardNames = Array.from(root.querySelectorAll('.stock-item-card .stock-item-name'))
    .map((node) => node.textContent)
  if (cardNames.length > 0) return cardNames

  const listNames = Array.from(root.querySelectorAll('.stock-list-product-name'))
    .map((node) => node.textContent)
  if (listNames.length > 0) return listNames

  return Array.from(root.querySelectorAll('.stock-compact-name'))
    .map((node) => node.textContent)
}

function resultCountText(container) {
  return catalogRoot(container)?.querySelector('.stock-browse-result-count')?.textContent ?? ''
}

function setLayoutMode(container, label) {
  const button = Array.from(container.querySelectorAll('.stock-layout-mode-btn'))
    .find((node) => node.textContent.includes(label))
  expect(button).toBeTruthy()
  click(button)
}

function attentionNames(container) {
  return Array.from(container.querySelectorAll('.stock-attention-name'))
    .map((node) => node.textContent)
}

const CATALOG = [
  // OK — healthy, above target
  stock({
    id: 'ok-1',
    name: 'HEALTHY OK',
    currentQuantity: 40,
    minimumQuantity: 5,
    targetQuantity: 30,
  }),
  // Low — below minimum (and needs order via target)
  stock({
    id: 'low-1',
    name: 'LOW ITEM',
    currentQuantity: 2,
    minimumQuantity: 5,
    targetQuantity: 10,
    status: 'low',
  }),
  // Out
  stock({
    id: 'out-1',
    name: 'OUT ITEM',
    currentQuantity: 0,
    minimumQuantity: 5,
    targetQuantity: 10,
    status: 'out',
  }),
  // To order only (ok vs min, but below target)
  stock({
    id: 'order-1',
    name: 'ORDER ITEM',
    currentQuantity: 8,
    minimumQuantity: 5,
    targetQuantity: 20,
  }),
]

const STALE_STATUS_CATALOG = [
  stock({
    id: 'stale-low',
    name: 'STALE LOW',
    currentQuantity: 2,
    minimumQuantity: 5,
    targetQuantity: 10,
    status: 'ok', // stale — quantities say low
  }),
  stock({
    id: 'ok-2',
    name: 'REAL OK',
    currentQuantity: 40,
    minimumQuantity: 5,
    targetQuantity: 30,
  }),
]

beforeEach(() => {
  mockMatchMedia(true)
  window.localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

describe('filterStockDashboardItems status pipeline (P8.17.3b)', () => {
  it('uses quantity status so stale item.status cannot leak OK products into Low', () => {
    const filtered = filterStockDashboardItems(STALE_STATUS_CATALOG, { statusFilter: 'low' })
    expect(filtered.map((item) => item.name)).toEqual(['STALE LOW'])
  })

  it('matches Out and To Order using quantity rules, not a pre-baked status field', () => {
    expect(filterStockDashboardItems(CATALOG, { statusFilter: 'out' }).map((item) => item.name))
      .toEqual(['OUT ITEM'])
    expect(filterStockDashboardItems(CATALOG, { statusFilter: 'order' }).map((item) => item.name).sort())
      .toEqual(['LOW ITEM', 'ORDER ITEM', 'OUT ITEM'])
  })
})

describe('dismissStockSearchKeyboardOnEnter', () => {
  it('blurs on Enter', () => {
    const blur = vi.fn()
    expect(dismissStockSearchKeyboardOnEnter({
      key: 'Enter',
      preventDefault: vi.fn(),
      currentTarget: { blur },
    })).toBe(true)
    expect(blur).toHaveBeenCalledTimes(1)
  })
})

describe('StockDashboardView KPI → All Products pipeline (P8.17.3b)', () => {
  function mount(extraProps = {}) {
    return render(createElement(StockDashboardView, {
      stockItems: CATALOG,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
      ...extraProps,
    }))
  }

  it('1. Low KPI removes OK and Out products from All Products', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    click(lowCard)

    expect(lowCard.getAttribute('aria-pressed')).toBe('true')
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])
    expect(catalogProductNames(container)).not.toContain('HEALTHY OK')
    expect(catalogProductNames(container)).not.toContain('OUT ITEM')
    expect(resultCountText(container)).toMatch(/Showing 1 of 4/)
    cleanup()
  })

  it('2. Out KPI removes OK and Low products from All Products', () => {
    const { container, cleanup } = mount()
    click(summaryCard(container, 'Out of stock'))
    expect(catalogProductNames(container)).toEqual(['OUT ITEM'])
    expect(catalogProductNames(container)).not.toContain('LOW ITEM')
    expect(catalogProductNames(container)).not.toContain('HEALTHY OK')
    cleanup()
  })

  it('3. To Order KPI matches only the existing To Order definition', () => {
    const { container, cleanup } = mount()
    click(summaryCard(container, 'To order'))
    const names = catalogProductNames(container)
    expect(names).toEqual(expect.arrayContaining(['LOW ITEM', 'OUT ITEM', 'ORDER ITEM']))
    expect(names).not.toContain('HEALTHY OK')
    expect(names).toHaveLength(3)
    cleanup()
  })

  it('4. Second Low tap restores the full eligible catalog', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    click(lowCard)
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])
    click(lowCard)
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')
    expect(catalogProductNames(container).sort()).toEqual([
      'HEALTHY OK',
      'LOW ITEM',
      'ORDER ITEM',
      'OUT ITEM',
    ])
    expect(resultCountText(container)).toMatch(/Showing 4 of 4/)
    cleanup()
  })

  it('5. Switching KPI replaces the prior All Products result set', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    const outCard = summaryCard(container, 'Out of stock')
    click(lowCard)
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])
    click(outCard)
    expect(outCard.getAttribute('aria-pressed')).toBe('true')
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')
    expect(catalogProductNames(container)).toEqual(['OUT ITEM'])
    cleanup()
  })

  it('6–8. Cards, List, and Count views share the same filtered dataset', () => {
    const { container, cleanup } = mount()
    click(summaryCard(container, 'Low stock'))

    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])

    setLayoutMode(container, 'List')
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])

    setLayoutMode(container, 'Count')
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])

    setLayoutMode(container, 'Cards')
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])
    cleanup()
  })

  it('9. Search + KPI intersect; clearing KPI preserves search', () => {
    const { container, cleanup } = mount({ searchTerm: 'ITEM' })
    // Search alone: LOW, OUT, ORDER (HEALTHY OK has no ITEM)
    expect(catalogProductNames(container).sort()).toEqual(['LOW ITEM', 'ORDER ITEM', 'OUT ITEM'])

    click(summaryCard(container, 'Out of stock'))
    expect(catalogProductNames(container)).toEqual(['OUT ITEM'])

    click(summaryCard(container, 'Out of stock'))
    expect(catalogProductNames(container).sort()).toEqual(['LOW ITEM', 'ORDER ITEM', 'OUT ITEM'])
    cleanup()
  })

  it('10. Visible result count updates with the filtered catalog', () => {
    const { container, cleanup } = mount()
    expect(resultCountText(container)).toMatch(/Showing 4 of 4/)
    click(summaryCard(container, 'Out of stock'))
    expect(resultCountText(container)).toMatch(/Showing 1 of 4/)
    cleanup()
  })

  it('11. Needs Attention remains present and still lists attention products while KPI filters All Products', () => {
    const { container, cleanup } = mount()
    click(summaryCard(container, 'Low stock'))

    const attention = container.querySelector('[aria-label="Needs attention"]')
    expect(attention).toBeTruthy()
    // Needs Attention is intentionally unfiltered by statusFilter — Out still appears there.
    expect(attentionNames(container)).toEqual(expect.arrayContaining(['OUT ITEM', 'LOW ITEM']))
    // All Products catalog is filtered.
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])
    // While filtered, All Products catalog precedes Needs Attention in document order.
    const catalog = catalogRoot(container)
    expect(
      catalog.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    cleanup()
  })

  it('12. KPI selected state stays synchronized with the filtered dataset', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    const outCard = summaryCard(container, 'Out of stock')
    const orderCard = summaryCard(container, 'To order')

    click(orderCard)
    expect(orderCard.className).toContain('is-selected')
    expect(orderCard.getAttribute('aria-pressed')).toBe('true')
    expect(catalogProductNames(container)).toHaveLength(3)

    click(lowCard)
    expect(lowCard.getAttribute('aria-pressed')).toBe('true')
    expect(orderCard.getAttribute('aria-pressed')).toBe('false')
    expect(outCard.getAttribute('aria-pressed')).toBe('false')
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])
    cleanup()
  })

  it('preserves Needs Attention preview limit constant', () => {
    expect(STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT).toBe(5)
  })
})

describe('StockDashboardView filtered catalog density (P8.17.3d)', () => {
  function mount(extraProps = {}) {
    return render(createElement(StockDashboardView, {
      stockItems: CATALOG,
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
      ...extraProps,
    }))
  }

  function buttonByText(container, text) {
    return Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === text)
  }

  it('1. Filtered context label, count, and Clear filter share one coherent wrapper', () => {
    expect(getStockStatusFilterLabel('low')).toBe('Low stock')
    expect(getStockStatusFilterLabel('out')).toBe('Out of stock')
    expect(getStockStatusFilterLabel('order')).toBe('To order')

    const { container, cleanup } = mount()
    expect(container.querySelector('#stock-filtered-context')).toBeNull()

    click(summaryCard(container, 'Low stock'))
    const context = container.querySelector('#stock-filtered-context')
    const main = context?.querySelector('.stock-filtered-context-main')
    expect(context).toBeTruthy()
    expect(main).toBeTruthy()
    expect(main.querySelector('.stock-filtered-context-title')?.textContent).toBe('Low stock')
    expect(main.querySelector('.stock-filtered-context-count')?.textContent).toBe('1 product')
    expect(main.querySelector('.stock-filtered-context-clear')?.textContent).toBe('Clear filter')
    expect(catalogRoot(container).className).toContain('is-filtered-mode')
    cleanup()
  })

  it('2 / 16. Clear filter and KPI second-tap both clear the active KPI filter', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    click(lowCard)
    expect(container.querySelector('#stock-filtered-context')).toBeTruthy()

    click(buttonByText(container, 'Clear filter'))
    expect(container.querySelector('#stock-filtered-context')).toBeNull()
    expect(catalogRoot(container).className).not.toContain('is-filtered-mode')
    expect(catalogProductNames(container)).toHaveLength(4)

    const attention = container.querySelector('[aria-label="Needs attention"]')
    expect(attention).toBeTruthy()
    expect(
      attention.compareDocumentPosition(catalogRoot(container)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    click(lowCard)
    expect(container.querySelector('#stock-filtered-context')).toBeTruthy()
    click(lowCard)
    expect(container.querySelector('#stock-filtered-context')).toBeNull()
    expect(lowCard.getAttribute('aria-pressed')).toBe('false')
    cleanup()
  })

  it('3–8. Filtered primary toolbar keeps category, visibility, view, group, sort, and actions', () => {
    const { container, cleanup } = mount()
    click(summaryCard(container, 'To order'))

    const controls = container.querySelector('.stock-filtered-controls')
    const primary = controls?.querySelector('.stock-filtered-primary-toolbar')
    const actions = controls?.querySelector('.stock-filtered-actions')
    expect(controls).toBeTruthy()
    expect(primary).toBeTruthy()
    expect(actions).toBeTruthy()

    expect(primary.querySelector('[aria-label="Stock categories"]')).toBeTruthy()
    expect(primary.querySelector('[aria-label="Product visibility"]')).toBeTruthy()
    expect(primary.querySelectorAll('.stock-layout-mode-btn')).toHaveLength(3)
    expect(primary.querySelector('.stock-browse-group')).toBeTruthy()
    expect(primary.querySelector('.stock-browse-sort')).toBeTruthy()

    expect(buttonByText(actions, 'Create order')).toBeTruthy()
    expect(buttonByText(actions, 'Import CSV')).toBeTruthy()
    expect(buttonByText(actions, 'Inventory Import')).toBeTruthy()
    expect(buttonByText(actions, 'Select')).toBeTruthy()
    expect(buttonByText(actions, '+ Add item')).toBeTruthy()

    setLayoutMode(container, 'List')
    expect(catalogProductNames(container)).toHaveLength(3)
    setLayoutMode(container, 'Count')
    expect(catalogProductNames(container)).toHaveLength(3)
    cleanup()
  })

  it('9–10. Active status stays KPI-synced without a contradictory second status chooser', () => {
    const { container, cleanup } = mount()
    const lowCard = summaryCard(container, 'Low stock')
    click(lowCard)

    expect(lowCard.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('#stock-filtered-context .stock-filtered-context-title')?.textContent)
      .toBe('Low stock')
    expect(container.querySelector('[aria-label="Stock status"]')).toBeNull()
    expect(container.querySelectorAll('.stock-summary-card.is-selected')).toHaveLength(1)
    expect(catalogProductNames(container)).toEqual(['LOW ITEM'])
    cleanup()
  })

  it('11–13. Catalog follows filtered toolbar; Needs Attention stays after; unfiltered structure unchanged', () => {
    const { container, cleanup } = mount()
    const catalog = catalogRoot(container)
    const attentionBefore = container.querySelector('[aria-label="Needs attention"]')
    expect(attentionBefore).toBeTruthy()
    expect(
      attentionBefore.compareDocumentPosition(catalog) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(container.querySelector('.stock-dashboard-toolbar')).toBeTruthy()
    expect(container.querySelector('.stock-browse-controls')).toBeTruthy()
    expect(container.querySelector('.stock-filtered-controls')).toBeNull()
    expect(container.querySelector('[aria-label="Stock status"]')).toBeTruthy()

    click(summaryCard(container, 'Out of stock'))
    const attentionAfter = container.querySelector('[aria-label="Needs attention"]')
    const context = container.querySelector('#stock-filtered-context')
    const controls = catalog.querySelector('.stock-filtered-controls')
    const firstProduct = catalog.querySelector('.stock-item-card, .stock-list-product-name, .stock-compact-name')

    expect(context).toBeTruthy()
    expect(controls).toBeTruthy()
    expect(firstProduct).toBeTruthy()
    expect(container.querySelector('.stock-dashboard-toolbar')).toBeNull()
    expect(container.querySelector('.stock-browse-controls')).toBeNull()
    expect(
      context.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      controls.compareDocumentPosition(firstProduct) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      catalog.compareDocumentPosition(attentionAfter) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(container.querySelector('.stock-operations-banner')).toBeNull()
    expect(container.querySelector('.stock-today-activity')).toBeNull()
    expect(catalogProductNames(container)).toEqual(['OUT ITEM'])
    cleanup()
  })

  it('15. Search remains compatible with filtered-mode density layout', () => {
    const { container, cleanup } = mount({ searchTerm: 'OUT' })
    click(summaryCard(container, 'Out of stock'))
    expect(container.querySelector('#stock-filtered-context .stock-filtered-context-count')?.textContent)
      .toBe('1 product')
    expect(catalogProductNames(container)).toEqual(['OUT ITEM'])
    cleanup()
  })
})

describe('MobileManagerStockView unchanged (P8.17.3d)', () => {
  it('14. Dedicated mobile shell does not gain filtered-mode chrome', () => {
    const { container, cleanup } = render(createElement(MobileManagerStockView, {
      stockItems: CATALOG,
      stockSummary: { totalItems: 4, lowStock: 1, outOfStock: 1, toOrder: 3 },
      isLoading: false,
      catalogLoadFailed: false,
      canManageStock: true,
      isWorkspaceReady: true,
    }))

    expect(container.querySelector('#stock-filtered-context')).toBeNull()
    expect(container.querySelector('.stock-filtered-controls')).toBeNull()
    expect(container.querySelector('.stock-all-products-catalog')).toBeNull()
    expect(container.textContent).toContain('LOW ITEM')
    cleanup()
  })
})

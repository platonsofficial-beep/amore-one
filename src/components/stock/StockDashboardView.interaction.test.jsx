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

  it('3–8. Shared compact toolbar keeps category, visibility, view, group, sort, and manager actions', () => {
    const { container, cleanup } = mount()
    click(summaryCard(container, 'To order'))

    const toolbar = container.querySelector('[data-stock-compact-browse-toolbar="true"]')
    const browseRow = toolbar?.querySelector('[data-stock-compact-browse-row="true"]')
    const actionsRow = toolbar?.querySelector('[data-stock-compact-actions-row="true"]')
    expect(toolbar).toBeTruthy()
    expect(browseRow).toBeTruthy()
    expect(actionsRow).toBeTruthy()
    expect(container.querySelectorAll('[data-stock-compact-browse-toolbar="true"]')).toHaveLength(1)

    expect(browseRow.querySelector('[aria-label="Stock categories"]')).toBeTruthy()
    expect(browseRow.querySelector('[aria-label="Product visibility"]')).toBeTruthy()
    expect(browseRow.querySelectorAll('.stock-layout-mode-btn')).toHaveLength(3)
    expect(browseRow.querySelector('.stock-browse-group')).toBeTruthy()
    expect(browseRow.querySelector('.stock-browse-sort')).toBeTruthy()
    expect(browseRow.querySelector('[aria-label="Group stock items"]')).toBeTruthy()
    expect(browseRow.querySelector('[aria-label="Sort stock items"]')).toBeTruthy()

    expect(buttonByText(actionsRow, 'Create order')).toBeTruthy()
    expect(buttonByText(actionsRow, 'Select')).toBeTruthy()
    expect(buttonByText(actionsRow, '+ Add item')).toBeTruthy()
    expect(buttonByText(actionsRow, 'Import CSV')).toBeFalsy()
    expect(buttonByText(actionsRow, 'Inventory Import')).toBeFalsy()

    click(actionsRow.querySelector('[aria-label="More catalog actions"]'))
    expect(container.querySelector('[data-stock-toolbar-overflow-import-csv="true"]')).toBeTruthy()
    expect(container.querySelector('[data-stock-toolbar-overflow-inventory-import="true"]')).toBeTruthy()

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

  it('11–13. Catalog follows compact toolbar; Needs Attention stays after; shared structure in both modes', () => {
    const { container, cleanup } = mount()
    const catalog = catalogRoot(container)
    const attentionBefore = container.querySelector('[aria-label="Needs attention"]')
    expect(attentionBefore).toBeTruthy()
    expect(
      attentionBefore.compareDocumentPosition(catalog) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(container.querySelector('[data-stock-compact-browse-toolbar="true"]')).toBeTruthy()
    expect(container.querySelector('.stock-dashboard-toolbar')).toBeNull()
    expect(container.querySelector('.stock-browse-controls')).toBeNull()
    expect(container.querySelector('.stock-filtered-controls')).toBeNull()
    expect(container.querySelector('[aria-label="Stock status"]')).toBeNull()

    click(summaryCard(container, 'Out of stock'))
    const attentionAfter = container.querySelector('[aria-label="Needs attention"]')
    const context = container.querySelector('#stock-filtered-context')
    const toolbar = catalog.querySelector('[data-stock-compact-browse-toolbar="true"]')
    const firstProduct = catalog.querySelector('.stock-item-card, .stock-list-product-name, .stock-compact-name')

    expect(context).toBeTruthy()
    expect(toolbar).toBeTruthy()
    expect(firstProduct).toBeTruthy()
    expect(container.querySelectorAll('[data-stock-compact-browse-toolbar="true"]')).toHaveLength(1)
    expect(
      context.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      toolbar.compareDocumentPosition(firstProduct) & Node.DOCUMENT_POSITION_FOLLOWING,
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

describe('StockDashboardView compact browse workspace (P8.24.3)', () => {
  function mount(extraProps = {}) {
    return render(createElement(StockDashboardView, {
      stockItems: [
        stock({
          id: 'list-1',
          name: 'LIST PRODUCT',
          category: 'Spirits',
          itemType: 'Vodka',
          supplier: 'Acme Supply',
          storageLocation: 'Main Storage',
          currentQuantity: 12,
          minimumQuantity: 5,
          unit: 'Bottle',
          active: true,
          lastMovement: {
            type: 'receive',
            createdAt: '2026-07-20T10:00:00.000Z',
          },
        }),
        stock({
          id: 'list-2',
          name: 'INACTIVE LIST',
          category: 'Wine',
          itemType: 'Red',
          supplier: 'Cellar Co',
          storageLocation: 'Cellar',
          currentQuantity: 1,
          minimumQuantity: 4,
          unit: 'Bottle',
          active: false,
          lastMovement: {
            type: 'stock_count',
            createdAt: '2026-07-19T08:00:00.000Z',
          },
        }),
      ],
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      isLoading: false,
      catalogLoadFailed: false,
      ...extraProps,
    }))
  }

  function buttonByText(root, text) {
    return Array.from(root.querySelectorAll('button'))
      .find((node) => node.textContent === text)
  }

  it('renders shared compact toolbar with browse controls and visible manager actions', () => {
    const { container, cleanup } = mount()
    const toolbar = container.querySelector('[data-stock-compact-browse-toolbar="true"]')
    const browseRow = toolbar.querySelector('[data-stock-compact-browse-row="true"]')
    const actionsRow = toolbar.querySelector('[data-stock-compact-actions-row="true"]')

    expect(toolbar).toBeTruthy()
    expect(container.querySelectorAll('[data-stock-compact-browse-toolbar="true"]')).toHaveLength(1)
    expect(browseRow.querySelector('[aria-label="Stock categories"]')).toBeTruthy()
    expect(browseRow.querySelector('[aria-label="Product visibility"]')).toBeTruthy()
    expect(browseRow.querySelectorAll('.stock-layout-mode-btn')).toHaveLength(3)
    expect(browseRow.querySelector('[aria-label="Group stock items"]')).toBeTruthy()
    expect(browseRow.querySelector('[aria-label="Sort stock items"]')).toBeTruthy()
    expect(resultCountText(container)).toMatch(/Showing 1 of 1/)

    expect(buttonByText(actionsRow, '+ Add item')).toBeTruthy()
    expect(buttonByText(actionsRow, 'Create order')).toBeTruthy()
    expect(buttonByText(actionsRow, 'Select')).toBeTruthy()
    expect(buttonByText(actionsRow, 'Import CSV')).toBeFalsy()
    expect(buttonByText(actionsRow, 'Inventory Import')).toBeFalsy()

    click(actionsRow.querySelector('[aria-label="More catalog actions"]'))
    expect(container.querySelector('[data-stock-toolbar-overflow-import-csv="true"]')?.textContent)
      .toBe('Import CSV')
    expect(container.querySelector('[data-stock-toolbar-overflow-inventory-import="true"]')?.textContent)
      .toBe('Inventory Import')
    cleanup()
  })

  it('keeps filtered context + Clear filter and accurate result count', () => {
    const { container, cleanup } = mount({
      stockItems: CATALOG,
    })
    click(summaryCard(container, 'Low stock'))
    expect(container.querySelector('#stock-filtered-context .stock-filtered-context-title')?.textContent)
      .toBe('Low stock')
    expect(buttonByText(container, 'Clear filter')).toBeTruthy()
    expect(resultCountText(container)).toMatch(/Showing 1 of 4/)
    expect(container.querySelectorAll('[data-stock-compact-browse-toolbar="true"]')).toHaveLength(1)
    cleanup()
  })

  it('renders the six-column List contract with Details/Stock content and actions', () => {
    const { container, cleanup } = mount()
    setLayoutMode(container, 'List')

    const headers = Array.from(container.querySelectorAll('.stock-list-table thead th'))
      .map((node) => node.textContent.trim())
      .filter(Boolean)
    expect(headers).toEqual(['Product', 'Details', 'Stock', 'Status', 'Updated', 'Actions'])
    expect(headers).not.toContain('Supplier')
    expect(headers).not.toContain('Location')
    expect(headers).not.toContain('Current Stock')
    expect(headers).not.toContain('Minimum')
    expect(headers).not.toContain('Last Movement')
    expect(headers).not.toContain('Category / Type')

    const row = container.querySelector('.stock-list-row')
    expect(row.querySelector('.stock-list-details')?.textContent).toContain('Spirits')
    expect(row.querySelector('.stock-list-details')?.textContent).toContain('Acme Supply')
    expect(row.querySelector('.stock-list-details')?.textContent).toContain('Main Storage')
    expect(row.querySelector('.stock-list-stock-current')?.textContent).toMatch(/12/)
    expect(row.querySelector('.stock-list-stock-min')?.textContent).toMatch(/Min/)
    expect(row.querySelector('.stock-list-stock-min')?.textContent).toMatch(/5/)
    expect(row.querySelector('.stock-list-cell-status .stock-item-status-badge')).toBeTruthy()
    expect(row.querySelector('.stock-list-cell-movement')?.textContent).not.toBe('')

    const actions = row.querySelector('.stock-list-cell-actions')
    expect(buttonByText(actions, 'Receive')).toBeTruthy()
    const countBtn = actions.querySelector('[data-stock-row-count-action="true"]')
    expect(countBtn).toBeTruthy()
    expect(countBtn.getAttribute('aria-label')).toBe('Stock count')
    expect(countBtn.textContent).toBe('Count')
    expect(actions.querySelector('[aria-label="More actions for LIST PRODUCT"]')).toBeTruthy()
    expect(actions.querySelectorAll('.stock-row-action-btn, .stock-row-more-btn')).toHaveLength(3)
    expect(actions.querySelectorAll('[data-stock-row-count-action="true"]')).toHaveLength(1)
    cleanup()
  })

  it('keeps selection mode functional without duplicating toolbar chrome', () => {
    const { container, cleanup } = mount()
    setLayoutMode(container, 'List')
    click(buttonByText(container, 'Select'))
    expect(buttonByText(container, 'Done')).toBeTruthy()
    expect(container.querySelector('.stock-selection-bar')).toBeTruthy()
    expect(container.querySelector('.stock-list-table.is-selection-mode')).toBeTruthy()
    expect(container.querySelector('.stock-list-head-select')).toBeTruthy()
    expect(container.querySelectorAll('[data-stock-compact-browse-toolbar="true"]')).toHaveLength(1)

    click(container.querySelector('.stock-list-select-btn'))
    expect(container.querySelector('.stock-bulk-toolbar')).toBeTruthy()
    cleanup()
  })

  it('preserves Cards and Count modes with the shared toolbar', () => {
    const { container, cleanup } = mount({ stockItems: CATALOG })
    const toolbar = container.querySelector('[data-stock-compact-browse-toolbar="true"]')
    expect(toolbar).toBeTruthy()

    setLayoutMode(container, 'Cards')
    expect(catalogProductNames(container).length).toBeGreaterThan(0)
    expect(container.querySelector('.stock-item-card, .stock-item-grid')).toBeTruthy()

    setLayoutMode(container, 'Count')
    expect(catalogProductNames(container).length).toBeGreaterThan(0)
    expect(container.querySelector('.stock-compact-row, .stock-compact-list')).toBeTruthy()

    setLayoutMode(container, 'List')
    expect(container.querySelector('.stock-list-table')).toBeTruthy()
    expect(container.querySelectorAll('[data-stock-compact-browse-toolbar="true"]')).toHaveLength(1)
    cleanup()
  })

  it('removes visible View label while keeping layout accessibility and card name clamp (P8.24.4)', () => {
    const { container, cleanup } = mount({
      stockItems: [
        stock({
          id: 'long-1',
          name: 'VERY LONG PREMIUM PRODUCT NAME THAT SHOULD CLAMP AFTER TWO LINES IN CARDS MODE',
          currentQuantity: 12,
          minimumQuantity: 5,
        }),
      ],
    })

    const layoutLabel = container.querySelector('#stock-layout-label')
    expect(layoutLabel).toBeTruthy()
    expect(layoutLabel.classList.contains('sr-only')).toBe(true)
    expect(container.querySelector('.stock-browse-layout .stock-browse-control-label')).toBeNull()
    expect(container.querySelector('[aria-labelledby="stock-layout-label"]')).toBeTruthy()

    setLayoutMode(container, 'Cards')
    const cardName = container.querySelector('.stock-item-name')
    expect(cardName?.textContent).toContain('VERY LONG PREMIUM PRODUCT NAME')
    expect(cardName?.getAttribute('title')).toContain('VERY LONG PREMIUM PRODUCT NAME')

    setLayoutMode(container, 'Count')
    expect(container.querySelector('.stock-compact-count-btn, .stock-compact-row')).toBeTruthy()
    cleanup()
  })
})

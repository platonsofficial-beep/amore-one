/**
 * @vitest-environment jsdom
 * Short landscape (844×390) keeps the stock dashboard as one scrolling column.
 * jsdom does not apply media-query layout, so the column contract is asserted
 * from the stylesheet and the summary panels are asserted from the render.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockDashboardView } from './StockDashboardView'
import { computeMenuPosition, StockItemMoreMenu } from './StockItemMoreMenu'

const APP_CSS = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

function shortLandscapeBlock() {
  const start = APP_CSS.indexOf('@media (orientation: landscape) and (max-height: 520px)')
  const next = APP_CSS.indexOf('@media', start + 10)
  return APP_CSS.slice(start, next)
}

function ruleStarting(css, selector) {
  const pattern = new RegExp(`(?:^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{`)
  const match = pattern.exec(css)
  if (!match) return ''
  const open = css.indexOf('{', match.index)
  const close = css.indexOf('}', open)
  return css.slice(match.index, close + 1)
}

function mockMatchMedia(matchesFor) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: matchesFor(String(query)),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
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

function rect(partial) {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON() { return this },
    ...partial,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

describe('short landscape stock dashboard', () => {
  it('flows summary panels in one column before a full-width product grid', () => {
    const block = shortLandscapeBlock()
    const pageRule = ruleStarting(block, '.stock-dashboard-page')
    const boardRule = ruleStarting(block, '.stock-today-board')
    const catalogRule = ruleStarting(block, '.stock-all-products-catalog')
    const gridRule = ruleStarting(block, '.stock-item-grid')

    expect(pageRule).toMatch(/display:\s*flex/)
    expect(pageRule).toMatch(/flex-direction:\s*column/)
    expect(pageRule).not.toMatch(/grid-template-columns/)
    expect(boardRule).toMatch(/grid-column:\s*auto/)
    expect(boardRule).toMatch(/grid-template-columns:\s*1fr 1fr/)
    expect(boardRule).not.toMatch(/grid-row:\s*2/)
    expect(catalogRule).toMatch(/width:\s*100%/)
    expect(catalogRule).not.toMatch(/grid-column:\s*2/)
    expect(gridRule).toMatch(/minmax\(240px,\s*1fr\)/)
  })

  it('renders the summary panels while short landscape is active', () => {
    mockMatchMedia((query) => query.includes('max-height: 520px') || query.includes('orientation: landscape'))

    const { container, cleanup } = render(createElement(StockDashboardView, {
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      stockItems: [{
        id: 'a1',
        name: 'House vodka',
        category: 'Vodka',
        itemType: 'Spirit',
        supplier: 'Supplier',
        supplierId: 10,
        storageLocation: 'Main Storage',
        unit: 'Bottle',
        currentQuantity: 1,
        minimumQuantity: 5,
        targetQuantity: 10,
        costPrice: 20,
        active: true,
        status: 'low',
      }],
    }))

    const page = container.querySelector('.stock-dashboard-page')
    const header = page.querySelector('.stock-calm-header')
    const board = page.querySelector('.stock-today-board')
    const catalog = page.querySelector('#stock-all-products-catalog')

    expect(header.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(board.compareDocumentPosition(catalog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(board.querySelector('.stock-today-kpis')?.textContent).toContain('Low')
    expect(board.querySelector('.stock-today-kpis')?.textContent).toContain('Out of stock')
    expect(board.querySelector('.stock-today-kpis')?.textContent).toContain('To order')
    expect(board.querySelector('[aria-label="To order"]')).toBeTruthy()
    expect(board.querySelector('[aria-label="To count"]')).toBeTruthy()
    expect(board.textContent).toContain('What changed today')
    expect(catalog.querySelector('.stock-item-grid, .stock-item-card, [data-stock-compact-browse-toolbar="true"]')).toBeTruthy()
    cleanup()
  })

  it('keeps the desktop product menu below the filter bar', () => {
    mockMatchMedia(() => false)
    const bar = document.createElement('div')
    bar.setAttribute('data-stock-compact-browse-toolbar', 'true')
    bar.getBoundingClientRect = () => rect({ top: 40, bottom: 160, height: 120, width: 900, right: 900 })
    document.body.appendChild(bar)

    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => rect({
      top: 80,
      bottom: 120,
      height: 40,
      width: 44,
      left: 700,
      right: 744,
    })
    document.body.appendChild(anchor)

    const { cleanup } = render(createElement(StockItemMoreMenu, {
      isOpen: true,
      anchorEl: anchor,
      item: { id: 'item-1', name: 'House vodka', active: true },
      itemName: 'House vodka',
      onClose: vi.fn(),
    }))

    const menu = document.querySelector('[role="menu"]')
    expect(menu?.className).toContain('is-popover')
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(168)
    cleanup()
  })

  it('flips the desktop product menu upward when the card is near the bottom', () => {
    const previousHeight = window.innerHeight
    const previousWidth = window.innerWidth
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })

    const fitted = computeMenuPosition(
      { top: 560, bottom: 600, left: 656, right: 700, width: 44, height: 40 },
      340,
      280,
    )
    expect(fitted.placement).toBe('above')
    expect(fitted.top).toBe(272)
    expect(fitted.top + 280).toBeLessThanOrEqual(632)
    expect(fitted.maxHeight).toBeNull()

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })
    const constrained = computeMenuPosition(
      { top: 220, bottom: 260, left: 356, right: 400, width: 44, height: 40 },
      340,
      500,
    )
    expect(constrained.placement).toBe('above')
    expect(constrained.maxHeight).toBeGreaterThan(0)
    expect(constrained.top).toBeGreaterThanOrEqual(0)
    expect(constrained.top + constrained.maxHeight).toBeLessThanOrEqual(392)

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: previousHeight })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth })
  })
})

describe('supplier cards and recent counts layout', () => {
  it('pins supplier stats, clamps names, and lets recent counts fill the row', () => {
    expect(APP_CSS).toMatch(/\.stock-supplier-card-stats\s*\{[^}]*margin-top:\s*auto/)
    expect(APP_CSS).toMatch(/\.stock-supplier-card-heading strong\s*\{[^}]*-webkit-line-clamp:\s*2/)
    expect(APP_CSS).toMatch(/\.stock-supplier-card-contact-grid\s*\{[^}]*height:\s*calc\(1\.25em \* 2 \+ 4px\)/)
    expect(APP_CSS).toMatch(/\.inventory-count-foundation-grid\.is-recent-only \.inventory-count-session-list\s*\{[^}]*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/)

    const block = shortLandscapeBlock()
    expect(block).toMatch(/\.stock-supplier-card-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(block).toMatch(/stock-item-more-menu-section-stack\s*\{[^}]*padding-inline:\s*8px/)
  })
})

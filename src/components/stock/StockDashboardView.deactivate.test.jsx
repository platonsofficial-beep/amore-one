/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStockItemDeactivatePayload } from '../../lib/stockBulkActions'
import { buildStockNeedsAttentionGroups } from '../../lib/stockInsights'
import { filterStockDashboardItems } from '../../lib/stockDashboardBrowse'
import { buildStockDashboardSummary } from '../../lib/stockUtils'
import { StockItemMoreMenu } from './StockItemMoreMenu'
import { StockDashboardView } from './StockDashboardView'

const APP_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../App.jsx'),
  'utf8',
)

function mockMatchMedia(matches = false) {
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

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  mockMatchMedia(false)
})

describe('buildStockItemDeactivatePayload (P8.16.14f)', () => {
  it('sets active=false while preserving catalog fields', () => {
    const item = stock({ id: 'ko', name: 'KETEL ONE', currentQuantity: 4 })
    const payload = buildStockItemDeactivatePayload(item)

    expect(payload.active).toBe(false)
    expect(payload.name).toBe('KETEL ONE')
    expect(payload.currentQuantity).toBe(4)
    expect(payload.minimumQuantity).toBe(5)
  })
})

describe('StockItemMoreMenu deactivate action', () => {
  it('exposes Deactivate and invokes onDeactivate', () => {
    mockMatchMedia(true)
    const onDeactivate = vi.fn()
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const { cleanup } = render(createElement(StockItemMoreMenu, {
      isOpen: true,
      anchorEl: anchor,
      itemName: 'KETEL ONE',
      onClose: vi.fn(),
      onDeactivate,
    }))

    const deactivateBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((node) => node.textContent === 'Deactivate')

    expect(deactivateBtn).toBeTruthy()

    act(() => {
      deactivateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeactivate).toHaveBeenCalledTimes(1)
    cleanup()
    anchor.remove()
  })
})

describe('StockDashboardView deactivate flow', () => {
  it('confirms deactivate, calls onUpdateItem with active=false, and closes modal', async () => {
    mockMatchMedia(true)
    const onUpdateItem = vi.fn(async () => {})
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    const moreBtn = container.querySelector('[aria-label="More stock actions"]')
      || container.querySelector('[aria-label^="More actions for"]')
    expect(moreBtn).toBeTruthy()

    act(() => {
      moreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const deactivateMenuBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((node) => node.textContent === 'Deactivate')
    expect(deactivateMenuBtn).toBeTruthy()

    act(() => {
      deactivateMenuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dialog = document.querySelector('[aria-labelledby="stock-item-deactivate-title"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Deactivate Product?')
    expect(dialog.textContent).toContain(
      'This product will become inactive and will no longer appear in active Stock views or dashboard alerts.',
    )

    const confirmBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Deactivate')
    expect(confirmBtn).toBeTruthy()

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(onUpdateItem).toHaveBeenCalledTimes(1)
    expect(onUpdateItem).toHaveBeenCalledWith(
      'ko',
      expect.objectContaining({ active: false, name: 'KETEL ONE' }),
    )
    expect(document.querySelector('[aria-labelledby="stock-item-deactivate-title"]')).toBeNull()

    cleanup()
  })

  it('does not expose deactivate controls when canManage is false', () => {
    const onUpdateItem = vi.fn()
    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [stock({ id: 'ko', name: 'KETEL ONE' })],
      canManage: false,
      onUpdateItem,
    }))

    expect(container.querySelector('[aria-label="More stock actions"]')).toBeNull()
    expect(container.querySelector('[aria-label^="More actions for"]')).toBeNull()
    expect(document.querySelector('[role="menuitem"]')).toBeNull()
    expect(onUpdateItem).not.toHaveBeenCalled()

    cleanup()
  })
})

describe('inactive stock items leave alert surfaces (P8.16.14f)', () => {
  const now = new Date('2026-07-21T12:00:00.000Z')

  it('excludes deactivated items from Needs Count, Low Stock, To Order, and counts', () => {
    const active = stock({
      id: 'active',
      name: 'Belvedere',
      currentQuantity: 12,
      minimumQuantity: 5,
      targetQuantity: 12,
      lastCount: null,
      status: 'ok',
    })
    const deactivated = stock({
      id: 'gone',
      name: 'KETEL ONE',
      currentQuantity: 1,
      minimumQuantity: 5,
      targetQuantity: 10,
      lastCount: null,
      status: 'low',
      active: false,
    })
    const catalog = [active, deactivated]

    const groups = buildStockNeedsAttentionGroups(catalog, { canManage: true, now })
    const summary = buildStockDashboardSummary(catalog)
    const toOrder = filterStockDashboardItems(catalog, { statusFilter: 'order' })

    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(['active'])
    expect(toOrder.map((item) => item.id)).toEqual([])
    expect(summary.totalItems).toBe(1)
    expect(summary.lowStock).toBe(0)
    expect(summary.toOrder).toBe(0)
  })

  it('keeps other active alert items visible', () => {
    const low = stock({
      id: 'low',
      name: 'Tanqueray',
      currentQuantity: 2,
      minimumQuantity: 5,
      targetQuantity: 10,
      lastCount: { createdAt: '2026-07-20T12:00:00.000Z' },
      status: 'low',
    })
    const deactivated = stock({
      id: 'gone',
      name: 'MILINENTO',
      currentQuantity: 2,
      minimumQuantity: 5,
      targetQuantity: 10,
      lastCount: { createdAt: '2026-07-20T12:00:00.000Z' },
      status: 'low',
      active: false,
    })

    const groups = buildStockNeedsAttentionGroups([low, deactivated], {
      canManage: true,
      now,
    })
    const lowGroup = groups.find((group) => group.id === 'low')

    expect(lowGroup?.items.map((item) => item.id)).toEqual(['low'])
    expect(buildStockDashboardSummary([low, deactivated]).lowStock).toBe(1)
  })
})

describe('inventory catalog delete remains independent', () => {
  it('does not wire inventory delete to stock deactivate helpers', () => {
    expect(APP_SOURCE).toContain('await deleteInventoryItem(inventoryPendingDelete.id)')
    expect(APP_SOURCE).not.toContain('buildStockItemDeactivatePayload')
    expect(APP_SOURCE).not.toContain('deactivateStockAlertItemsForDeletedInventoryItem')
  })
})

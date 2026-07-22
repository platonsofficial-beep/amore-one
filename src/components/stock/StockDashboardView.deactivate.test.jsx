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

function openDeactivateFromCard(container, productName) {
  const cards = Array.from(container.querySelectorAll('.stock-item-card'))
  const card = cards.find((node) => node.textContent?.includes(productName))
    || container
  const moreBtn = card.querySelector('[aria-label="More stock actions"]')
    || card.querySelector('[aria-label^="More actions for"]')
    || container.querySelector('[aria-label="More stock actions"]')
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
}

function getDeactivateDialog() {
  return document.querySelector('[aria-labelledby="stock-item-deactivate-title"]')
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

beforeEach(() => {
  mockMatchMedia(true)
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
  it('passes the captured menu item into onDeactivate', () => {
    const onDeactivate = vi.fn()
    const item = stock({ id: 'ko', name: 'KETEL ONE' })
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const { cleanup } = render(createElement(StockItemMoreMenu, {
      isOpen: true,
      anchorEl: anchor,
      item,
      itemName: item.name,
      onClose: vi.fn(),
      onDeactivate,
    }))

    const deactivateBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((node) => node.textContent === 'Deactivate')

    act(() => {
      deactivateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDeactivate).toHaveBeenCalledTimes(1)
    expect(onDeactivate).toHaveBeenCalledWith(item)
    cleanup()
    anchor.remove()
  })

  it('still invokes other menu handlers', () => {
    const onEdit = vi.fn()
    const onHistory = vi.fn()
    const item = stock({ id: 'ko', name: 'KETEL ONE' })
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const { cleanup } = render(createElement(StockItemMoreMenu, {
      isOpen: true,
      anchorEl: anchor,
      item,
      itemName: item.name,
      onClose: vi.fn(),
      onEdit,
      onHistory,
      onDeactivate: vi.fn(),
    }))

    const editBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((node) => node.textContent === 'Edit')
    const historyBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((node) => node.textContent === 'History & details')

    act(() => {
      editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onHistory).toHaveBeenCalledTimes(1)
    cleanup()
    anchor.remove()
  })
})

describe('StockDashboardView deactivate confirmation UI (P8.16.14h)', () => {
  it('opens the confirmation modal from the real ⋯ → Deactivate path', () => {
    vi.useFakeTimers()
    const onUpdateItem = vi.fn(async () => {})
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'KETEL ONE')

    const dialog = getDeactivateDialog()
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Deactivate Product?')
    expect(dialog.textContent).toContain('KETEL ONE')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(onUpdateItem).not.toHaveBeenCalled()

    cleanup()
  })

  it('keeps the modal open through a ghost backdrop click from the menu gesture', () => {
    vi.useFakeTimers()
    const onUpdateItem = vi.fn(async () => {})
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'KETEL ONE')
    expect(getDeactivateDialog()).toBeTruthy()

    const backdrop = document.querySelector('.stock-item-deactivate-backdrop')
    expect(backdrop).toBeTruthy()

    act(() => {
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getDeactivateDialog()).toBeTruthy()
    expect(onUpdateItem).not.toHaveBeenCalled()

    cleanup()
  })

  it('Cancel closes the modal without calling onUpdateItem', () => {
    vi.useFakeTimers()
    const onUpdateItem = vi.fn(async () => {})
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'KETEL ONE')

    act(() => {
      vi.runAllTimers()
    })

    const dialog = getDeactivateDialog()
    const cancelBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Cancel')

    act(() => {
      cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getDeactivateDialog()).toBeNull()
    expect(onUpdateItem).not.toHaveBeenCalled()

    cleanup()
  })

  it('Close (X) and backdrop dismiss do not call onUpdateItem', () => {
    vi.useFakeTimers()
    const onUpdateItem = vi.fn(async () => {})
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'KETEL ONE')

    act(() => {
      vi.runAllTimers()
    })

    const closeBtn = getDeactivateDialog()?.querySelector('[aria-label="Close"]')
    act(() => {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(getDeactivateDialog()).toBeNull()
    expect(onUpdateItem).not.toHaveBeenCalled()

    openDeactivateFromCard(container, 'KETEL ONE')
    act(() => {
      vi.runAllTimers()
    })

    const backdrop = document.querySelector('.stock-item-deactivate-backdrop')
    act(() => {
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(getDeactivateDialog()).toBeNull()
    expect(onUpdateItem).not.toHaveBeenCalled()

    cleanup()
  })

  it('Confirm sends the selected item id with active:false', async () => {
    vi.useFakeTimers()
    const onUpdateItem = vi.fn(async () => {})
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'KETEL ONE')

    act(() => {
      vi.runAllTimers()
    })

    const dialog = getDeactivateDialog()
    const confirmBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Deactivate')

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(onUpdateItem).toHaveBeenCalledTimes(1)
    expect(onUpdateItem).toHaveBeenCalledWith(
      'ko',
      expect.objectContaining({ active: false, name: 'KETEL ONE' }),
    )
    expect(getDeactivateDialog()).toBeNull()

    cleanup()
  })

  it('keeps the modal open and shows an error when confirm update rejects', async () => {
    vi.useFakeTimers()
    const onUpdateItem = vi.fn(async () => {
      throw new Error('Unable to update stock item right now.')
    })
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'KETEL ONE')

    act(() => {
      vi.runAllTimers()
    })

    const dialog = getDeactivateDialog()
    const confirmBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Deactivate')

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onUpdateItem).toHaveBeenCalledTimes(1)
    expect(getDeactivateDialog()).toBeTruthy()
    expect(getDeactivateDialog()?.textContent).toContain('Unable to update stock item right now.')
    expect(container.textContent).toContain('KETEL ONE')

    const retryBtn = Array.from(getDeactivateDialog().querySelectorAll('button'))
      .find((node) => node.textContent === 'Deactivate')
    expect(retryBtn?.disabled).toBe(false)

    cleanup()
  })

  it('shows saving state and ignores duplicate confirm clicks while pending', async () => {
    vi.useFakeTimers()
    let resolveUpdate
    const onUpdateItem = vi.fn(() => new Promise((resolve) => {
      resolveUpdate = resolve
    }))
    const item = stock({ id: 'ko', name: 'KETEL ONE' })

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'KETEL ONE')

    act(() => {
      vi.runAllTimers()
    })

    const dialog = getDeactivateDialog()
    const confirmBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Deactivate')

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(onUpdateItem).toHaveBeenCalledTimes(1)
    expect(getDeactivateDialog()?.textContent).toContain('Saving')

    const busyBtn = Array.from(getDeactivateDialog().querySelectorAll('button'))
      .find((node) => node.textContent === 'Saving…' || node.textContent === 'Saving...')
    expect(busyBtn?.disabled).toBe(true)

    await act(async () => {
      busyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(onUpdateItem).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveUpdate()
      await Promise.resolve()
    })

    expect(getDeactivateDialog()).toBeNull()
    cleanup()
  })

  it('targets the exact product when two cards are present', () => {
    vi.useFakeTimers()
    const onUpdateItem = vi.fn(async () => {})
    const items = [
      stock({ id: 'ko', name: 'KETEL ONE' }),
      stock({ id: 'bot', name: 'THE BOTANIST', category: 'Gin' }),
    ]

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: items,
      canManage: true,
      onUpdateItem,
      isSaving: false,
    }))

    openDeactivateFromCard(container, 'THE BOTANIST')

    const dialog = getDeactivateDialog()
    expect(dialog?.textContent).toContain('THE BOTANIST')
    expect(dialog?.textContent).not.toContain('KETEL ONE')

    act(() => {
      vi.runAllTimers()
    })

    const confirmBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Deactivate')

    act(() => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onUpdateItem).toHaveBeenCalledWith(
      'bot',
      expect.objectContaining({ active: false, name: 'THE BOTANIST' }),
    )

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
})

describe('inventory catalog delete remains independent', () => {
  it('does not wire inventory delete to stock deactivate helpers', () => {
    expect(APP_SOURCE).toContain('await deleteInventoryItem(inventoryPendingDelete.id)')
    expect(APP_SOURCE).not.toContain('buildStockItemDeactivatePayload')
    expect(APP_SOURCE).not.toContain('deactivateStockAlertItemsForDeletedInventoryItem')
  })
})

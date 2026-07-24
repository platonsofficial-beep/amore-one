/**
 * @vitest-environment jsdom
 * P8.16.25 / P8.16.26c — Single product permanent delete UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockItemPermanentDeleteDialog } from './StockItemPermanentDeleteDialog'
import { StockItemMoreMenu } from './StockItemMoreMenu'
import { StockDashboardView } from './StockDashboardView'
import {
  buildOpenInventoryCountBlockDetails,
  buildStockItemPermanentDeletePhrase,
  matchesStockItemPermanentDeletePhrase,
  normalizeStockItemPermanentDeletePhrase,
} from '../../lib/stockItemPermanentDeleteUi'
import { StockItemPermanentDeleteError } from '../../services/stockItemPermanentDeleteService'
import { StockItemPermanentDeletePreviewError } from '../../services/stockItemPermanentDeletePreviewService'

const previewMock = vi.fn()
const deleteMock = vi.fn()
const signInMock = vi.fn()
const useAuthMock = vi.fn()
const openCountBlockerMock = vi.fn()

vi.mock('../../services/stockItemPermanentDeletePreviewService', async () => {
  const actual = await vi.importActual('../../services/stockItemPermanentDeletePreviewService')
  return {
    ...actual,
    previewStockItemPermanentDelete: (...args) => previewMock(...args),
  }
})

vi.mock('../../services/stockItemPermanentDeleteService', async () => {
  const actual = await vi.importActual('../../services/stockItemPermanentDeleteService')
  return {
    ...actual,
    deleteStockItemPermanently: (...args) => deleteMock(...args),
  }
})

vi.mock('../../services/authService', () => ({
  signInWithPassword: (...args) => signInMock(...args),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../../services/inventoryCountService', () => ({
  getOpenInventoryCountBlockerForStockItem: (...args) => openCountBlockerMock(...args),
}))

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

function setNativeValue(element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function previewPayload(overrides = {}) {
  return {
    workspace_id: 'ws-1',
    preview_only: true,
    product: {
      id: 'item-1',
      name: 'KETEL ONE',
      active: false,
      current_quantity: 2,
      unit: 'btl',
      storage_location: 'Bar',
    },
    movements: {
      receive: 1,
      usage: 2,
      adjustment: 3,
      stock_count: 0,
      total: 6,
    },
    orders: {
      draft: 0,
      sent: 0,
      received: 1,
      cancelled: 0,
      total: 1,
    },
    inventory_count: {
      posted_references: 2,
      open_references: 0,
    },
    import: {
      matched_refs: 1,
      applied_refs: 0,
    },
    migration: {
      map_refs: 1,
    },
    supplier: {
      supplier_id: 9,
      supplier_name: 'Demo Supplier',
    },
    ...overrides,
  }
}

function getDialog() {
  return document.querySelector('[aria-labelledby="stock-item-permanent-delete-title"]')
}

function getDeleteBtn() {
  return Array.from(getDialog()?.querySelectorAll('button') ?? [])
    .find((node) => `${node.textContent}`.includes('Permanently delete') || node.textContent === 'Deleting…')
}

async function waitForPreview() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

beforeEach(() => {
  mockMatchMedia(true)
  useAuthMock.mockReturnValue({
    user: { email: 'owner@amore.test' },
    session: { user: { email: 'owner@amore.test' } },
  })
  previewMock.mockResolvedValue(previewPayload())
  openCountBlockerMock.mockResolvedValue(null)
  deleteMock.mockResolvedValue({
    success: true,
    deleted: {
      product: { id: 'item-1', name: 'KETEL ONE' },
      movements: { total: 6 },
    },
    preserved: {},
  })
  signInMock.mockResolvedValue({})
})

describe('stockItemPermanentDeleteUi helpers', () => {
  const product = 'THE BOTANIST'

  it('builds contextual open-count block details from session metadata', () => {
    const details = buildOpenInventoryCountBlockDetails({
      productName: product,
      blocker: {
        sessionId: 'session-1',
        countTypeLabel: 'New Count',
        statusLabel: 'In Progress',
        storageLocation: 'Main Storage',
        startedAt: '2026-07-20T10:00:00.000Z',
        operatorName: 'PLATON SACHINIS',
      },
    })

    expect(details.title).toBe('Blocked by Inventory Count')
    expect(details.fallbackMessage).toBeNull()
    expect(details.fields).toEqual([
      { label: 'Product', value: 'THE BOTANIST' },
      { label: 'Session', value: 'New Count' },
      { label: 'Status', value: 'In Progress' },
      { label: 'Location', value: 'Main Storage' },
      { label: 'Started', value: expect.stringMatching(/20.*Jul.*2026|Jul.*20.*2026/) },
      { label: 'Operator', value: 'PLATON SACHINIS' },
    ])
    expect(details.guidance).toContain('Finish or cancel this count')
  })

  it('falls back to the generic open-count message when metadata is unavailable', () => {
    const details = buildOpenInventoryCountBlockDetails({
      productName: product,
      blocker: null,
    })

    expect(details.title).toBe('Blocked by Inventory Count')
    expect(details.fields).toBeNull()
    expect(details.fallbackMessage).toContain('open inventory count')
  })

  it('builds DELETE <NAME> display phrase', () => {
    expect(buildStockItemPermanentDeletePhrase(product)).toBe('DELETE THE BOTANIST')
  })

  it('normalizes by trim, uppercase, and removing whitespace / - / _', () => {
    expect(normalizeStockItemPermanentDeletePhrase('  delete the botanist  '))
      .toBe('DELETETHEBOTANIST')
    expect(normalizeStockItemPermanentDeletePhrase('DELETE   THE   BOTANIST'))
      .toBe('DELETETHEBOTANIST')
    expect(normalizeStockItemPermanentDeletePhrase('delete-the-botanist'))
      .toBe('DELETETHEBOTANIST')
    expect(normalizeStockItemPermanentDeletePhrase('delete_the_botanist'))
      .toBe('DELETETHEBOTANIST')
  })

  it('accepts exact phrase', () => {
    expect(matchesStockItemPermanentDeletePhrase('DELETE THE BOTANIST', product)).toBe(true)
  })

  it('accepts lowercase', () => {
    expect(matchesStockItemPermanentDeletePhrase('delete the botanist', product)).toBe(true)
  })

  it('accepts mixed case', () => {
    expect(matchesStockItemPermanentDeletePhrase('Delete The Botanist', product)).toBe(true)
  })

  it('accepts multiple spaces', () => {
    expect(matchesStockItemPermanentDeletePhrase('DELETE   THE   BOTANIST', product)).toBe(true)
  })

  it('accepts no spaces', () => {
    expect(matchesStockItemPermanentDeletePhrase('Deletethebotanist', product)).toBe(true)
  })

  it('accepts hyphens', () => {
    expect(matchesStockItemPermanentDeletePhrase('delete-the-botanist', product)).toBe(true)
  })

  it('accepts underscores', () => {
    expect(matchesStockItemPermanentDeletePhrase('delete_the_botanist', product)).toBe(true)
  })

  it('rejects partial phrase', () => {
    expect(matchesStockItemPermanentDeletePhrase('DELETE BOTANIST', product)).toBe(false)
    expect(matchesStockItemPermanentDeletePhrase('DELETE GIN', product)).toBe(false)
    expect(matchesStockItemPermanentDeletePhrase('DELETE THE', product)).toBe(false)
    expect(matchesStockItemPermanentDeletePhrase('BOTANIST', product)).toBe(false)
    expect(matchesStockItemPermanentDeletePhrase('DELETE', product)).toBe(false)
  })

  it('rejects unrelated text', () => {
    expect(matchesStockItemPermanentDeletePhrase('Random text', product)).toBe(false)
  })
})

describe('StockItemMoreMenu permanent delete entry', () => {
  it('shows Permanently Delete after a separator and passes the captured item', () => {
    const onPermanentlyDelete = vi.fn()
    const item = { id: 'item-1', name: 'KETEL ONE', active: true }
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const { cleanup } = render(createElement(StockItemMoreMenu, {
      isOpen: true,
      anchorEl: anchor,
      item,
      itemName: item.name,
      onClose: vi.fn(),
      onPermanentlyDelete,
      onDeactivate: vi.fn(),
    }))

    const labels = Array.from(document.querySelectorAll('[role="menuitem"]')).map((node) => node.textContent)
    expect(labels).toContain('Edit')
    expect(labels).toContain('Deactivate')
    expect(labels).toContain('Permanently Delete…')
    expect(document.querySelector('[role="separator"]')).toBeTruthy()

    act(() => {
      Array.from(document.querySelectorAll('[role="menuitem"]'))
        .find((node) => node.textContent === 'Permanently Delete…')
        ?.click()
    })

    expect(onPermanentlyDelete).toHaveBeenCalledWith(item)
    cleanup()
  })
})

describe('StockItemPermanentDeleteDialog', () => {
  it('shows loading then preview with movement and preserved sections', async () => {
    let resolvePreview
    previewMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePreview = resolve
    }))

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    expect(getDialog()?.textContent).toContain('Loading permanent delete preview')

    await act(async () => {
      resolvePreview(previewPayload())
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(previewMock).toHaveBeenCalledWith('ws-1', 'item-1')
    expect(getDialog()?.textContent).toContain('KETEL ONE')
    expect(getDialog()?.textContent).toContain('Receive')
    expect(getDialog()?.textContent).toContain('Usage')
    expect(getDialog()?.textContent).toContain('Adjustments')
    expect(getDialog()?.textContent).toContain('Stock Count')
    expect(getDialog()?.textContent).toContain('The following will be preserved')
    expect(getDialog()?.textContent).toContain('Purchase Orders')
    expect(getDialog()?.textContent).toContain('Inventory Count snapshots')
    expect(getDialog()?.textContent).toContain('Import history')
    expect(getDialog()?.textContent).toContain('Migration history')
    expect(getDeleteBtn()?.disabled).toBe(true)

    cleanup()
  })

  it('keeps delete disabled until phrase and password are valid', async () => {
    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await waitForPreview()
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'delete ketel one',
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        'secret',
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(false)

    cleanup()
  })

  it('preserves spaces while typing (iPad SPACE regression)', async () => {
    vi.useFakeTimers()
    previewMock.mockResolvedValue(previewPayload({
      product: {
        id: 'item-1',
        name: 'THE BOTANIST',
        active: false,
        current_quantity: 2,
        unit: 'btl',
        storage_location: 'Bar',
      },
    }))

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'THE BOTANIST' },
      onClose: vi.fn(),
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const confirmInput = getDialog().querySelector('input[aria-label="Typed confirmation phrase"]')
    await act(async () => {
      setNativeValue(confirmInput, 'DELETE ')
    })
    expect(confirmInput.value).toBe('DELETE ')

    // Former bug: autofill poll trimmed confirm DOM → setConfirmText → trailing space vanished.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(confirmInput.value).toBe('DELETE ')

    await act(async () => {
      setNativeValue(confirmInput, 'DELETE THE ')
    })
    expect(confirmInput.value).toBe('DELETE THE ')

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(confirmInput.value).toBe('DELETE THE ')

    cleanup()
    vi.useRealTimers()
  })

  it('enables delete for normalized phrase variants and rejects partials', async () => {
    previewMock.mockResolvedValue(previewPayload({
      product: {
        id: 'item-1',
        name: 'THE BOTANIST',
        active: false,
        current_quantity: 2,
        unit: 'btl',
        storage_location: 'Bar',
      },
    }))

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'THE BOTANIST' },
      onClose: vi.fn(),
    }))

    await waitForPreview()
    const confirmInput = getDialog().querySelector('input[aria-label="Typed confirmation phrase"]')
    const passwordInput = getDialog().querySelector('input[aria-label="Account password"]')

    await act(async () => {
      setNativeValue(passwordInput, 'secret')
    })

    await act(async () => {
      setNativeValue(confirmInput, 'DELETE BOTANIST')
    })
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(confirmInput, 'delete-the-botanist')
    })
    expect(getDeleteBtn()?.disabled).toBe(false)

    await act(async () => {
      setNativeValue(confirmInput, 'DELETE   THE   BOTANIST')
    })
    expect(getDeleteBtn()?.disabled).toBe(false)

    cleanup()
  })

  it('wrong password shows error and never calls delete', async () => {
    signInMock.mockRejectedValueOnce(new Error('Invalid login'))

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await waitForPreview()
    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'DELETE KETEL ONE',
      )
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        'wrong',
      )
    })

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(signInMock).toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
    expect(getDialog()?.textContent).toContain('Incorrect password')

    cleanup()
  })

  it('maps blocked draft, sent, and open-count errors', async () => {
    const cases = [
      ['BLOCKED_DRAFT_ORDER', 'draft purchase order'],
      ['BLOCKED_SENT_ORDER', 'sent purchase order'],
      ['BLOCKED_OPEN_COUNT', 'open inventory count'],
    ]

    for (const [code, phrase] of cases) {
      deleteMock.mockRejectedValueOnce(new StockItemPermanentDeleteError(code, code))
      signInMock.mockResolvedValueOnce({})

      const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
        workspaceId: 'ws-1',
        item: { id: 'item-1', name: 'KETEL ONE' },
        onClose: vi.fn(),
      }))

      await waitForPreview()
      await act(async () => {
        setNativeValue(
          getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
          'DELETE KETEL ONE',
        )
        setNativeValue(
          getDialog().querySelector('input[aria-label="Account password"]'),
          'secret',
        )
      })

      await act(async () => {
        getDialog().querySelector('form')?.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        )
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(getDialog()?.textContent.toLowerCase()).toContain(phrase)
      cleanup()
      document.body.innerHTML = ''
    }
  })

  it('successful delete shows completion and refreshes list', async () => {
    const onCompleted = vi.fn(async () => {})
    const onClose = vi.fn()

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose,
      onCompleted,
    }))

    await waitForPreview()
    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'DELETE KETEL ONE',
      )
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        'secret',
      )
    })

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deleteMock).toHaveBeenCalledWith('ws-1', 'item-1')
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(getDialog()?.textContent).toContain('Successfully deleted')
    expect(getDialog()?.textContent).toContain('6 Stock movements')
    expect(getDialog()?.textContent).toContain('Preserved')

    await act(async () => {
      Array.from(getDialog().querySelectorAll('button'))
        .find((node) => node.textContent === 'Done')
        ?.click()
    })
    expect(onClose).toHaveBeenCalled()

    cleanup()
  })

  it('preview failure shows error and keeps delete unavailable', async () => {
    previewMock.mockRejectedValueOnce(
      new StockItemPermanentDeletePreviewError('FORBIDDEN', 'nope'),
    )

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await waitForPreview()
    expect(getDialog()?.textContent).toContain('permission')
    expect(getDeleteBtn()?.disabled).toBe(true)

    cleanup()
  })
})

describe('StockDashboardView permanent delete wiring', () => {
  it('opens dialog from menu and hides deleted product after success', async () => {
    const onStockItemsChanged = vi.fn(async () => {})
    const item = {
      id: 'item-1',
      name: 'KETEL ONE',
      category: 'Vodka',
      itemType: 'Spirit',
      supplier: 'Demo',
      unit: 'btl',
      currentQuantity: 2,
      minimumQuantity: 1,
      targetQuantity: 4,
      costPrice: 10,
      storageLocation: 'Bar',
      active: true,
      status: 'ok',
    }

    const { container, cleanup } = render(createElement(StockDashboardView, {
      stockItems: [item],
      canManage: true,
      workspaceId: 'ws-1',
      isWorkspaceReady: true,
      onStockItemsChanged,
    }))

    const moreBtn = container.querySelector('[aria-label="More stock actions"]')
      || container.querySelector('[aria-label^="More actions for"]')
      || container.querySelector('.stock-item-more-btn')
    expect(moreBtn).toBeTruthy()

    await act(async () => {
      moreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const deleteMenuBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((node) => node.textContent === 'Permanently Delete…')
    expect(deleteMenuBtn).toBeTruthy()

    await act(async () => {
      deleteMenuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitForPreview()
    expect(getDialog()?.textContent ?? '').toContain('Permanently Delete Product')

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'DELETE KETEL ONE',
      )
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        'secret',
      )
    })

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onStockItemsChanged).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain('KETEL ONE')

    cleanup()
  })
})

describe('Permanent Delete open inventory count guidance (P8.16.29)', () => {
  it('shows contextual blocking session details when open references exist', async () => {
    previewMock.mockResolvedValue(previewPayload({
      product: {
        id: 'item-1',
        name: 'THE BOTANIST',
        active: false,
        current_quantity: 2,
        unit: 'btl',
        storage_location: 'Bar',
      },
      inventory_count: {
        posted_references: 0,
        open_references: 1,
      },
    }))
    openCountBlockerMock.mockResolvedValue({
      sessionId: 'session-open-1',
      countTypeLabel: 'New Count',
      statusLabel: 'In Progress',
      storageLocation: 'Main Storage',
      startedAt: '2026-07-20T10:00:00.000Z',
      operatorName: 'PLATON SACHINIS',
    })

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'THE BOTANIST' },
      onClose: vi.fn(),
    }))

    await waitForPreview()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(openCountBlockerMock).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      stockItemId: 'item-1',
    })

    const block = getDialog()?.querySelector('[aria-label="Blocked by Inventory Count"]')
    expect(block).toBeTruthy()
    expect(block.textContent).toContain('Blocked by Inventory Count')
    expect(block.textContent).toContain('THE BOTANIST')
    expect(block.textContent).toContain('New Count')
    expect(block.textContent).toContain('In Progress')
    expect(block.textContent).toContain('Main Storage')
    expect(block.textContent).toContain('PLATON SACHINIS')
    expect(block.textContent).toMatch(/20.*Jul.*2026|Jul.*20.*2026/)
    expect(block.textContent).toContain('Finish or cancel this count before permanently deleting this product.')

    cleanup()
  })

  it('keeps the generic open-count fallback when blocker metadata is unavailable', async () => {
    previewMock.mockResolvedValue(previewPayload({
      inventory_count: {
        posted_references: 0,
        open_references: 1,
      },
    }))
    openCountBlockerMock.mockResolvedValue(null)

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await waitForPreview()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const block = getDialog()?.querySelector('[aria-label="Blocked by Inventory Count"]')
    expect(block).toBeTruthy()
    expect(block.textContent).toContain('This product is in an open inventory count')
    expect(block.textContent).not.toContain('Session')

    cleanup()
  })
})

describe('Permanent Delete dialog viewport layout (P8.16.30a)', () => {
  it('uses viewport-constrained shell with internal scroll body and sticky footer', async () => {
    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await waitForPreview()

    const dialog = getDialog()
    expect(dialog?.className).toContain('has-viewport-max-height')
    expect(dialog?.className).toContain('stock-item-permanent-delete-dialog')
    expect(dialog?.querySelector('.stock-item-permanent-delete-body.is-internal-scroll')).toBeTruthy()
    expect(dialog?.querySelector('.stock-item-permanent-delete-actions.is-dialog-footer')).toBeTruthy()
    expect(dialog?.querySelector('.stock-item-permanent-delete-form')).toBeTruthy()
    expect(dialog?.querySelector('input[aria-label="Typed confirmation phrase"]')).toBeTruthy()
    expect(dialog?.querySelector('input[aria-label="Account password"]')).toBeTruthy()

    cleanup()
  })

  it('keeps blocker metadata and Open Inventory Count inside the scrollable body', async () => {
    previewMock.mockResolvedValue(previewPayload({
      inventory_count: {
        posted_references: 0,
        open_references: 1,
      },
    }))
    openCountBlockerMock.mockResolvedValue({
      sessionId: 'session-open-1',
      countTypeLabel: 'New Count',
      statusLabel: 'In Progress',
      storageLocation: 'Main Storage',
      startedAt: '2026-07-20T10:00:00.000Z',
      operatorName: 'PLATON SACHINIS',
    })

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
      onOpenBlockingInventoryCount: vi.fn(),
    }))

    await waitForPreview()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const body = getDialog()?.querySelector('.stock-item-permanent-delete-body.is-internal-scroll')
    const block = body?.querySelector('[aria-label="Blocked by Inventory Count"]')
    expect(block).toBeTruthy()
    expect(block.textContent).toContain('Product')
    expect(block.textContent).toContain('Session')
    expect(block.textContent).toContain('Status')
    expect(block.textContent).toContain('Location')
    expect(block.textContent).toContain('Started')
    expect(block.textContent).toContain('Operator')
    expect(block.textContent).toContain('New Count')
    expect(block.textContent).toContain('PLATON SACHINIS')
    expect(
      Array.from(block.querySelectorAll('button'))
        .some((node) => node.textContent === 'Open Inventory Count'),
    ).toBe(true)
    expect(getDialog()?.querySelector('.stock-item-permanent-delete-actions.is-dialog-footer')).toBeTruthy()
    expect(getDialog()?.querySelector('input[aria-label="Typed confirmation phrase"]')).toBeTruthy()
    expect(getDialog()?.querySelector('input[aria-label="Account password"]')).toBeTruthy()

    cleanup()
  })
})

describe('Permanent Delete open inventory count deep link (P8.16.30)', () => {
  it('renders Open Inventory Count and navigates with the blocking session id', async () => {
    const onClose = vi.fn()
    const onOpenBlockingInventoryCount = vi.fn()

    previewMock.mockResolvedValue(previewPayload({
      inventory_count: {
        posted_references: 0,
        open_references: 1,
      },
    }))
    openCountBlockerMock.mockResolvedValue({
      sessionId: 'session-open-1',
      countTypeLabel: 'New Count',
      statusLabel: 'In Progress',
      storageLocation: 'Main Storage',
      startedAt: '2026-07-20T10:00:00.000Z',
      operatorName: 'PLATON SACHINIS',
    })

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose,
      onOpenBlockingInventoryCount,
    }))

    await waitForPreview()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const openBtn = Array.from(getDialog()?.querySelectorAll('button') ?? [])
      .find((node) => node.textContent === 'Open Inventory Count')
    expect(openBtn).toBeTruthy()

    await act(async () => {
      openBtn.click()
    })

    expect(onOpenBlockingInventoryCount).toHaveBeenCalledWith('session-open-1')
    expect(onClose).toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()

    cleanup()
  })

  it('does not change the successful delete path when open-count guidance is unused', async () => {
    const onCompleted = vi.fn()
    const onClose = vi.fn()

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose,
      onCompleted,
      onOpenBlockingInventoryCount: vi.fn(),
    }))

    await waitForPreview()
    expect(getDialog()?.textContent).not.toContain('Open Inventory Count')

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'DELETE KETEL ONE',
      )
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        'secret',
      )
    })

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deleteMock).toHaveBeenCalled()
    expect(onCompleted).toHaveBeenCalled()
    expect(getDialog()?.textContent).toContain('Successfully deleted')

    cleanup()
  })
})

describe('Permanent Delete execution error visibility (P8.16.36)', () => {
  async function fillAndSubmit(phrase = 'DELETE KETEL ONE', password = 'secret') {
    await waitForPreview()
    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        phrase,
      )
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        password,
      )
    })

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function getFooterExecutionAlert() {
    return getDialog()?.querySelector(
      '.stock-item-permanent-delete-actions.is-dialog-footer [role="alert"].stock-item-permanent-delete-execution-error',
    )
  }

  it('shows delete/RPC failure in the sticky footer alert without body scroll reliance', async () => {
    const onCompleted = vi.fn()
    deleteMock.mockRejectedValueOnce(
      new StockItemPermanentDeleteError('INTERNAL', 'boom'),
    )

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
      onCompleted,
    }))

    await fillAndSubmit()

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(onCompleted).not.toHaveBeenCalled()
    expect(getDialog()?.textContent).toContain('Permanently Delete Product')
    expect(getDeleteBtn()?.textContent).toBe('Permanently delete')
    expect(getDeleteBtn()?.disabled).toBe(false)

    const alert = getFooterExecutionAlert()
    expect(alert).toBeTruthy()
    expect(alert.textContent.length).toBeGreaterThan(0)
    expect(
      getDialog()?.querySelector('.stock-item-permanent-delete-body.is-internal-scroll [role="alert"]'),
    ).toBeNull()
    expect(alert.parentElement?.className).toContain('is-dialog-footer')

    cleanup()
  })

  it('shows password failure in the sticky footer and never calls delete', async () => {
    signInMock.mockRejectedValueOnce(new Error('Invalid login'))

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await fillAndSubmit('DELETE KETEL ONE', 'wrong')

    expect(signInMock).toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
    expect(getDeleteBtn()?.textContent).toBe('Permanently delete')

    const alert = getFooterExecutionAlert()
    expect(alert).toBeTruthy()
    expect(alert.textContent).toContain('Incorrect password')

    cleanup()
  })

  it('moves focus to the footer alert after execution failure, not the confirm input', async () => {
    deleteMock.mockRejectedValueOnce(
      new StockItemPermanentDeleteError('INTERNAL', 'boom'),
    )

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await fillAndSubmit()

    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    const alert = getFooterExecutionAlert()
    const confirmInput = getDialog()?.querySelector('input[aria-label="Typed confirmation phrase"]')
    expect(alert).toBeTruthy()
    expect(document.activeElement).toBe(alert)
    expect(document.activeElement).not.toBe(confirmInput)

    cleanup()
  })

  it('allows retry after failure without duplicate in-flight requests from one click', async () => {
    deleteMock
      .mockRejectedValueOnce(new StockItemPermanentDeleteError('INTERNAL', 'boom'))
      .mockResolvedValueOnce({
        success: true,
        deleted: {
          product: { id: 'item-1', name: 'KETEL ONE' },
          movements: { total: 6 },
        },
        preserved: {},
      })

    const onCompleted = vi.fn(async () => {})
    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
      onCompleted,
    }))

    await fillAndSubmit()
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(getFooterExecutionAlert()).toBeTruthy()
    expect(getDeleteBtn()?.disabled).toBe(false)

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deleteMock).toHaveBeenCalledTimes(2)
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(getDialog()?.textContent).toContain('Successfully deleted')
    expect(getFooterExecutionAlert()).toBeNull()

    cleanup()
  })

  it('keeps successful delete free of failure alerts and still runs onCompleted', async () => {
    const onCompleted = vi.fn(async () => {})

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
      onCompleted,
    }))

    await fillAndSubmit()

    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(getDialog()?.textContent).toContain('Successfully deleted')
    expect(getFooterExecutionAlert()).toBeNull()
    expect(getDialog()?.querySelector('[role="alert"]')).toBeNull()

    cleanup()
  })

  it('keeps preview-error behavior in the scroll body unchanged', async () => {
    previewMock.mockRejectedValueOnce(
      new StockItemPermanentDeletePreviewError('FORBIDDEN', 'nope'),
    )

    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await waitForPreview()

    const bodyAlert = getDialog()?.querySelector(
      '.stock-item-permanent-delete-body [role="alert"]',
    )
    expect(bodyAlert).toBeTruthy()
    expect(bodyAlert.textContent).toContain('permission')
    expect(getFooterExecutionAlert()).toBeNull()
    expect(getDeleteBtn()?.disabled).toBe(true)

    cleanup()
  })

  it('keeps confirmation phrase, password, and button enable rules unchanged', async () => {
    const { cleanup } = render(createElement(StockItemPermanentDeleteDialog, {
      workspaceId: 'ws-1',
      item: { id: 'item-1', name: 'KETEL ONE' },
      onClose: vi.fn(),
    }))

    await waitForPreview()
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'DELETE KETEL',
      )
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        'secret',
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'DELETE KETEL ONE',
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(false)

    cleanup()
  })
})

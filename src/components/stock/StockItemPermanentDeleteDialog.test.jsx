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

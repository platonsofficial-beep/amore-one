/**
 * @vitest-environment jsdom
 * P8.16.21 / P8.16.21a — Purchase Order cleanup UI execution path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE, StockOrderCleanupDialog } from './StockOrderCleanupDialog'
import { StockOrdersView } from './StockOrdersView'
import { StockOrderCleanupError } from '../../services/stockOrderCleanupService'

const previewMock = vi.fn()
const cleanupMock = vi.fn()
const signInMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../../services/stockOrderCleanupService', async () => {
  const actual = await vi.importActual('../../services/stockOrderCleanupService')
  return {
    ...actual,
    previewPurchaseOrderCleanup: (...args) => previewMock(...args),
    cleanupPurchaseOrderDocuments: (...args) => cleanupMock(...args),
  }
})

vi.mock('../../services/authService', () => ({
  signInWithPassword: (...args) => signInMock(...args),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

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

function previewPayload(overrides = {}) {
  return {
    workspaceId: 'ws-1',
    previewOnly: true,
    totalOrders: 11,
    draftOrders: 0,
    sentOrders: 0,
    receivedOrders: 2,
    cancelledOrders: 9,
    totalOrderItems: 14,
    linesWithReceive: 3,
    ordersWithReceive: 2,
    hasReceiveFootprint: true,
    deletedOrders: 0,
    deletedOrderItems: 0,
    preservesStockMovements: true,
    preservesStockQuantities: true,
    ...overrides,
  }
}

function getDialog() {
  return document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')
}

function getDeleteBtn() {
  return Array.from(getDialog()?.querySelectorAll('button') ?? [])
    .find((node) => `${node.textContent}`.includes('Delete purchase orders') || node.textContent === 'Deleting…')
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

async function waitForPreview() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function fillConfirmAndPassword({
  phrase = PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE,
  password = 'correct-password',
} = {}) {
  await act(async () => {
    setNativeValue(getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'), phrase)
    setNativeValue(getDialog().querySelector('input[aria-label="Account password"]'), password)
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

beforeEach(() => {
  useAuthMock.mockReturnValue({
    user: { email: 'owner@amore.test' },
    session: { user: { email: 'owner@amore.test' } },
  })
  previewMock.mockResolvedValue(previewPayload())
  cleanupMock.mockResolvedValue(previewPayload({
    previewOnly: false,
    deletedOrders: 11,
    deletedOrderItems: 14,
  }))
  signInMock.mockResolvedValue({})
})

describe('StockOrdersView cleanup entry point', () => {
  it('shows Delete purchase orders for managers and hides it for staff', () => {
    const managed = render(createElement(StockOrdersView, {
      orders: [],
      canManage: true,
      isWorkspaceReady: true,
      workspaceId: 'ws-1',
    }))
    expect(managed.container.textContent).toContain('Delete purchase orders…')
    managed.cleanup()

    const staff = render(createElement(StockOrdersView, {
      orders: [],
      canManage: false,
      isWorkspaceReady: true,
      workspaceId: 'ws-1',
    }))
    expect(staff.container.textContent).not.toContain('Delete purchase orders…')
    staff.cleanup()
  })
})

describe('StockOrderCleanupDialog execution path (P8.16.21a)', () => {
  it('loads preview counts and shows receive warning', async () => {
    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()

    expect(previewMock).toHaveBeenCalledWith('ws-1')
    expect(getDialog()?.textContent).toContain('Total orders')
    expect(getDialog()?.textContent).toContain('11')
    expect(getDialog()?.textContent).toContain('These purchase orders have already updated inventory.')
    expect(getDialog()?.textContent).toContain('Current stock quantities remain unchanged.')

    cleanup()
  })

  it('shows empty state and keeps delete disabled', async () => {
    previewMock.mockResolvedValueOnce(previewPayload({
      totalOrders: 0,
      cancelledOrders: 0,
      receivedOrders: 0,
      totalOrderItems: 0,
      ordersWithReceive: 0,
      hasReceiveFootprint: false,
    }))

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()

    expect(getDialog()?.textContent).toContain('No purchase orders to delete')
    expect(getDeleteBtn()?.disabled).toBe(true)

    cleanup()
  })

  it('keeps delete disabled for empty password or wrong phrase', async () => {
    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE,
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(getDialog().querySelector('input[aria-label="Account password"]'), 'secret')
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        'delete purchase orders',
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(true)

    cleanup()
  })

  it('enabled submit invokes auth then cleanup and shows busy label', async () => {
    let resolveSignIn
    signInMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSignIn = resolve
    }))

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()
    await fillConfirmAndPassword()

    expect(getDeleteBtn()?.disabled).toBe(false)

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })

    expect(getDialog()?.textContent).toContain('Deleting…')
    expect(signInMock).toHaveBeenCalledWith('owner@amore.test', 'correct-password')
    expect(cleanupMock).not.toHaveBeenCalled()

    await act(async () => {
      resolveSignIn({})
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(getDialog()?.textContent).toContain('Purchase Order cleanup completed.')

    cleanup()
  })

  it('wrong password shows error and never calls cleanup', async () => {
    signInMock.mockRejectedValueOnce(new Error('Invalid login'))

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()
    await fillConfirmAndPassword({ password: 'wrong' })

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(signInMock).toHaveBeenCalled()
    expect(cleanupMock).not.toHaveBeenCalled()
    expect(getDialog()?.textContent).toContain('Incorrect password')
    expect(getDeleteBtn()?.disabled).toBe(false)

    cleanup()
  })

  it('successful cleanup renders completion even if onOrdersChanged fails', async () => {
    const onCompleted = vi.fn(async () => {
      throw new Error('refresh failed')
    })

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
      onCompleted,
    }))

    await waitForPreview()
    await fillConfirmAndPassword()

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(getDialog()?.textContent).toContain('Purchase Order cleanup completed.')
    expect(getDialog()?.textContent).toContain('Inventory quantities were not modified.')
    expect(getDialog()?.textContent).toContain('11 order')
    expect(getDialog()?.textContent).toContain('14 order line')

    cleanup()
  })

  it('RPC failure shows retryable error and keeps dialog open', async () => {
    cleanupMock.mockRejectedValueOnce(new StockOrderCleanupError('FORBIDDEN', 'denied'))

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()
    await fillConfirmAndPassword()

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getDialog()?.textContent).toContain('You do not have permission to delete purchase orders.')
    expect(getDeleteBtn()?.disabled).toBe(false)

    cleanup()
  })

  it('double submit does not duplicate cleanup execution', async () => {
    let resolveSignIn
    signInMock.mockImplementation(() => new Promise((resolve) => {
      resolveSignIn = resolve
    }))

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()
    await fillConfirmAndPassword()

    await act(async () => {
      const form = getDialog().querySelector('form')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(signInMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSignIn({})
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(cleanupMock).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('reads autofilled password from the DOM even when React state was empty', async () => {
    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await waitForPreview()

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE,
      )
    })

    // Simulate browser autofill writing the DOM without a React onChange.
    const passwordInput = getDialog().querySelector('input[aria-label="Account password"]')
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    descriptor?.set?.call(passwordInput, 'autofilled-secret')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(getDeleteBtn()?.disabled).toBe(false)

    await act(async () => {
      getDialog().querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(signInMock).toHaveBeenCalledWith('owner@amore.test', 'autofilled-secret')
    expect(cleanupMock).toHaveBeenCalledTimes(1)

    cleanup()
  })
})

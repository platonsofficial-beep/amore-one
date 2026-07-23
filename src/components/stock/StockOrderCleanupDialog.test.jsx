/**
 * @vitest-environment jsdom
 * P8.16.21 — Purchase Order cleanup UI.
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

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { email: 'owner@amore.test' } })
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

describe('StockOrderCleanupDialog', () => {
  it('loads preview counts and shows receive warning', async () => {
    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(previewMock).toHaveBeenCalledWith('ws-1')
    const dialog = document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')
    expect(dialog?.textContent).toContain('Total orders')
    expect(dialog?.textContent).toContain('11')
    expect(dialog?.textContent).toContain('These purchase orders have already updated inventory.')
    expect(dialog?.textContent).toContain('Current stock quantities remain unchanged.')

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

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const dialog = document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')
    expect(dialog?.textContent).toContain('No purchase orders to delete')
    const deleteBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Delete purchase orders')
    expect(deleteBtn?.disabled).toBe(true)

    cleanup()
  })

  it('keeps delete disabled until typed confirmation and password are valid', async () => {
    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const getDialog = () => document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')
    const getDeleteBtn = () => Array.from(getDialog().querySelectorAll('button'))
      .find((node) => node.textContent === 'Delete purchase orders')
    const setNativeValue = (element, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      descriptor?.set?.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }

    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Typed confirmation phrase"]'),
        PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE,
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(true)

    await act(async () => {
      setNativeValue(
        getDialog().querySelector('input[aria-label="Account password"]'),
        'secret-password',
      )
    })
    expect(getDeleteBtn()?.disabled).toBe(false)

    cleanup()
  })

  it('keeps the dialog open on password failure and does not call cleanup', async () => {
    signInMock.mockRejectedValueOnce(new Error('Invalid login'))

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const dialog = document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')
    const confirmInput = dialog.querySelector('input[aria-label="Typed confirmation phrase"]')
    const passwordInput = dialog.querySelector('input[aria-label="Account password"]')
    const deleteBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Delete purchase orders')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(confirmInput, PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE)
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }))
      setter?.call(passwordInput, 'wrong')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(signInMock).toHaveBeenCalled()
    expect(cleanupMock).not.toHaveBeenCalled()
    expect(document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')).toBeTruthy()
    expect(dialog.textContent).toContain('Incorrect password')

    cleanup()
  })

  it('executes cleanup after password verification and shows success', async () => {
    const onCompleted = vi.fn()
    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
      onCompleted,
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const dialog = document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')
    const confirmInput = dialog.querySelector('input[aria-label="Typed confirmation phrase"]')
    const passwordInput = dialog.querySelector('input[aria-label="Account password"]')
    const deleteBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Delete purchase orders')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(confirmInput, PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE)
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }))
      setter?.call(passwordInput, 'correct-password')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(signInMock).toHaveBeenCalledWith('owner@amore.test', 'correct-password')
    expect(cleanupMock).toHaveBeenCalledWith('ws-1')
    expect(onCompleted).toHaveBeenCalled()
    expect(dialog.textContent).toContain('Purchase Order cleanup completed.')
    expect(dialog.textContent).toContain('Inventory quantities were not modified.')
    expect(dialog.textContent).toContain('Stock movement history remains intact.')

    cleanup()
  })

  it('shows a friendly RPC failure without closing', async () => {
    cleanupMock.mockRejectedValueOnce(new StockOrderCleanupError('FORBIDDEN', 'denied'))

    const { cleanup } = render(createElement(StockOrderCleanupDialog, {
      workspaceId: 'ws-1',
      onClose: vi.fn(),
    }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const dialog = document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')
    const confirmInput = dialog.querySelector('input[aria-label="Typed confirmation phrase"]')
    const passwordInput = dialog.querySelector('input[aria-label="Account password"]')
    const deleteBtn = Array.from(dialog.querySelectorAll('button'))
      .find((node) => node.textContent === 'Delete purchase orders')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(confirmInput, PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE)
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }))
      setter?.call(passwordInput, 'correct-password')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(dialog.textContent).toContain('You do not have permission to delete purchase orders.')
    expect(document.querySelector('[aria-labelledby="stock-order-cleanup-title"]')).toBeTruthy()

    cleanup()
  })
})

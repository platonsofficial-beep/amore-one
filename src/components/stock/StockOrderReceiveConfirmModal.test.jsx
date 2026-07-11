/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { StockOrderReceiveConfirmModal } from './StockOrderReceiveConfirmModal'

const baseOrder = {
  supplier: 'Fresh Produce Co',
  orderNumber: 'PO-1001',
  items: [
    { id: 'line-1', itemName: 'Tomatoes', quantity: 10, unit: 'kg', receivedQuantity: 0 },
  ],
}

function renderModal(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(StockOrderReceiveConfirmModal, {
      order: baseOrder,
      receiveNowByItemId: { 'line-1': 5 },
      isSaving: false,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      ...props,
    }))
  })

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('StockOrderReceiveConfirmModal confirm button', () => {
  it('keeps the loading spinner inside the confirm button while receiving', async () => {
    let resolveConfirm
    const onConfirm = vi.fn(() => new Promise((resolve) => {
      resolveConfirm = resolve
    }))
    const { container, cleanup } = renderModal({ isSaving: false, onConfirm })
    const button = container.querySelector('.primary-btn')

    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(button?.textContent).toContain('Receiving...')
    expect(button?.querySelector('.btn-loading-spinner')).not.toBeNull()
    expect(button?.contains(button.querySelector('.btn-loading-spinner'))).toBe(true)

    await act(async () => {
      resolveConfirm()
      await Promise.resolve()
    })

    cleanup()
  })
})

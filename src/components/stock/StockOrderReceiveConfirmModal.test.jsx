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
  it('keeps the loading spinner inside the confirm button while receiving', () => {
    const { container, cleanup } = renderModal({ isSaving: true })
    const button = container.querySelector('.primary-btn')
    const spinner = button?.querySelector('.btn-loading-spinner')

    expect(button?.textContent).toContain('Receiving...')
    expect(spinner).not.toBeNull()
    expect(button?.contains(spinner)).toBe(true)

    cleanup()
  })
})

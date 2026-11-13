/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StockInvoiceSection } from './StockInvoiceSection'

vi.mock('../../services/stockInvoiceService', () => ({
  loadOrderInvoice: vi.fn(async () => null),
  saveOrderInvoice: vi.fn(async () => null),
  scanInvoiceFile: vi.fn(async () => ({ scanned: false, reason: 'no_provider', fields: null })),
}))

function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

const order = {
  id: 'order-1',
  status: 'sent',
  supplier: 'Harbour Wines',
  workspaceId: 'ws-1',
  items: [{ itemName: 'Cola', quantity: 12, costPrice: 1.2 }],
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllEnvs()
  window.history.pushState({}, '', '/')
})

describe('StockInvoiceSection', () => {
  it('shows nothing when the person cannot manage stock', () => {
    const view = render(createElement(StockInvoiceSection, { order, canManage: false }))
    expect(view.container.querySelector('[data-testid="stock-invoice-section"]')).toBeNull()
    view.unmount()
  })

  it('offers a camera capture and a file picker', () => {
    const view = render(createElement(StockInvoiceSection, { order, canManage: true }))
    const camera = view.container.querySelector('[data-testid="stock-invoice-camera"]')
    const file = view.container.querySelector('[data-testid="stock-invoice-file"]')
    expect(camera.getAttribute('capture')).toBe('environment')
    expect(camera.getAttribute('accept')).toBe('image/*')
    expect(file.getAttribute('accept')).toContain('application/pdf')
    expect(file.hasAttribute('multiple')).toBe(true)
    expect(view.container.textContent).toContain('Add invoice')
    view.unmount()
  })

  it('shows extracted fields and the order difference for a preview review', () => {
    const view = render(createElement(StockInvoiceSection, { order, canManage: true, previewMode: 'review' }))
    const invoiceNumber = [...document.querySelectorAll('label')]
      .find((label) => label.textContent.startsWith('Invoice number'))
      ?.querySelector('input')
    expect(invoiceNumber?.value).toBe('HW-2041')
    expect(document.body.textContent).toContain('Quantity differs')
    expect(document.querySelector('.is-different')).toBeTruthy()
    view.unmount()
  })
})

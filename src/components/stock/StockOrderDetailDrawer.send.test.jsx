/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockOrderDetailDrawer } from './StockOrderDetailDrawer'

const { opened, printed } = vi.hoisted(() => ({
  opened: [],
  printed: [],
}))

vi.mock('../../lib/stockOrderSend', async () => {
  const actual = await vi.importActual('../../lib/stockOrderSend')
  return {
    ...actual,
    openStockOrderExternalLink: (url) => {
      opened.push(url)
      return true
    },
    openStockOrderPrintWindow: (html) => {
      printed.push(html)
      return true
    },
  }
})

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

function draftOrder() {
  return {
    id: 'order-1',
    orderNumber: 4,
    status: 'draft',
    supplier: 'Wine Co',
    supplierId: 'sup-1',
    notes: 'Morning delivery',
    expectedDeliveryDate: '2026-10-28',
    totalCost: 20,
    createdAt: '2026-10-20T10:00:00.000Z',
    createdByName: 'Manager',
    items: [{
      id: 'line-1',
      stockItemId: 'cola',
      itemName: 'Cola',
      quantity: 2,
      receivedQuantity: 0,
      unit: 'Can',
      costPrice: 1,
      totalPrice: 2,
    }],
  }
}

function buttonNamed(container, name) {
  return Array.from(container.querySelectorAll('button')).find((node) => node.textContent === name)
}

afterEach(() => {
  document.body.innerHTML = ''
  opened.length = 0
  printed.length = 0
})

describe('StockOrderDetailDrawer send draft', () => {
  it('emails, messages, and prints the draft on screen without marking it sent', () => {
    const onMarkSent = vi.fn()

    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: draftOrder(),
      suppliers: [{ id: 'sup-1', companyName: 'Wine Co', email: 'orders@wine.test', phone: '+357 99 000111' }],
      venueName: 'Amore',
      senderName: 'Platon Sachinis',
      canManage: true,
      onClose: vi.fn(),
      onMarkSent,
    }))

    expect(buttonNamed(container, 'Email').disabled).toBe(false)
    expect(buttonNamed(container, 'WhatsApp').disabled).toBe(false)
    expect(buttonNamed(container, 'Viber').disabled).toBe(false)
    expect(buttonNamed(container, 'Print').disabled).toBe(false)
    expect(container.textContent).toContain('Mark sent')

    act(() => { buttonNamed(container, 'Email').click() })
    expect(opened[0]).toContain('mailto:orders@wine.test')
    const emailed = decodeURIComponent(opened[0].replace(/\+/g, ' '))
    expect(emailed).toContain('Platon Sachinis – Order #0004')
    expect(emailed).toContain('Morning delivery')
    expect(emailed).not.toContain('Amore – Order')

    act(() => { buttonNamed(container, 'WhatsApp').click() })
    expect(opened.some((url) => url.startsWith('https://wa.me/35799000111?text='))).toBe(true)

    act(() => { buttonNamed(container, 'Viber').click() })
    expect(opened.some((url) => url.startsWith('viber://forward?text='))).toBe(true)

    act(() => { buttonNamed(container, 'Print').click() })
    expect(printed[0]).toContain('Platon Sachinis – Order #0004')
    expect(printed[0]).toContain('Morning delivery')
    expect(container.textContent).not.toContain('Allow pop-ups')
    expect(onMarkSent).not.toHaveBeenCalled()

    cleanup()
  })

  it('keeps email and chat disabled until the supplier has contact details', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: draftOrder(),
      suppliers: [{ id: 'sup-1', companyName: 'Wine Co', email: '', phone: '' }],
      canManage: true,
      onClose: vi.fn(),
    }))

    expect(buttonNamed(container, 'Email').disabled).toBe(true)
    expect(buttonNamed(container, 'WhatsApp').disabled).toBe(true)
    expect(buttonNamed(container, 'Viber').disabled).toBe(true)
    expect(buttonNamed(container, 'Print').disabled).toBe(false)
    expect(container.textContent).toContain('Add an email or phone on this supplier')

    cleanup()
  })

  it('hides send actions after the order is marked sent', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: { ...draftOrder(), status: 'sent' },
      suppliers: [{ id: 'sup-1', companyName: 'Wine Co', email: 'orders@wine.test', phone: '35799000111' }],
      canManage: true,
      onClose: vi.fn(),
      onReceiveOrder: vi.fn(),
    }))

    expect(buttonNamed(container, 'Email')).toBeUndefined()
    expect(buttonNamed(container, 'Print')).toBeUndefined()
    expect(container.textContent).toContain('Review receive')

    cleanup()
  })
})

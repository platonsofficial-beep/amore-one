/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockOrderDetailDrawer } from './StockOrderDetailDrawer'

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

function stockItem(partial) {
  return {
    id: partial.id,
    name: partial.name,
    unit: partial.unit ?? 'Bottle',
    costPrice: partial.costPrice ?? 20,
    active: partial.active ?? true,
    supplier: partial.supplier ?? 'Supplier',
    supplierId: partial.supplierId ?? 10,
    currentQuantity: partial.currentQuantity ?? 2,
    minimumQuantity: partial.minimumQuantity ?? 5,
    targetQuantity: partial.targetQuantity ?? 10,
  }
}

function orderLine(partial) {
  return {
    id: partial.id,
    stockItemId: partial.stockItemId,
    itemName: partial.itemName,
    quantity: partial.quantity ?? 4,
    receivedQuantity: partial.receivedQuantity ?? 0,
    unit: partial.unit ?? 'Bottle',
    costPrice: partial.costPrice ?? 20,
    totalPrice: partial.totalPrice ?? 80,
  }
}

function baseOrder(overrides = {}) {
  return {
    id: 'order-1',
    orderNumber: 12,
    status: 'draft',
    supplier: 'Malakakos AE',
    supplierId: 10,
    notes: '',
    expectedDeliveryDate: '',
    totalCost: 80,
    createdAt: '2026-07-20T10:00:00.000Z',
    createdByName: 'Manager',
    items: [
      orderLine({
        id: 'line-inactive',
        stockItemId: 'ko',
        itemName: 'KETEL ONE',
      }),
    ],
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('StockOrderDetailDrawer inactive draft products (P8.16.15)', () => {
  it('renders Inactive badge and warning on draft lines', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: baseOrder(),
      stockItems: [
        stockItem({ id: 'ko', name: 'KETEL ONE', active: false }),
        stockItem({ id: 'bel', name: 'Belvedere', active: true }),
      ],
      canManage: true,
      onClose: vi.fn(),
    }))

    expect(container.textContent).toContain('KETEL ONE')
    expect(container.textContent).toContain('Inactive')
    expect(container.textContent).toContain('This product has been deactivated.')
    expect(container.textContent).toContain('Remove from order')
    expect(container.textContent).toContain('Replace product')

    cleanup()
  })

  it('removes an inactive product from the draft without silent catalog changes', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: baseOrder({
        items: [
          orderLine({ id: 'line-inactive', stockItemId: 'ko', itemName: 'KETEL ONE' }),
          orderLine({ id: 'line-active', stockItemId: 'bel', itemName: 'Belvedere' }),
        ],
      }),
      stockItems: [
        stockItem({ id: 'ko', name: 'KETEL ONE', active: false }),
        stockItem({ id: 'bel', name: 'Belvedere', active: true }),
      ],
      canManage: true,
      onClose: vi.fn(),
    }))

    const removeBtn = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Remove from order')
    expect(removeBtn).toBeTruthy()

    act(() => {
      removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).not.toContain('KETEL ONE')
    expect(container.textContent).toContain('Belvedere')
    expect(container.textContent).not.toContain('This product has been deactivated.')

    cleanup()
  })

  it('replace action swaps product identity while preserving line id and quantity', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: baseOrder({
        items: [
          orderLine({
            id: 'line-inactive',
            stockItemId: 'ko',
            itemName: 'KETEL ONE',
            quantity: 7,
            costPrice: 22,
            totalPrice: 154,
          }),
        ],
      }),
      stockItems: [
        stockItem({ id: 'ko', name: 'KETEL ONE', active: false, costPrice: 22 }),
        stockItem({ id: 'bel', name: 'Belvedere', active: true, unit: 'Bottle', costPrice: 30 }),
      ],
      canManage: true,
      onClose: vi.fn(),
    }))

    const replaceToggle = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Replace product')

    act(() => {
      replaceToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const select = container.querySelector('select[aria-label="Replace KETEL ONE"]')
    expect(select).toBeTruthy()
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'bel'])

    act(() => {
      select.value = 'bel'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.textContent).toContain('Belvedere')
    expect(container.textContent).not.toContain('KETEL ONE')
    expect(container.textContent).not.toContain('Inactive')
    expect(container.textContent).not.toContain('This product has been deactivated.')

    const qtyInput = container.querySelector('input[aria-label="Quantity for Belvedere"]')
    expect(qtyInput?.value).toBe('7')
    expect(container.textContent).toContain('x €30.00')

    cleanup()
  })

  it('does not show inactive draft UX on sent orders', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: baseOrder({
        status: 'sent',
        items: [
          orderLine({
            id: 'line-inactive',
            stockItemId: 'ko',
            itemName: 'KETEL ONE',
            quantity: 4,
            receivedQuantity: 0,
          }),
        ],
      }),
      stockItems: [stockItem({ id: 'ko', name: 'KETEL ONE', active: false })],
      canManage: true,
      onClose: vi.fn(),
      onReceiveOrder: vi.fn(),
    }))

    expect(container.textContent).toContain('KETEL ONE')
    expect(container.textContent).not.toContain('This product has been deactivated.')
    expect(container.textContent).not.toContain('Remove from order')
    expect(container.textContent).not.toContain('Replace product')
    expect(container.querySelector('.stock-order-status-badge.tone-muted')?.textContent).not.toBe('Inactive')

    cleanup()
  })

  it('does not show inactive draft UX on received orders', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: baseOrder({
        status: 'received',
        receivedAt: '2026-07-21T12:00:00.000Z',
        receivedByName: 'Manager',
        items: [
          orderLine({
            id: 'line-inactive',
            stockItemId: 'ko',
            itemName: 'KETEL ONE',
            quantity: 4,
            receivedQuantity: 4,
          }),
        ],
      }),
      stockItems: [stockItem({ id: 'ko', name: 'KETEL ONE', active: false })],
      canManage: true,
      onClose: vi.fn(),
    }))

    expect(container.textContent).toContain('KETEL ONE')
    expect(container.textContent).toContain('Order completed')
    expect(container.textContent).not.toContain('This product has been deactivated.')
    expect(container.textContent).not.toContain('Remove from order')
    expect(container.textContent).not.toContain('Replace product')

    cleanup()
  })

  it('does not show inactive draft UX on cancelled orders', () => {
    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: baseOrder({
        status: 'cancelled',
        items: [
          orderLine({
            id: 'line-inactive',
            stockItemId: 'ko',
            itemName: 'KETEL ONE',
          }),
        ],
      }),
      stockItems: [stockItem({ id: 'ko', name: 'KETEL ONE', active: false })],
      canManage: true,
      onClose: vi.fn(),
    }))

    expect(container.textContent).toContain('KETEL ONE')
    expect(container.textContent).not.toContain('This product has been deactivated.')
    expect(container.textContent).not.toContain('Remove from order')
    expect(container.textContent).not.toContain('Replace product')

    cleanup()
  })
})

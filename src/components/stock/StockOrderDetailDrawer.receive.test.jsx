/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockOrderDetailDrawer } from './StockOrderDetailDrawer'

const { listReceiveDestinationStoragesMock } = vi.hoisted(() => ({
  listReceiveDestinationStoragesMock: vi.fn(),
}))

vi.mock('../../services/workspaceStorageService', () => ({
  listReceiveDestinationStorages: (...args) => listReceiveDestinationStoragesMock(...args),
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

function sentOrder() {
  return {
    id: 'order-1',
    workspaceId: 'ws-1',
    orderNumber: 4,
    status: 'sent',
    supplier: 'Wine Co',
    supplierId: 'sup-1',
    notes: '',
    expectedDeliveryDate: '',
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  listReceiveDestinationStoragesMock.mockReset()
})

describe('StockOrderDetailDrawer receive destination', () => {
  it('selects the only supply storage and labels it', async () => {
    listReceiveDestinationStoragesMock.mockResolvedValue([
      { id: 'bar', name: 'Back bar', active: true, isSupply: false },
      { id: 'cellar', name: 'Cellar', active: true, isSupply: true },
    ])

    const { container, cleanup } = render(createElement(StockOrderDetailDrawer, {
      order: sentOrder(),
      canManage: true,
      onClose: vi.fn(),
      onReceiveOrder: vi.fn(),
    }))

    await flush()

    const select = container.querySelector('select[aria-label="Destination storage"]')
    expect(select?.value).toBe('cellar')
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'Select storage',
      'Back bar',
      'Cellar · Supply',
    ])
    expect(container.textContent).toContain('received into the supply storage')
    expect(listReceiveDestinationStoragesMock).toHaveBeenCalledWith('ws-1')

    cleanup()
  })
})

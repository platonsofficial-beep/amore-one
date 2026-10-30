/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockCreateOrderModal } from './StockCreateOrderModal'

const groups = [
  {
    groupKey: 'lanitis', supplier: 'Lanitis', notes: '', expectedDeliveryDate: '',
    items: [
      { stockItemId: 'a', itemName: 'Rum', quantity: 2, unit: 'bottle', costPrice: 10 },
      { stockItemId: 'b', itemName: 'Gin', quantity: 1, unit: 'bottle', costPrice: 12 },
    ],
  },
  {
    groupKey: 'keo', supplier: 'KEO', notes: '', expectedDeliveryDate: '',
    items: [{ stockItemId: 'c', itemName: 'Beer', quantity: 24, unit: 'bottle', costPrice: 1 }],
  },
]

let root
let container
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
})

async function render(onClose = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(StockCreateOrderModal, { initialGroups: groups, onClose, onSubmit: vi.fn() }))
  })
  return onClose
}

const suppliers = () => [...document.querySelectorAll('.stock-create-order-group-title')].map((el) => el.textContent)
const dialog = () => document.querySelector('.stock-create-order-remove-confirm')
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

describe('Create supplier orders: remove confirmation', () => {
  it('asks before removing a supplier, and Cancel keeps it', async () => {
    const onClose = await render()
    click(document.querySelector('.stock-create-order-remove-group'))
    expect(dialog().textContent).toContain('Remove Lanitis?')
    expect(dialog().textContent).toContain('Its 2 products will be removed from this order.')
    expect(suppliers()).toEqual(['Lanitis', 'KEO'])
    click(button(dialog(), 'Cancel'))
    expect(dialog()).toBeNull()
    expect(suppliers()).toEqual(['Lanitis', 'KEO'])
    // Tapping the dialog backdrop must not close the whole sheet.
    click(document.querySelector('.stock-create-order-remove-group'))
    click(document.querySelector('.stock-create-order-remove-confirm-overlay'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes the supplier on Remove and Undo brings it back', async () => {
    await render()
    click(document.querySelector('.stock-create-order-remove-group'))
    click(button(dialog(), 'Remove'))
    expect(suppliers()).toEqual(['KEO'])
    const toast = document.querySelector('.stock-create-order-undo-toast')
    expect(toast.textContent).toContain('Removed Lanitis')
    click(button(toast, 'Undo'))
    expect(suppliers()).toEqual(['Lanitis', 'KEO'])
  })

  it('asks before removing one product', async () => {
    await render()
    click(document.querySelector('.stock-create-order-remove-item'))
    expect(dialog().textContent).toContain('Remove Rum from this order?')
    click(button(dialog(), 'Remove'))
    expect([...document.querySelectorAll('.stock-create-order-item strong')].map((el) => el.textContent)).toEqual(['Gin', 'Beer'])
  })
})

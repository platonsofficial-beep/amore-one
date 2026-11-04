/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../stock/StockDashboardMovementDialog', () => ({
  StockDashboardMovementDialog: ({ movementType }) => createElement('div', { 'data-testid': 'movement' }, movementType),
}))
vi.mock('../stock/StockItemFormModal', () => ({
  StockItemFormModal: () => createElement('div', { 'data-testid': 'edit' }, 'edit'),
}))

const { MobileManagerStockView } = await import('./MobileManagerStockView')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const item = { id: 'i1', name: 'Aperol', unit: 'bottle', currentQuantity: 0, minimumQuantity: 5, status: 'out', category: 'Spirits', supplier: 'Cyprus Beverages' }

function render(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(createElement(MobileManagerStockView, { stockItems: [item], isWorkspaceReady: true, ...props })))
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}
const openSheet = (c) => act(() => c.querySelector('.mobile-manager-stock-card').click())
const btn = (c, label) => Array.from(c.querySelectorAll('.mobile-stock-detail-actions button')).find((b) => b.textContent === label)

describe('portrait product sheet actions (S-08)', () => {
  it('offers Count, Receive and Edit to managers and opens the right dialog', () => {
    const { container, unmount } = render({ canManageStock: true, onRecordMovement: vi.fn(), onUpdateItem: vi.fn() })
    openSheet(container)
    expect(['Count', 'Receive', 'Edit'].every((l) => btn(container, l))).toBe(true)
    act(() => btn(container, 'Receive').click())
    expect(container.querySelector('[data-testid=movement]').textContent).toBe('receive')
    openSheet(container)
    act(() => btn(container, 'Edit').click())
    expect(container.querySelector('[data-testid=edit]')).toBeTruthy()
    unmount()
  })
  it('shows no actions for staff', () => {
    const { container, unmount } = render({ canManageStock: false, onRecordMovement: vi.fn(), onUpdateItem: vi.fn() })
    openSheet(container)
    expect(container.querySelector('.mobile-stock-detail-actions')).toBeNull()
    unmount()
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { StockSuppliersView } from './StockSuppliersView'
import { StockSupplierDetailDrawer } from './StockSupplierDetailDrawer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const supplier = { id: 's1', companyName: 'Cyprus Beverages', contactPerson: 'Maria', phone: '+357 22 000000', email: 'orders@cybev.example', active: true }
const stockItems = [{ id: 'i1', name: 'Cola', supplier: 'Cyprus Beverages', supplierId: 's1', currentQuantity: 4, unit: 'bottle', costPrice: 6.5, active: true }]

function render(el) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(el))
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

describe('Supplier contacts and prices are manager-only (S-10)', () => {
  for (const canManage of [false, true]) {
    it(`supplier list ${canManage ? 'shows' : 'hides'} phone/email`, () => {
      const { container, unmount } = render(createElement(StockSuppliersView, { suppliers: [supplier], stockItems, canManage }))
      const t = container.textContent
      expect(t.includes('+357 22 000000')).toBe(canManage)
      expect(t.includes('orders@cybev.example')).toBe(canManage)
      expect(t).toContain('Cyprus Beverages')
      unmount()
    })
    it(`supplier drawer ${canManage ? 'shows' : 'hides'} phone/email/prices`, () => {
      const { container, unmount } = render(createElement(StockSupplierDetailDrawer, { supplier, stockItems, canManage, onClose: () => {} }))
      const t = container.textContent
      expect(t.includes('+357 22 000000')).toBe(canManage)
      expect(t.includes('orders@cybev.example')).toBe(canManage)
      expect(/€/.test(t)).toBe(canManage)
      expect(t).toContain('Maria')
      unmount()
    })
  }
})

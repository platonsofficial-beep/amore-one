/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { StockCreateOrderModal } from './StockCreateOrderModal'
import { StockOrderDetailDrawer } from './StockOrderDetailDrawer'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const mobileShellCss = readFileSync(resolve(process.cwd(), 'src/mobileShell.css'), 'utf8')

function render(ui) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(ui)
  })
  return () => {
    act(() => root.unmount())
    host.remove()
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.classList.remove('has-one-overlay')
})

describe('stock landscape overlays', () => {
  it('hides the floating nav and lets overlay scrollers paint above it', () => {
    expect(mobileShellCss).toContain('body.has-one-overlay .mobile-bottom-nav')
    expect(mobileShellCss).toContain('.stock-product-history-backdrop')
    expect(mobileShellCss).toContain('.inventory-count-wizard-backdrop')
    expect(mobileShellCss).toMatch(/display:\s*none !important/)
    expect(mobileShellCss).toContain('body:not(:has(.inventory-count-session))')
    expect(appCss).toMatch(/\.stock-product-history-scroll\s*\{[^}]*min-height:\s*0/s)
    expect(appCss).toMatch(/\.stock-create-order-body\s*\{[^}]*min-height:\s*0/s)
    expect(appCss).toContain('.stock-create-order-footer .ghost-btn')
  })

  it('names the create action without draft jargon and portals the dialog', () => {
    const groups = Array.from({ length: 7 }, (_, index) => ({
      groupKey: `supplier-${index}`,
      supplier: index === 0 ? 'Ramnista' : `Supplier ${index + 1}`,
      items: [{
        stockItemId: `item-${index}`,
        itemName: index === 0 ? 'Ramnista' : `Product ${index + 1}`,
        quantity: 6,
        unit: 'Bottle',
        costPrice: 4,
      }],
    }))
    const cleanup = render(createElement(StockCreateOrderModal, {
      stockItems: [],
      initialGroups: groups,
      onClose: () => {},
      onSubmit: () => {},
    }))

    const dialog = document.body.querySelector('.stock-create-order-modal')
    expect(dialog).toBeTruthy()
    expect(dialog.closest('.stock-create-order-backdrop').parentElement).toBe(document.body)
    const submit = Array.from(dialog.querySelectorAll('button')).find((button) => button.type === 'submit')
    expect(submit.textContent).toBe('Create 7 orders')
    expect(submit.textContent.toLowerCase()).not.toContain('draft')
    const cancel = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Cancel')
    expect(cancel.className).toContain('ghost-btn')
    cleanup()
  })

  it('keeps a long supplier name and save action in the order drawer', () => {
    const cleanup = render(createElement(StockOrderDetailDrawer, {
      order: {
        id: 'order-7',
        orderNumber: 7,
        status: 'draft',
        supplier: 'MEDITERRANEAN BEVERAGE PARTNERS',
        supplierId: 'sup-1',
        notes: '',
        expectedDeliveryDate: '2026-10-27',
        totalCost: 12,
        createdAt: '2026-10-26T00:13:00.000Z',
        createdByName: 'Platon Sachinis',
        items: [{
          id: 'line-1',
          stockItemId: 'wine',
          itemName: 'Ramnista',
          quantity: 6,
          receivedQuantity: 0,
          unit: 'Bottle',
          costPrice: 2,
          totalPrice: 12,
        }],
      },
      suppliers: [{ id: 'sup-1', companyName: 'MEDITERRANEAN BEVERAGE PARTNERS', email: 'orders@example.com', phone: '+35799000111' }],
      canManage: true,
      onClose: () => {},
      onSaveDraft: () => {},
    }))

    const drawer = document.body.querySelector('.stock-order-detail-drawer')
    expect(drawer).toBeTruthy()
    expect(drawer.parentElement.className).toContain('stock-product-history-backdrop')
    expect(drawer.parentElement.parentElement).toBe(document.body)
    expect(drawer.textContent).toContain('MEDITERRANEAN BEVERAGE PARTNERS')
    const more = Array.from(drawer.querySelectorAll('button')).find((button) => button.textContent === 'More')
    act(() => { more.click() })
    expect(drawer.textContent).toContain('Save order')
    expect(drawer.textContent).not.toContain('Save draft')
    cleanup()
  })
})

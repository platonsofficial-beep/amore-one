import { describe, expect, it } from 'vitest'
import {
  buildStockOrderMailtoUrl,
  buildStockOrderPrintHtml,
  buildStockOrderSendMessage,
  buildStockOrderSendSubject,
  buildStockOrderViberUrl,
  buildStockOrderWhatsAppUrl,
  formatStockOrderSendText,
  formatSupplierPhoneDigits,
  isSupplierEmail,
  resolveStockOrderSupplierContact,
} from './stockOrderSend'

const order = {
  orderNumber: 12,
  supplier: 'Malakakos AE',
  supplierId: '10',
  expectedDeliveryDate: '2026-10-28',
  notes: 'Leave at the back door',
  items: [
    { itemName: 'KETEL ONE', quantity: 4, unit: 'Bottle', costPrice: 20, totalPrice: 80 },
    { itemName: 'Ice', quantity: 2, unit: 'kg', costPrice: 0, totalPrice: 0 },
  ],
}

describe('stock order send', () => {
  it('matches the supplier by id before the stored name', () => {
    const contact = resolveStockOrderSupplierContact(order, [
      { id: '9', companyName: 'Malakakos AE', email: 'wrong@example.com', phone: '1' },
      { id: '10', companyName: 'Directory name', email: 'orders@malakakos.test', phone: '+357 99 111222' },
    ])
    expect(contact.email).toBe('orders@malakakos.test')
  })

  it('falls back to a case-insensitive supplier name', () => {
    const contact = resolveStockOrderSupplierContact(
      { supplier: 'local wine', supplierId: null },
      [{ id: '4', companyName: 'Local Wine', email: 'local@example.com', phone: '' }],
    )
    expect(contact.id).toBe('4')
  })

  it('formats a supplier-ready order message', () => {
    expect(buildStockOrderSendSubject(order, 'Amore')).toBe('Amore order #0012')
    const text = formatStockOrderSendText(order, { supplierName: 'Directory name' })
    expect(text).toContain('Supplier: Directory name')
    expect(text).toContain('Expected: 28 Oct 2026')
    expect(text).toContain('4 Bottles KETEL ONE — €20.00 each (€80.00)')
    expect(text).toContain('2 kg Ice')
    expect(text).not.toContain('Ice —')
    expect(text).toContain('Total: €80.00')
    expect(text).toContain('Notes: Leave at the back door')
    expect(buildStockOrderSendMessage(order, { venueName: 'Amore' })).toMatch(/^Amore order #0012\n\nSupplier:/)
  })

  it('builds mailto, WhatsApp, and Viber links from contact details', () => {
    expect(isSupplierEmail('orders@malakakos.test')).toBe(true)
    expect(isSupplierEmail('not-an-email')).toBe(false)
    expect(formatSupplierPhoneDigits('+357 99-111 222')).toBe('35799111222')
    expect(formatSupplierPhoneDigits('00357 99 111222')).toBe('35799111222')

    const mailto = buildStockOrderMailtoUrl('orders@malakakos.test', {
      subject: 'Amore order #0012',
      body: 'Supplier: Directory name',
    })
    expect(mailto.startsWith('mailto:orders@malakakos.test?')).toBe(true)
    expect(decodeURIComponent(mailto.replace(/\+/g, ' '))).toContain('subject=Amore order #0012')
    expect(buildStockOrderMailtoUrl('')).toBe('')

    const whatsapp = buildStockOrderWhatsAppUrl('+357 99 111222', 'Amore order #0012')
    expect(whatsapp).toBe(`https://wa.me/35799111222?text=${encodeURIComponent('Amore order #0012')}`)
    expect(buildStockOrderWhatsAppUrl('')).toBe('')

    expect(buildStockOrderViberUrl('Hello & co')).toBe(`viber://forward?text=${encodeURIComponent('Hello & co')}`)
  })

  it('escapes printable order html', () => {
    const html = buildStockOrderPrintHtml({
      title: 'Order <1>',
      body: 'Notes: 2 < 3 & "cold"',
    })
    expect(html).toContain('<title>Order &lt;1&gt;</title>')
    expect(html).toContain('Notes: 2 &lt; 3 &amp; &quot;cold&quot;')
    expect(html).not.toContain('2 < 3')
  })
})

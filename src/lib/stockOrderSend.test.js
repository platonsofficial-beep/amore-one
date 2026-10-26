/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
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
  openStockOrderExternalLink,
  openStockOrderPrintWindow,
  resolveStockOrderSupplierContact,
  resolveSupplierOrderFromName,
  resolveSupplierOrderVenueName,
  stockOrderGreeting,
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
    expect(resolveSupplierOrderVenueName('Workspace', 'AMORE.NICOSIA')).toBe('AMORE.NICOSIA')
    expect(resolveSupplierOrderVenueName('Workspace', 'Workspace not set')).toBe('')
    expect(stockOrderGreeting('el-GR')).toBe('Καλησπέρα,')
    expect(stockOrderGreeting('en-GB')).toBe('Hello,')
    expect(buildStockOrderSendSubject(order, 'Workspace')).toBe('Order #0012')
    expect(buildStockOrderSendSubject(order, 'AMORE.NICOSIA')).toBe('AMORE.NICOSIA – Order #0012')
    const text = formatStockOrderSendText(order, {
      supplierName: 'Directory name',
      venueName: 'AMORE.NICOSIA',
      includeCost: true,
      language: 'en',
    })
    expect(text.startsWith('Hello,\n\nSupplier: Directory name')).toBe(true)
    expect(text).toContain('Expected: 28 Oct 2026')
    expect(text).toContain('4 Bottles KETEL ONE — €20.00 each (€80.00)')
    expect(text).toContain('2 kg Ice')
    expect(text).not.toContain('Ice —')
    expect(text).toContain('Total: €80.00')
    expect(text).toContain('Notes: Leave at the back door')
    expect(text.trimEnd().endsWith('AMORE.NICOSIA\nRequested delivery: 28 Oct 2026')).toBe(true)
    expect(buildStockOrderSendMessage(order, {
      venueName: 'AMORE.NICOSIA',
      includeCost: true,
      language: 'el',
    })).toMatch(/^AMORE\.NICOSIA – Order #0012\n\nΚαλησπέρα,/)
  })

  it('hides a zero total and never prints cost unless the caller includes it', () => {
    const unpriced = {
      ...order,
      items: [{ itemName: 'Ice', quantity: 2, unit: 'kg', costPrice: 0, totalPrice: 0 }],
    }
    const managerText = formatStockOrderSendText(unpriced, {
      venueName: 'Amore',
      includeCost: true,
    })
    expect(managerText).not.toContain('Total:')
    expect(managerText).not.toContain('€')
    const staffText = formatStockOrderSendText(order, {
      venueName: 'Amore',
      includeCost: false,
    })
    expect(staffText).toContain('4 Bottles KETEL ONE')
    expect(staffText).not.toContain('€')
    expect(staffText).not.toContain('Total:')
  })

  it('uses the sender name in the subject and sign-off, and falls back to the venue', () => {
    const po = {
      orderNumber: 2,
      supplier: 'TEST GrokBot Supplier',
      items: [{ itemName: 'TEST GrokBot Cola', quantity: 20, costPrice: 0 }],
    }
    expect(resolveSupplierOrderFromName('Platon Sachinis', 'Workspace', 'AMORE.NICOSIA')).toBe('Platon Sachinis')
    expect(resolveSupplierOrderFromName('Workspace', 'Workspace', 'AMORE.NICOSIA')).toBe('AMORE.NICOSIA')
    expect(resolveSupplierOrderFromName('', 'amore 23')).toBe('amore 23')
    expect(resolveSupplierOrderFromName('Profile not set', 'AMORE.NICOSIA')).toBe('AMORE.NICOSIA')

    const shared = {
      supplierName: 'TEST GrokBot Supplier',
      venueName: 'AMORE.NICOSIA',
      includeCost: true,
    }
    expect(buildStockOrderSendMessage(po, { ...shared, senderName: 'Platon Sachinis', language: 'el' })).toBe(
      [
        'Platon Sachinis – Order #0002',
        '',
        'Καλησπέρα,',
        '',
        'Supplier: TEST GrokBot Supplier',
        '',
        '20 TEST GrokBot Cola',
        '',
        'Platon Sachinis',
      ].join('\n'),
    )
    expect(buildStockOrderSendMessage(po, { ...shared, senderName: 'Platon Sachinis', language: 'en' })).toBe(
      [
        'Platon Sachinis – Order #0002',
        '',
        'Hello,',
        '',
        'Supplier: TEST GrokBot Supplier',
        '',
        '20 TEST GrokBot Cola',
        '',
        'Platon Sachinis',
      ].join('\n'),
    )

    const fallback = buildStockOrderSendMessage(po, { ...shared, senderName: '', language: 'en' })
    expect(fallback.startsWith('AMORE.NICOSIA – Order #0002\n\nHello,')).toBe(true)
    expect(fallback.trimEnd().endsWith('AMORE.NICOSIA')).toBe(true)
    expect(fallback).not.toContain('Workspace')
    expect(fallback).not.toContain('€')
  })

  it('opens https links with an anchor click and prints from an iframe', () => {
    const click = vi.fn()
    const originalCreate = document.createElement.bind(document)
    const print = vi.fn()
    const write = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        const anchor = originalCreate('a')
        anchor.click = click
        return anchor
      }
      if (tag === 'iframe') {
        const frame = originalCreate('iframe')
        Object.defineProperty(frame, 'contentDocument', {
          configurable: true,
          value: { open: vi.fn(), write, close: vi.fn() },
        })
        Object.defineProperty(frame, 'contentWindow', {
          configurable: true,
          value: { focus: vi.fn(), print, addEventListener: vi.fn() },
        })
        return frame
      }
      return originalCreate(tag)
    })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openStockOrderExternalLink('https://wa.me/357')).toBe(true)
    expect(open).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(openStockOrderPrintWindow('<p>Order</p>')).toBe(true)
    expect(open).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledWith('<p>Order</p>')
    expect(print).toHaveBeenCalled()
    open.mockRestore()
    document.createElement.mockRestore()
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

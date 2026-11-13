import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  buildInvoiceStoragePath,
  compareInvoiceLines,
  draftFromScan,
  emptyInvoiceDraft,
  prepareInvoiceUpload,
  receivedWithInvoiceBadge,
} from './stockInvoice'
import { readStockInvoicePreview } from './stockInvoicePreview'
import {
  fallbackScanResult,
  normalizeProviderInvoice,
  scanInvoicePayload,
} from './stockInvoiceScan'

const order = {
  supplier: 'Harbour Wines',
  items: [
    { itemName: 'Cola', quantity: 12, costPrice: 1.2 },
    { itemName: 'House red', quantity: 6, costPrice: 8 },
  ],
}

describe('stock invoice capture', () => {
  it('keeps the SQL file unapplied and private to stock managers', () => {
    const sql = readFileSync(new URL('../../supabase/stock_invoices.sql', import.meta.url), 'utf8')
    expect(sql).toContain('NOT APPLIED')
    expect(sql).toContain('stock-invoices')
    expect(sql).toContain('can_manage_workspace_stock')
    expect(sql).toContain('stock_order_invoice_files')
    expect(sql).toContain('public = false')
  })

  it('highlights qty and price differences against the order', () => {
    const lines = compareInvoiceLines([
      { name: 'Cola', quantity: 10, unitPrice: 1.2 },
      { name: 'House red', quantity: 6, unitPrice: 9 },
      { name: 'Napkins', quantity: 1, unitPrice: 3 },
    ], order.items)
    expect(lines[0].difference).toMatchObject({ qtyDiffers: true, priceDiffers: false, orderQty: 12 })
    expect(lines[1].difference).toMatchObject({ qtyDiffers: false, priceDiffers: true, orderPrice: 8 })
    expect(lines[2].difference).toBeNull()
  })

  it('falls back to an empty editable draft when no scan provider is configured', async () => {
    const result = await scanInvoicePayload({ fileName: 'invoice.jpg' }, {})
    expect(result).toEqual(fallbackScanResult())
    expect(draftFromScan(result.fields, order).supplierName).toBe('Harbour Wines')
    expect(emptyInvoiceDraft(order).lines).toEqual([])
  })

  it('maps a provider payload and falls back when the provider request fails', async () => {
    const fields = normalizeProviderInvoice({
      supplier_name: 'Harbour Wines',
      invoice_number: 'HW-2041',
      invoice_date: '2026-11-13',
      line_items: [{ description: 'Cola', qty: '10', unit_price: '1.20' }],
      subtotal: '12',
      tax: '2.28',
      total: '14.28',
    })
    expect(fields).toMatchObject({
      supplierName: 'Harbour Wines',
      invoiceNumber: 'HW-2041',
      lines: [{ name: 'Cola', quantity: 10, unitPrice: 1.2 }],
      vat: 2.28,
    })

    const fetchImpl = vi.fn(async () => ({ ok: false }))
    const failed = await scanInvoicePayload({ dataBase64: 'abc' }, {
      INVOICE_SCAN_URL: 'https://scan.example/read',
      INVOICE_SCAN_API_KEY: 'secret',
    }, fetchImpl)
    expect(failed.scanned).toBe(false)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('stores several pages under the venue and order', () => {
    expect(buildInvoiceStoragePath('ws', 'order', 'page-1', 'image/jpeg')).toBe('ws/order/page-1.jpg')
    expect(buildInvoiceStoragePath('ws', 'order', 'page-2', 'application/pdf', 'note.pdf')).toBe('ws/order/page-2.pdf')
    expect(receivedWithInvoiceBadge({ status: 'received', hasInvoice: true })).toBe('Received with invoice')
    expect(receivedWithInvoiceBadge({ status: 'sent', hasInvoice: true })).toBe('')
    expect(receivedWithInvoiceBadge({ status: 'received', hasInvoice: false })).toBe('')
  })

  it('keeps a PDF and compresses a photo through the encoder', async () => {
    const pdf = new File(['%PDF'], 'bill.pdf', { type: 'application/pdf' })
    const prepared = await prepareInvoiceUpload(pdf)
    expect(prepared.contentType).toBe('application/pdf')
    const huge = new File([new Uint8Array(9 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    await expect(prepareInvoiceUpload(huge)).rejects.toThrow(/too large/)
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' })
    const photo = await prepareInvoiceUpload(
      new File(['img'], 'page.png', { type: 'image/png' }),
      { encodeImage: async () => jpeg },
    )
    expect(photo.contentType).toBe('image/jpeg')
    expect(photo.blob).toBe(jpeg)
  })

  it('ignores the preview query unless local auth is disabled', () => {
    expect(readStockInvoicePreview('?invoicePreview=review', { VITE_AUTH_DISABLED: 'false' })).toBeNull()
    expect(readStockInvoicePreview('?invoicePreview=review', { VITE_AUTH_DISABLED: 'true' })).toBe('review')
    expect(readStockInvoicePreview('?invoicePreview=nope', { VITE_AUTH_DISABLED: 'true' })).toBeNull()
  })
})

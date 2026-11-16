import { t } from '../i18n/i18n'
/** Local invoice screens for auth-disabled screenshots. Never used when auth is on. */

const PREVIEW_MODES = new Set(['add', 'review', 'saved', 'list'])

export function readStockInvoicePreview(search, env = import.meta.env) {
  if (env?.VITE_AUTH_DISABLED !== 'true') return null
  const query = typeof search === 'string'
    ? search
    : (typeof window !== 'undefined' ? window.location.search : '')
  const mode = new URLSearchParams(query.startsWith('?') || query === '' ? query : `?${query}`).get('invoicePreview')
  return PREVIEW_MODES.has(mode) ? mode : null
}

export function shouldUseStockInvoicePreview(search) {
  const source = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  return Boolean(readStockInvoicePreview(source))
}

export function buildStockInvoicePreviewOrders() {
  const sent = {
    id: 'preview-order-sent',
    workspaceId: 'dev-workspace-id',
    orderNumber: 18,
    status: 'sent',
    supplier: t("Harbour Wines"),
    supplierId: 'preview-supplier',
    notes: '',
    expectedDeliveryDate: '2026-11-14',
    totalCost: 86,
    createdAt: '2026-11-12T09:00:00.000Z',
    createdByName: t("Development user"),
    hasInvoice: false,
    items: [
      { id: 'line-cola', itemName: 'Cola', quantity: 12, receivedQuantity: 0, unit: 'Can', costPrice: 1.2, totalPrice: 14.4 },
      { id: 'line-wine', itemName: t("House red"), quantity: 6, receivedQuantity: 0, unit: 'Btl', costPrice: 8, totalPrice: 48 },
    ],
  }
  const received = {
    id: 'preview-order-received',
    workspaceId: 'dev-workspace-id',
    orderNumber: 17,
    status: 'received',
    supplier: t("Harbour Wines"),
    notes: '',
    expectedDeliveryDate: '2026-11-10',
    totalCost: 86,
    createdAt: '2026-11-10T09:00:00.000Z',
    receivedAt: '2026-11-11T15:00:00.000Z',
    receivedByName: t("Development user"),
    hasInvoice: true,
    items: [
      { id: 'line-cola-r', itemName: 'Cola', quantity: 12, receivedQuantity: 12, unit: 'Can', costPrice: 1.2, totalPrice: 14.4 },
      { id: 'line-wine-r', itemName: t("House red"), quantity: 6, receivedQuantity: 6, unit: 'Btl', costPrice: 8, totalPrice: 48 },
    ],
  }
  return [sent, received]
}

/** Paper invoice for the Lisbon Drinks demo capture. Not a live supplier file. */
export function demoInvoicePaperUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="440" viewBox="0 0 320 440">
    <rect width="320" height="440" fill="#f6f1e6"/>
    <rect x="18" y="18" width="284" height="404" fill="#fffdf8" stroke="#d7c7a3"/>
    <text x="36" y="58" font-family="Georgia, serif" font-size="22" fill="#1c2740">&#8203;Lisbon Drinks</text>
    <text x="36" y="80" font-family="Georgia, serif" font-size="12" fill="#7a6848">&#8203;Rua da Prata 18, Lisbon</text>
    <text x="36" y="112" font-family="Georgia, serif" font-size="13" fill="#1c2740">&#8203;Invoice INV-2041</text>
    <text x="200" y="112" font-family="Georgia, serif" font-size="13" fill="#1c2740">&#8203;13 Nov 2026</text>
    <line x1="36" y1="128" x2="284" y2="128" stroke="#e4d7bc"/>
    <text x="36" y="156" font-family="Georgia, serif" font-size="13" fill="#243044">&#8203;Cola 330ml</text>
    <text x="230" y="156" font-family="Georgia, serif" font-size="13" fill="#243044">&#8203;12 x 1.20</text>
    <text x="36" y="180" font-family="Georgia, serif" font-size="13" fill="#243044">&#8203;Subtotal</text>
    <text x="230" y="180" font-family="Georgia, serif" font-size="13" fill="#243044">&#8203;EUR 14.40</text>
    <text x="36" y="204" font-family="Georgia, serif" font-size="13" fill="#243044">&#8203;VAT</text>
    <text x="230" y="204" font-family="Georgia, serif" font-size="13" fill="#243044">&#8203;EUR 2.74</text>
    <line x1="36" y1="222" x2="284" y2="222" stroke="#e4d7bc"/>
    <text x="36" y="250" font-family="Georgia, serif" font-size="16" fill="#1c2740">&#8203;Total</text>
    <text x="214" y="250" font-family="Georgia, serif" font-size="16" fill="#1c2740">&#8203;EUR 17.14</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function previewInvoiceThumb() {
  return demoInvoicePaperUrl()
}

export function buildPreviewInvoiceDraft() {
  return {
    supplierName: t("Harbour Wines"),
    invoiceNumber: 'HW-2041',
    invoiceDate: '2026-11-13',
    lines: [
      { name: 'Cola', quantity: 10, unitPrice: 1.2 },
      { name: t("House red"), quantity: 6, unitPrice: 9 },
    ],
    subtotal: 66,
    vat: 12.54,
    total: 78.54,
    scanned: true,
  }
}

export function buildPreviewSavedInvoice() {
  return {
    id: 'preview-invoice',
    supplierName: t("Harbour Wines"),
    invoiceNumber: 'HW-2041',
    invoiceDate: '2026-11-13',
    subtotal: 66,
    vat: 12.54,
    total: 78.54,
    files: [{
      id: 'preview-file',
      fileName: 'invoice.jpg',
      contentType: 'image/jpeg',
      previewUrl: previewInvoiceThumb(),
    }],
  }
}

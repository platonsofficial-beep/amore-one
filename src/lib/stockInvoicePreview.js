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
    supplier: 'Harbour Wines',
    supplierId: 'preview-supplier',
    notes: '',
    expectedDeliveryDate: '2026-11-14',
    totalCost: 86,
    createdAt: '2026-11-12T09:00:00.000Z',
    createdByName: 'Development user',
    hasInvoice: false,
    items: [
      { id: 'line-cola', itemName: 'Cola', quantity: 12, receivedQuantity: 0, unit: 'Can', costPrice: 1.2, totalPrice: 14.4 },
      { id: 'line-wine', itemName: 'House red', quantity: 6, receivedQuantity: 0, unit: 'Btl', costPrice: 8, totalPrice: 48 },
    ],
  }
  const received = {
    id: 'preview-order-received',
    workspaceId: 'dev-workspace-id',
    orderNumber: 17,
    status: 'received',
    supplier: 'Harbour Wines',
    notes: '',
    expectedDeliveryDate: '2026-11-10',
    totalCost: 86,
    createdAt: '2026-11-10T09:00:00.000Z',
    receivedAt: '2026-11-11T15:00:00.000Z',
    receivedByName: 'Development user',
    hasInvoice: true,
    items: [
      { id: 'line-cola-r', itemName: 'Cola', quantity: 12, receivedQuantity: 12, unit: 'Can', costPrice: 1.2, totalPrice: 14.4 },
      { id: 'line-wine-r', itemName: 'House red', quantity: 6, receivedQuantity: 6, unit: 'Btl', costPrice: 8, totalPrice: 48 },
    ],
  }
  return [sent, received]
}

export function previewInvoiceThumb() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="210" viewBox="0 0 160 210"><rect width="160" height="210" fill="#18283d"/><rect x="16" y="18" width="128" height="10" fill="#f3d27a"/><rect x="16" y="40" width="90" height="6" fill="#a9c0d6"/><rect x="16" y="56" width="128" height="4" fill="#21344c"/><rect x="16" y="70" width="128" height="4" fill="#21344c"/><rect x="16" y="84" width="128" height="4" fill="#21344c"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function buildPreviewInvoiceDraft() {
  return {
    supplierName: 'Harbour Wines',
    invoiceNumber: 'HW-2041',
    invoiceDate: '2026-11-13',
    lines: [
      { name: 'Cola', quantity: 10, unitPrice: 1.2 },
      { name: 'House red', quantity: 6, unitPrice: 9 },
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
    supplierName: 'Harbour Wines',
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

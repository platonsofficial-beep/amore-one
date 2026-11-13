import { t } from '../i18n/i18n'
export const INVOICE_IMAGE_MAX_EDGE = 1600
export const INVOICE_JPEG_QUALITY = 0.72
export const INVOICE_PDF_MAX_BYTES = 8 * 1024 * 1024

function cleanName(value) {
  return `${value ?? ''}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function emptyInvoiceDraft(order = {}) {
  return {
    supplierName: `${order.supplier ?? order.supplierName ?? ''}`.trim(),
    invoiceNumber: '',
    invoiceDate: '',
    lines: [],
    subtotal: '',
    vat: '',
    total: '',
    scanned: false,
  }
}

export function draftFromScan(fields, order = {}) {
  const base = emptyInvoiceDraft(order)
  if (!fields) return base
  return {
    supplierName: `${fields.supplierName ?? ''}`.trim() || base.supplierName,
    invoiceNumber: `${fields.invoiceNumber ?? ''}`.trim(),
    invoiceDate: `${fields.invoiceDate ?? ''}`.trim(),
    lines: (fields.lines ?? []).map((line) => ({
      name: `${line.name ?? ''}`.trim(),
      quantity: line.quantity ?? '',
      unitPrice: line.unitPrice ?? '',
    })),
    subtotal: fields.subtotal ?? '',
    vat: fields.vat ?? '',
    total: fields.total ?? '',
    scanned: true,
  }
}

export function compareInvoiceLines(lines = [], orderItems = []) {
  return lines.map((line) => {
    const name = cleanName(line?.name)
    const match = (orderItems ?? []).find((item) => cleanName(item?.itemName || item?.name) === name)
    if (!match || !name) {
      return { ...line, difference: null }
    }
    const orderQty = Number(match.quantity ?? match.orderedQuantity) || 0
    const orderPrice = Number(match.costPrice ?? match.unitPrice ?? match.cost_price) || 0
    const qty = Number(line.quantity)
    const price = Number(line.unitPrice)
    const qtyDiffers = Number.isFinite(qty) && qty !== orderQty
    const priceDiffers = Number.isFinite(price) && Math.abs(price - orderPrice) > 0.009
    return {
      ...line,
      difference: {
        orderQty,
        orderPrice,
        qtyDiffers,
        priceDiffers,
      },
    }
  })
}

export function receivedWithInvoiceBadge(order) {
  const status = `${order?.status ?? ''}`.trim().toLowerCase()
  if (status === 'received' && order?.hasInvoice) return t("Received with invoice")
  return ''
}

export function invoiceHasDifference(lines = []) {
  return lines.some((line) => line?.difference?.qtyDiffers || line?.difference?.priceDiffers)
}

function extensionFor(contentType, fileName) {
  if (contentType === 'application/pdf' || `${fileName}`.toLowerCase().endsWith('.pdf')) return 'pdf'
  return 'jpg'
}

export function buildInvoiceStoragePath(workspaceId, orderId, fileId, contentType, fileName = '') {
  const workspace = `${workspaceId ?? ''}`.trim()
  const order = `${orderId ?? ''}`.trim()
  const id = `${fileId ?? ''}`.trim()
  return `${workspace}/${order}/${id}.${extensionFor(contentType, fileName)}`
}

export async function prepareInvoiceUpload(file, deps = {}) {
  if (!file) throw new Error('Choose an invoice file first.')
  const contentType = `${file.type ?? ''}`.trim().toLowerCase()
  const isPdf = contentType === 'application/pdf' || `${file.name ?? ''}`.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    if (file.size > INVOICE_PDF_MAX_BYTES) {
      throw new Error('That PDF is too large. Try a smaller file.')
    }
    return { blob: file, contentType: 'application/pdf', fileName: file.name || 'invoice.pdf' }
  }
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error('Use a photo or a PDF.')
  }
  const encode = deps.encodeImage || encodeInvoiceImage
  const blob = await encode(file)
  return { blob, contentType: 'image/jpeg', fileName: `${(file.name || 'invoice').replace(/\.\w+$/, '')}.jpg` }
}

async function encodeInvoiceImage(file) {
  const bitmap = typeof createImageBitmap === 'function'
    ? await createImageBitmap(file)
    : await loadHtmlImage(file)
  const scale = Math.min(1, INVOICE_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.drawImage(bitmap, 0, 0, width, height)
  if (typeof bitmap.close === 'function') bitmap.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', INVOICE_JPEG_QUALITY))
  if (!blob) throw new Error('Could not prepare that photo. Try another one.')
  return blob
}

function loadHtmlImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that photo.'))
    }
    image.src = url
  })
}

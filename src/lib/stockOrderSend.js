import {
  computeOrderLineTotal,
  computeOrderTotalCost,
  formatStockOrderDeliveryDate,
  formatStockOrderNumber,
} from './stockOrderUtils'
import { normalizeSupplierId } from './stockSupplierUtils'
import { formatStockPurchasePrice, formatStockQuantity } from './stockUtils'

function supplierDisplayName(supplier) {
  return `${supplier?.companyName ?? supplier?.company_name ?? ''}`.trim()
}

export function isSupplierEmail(value) {
  const email = `${value ?? ''}`.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Digits only, for wa.me. A leading 00 international prefix is dropped. */
export function formatSupplierPhoneDigits(phone) {
  const digits = `${phone ?? ''}`.replace(/\D/g, '')
  if (digits.startsWith('00')) return digits.slice(2)
  return digits
}

/**
 * Supplier contact for a draft. Id wins. Name is a case-insensitive fallback.
 */
export function resolveStockOrderSupplierContact(order, suppliers = []) {
  const list = Array.isArray(suppliers) ? suppliers : []
  const supplierId = normalizeSupplierId(order?.supplierId ?? order?.supplier_id)
  if (supplierId != null) {
    const byId = list.find((supplier) => normalizeSupplierId(supplier?.id) === supplierId)
    if (byId) return byId
  }

  const orderName = `${order?.supplier ?? ''}`.trim().toLocaleLowerCase('en-US')
  if (!orderName) return null
  return list.find((supplier) => supplierDisplayName(supplier).toLocaleLowerCase('en-US') === orderName) ?? null
}

export function buildStockOrderSendSubject(order, venueName = '') {
  const number = formatStockOrderNumber(order?.orderNumber)
  const venue = `${venueName ?? ''}`.trim()
  return venue ? `${venue} order ${number}` : `Order ${number}`
}

export function formatStockOrderSendText(order, { supplierName = '' } = {}) {
  const supplier = `${supplierName || order?.supplier || 'Supplier'}`.trim() || 'Supplier'
  const lines = [`Supplier: ${supplier}`]
  const delivery = formatStockOrderDeliveryDate(
    order?.expectedDeliveryDate ?? order?.expected_delivery_date,
  )
  if (delivery) lines.push(`Expected: ${delivery}`)
  lines.push('')

  const items = Array.isArray(order?.items) ? order.items : []
  if (items.length === 0) {
    lines.push('No products listed.')
  } else {
    items.forEach((item) => {
      const name = `${item?.itemName ?? item?.item_name ?? ''}`.trim() || 'Item'
      const quantity = formatStockQuantity(item?.quantity, item?.unit)
      const cost = Number(item?.costPrice ?? item?.cost_price) || 0
      const total = Number(item?.totalPrice ?? item?.total_price) || computeOrderLineTotal(item?.quantity, cost)
      lines.push(cost > 0
        ? `${quantity} ${name} — ${formatStockPurchasePrice(cost)} each (${formatStockPurchasePrice(total)})`
        : `${quantity} ${name}`)
    })
    lines.push('')
    lines.push(`Total: ${formatStockPurchasePrice(computeOrderTotalCost(items))}`)
  }

  const notes = `${order?.notes ?? ''}`.trim()
  if (notes) {
    lines.push('')
    lines.push(`Notes: ${notes}`)
  }

  return lines.join('\n')
}

export function buildStockOrderSendMessage(order, { venueName = '', supplierName = '' } = {}) {
  const subject = buildStockOrderSendSubject(order, venueName)
  const body = formatStockOrderSendText(order, { supplierName })
  return `${subject}\n\n${body}`
}

export function buildStockOrderMailtoUrl(email, { subject = '', body = '' } = {}) {
  const to = `${email ?? ''}`.trim()
  if (!isSupplierEmail(to)) return ''
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const query = params.toString()
  return query ? `mailto:${to}?${query}` : `mailto:${to}`
}

export function buildStockOrderWhatsAppUrl(phone, text) {
  const digits = formatSupplierPhoneDigits(phone)
  if (!digits) return ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(text ?? '')}`
}

/** Viber chat links do not reliably prefill text, so this opens the forward sheet. */
export function buildStockOrderViberUrl(text) {
  return `viber://forward?text=${encodeURIComponent(text ?? '')}`
}

export function escapeStockOrderHtml(value) {
  return `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildStockOrderPrintHtml({ title, body }) {
  const safeTitle = escapeStockOrderHtml(title)
  const safeBody = escapeStockOrderHtml(body)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.45; margin: 0; }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
<pre>${safeBody}</pre>
</body>
</html>`
}

export function openStockOrderExternalLink(url) {
  if (!url || typeof window === 'undefined') return false
  if (url.startsWith('https://') || url.startsWith('http://')) {
    return Boolean(window.open(url, '_blank', 'noopener,noreferrer'))
  }
  window.location.assign(url)
  return true
}

export function openStockOrderPrintWindow(html) {
  if (typeof window === 'undefined') return false
  const popup = window.open('', '_blank', 'width=820,height=960')
  if (!popup) return false
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  try {
    popup.print()
  } catch {
    // The printable page is still open if the browser blocks print.
  }
  return true
}

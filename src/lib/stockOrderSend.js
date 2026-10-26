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

const SUPPLIER_ORDER_VENUE_PLACEHOLDERS = new Set([
  'workspace',
  'workspace not set',
  '—',
  '-',
])

/** First real venue name. Skips the hydrated "Workspace" placeholder. */
export function resolveSupplierOrderVenueName(...candidates) {
  const list = candidates.flat()
  for (const candidate of list) {
    const name = `${candidate ?? ''}`.trim()
    if (!name) continue
    if (SUPPLIER_ORDER_VENUE_PLACEHOLDERS.has(name.toLocaleLowerCase('en-US'))) continue
    return name
  }
  return ''
}

/** Greek app language gets the evening greeting used with suppliers. */
export function stockOrderGreeting(language = '') {
  const lang = `${language ?? ''}`.trim().toLowerCase()
  return lang.startsWith('el') ? 'Καλησπέρα,' : 'Hello,'
}

/**
 * Sign-off line under the venue. The Greek article is the literal "τον/την".
 * The manager name is printed as stored. No name means no line.
 */
export function formatStockOrderSenderLine(senderName = '', language = '') {
  const name = `${senderName ?? ''}`.trim()
  if (!name) return ''
  const lang = `${language ?? ''}`.trim().toLowerCase()
  return lang.startsWith('el')
    ? `Στάλθηκε από τον/την ${name}`
    : `Sent by ${name}`
}

export function buildStockOrderSendSubject(order, venueName = '') {
  const number = formatStockOrderNumber(order?.orderNumber)
  const venue = resolveSupplierOrderVenueName(venueName)
  return venue ? `${venue} – Order ${number}` : `Order ${number}`
}

export function formatStockOrderSendText(order, {
  supplierName = '',
  venueName = '',
  senderName = '',
  includeCost = false,
  language = '',
} = {}) {
  const supplier = `${supplierName || order?.supplier || 'Supplier'}`.trim() || 'Supplier'
  const venue = resolveSupplierOrderVenueName(venueName)
  const senderLine = formatStockOrderSenderLine(senderName, language)
  const delivery = formatStockOrderDeliveryDate(
    order?.expectedDeliveryDate ?? order?.expected_delivery_date,
  )
  const lines = [stockOrderGreeting(language), '', `Supplier: ${supplier}`]
  if (delivery) lines.push(`Expected: ${delivery}`)
  lines.push('')

  const items = Array.isArray(order?.items) ? order.items : []
  let pricedLineCount = 0
  if (items.length === 0) {
    lines.push('No products listed.')
  } else {
    items.forEach((item) => {
      const name = `${item?.itemName ?? item?.item_name ?? ''}`.trim() || 'Item'
      const quantity = formatStockQuantity(item?.quantity, item?.unit)
      const cost = Number(item?.costPrice ?? item?.cost_price) || 0
      const total = Number(item?.totalPrice ?? item?.total_price) || computeOrderLineTotal(item?.quantity, cost)
      const showPrice = includeCost === true && cost > 0
      if (showPrice) pricedLineCount += 1
      lines.push(showPrice
        ? `${quantity} ${name} — ${formatStockPurchasePrice(cost)} each (${formatStockPurchasePrice(total)})`
        : `${quantity} ${name}`)
    })
    if (includeCost === true && pricedLineCount > 0) {
      lines.push('')
      lines.push(`Total: ${formatStockPurchasePrice(computeOrderTotalCost(items))}`)
    }
  }

  const notes = `${order?.notes ?? ''}`.trim()
  if (notes) {
    lines.push('')
    lines.push(`Notes: ${notes}`)
  }

  if (venue || senderLine || delivery) {
    lines.push('')
    if (venue) lines.push(venue)
    if (senderLine) lines.push(senderLine)
    if (delivery) lines.push(`Requested delivery: ${delivery}`)
  }

  return lines.join('\n')
}

export function buildStockOrderSendMessage(order, options = {}) {
  const subject = buildStockOrderSendSubject(order, options.venueName)
  const body = formatStockOrderSendText(order, options)
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

/**
 * Open http(s) with a user-gesture anchor click.
 * window.open(..., 'noopener') returns null even when the tab opens, so that
 * return value is not a popup-blocked signal.
 */
export function openStockOrderExternalLink(url) {
  if (!url || typeof document === 'undefined') return false
  if (url.startsWith('https://') || url.startsWith('http://')) {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.referrerPolicy = 'no-referrer'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return true
  }
  if (typeof window === 'undefined') return false
  window.location.assign(url)
  return true
}

/** Print from a hidden iframe so the order sheet does not depend on window.open. */
export function openStockOrderPrintWindow(html) {
  if (typeof document === 'undefined') return false
  const frame = document.createElement('iframe')
  frame.setAttribute('title', 'Print order')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument || frame.contentWindow?.document
  const printWindow = frame.contentWindow
  if (!doc || !printWindow) {
    frame.remove()
    return false
  }
  doc.open()
  doc.write(html)
  doc.close()
  const removeFrame = () => {
    window.setTimeout(() => frame.remove(), 400)
  }
  try {
    printWindow.focus()
    printWindow.print()
  } catch {
    frame.remove()
    return false
  }
  printWindow.addEventListener?.('afterprint', removeFrame)
  window.setTimeout(removeFrame, 60000)
  return true
}

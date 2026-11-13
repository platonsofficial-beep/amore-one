/**
 * Invoice scan plug-in. A provider is used only when both INVOICE_SCAN_URL
 * and INVOICE_SCAN_API_KEY are set. Otherwise the caller stores the file
 * and the manager types the fields. No vendor is called from this file.
 */

export function readScanConfig(env = {}) {
  const url = `${env.INVOICE_SCAN_URL ?? ''}`.trim()
  const key = `${env.INVOICE_SCAN_API_KEY ?? ''}`.trim()
  return {
    configured: Boolean(url && key),
    url,
    key,
  }
}

export function fallbackScanResult() {
  return {
    scanned: false,
    reason: 'no_provider',
    fields: null,
  }
}

function numberOrNull(value) {
  if (value == null || value === '') return null
  const amount = Number(`${value}`.replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) ? amount : null
}

function text(value) {
  return `${value ?? ''}`.trim()
}

export function normalizeProviderInvoice(payload = {}) {
  const source = payload?.invoice && typeof payload.invoice === 'object' ? payload.invoice : payload
  const rawLines = source.lines || source.line_items || source.items || []
  const lines = (Array.isArray(rawLines) ? rawLines : []).map((line) => ({
    name: text(line?.name || line?.description || line?.item),
    quantity: numberOrNull(line?.quantity ?? line?.qty),
    unitPrice: numberOrNull(line?.unitPrice ?? line?.unit_price ?? line?.price),
  })).filter((line) => line.name)
  return {
    supplierName: text(source.supplierName || source.supplier_name || source.supplier),
    invoiceNumber: text(source.invoiceNumber || source.invoice_number || source.number),
    invoiceDate: text(source.invoiceDate || source.invoice_date || source.date).slice(0, 10),
    lines,
    subtotal: numberOrNull(source.subtotal),
    vat: numberOrNull(source.vat ?? source.tax),
    total: numberOrNull(source.total ?? source.amount_due),
  }
}

export async function scanInvoicePayload(body, env = {}, fetchImpl = globalThis.fetch) {
  const config = readScanConfig(env)
  if (!config.configured) return fallbackScanResult()
  try {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fileName: text(body?.fileName),
        contentType: text(body?.contentType),
        dataBase64: text(body?.dataBase64),
      }),
    })
    if (!response?.ok) return fallbackScanResult()
    const payload = await response.json()
    return {
      scanned: true,
      reason: 'provider',
      fields: normalizeProviderInvoice(payload),
    }
  } catch {
    return fallbackScanResult()
  }
}

import { scanInvoicePayload } from '../_shared/stockInvoiceScan.js'

function env(name) {
  return globalThis.Deno?.env?.get?.(name) ?? ''
}

export async function handleScanInvoice(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  let body = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const result = await scanInvoicePayload(body, {
    INVOICE_SCAN_URL: env('INVOICE_SCAN_URL'),
    INVOICE_SCAN_API_KEY: env('INVOICE_SCAN_API_KEY'),
  })
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

if (globalThis.Deno?.serve) {
  globalThis.Deno.serve(handleScanInvoice)
}

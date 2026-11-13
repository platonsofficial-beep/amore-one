import { supabase } from '../lib/supabaseClient'
import { fallbackScanResult } from '../lib/stockInvoiceScan'
import { buildInvoiceStoragePath } from '../lib/stockInvoice'

export const STOCK_INVOICE_BUCKET = 'stock-invoices'
const SIGNED_URL_SECONDS = 60 * 60
const REFRESH_BEFORE_MS = 60 * 1000
const SIGNED_URL_STORAGE_KEY = 'one.stockInvoiceSignedUrls.v1'

const signedUrlCache = new Map()

function readPersisted() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(SIGNED_URL_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function rememberSignedUrl(path, url, expiresAt) {
  signedUrlCache.set(path, { url, expiresAt })
  if (typeof localStorage === 'undefined') return
  try {
    const entries = readPersisted()
    const now = Date.now()
    entries[path] = { url, expiresAt }
    for (const [key, value] of Object.entries(entries)) {
      if (!value?.url || !value?.expiresAt || value.expiresAt <= now + REFRESH_BEFORE_MS) delete entries[key]
    }
    localStorage.setItem(SIGNED_URL_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // A full disk should not block an invoice that is already on screen.
  }
}

export function readCachedInvoiceUrl(path, now = Date.now()) {
  const memory = signedUrlCache.get(path)
  if (memory && memory.expiresAt > now + REFRESH_BEFORE_MS) return memory.url
  const persisted = readPersisted()[path]
  if (persisted?.url && persisted.expiresAt > now + REFRESH_BEFORE_MS) {
    signedUrlCache.set(path, persisted)
    return persisted.url
  }
  return ''
}

export async function resolveInvoiceUrls(paths = []) {
  const unique = [...new Set(paths.map((path) => `${path ?? ''}`.trim()).filter(Boolean))]
  const result = new Map()
  const missing = []
  unique.forEach((path) => {
    const cached = readCachedInvoiceUrl(path)
    if (cached) result.set(path, cached)
    else missing.push(path)
  })
  if (missing.length === 0 || !supabase) return result
  const { data, error } = await supabase.storage.from(STOCK_INVOICE_BUCKET).createSignedUrls(missing, SIGNED_URL_SECONDS)
  if (error) return result
  const expiresAt = Date.now() + SIGNED_URL_SECONDS * 1000
  ;(data ?? []).forEach((row) => {
    const path = `${row?.path ?? ''}`.trim()
    const url = `${row?.signedUrl ?? ''}`.trim()
    if (!path || !url || row?.error) return
    rememberSignedUrl(path, url, expiresAt)
    result.set(path, url)
  })
  return result
}

function mapInvoice(row, files = [], lines = []) {
  if (!row) return null
  return {
    id: row.id,
    orderId: row.order_id,
    workspaceId: row.workspace_id,
    supplierName: row.supplier_name || '',
    invoiceNumber: row.invoice_number || '',
    invoiceDate: row.invoice_date || '',
    subtotal: row.subtotal,
    vat: row.vat,
    total: row.total,
    scanned: row.scanned === true,
    files: files.map((file) => ({
      id: file.id,
      storagePath: file.storage_path,
      contentType: file.content_type,
      fileName: file.file_name || '',
      previewUrl: '',
    })),
    lines: lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unit_price,
    })),
  }
}

export async function loadOrderInvoice(orderId) {
  const id = `${orderId ?? ''}`.trim()
  if (!id || !supabase) return null
  const { data, error } = await supabase
    .from('stock_order_invoices')
    .select('id, order_id, workspace_id, supplier_name, invoice_number, invoice_date, subtotal, vat, total, scanned')
    .eq('order_id', id)
    .maybeSingle()
  if (error || !data) return null
  const [{ data: files }, { data: lines }] = await Promise.all([
    supabase.from('stock_order_invoice_files').select('id, storage_path, content_type, file_name, page_index').eq('invoice_id', data.id).order('page_index'),
    supabase.from('stock_order_invoice_lines').select('name, quantity, unit_price, sort_order').eq('invoice_id', data.id).order('sort_order'),
  ])
  const invoice = mapInvoice(data, files ?? [], lines ?? [])
  const urls = await resolveInvoiceUrls(invoice.files.map((file) => file.storagePath))
  invoice.files = invoice.files.map((file) => ({ ...file, previewUrl: urls.get(file.storagePath) || '' }))
  return invoice
}

export async function listInvoicedOrderIds(workspaceId) {
  const id = `${workspaceId ?? ''}`.trim()
  if (!id || !supabase) return new Set()
  const { data, error } = await supabase
    .from('stock_order_invoices')
    .select('order_id')
    .eq('workspace_id', id)
  if (error || !Array.isArray(data)) return new Set()
  return new Set(data.map((row) => `${row.order_id}`))
}

async function fileToBase64(blob) {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

export async function scanInvoiceFile({ blob, fileName, contentType }) {
  if (!supabase?.functions?.invoke) return fallbackScanResult()
  try {
    const dataBase64 = await fileToBase64(blob)
    const { data, error } = await supabase.functions.invoke('scan-stock-invoice', {
      body: { fileName, contentType, dataBase64 },
    })
    if (error || !data) return fallbackScanResult()
    return data
  } catch {
    return fallbackScanResult()
  }
}

export async function saveOrderInvoice({ workspaceId, orderId, draft, files }) {
  if (!supabase) {
    const error = new Error('Invoice storage is not turned on yet.')
    error.code = 'unavailable'
    throw error
  }
  const uploaded = []
  for (const file of files ?? []) {
    const path = buildInvoiceStoragePath(workspaceId, orderId, crypto.randomUUID(), file.contentType, file.fileName)
    const { error } = await supabase.storage.from(STOCK_INVOICE_BUCKET).upload(path, file.blob, {
      contentType: file.contentType,
      upsert: false,
    })
    if (error) throw new Error('Could not store the invoice file.')
    uploaded.push({ path, contentType: file.contentType, fileName: file.fileName })
  }
  const { data, error } = await supabase.from('stock_order_invoices').insert([{
    workspace_id: workspaceId,
    order_id: orderId,
    supplier_name: draft.supplierName || '',
    invoice_number: draft.invoiceNumber || '',
    invoice_date: draft.invoiceDate || null,
    subtotal: draft.subtotal === '' ? null : draft.subtotal,
    vat: draft.vat === '' ? null : draft.vat,
    total: draft.total === '' ? null : draft.total,
    scanned: draft.scanned === true,
  }]).select('id').single()
  if (error || !data?.id) throw new Error('Could not save the invoice.')
  if (uploaded.length) {
    await supabase.from('stock_order_invoice_files').insert(uploaded.map((file, index) => ({
      invoice_id: data.id,
      workspace_id: workspaceId,
      storage_path: file.path,
      content_type: file.contentType,
      file_name: file.fileName,
      page_index: index,
    })))
  }
  const lines = (draft.lines ?? []).filter((line) => `${line.name ?? ''}`.trim())
  if (lines.length) {
    await supabase.from('stock_order_invoice_lines').insert(lines.map((line, index) => ({
      invoice_id: data.id,
      workspace_id: workspaceId,
      name: line.name,
      quantity: line.quantity === '' ? null : line.quantity,
      unit_price: line.unitPrice === '' ? null : line.unitPrice,
      sort_order: index,
    })))
  }
  return loadOrderInvoice(orderId)
}

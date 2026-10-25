/** Shown when stock_item_storage_pars is not in the database yet. */
export const STORAGE_PAR_UNAVAILABLE_MESSAGE =
  'Per-shelf par is not available yet. On hand still shows. Pars appear after the shelf par update is applied.'

export const STORAGE_PAR_LABEL = 'Per-shelf par'

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isStockStorageParSchemaMissing(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  const mentionsSchema = (
    message.includes('stock_item_storage_pars')
    || message.includes('par_quantity')
  )
  if (!mentionsSchema) return false
  return code === '42703'
    || code === '42P01'
    || code === 'PGRST204'
    || code === 'PGRST205'
    || message.includes('schema cache')
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('could not find')
    || message.includes('relation')
}

/**
 * Round half away from zero to 3 decimal places, matching numeric(12,3).
 *
 * @param {number} value
 * @returns {number}
 */
function roundParQuantity(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

/**
 * Blank input clears the par. A number, including 0, is a tracked par.
 * Does not read the catalog minimum or target.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, clear: true, value: null }|{ ok: true, clear: false, value: number }|{ ok: false, clear: false, value: null, error: string }}
 */
export function parseStorageParInput(raw) {
  const trimmed = `${raw ?? ''}`.trim().replace(',', '.')
  if (!trimmed) {
    return { ok: true, clear: true, value: null }
  }
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    return {
      ok: false,
      clear: false,
      value: null,
      error: 'Par must be zero or greater, with up to 3 decimal places.',
    }
  }
  const value = roundParQuantity(Number(trimmed))
  if (!Number.isFinite(value) || value < 0) {
    return {
      ok: false,
      clear: false,
      value: null,
      error: 'Par must be zero or greater, with up to 3 decimal places.',
    }
  }
  return { ok: true, clear: false, value }
}

/**
 * @param {unknown} parQuantity
 * @returns {number|null}
 */
export function normalizeStorageParQuantity(parQuantity) {
  if (parQuantity == null || parQuantity === '') return null
  const parsed = Number(parQuantity)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return roundParQuantity(parsed)
}

/**
 * Missing on-hand counts as 0. A blank par is not a short.
 *
 * @param {unknown} parQuantity
 * @param {unknown} onHand
 * @returns {number|null}
 */
export function storageParShort(parQuantity, onHand) {
  const par = normalizeStorageParQuantity(parQuantity)
  if (par == null) return null
  const hand = Number(onHand)
  const quantity = Number.isFinite(hand) ? hand : 0
  return roundParQuantity(Math.max(0, par - quantity))
}

/**
 * @param {unknown} parQuantity
 * @param {unknown} onHand
 * @returns {boolean}
 */
export function isBelowStoragePar(parQuantity, onHand) {
  const par = normalizeStorageParQuantity(parQuantity)
  if (par == null) return false
  const hand = Number(onHand)
  const quantity = Number.isFinite(hand) ? hand : 0
  return quantity < par
}

/**
 * Count tracked pars whose on-hand (missing balance = 0) is under the par.
 * Blank pars are not counted. Catalog minimum and target are not read.
 *
 * @param {{ balances?: unknown, pars?: unknown }} [input]
 * @returns {Map<string, number>}
 */
export function countBelowParByStorage({ balances = [], pars = [] } = {}) {
  /** @type {Map<string, Map<string, number>>} */
  const onHand = new Map()
  for (const balance of Array.isArray(balances) ? balances : []) {
    const storageId = `${balance?.workspace_storage_id ?? balance?.workspaceStorageId ?? ''}`.trim()
    const itemId = `${balance?.stock_item_id ?? balance?.stockItemId ?? ''}`.trim()
    if (!storageId || !itemId) continue
    const byItem = onHand.get(storageId) ?? new Map()
    const quantity = Number(balance?.quantity)
    byItem.set(itemId, Number.isFinite(quantity) ? quantity : 0)
    onHand.set(storageId, byItem)
  }

  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const par of Array.isArray(pars) ? pars : []) {
    const storageId = `${par?.workspace_storage_id ?? par?.workspaceStorageId ?? ''}`.trim()
    const itemId = `${par?.stock_item_id ?? par?.stockItemId ?? ''}`.trim()
    const parQuantity = normalizeStorageParQuantity(par?.par_quantity ?? par?.parQuantity)
    if (!storageId || !itemId || parQuantity == null) continue
    const quantity = onHand.get(storageId)?.get(itemId) ?? 0
    if (!isBelowStoragePar(parQuantity, quantity)) continue
    counts.set(storageId, (counts.get(storageId) ?? 0) + 1)
  }
  return counts
}

/**
 * @param {number} count
 * @returns {string}
 */
export function formatItemsBelowPar(count) {
  const total = Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : 0
  return `${total} ${total === 1 ? 'item' : 'items'} below par`
}

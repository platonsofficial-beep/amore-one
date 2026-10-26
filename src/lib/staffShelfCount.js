import { formatStockQuantity } from './stockUtils'

/** Stored on the inventory count session. Manager approval is Post Count. */
export const STAFF_SHELF_COUNT_NOTE = 'Staff shelf count'

export const STAFF_SHELF_COUNT_UNAVAILABLE_MESSAGE = 'Shelf counting is not available yet.'

export const STAFF_SHELF_COUNT_EMPTY_MESSAGE = 'Nothing on this shelf has a balance to count yet.'

export const STAFF_SHELF_COUNT_WAITING_MESSAGE = 'Waiting for a manager to post. Stock is unchanged.'

const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/

/**
 * A shelf count line is a product that already has a location balance.
 * Par-only rows use quantityVersion 0 and are not posted by Inventory Count.
 *
 * @param {{ active?: boolean, quantityVersion?: unknown }} row
 */
export function isStaffShelfCountable(row) {
  if (!row || row.active === false) return false
  const version = Number(row.quantityVersion)
  return Number.isFinite(version) && version >= 1
}

/**
 * Slim row for the staff sheet. Cost and line value are dropped.
 *
 * @param {object[]} products
 */
export function toStaffShelfCountRows(products = []) {
  return (Array.isArray(products) ? products : []).map((row) => ({
    stockItemId: `${row?.stockItemId ?? ''}`.trim(),
    displayName: `${row?.displayName ?? row?.name ?? ''}`.trim() || 'Product',
    unit: `${row?.unit ?? ''}`.trim(),
    quantity: Number(row?.quantity) || 0,
    quantityVersion: Number(row?.quantityVersion) || 0,
    parQuantity: row?.parQuantity ?? null,
    active: row?.active !== false,
  })).filter((row) => row.stockItemId)
}

/**
 * @param {unknown} quantity
 * @returns {string}
 */
export function formatStaffShelfCountInput(quantity) {
  const value = Number(quantity)
  if (!Number.isFinite(value) || value < 0) return ''
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000
  return `${rounded}`
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: number }|{ ok: false, value: null }}
 */
export function parseStaffShelfCountQuantity(raw) {
  const trimmed = `${raw ?? ''}`.trim().replace(',', '.')
  if (!QUANTITY_PATTERN.test(trimmed)) {
    return { ok: false, value: null }
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0 || value > 999999999.999) {
    return { ok: false, value: null }
  }
  return { ok: true, value }
}

/**
 * @param {ReturnType<typeof toStaffShelfCountRows>} rows
 * @param {Record<string, string>} drafts
 * @returns {{ ok: true, lines: { stock_item_id: string, counted_quantity: number }[] }|{ ok: false, lines: [], error: string }}
 */
export function buildStaffShelfCountLines(rows = [], drafts = {}) {
  const countable = rows.filter(isStaffShelfCountable)
  if (countable.length === 0) {
    return { ok: false, lines: [], error: STAFF_SHELF_COUNT_EMPTY_MESSAGE }
  }

  const lines = []
  for (const row of countable) {
    const parsed = parseStaffShelfCountQuantity(drafts[row.stockItemId])
    if (!parsed.ok) {
      return {
        ok: false,
        lines: [],
        error: `Enter a quantity for ${row.displayName}.`,
      }
    }
    lines.push({
      stock_item_id: row.stockItemId,
      counted_quantity: parsed.value,
    })
  }

  return { ok: true, lines }
}

export function formatStaffShelfOnHand(row) {
  return formatStockQuantity(row?.quantity, row?.unit)
}

/**
 * Card copy for a session created by submit_staff_shelf_count.
 * Other sessions keep their existing count-type title.
 *
 * @param {{ note?: string, status?: string }|null|undefined} session
 * @returns {{ title: string, detail: string }|null}
 */
export function staffShelfCountPresentation(session) {
  if (`${session?.note ?? ''}`.trim() !== STAFF_SHELF_COUNT_NOTE) return null
  const waiting = `${session?.status ?? ''}`.trim() === 'counting_complete'
  return {
    title: 'Staff shelf count',
    detail: waiting ? STAFF_SHELF_COUNT_WAITING_MESSAGE : '',
  }
}

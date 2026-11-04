/**
 * Pack sizes for Quick Take (e.g. 1 Case = 6 Bottles).
 * Stock is always stored in the item's own unit. A pack is an optional
 * way to enter quantities: the app converts packs to units before saving.
 * Needs stock_items.pack_unit + units_per_pack (proposal SQL, not applied yet).
 */

let packSchemaDetected = false

/** Set when a loaded stock_items row carries the pack columns. */
export function notePackSchemaFromRecord(record) {
  if (record && typeof record === 'object' && Object.prototype.hasOwnProperty.call(record, 'units_per_pack')) {
    packSchemaDetected = true
  }
}

export function isStockPackSchemaAvailable() {
  return packSchemaDetected
}

export function __setPackSchemaAvailableForTests(value) {
  packSchemaDetected = Boolean(value)
}

export const PACK_UNIT_MAX_LENGTH = 40

export function normalizePackUnit(value) {
  const text = `${value ?? ''}`.trim().slice(0, PACK_UNIT_MAX_LENGTH)
  return text || null
}

export function normalizeUnitsPerPack(value) {
  if (value === null || value === undefined || `${value}`.trim() === '') return null
  const number = Number(`${value}`.replace(',', '.'))
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.round(number * 1000) / 1000
}

/** @returns {{ packUnit: string, unitsPerPack: number } | null} */
export function resolveItemPack(item) {
  const packUnit = normalizePackUnit(item?.packUnit ?? item?.pack_unit)
  const unitsPerPack = normalizeUnitsPerPack(item?.unitsPerPack ?? item?.units_per_pack)
  if (!packUnit || !unitsPerPack || unitsPerPack === 1) return null
  return { packUnit, unitsPerPack }
}

function pluralize(word, quantity) {
  const text = `${word ?? ''}`.trim()
  if (!text) return ''
  if (Math.abs(Number(quantity)) === 1) return text
  if (/(s|x|ch|sh)$/i.test(text)) return `${text}es`
  if (/[^aeiou]y$/i.test(text)) return `${text.slice(0, -1)}ies`
  return `${text}s`
}

export function formatQuantityWithUnit(quantity, unit) {
  const number = Number(quantity)
  const shown = Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0
  const word = pluralize(unit, shown)
  return word ? `${shown} ${word}` : `${shown}`
}

/** Packs → base units. mode 'pack' or 'unit'. */
export function toBaseQuantity(quantity, mode, pack) {
  const number = Number(quantity)
  if (!Number.isFinite(number) || number <= 0) return 0
  if (mode === 'pack' && pack) return Math.round(number * pack.unitsPerPack * 1000) / 1000
  return Math.round(number * 1000) / 1000
}

/** "8 Cases · 48 Bottles" or "36 Bottles". */
export function formatBalanceWithPack(quantity, unit, pack) {
  const base = formatQuantityWithUnit(quantity, unit)
  if (!pack) return base
  const packs = Math.floor((Number(quantity) || 0) / pack.unitsPerPack)
  const rest = Math.round(((Number(quantity) || 0) - packs * pack.unitsPerPack) * 1000) / 1000
  if (packs <= 0 || Number(quantity) < 0) return base
  const packText = formatQuantityWithUnit(packs, pack.packUnit)
  return rest > 0 ? `${packText} + ${formatQuantityWithUnit(rest, unit)} · ${base}` : `${packText} · ${base}`
}

/**
 * Plan one take. Taking more than the balance is allowed, with a warning;
 * the balance goes below 0 (a real minus) until the next count or delivery.
 */
export function planQuickTake({ balance = 0, quantity = 0, mode = 'unit', pack = null, unit = '' } = {}) {
  const baseQuantity = toBaseQuantity(quantity, mode, pack)
  const before = Number(balance) || 0
  const raw = Math.round((before - baseQuantity) * 1000) / 1000
  // Taking more than stock shows is allowed: the balance shows a real minus.
  const after = raw
  const enteredUnit = mode === 'pack' && pack ? pack.packUnit : unit
  return {
    baseQuantity,
    before,
    after,
    shortfall: raw < 0 ? Math.round(-raw * 1000) / 1000 : 0,
    goesNegative: baseQuantity > 0 && raw < 0,
    enteredLabel: formatQuantityWithUnit(quantity, enteredUnit),
    baseLabel: formatQuantityWithUnit(baseQuantity, unit),
  }
}

export const QUICK_TAKE_UNDO_WINDOW_MS = 15 * 60 * 1000

export function canUndoQuickTake(takenAt, now = Date.now()) {
  const time = typeof takenAt === 'number' ? takenAt : Date.parse(takenAt ?? '')
  if (!Number.isFinite(time)) return false
  return now - time >= 0 && now - time <= QUICK_TAKE_UNDO_WINDOW_MS
}

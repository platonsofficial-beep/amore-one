/**
 * P8.31.13 — Inventory Unit display formatting (presentation only).
 * Does not change stored units, quantities, or stock math.
 */

/** Countable inventory objects — pluralize for quantity !== 1 (including 0). */
const COUNTABLE_UNIT_FORMS = Object.freeze({
  piece: { singular: 'Piece', plural: 'Pieces' },
  bottle: { singular: 'Bottle', plural: 'Bottles' },
  can: { singular: 'Can', plural: 'Cans' },
  roll: { singular: 'Roll', plural: 'Rolls' },
  keg: { singular: 'Keg', plural: 'Kegs' },
})

/** Measured units — fixed abbreviations; never pluralize. */
const MEASURED_UNIT_LABELS = Object.freeze({
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  gram: 'g',
  grams: 'g',
  g: 'g',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  l: 'L',
  milliliter: 'mL',
  milliliters: 'mL',
  millilitre: 'mL',
  millilitres: 'mL',
  ml: 'mL',
})

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatInventoryQuantityNumber(value) {
  const quantity = Number(value)
  if (!Number.isFinite(quantity)) return '0'
  if (Number.isInteger(quantity)) return String(quantity)
  return quantity.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Human-readable inventory unit label (no quantity).
 * Measured units → kg / g / L / mL. Countable → singular canonical form.
 *
 * @param {unknown} unit
 * @returns {string}
 */
export function formatInventoryUnitLabel(unit) {
  const normalized = `${unit ?? ''}`.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const key = normalized.toLocaleLowerCase('en-US')
  if (Object.prototype.hasOwnProperty.call(MEASURED_UNIT_LABELS, key)) {
    return MEASURED_UNIT_LABELS[key]
  }
  if (Object.prototype.hasOwnProperty.call(COUNTABLE_UNIT_FORMS, key)) {
    return COUNTABLE_UNIT_FORMS[key].singular
  }
  return normalized
}

/**
 * Format quantity + inventory unit for Stock presentation.
 * Countable: "1 Piece", "2 Pieces", "0 Bottles".
 * Measured: "1 kg", "250 g", "500 mL", "1 L" (never pluralize abbreviations).
 *
 * @param {unknown} quantity
 * @param {unknown} unit
 * @returns {string}
 */
export function formatInventoryUnit(quantity, unit = '') {
  const formattedQuantity = formatInventoryQuantityNumber(quantity)
  const normalizedUnit = `${unit ?? ''}`.replace(/\s+/g, ' ').trim()
  if (!normalizedUnit) return formattedQuantity

  const key = normalizedUnit.toLocaleLowerCase('en-US')
  const numericQuantity = Number(quantity)
  const isSingular = Number.isFinite(numericQuantity) && numericQuantity === 1

  if (Object.prototype.hasOwnProperty.call(MEASURED_UNIT_LABELS, key)) {
    return `${formattedQuantity} ${MEASURED_UNIT_LABELS[key]}`
  }

  if (Object.prototype.hasOwnProperty.call(COUNTABLE_UNIT_FORMS, key)) {
    const forms = COUNTABLE_UNIT_FORMS[key]
    return `${formattedQuantity} ${isSingular ? forms.singular : forms.plural}`
  }

  return `${formattedQuantity} ${normalizedUnit}`
}

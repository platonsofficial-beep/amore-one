/**
 * P8.31.7a — Product Identity & Computed Display Name Contract
 * P8.31.7b — buildProductDisplayName may be used for read-only presentation.
 *
 * Pure helpers. No I/O. No mutations of stored product fields.
 *
 * Identity components (locked): Brand + Product Name + Size.
 * No Variant field. No duplicate-word cleanup. No quantity/packaging math.
 */

/**
 * Normalize a single identity component for display:
 * coerce to string, collapse whitespace, trim. Preserve casing and Unicode.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeProductIdentityComponent(value) {
  if (value == null) return ''
  return `${value}`.replace(/\s+/g, ' ').trim()
}

/**
 * Computed human display name: Brand + Name + Size (space-joined).
 * Omits empty components. Leaves intentional duplicated brand text in name untouched.
 *
 * @param {{ brand?: unknown, name?: unknown, size?: unknown }} parts
 * @returns {string}
 */
export function buildProductDisplayName({ brand, name, size } = {}) {
  return [brand, name, size]
    .map((part) => normalizeProductIdentityComponent(part))
    .filter(Boolean)
    .join(' ')
}

/**
 * Read-only title from a stock item / storage row shape.
 * Does not mutate the item. Falls back to trimmed name when all parts empty.
 *
 * @param {{ brand?: unknown, name?: unknown, size?: unknown }|null|undefined} item
 * @returns {string}
 */
export function buildProductDisplayNameFromItem(item) {
  const display = buildProductDisplayName({
    brand: item?.brand,
    name: item?.name,
    size: item?.size,
  })
  if (display) return display
  return normalizeProductIdentityComponent(item?.name)
}

/**
 * Comparison key for duplicate detection (not DB-enforced in this sprint).
 * Whitespace- and casing-insensitive. Size differentiates products.
 * Excludes unit, packaging, supplier, cost, storage, quantity, barcode.
 *
 * @param {{ brand?: unknown, name?: unknown, size?: unknown }} parts
 * @returns {string}
 */
export function buildProductIdentityKey({ brand, name, size } = {}) {
  return [brand, name, size]
    .map((part) => normalizeProductIdentityComponent(part).toLocaleLowerCase('en-US'))
    .join('\u001f')
}

/** Locked identity field names — Variant is intentionally absent. */
export const PRODUCT_IDENTITY_FIELDS = Object.freeze(['brand', 'name', 'size'])

/** Fields that must never participate in commercial identity. */
export const PRODUCT_IDENTITY_EXCLUDED_FIELDS = Object.freeze([
  'unit',
  'packagingNote',
  'packaging_note',
  'supplier',
  'supplierId',
  'costPrice',
  'cost_price',
  'storageLocation',
  'storage_location',
  'currentQuantity',
  'current_quantity',
  'barcode',
  'variant',
])

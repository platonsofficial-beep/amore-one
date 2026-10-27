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
/**
 * Bottle or pack size when it is stored and the visible name does not
 * already contain it. The computed title is Brand + Name + Size, so a chip
 * next to that title would repeat "1 kg" on "Espresso beans 1 kg".
 * Pass the text actually shown when it is not the computed title.
 * Empty when size was never stored. Does not read the unit or invent a size.
 *
 * @param {{ brand?: unknown, name?: unknown, size?: unknown }|null|undefined} item
 * @param {unknown} [visibleLabel]
 * @returns {string}
 */
export function formatProductSizeDetail(item, visibleLabel) {
  const size = normalizeProductIdentityComponent(item?.size)
  if (!size) return ''
  const label = visibleLabel == null
    ? buildProductDisplayNameFromItem(item)
    : normalizeProductIdentityComponent(visibleLabel)
  const haystack = label.toLocaleLowerCase('en-US')
  const needle = size.toLocaleLowerCase('en-US')
  if (haystack && needle && haystack.includes(needle)) return ''
  return size
}

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
 * List title for an order line, supplier product, or dialog row.
 * Catalog Brand + Name + Size wins. Otherwise the line's own identity parts.
 * Does not rewrite stored item names.
 *
 * @param {object|null|undefined} line
 * @param {object|null|undefined} catalogItem
 * @returns {string}
 */
export function resolveListedProductName(line, catalogItem) {
  if (catalogItem && (catalogItem.brand || catalogItem.name || catalogItem.size)) {
    const fromCatalog = buildProductDisplayNameFromItem(catalogItem)
    if (fromCatalog) return fromCatalog
  }
  const fromLine = buildProductDisplayName({
    brand: line?.brand,
    name: line?.productName || line?.name || line?.itemName,
    size: line?.size,
  })
  if (fromLine) return fromLine
  return normalizeProductIdentityComponent(line?.itemName ?? line?.name)
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

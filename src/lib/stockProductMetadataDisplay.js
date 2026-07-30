/**
 * P8.31.6d — Product metadata display helpers (read-only).
 * Does not compute Display Name. Does not change quantities or units.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function trimProductMetadataValue(value) {
  return `${value ?? ''}`.replace(/\s+/g, ' ').trim()
}

/**
 * Compact Brand · Size secondary line. Omits empty parts. No duplicate-word cleanup.
 *
 * @param {{ brand?: unknown, size?: unknown }} item
 * @returns {string}
 */
export function formatStockProductBrandSizeLine(item) {
  const brand = trimProductMetadataValue(item?.brand)
  const size = trimProductMetadataValue(item?.size)
  if (brand && size) return `${brand} · ${size}`
  return brand || size
}

/**
 * Search haystack fields for Stock browse (excludes packaging note).
 *
 * @param {{
 *   name?: unknown,
 *   brand?: unknown,
 *   size?: unknown,
 *   barcode?: unknown,
 *   supplier?: unknown,
 *   category?: unknown,
 *   itemType?: unknown,
 *   item_type?: unknown,
 *   storageLocation?: unknown,
 *   storage_location?: unknown,
 * }} item
 * @param {{ itemType?: string, location?: string }} [resolved]
 * @returns {string}
 */
export function buildStockProductSearchHaystack(item, resolved = {}) {
  const itemType = resolved.itemType
    ?? trimProductMetadataValue(item?.itemType ?? item?.item_type)
  const location = resolved.location
    ?? trimProductMetadataValue(item?.storageLocation ?? item?.storage_location)

  return [
    item?.name,
    item?.brand,
    item?.size,
    item?.barcode,
    item?.supplier,
    item?.category,
    itemType,
    location,
  ]
    .map((part) => trimProductMetadataValue(part))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Detail rows for Product Information — omit empty values (no N/A noise).
 *
 * @param {{
 *   brand?: unknown,
 *   size?: unknown,
 *   barcode?: unknown,
 *   packagingNote?: unknown,
 *   packaging_note?: unknown,
 *   supplier?: unknown,
 *   storageLocation?: unknown,
 *   storage_location?: unknown,
 *   unit?: unknown,
 * }} item
 * @param {{
 *   supplierLabel?: string,
 *   storageLabel?: string,
 *   unitLabel?: string,
 * }} [options]
 * @returns {Array<{ key: string, label: string, value: string }>}
 */
export function buildStockProductInformationRows(item, options = {}) {
  const rows = []
  const brand = trimProductMetadataValue(item?.brand)
  const size = trimProductMetadataValue(item?.size)
  const barcode = trimProductMetadataValue(item?.barcode)
  const packagingNote = trimProductMetadataValue(
    item?.packagingNote ?? item?.packaging_note,
  )
  const supplier = trimProductMetadataValue(
    options.supplierLabel ?? item?.supplier,
  )
  const storage = trimProductMetadataValue(
    options.storageLabel ?? item?.storageLocation ?? item?.storage_location,
  )
  const unit = trimProductMetadataValue(options.unitLabel ?? item?.unit)

  if (brand) rows.push({ key: 'brand', label: 'Brand', value: brand })
  if (size) rows.push({ key: 'size', label: 'Size', value: size })
  if (barcode) rows.push({ key: 'barcode', label: 'Barcode', value: barcode })
  if (packagingNote) {
    rows.push({ key: 'packagingNote', label: 'Packaging note', value: packagingNote })
  }
  if (supplier) rows.push({ key: 'supplier', label: 'Supplier', value: supplier })
  if (storage) rows.push({ key: 'storage', label: 'Default storage', value: storage })
  if (unit) rows.push({ key: 'unit', label: 'Inventory unit', value: unit })

  return rows
}

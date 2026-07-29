/**
 * P8.27.5 — Spreadsheet Import wizard presentation helpers.
 *
 * Pure UI grouping / mapping labels only. No parser, eligibility, or Apply changes.
 */

import { INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION } from './inventoryOperationalImportPreview'

export const INVENTORY_IMPORT_MAP_PREVIEW_ROW_LIMIT = 5

/**
 * @param {unknown} header
 * @returns {string}
 */
function normalizeHeaderLabel(header) {
  if (header === null || header === undefined) return ''
  return `${header}`.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Map a source header to a ONE field role for Map Columns.
 *
 * @param {{
 *   columnIndex?: number,
 *   sourceHeader?: unknown,
 *   normalized?: string,
 *   isBlank?: boolean,
 * }} header
 * @returns {{
 *   oneField: string,
 *   required: boolean,
 *   optional: boolean,
 *   role: 'product_name'|'storage'|'bar'|'weekday'|'order'|'stock_control'|'unmapped'|'blank',
 * }}
 */
export function mapInventoryImportHeaderToOneField(header) {
  const columnIndex = Number.isInteger(header?.columnIndex) ? header.columnIndex : -1

  // Operational weekly sheets use a blank header for the product-name column.
  if (columnIndex === 0) {
    return {
      oneField: 'Product name',
      required: true,
      optional: false,
      role: 'product_name',
    }
  }

  if (header?.isBlank) {
    return {
      oneField: 'Unmapped',
      required: false,
      optional: false,
      role: 'blank',
    }
  }

  const normalized = normalizeHeaderLabel(header?.normalized || header?.sourceHeader)

  if (normalized === 'product' || normalized === 'product name' || normalized === 'name') {
    return {
      oneField: 'Product name',
      required: true,
      optional: false,
      role: 'product_name',
    }
  }

  if (
    normalized === 'storage'
    || normalized.startsWith('storage ')
    || normalized.includes(' storage')
  ) {
    return {
      oneField: 'Storage / location',
      required: false,
      optional: true,
      role: 'storage',
    }
  }

  if (normalized === 'bar') {
    return {
      oneField: 'Bar quantity',
      required: false,
      optional: true,
      role: 'bar',
    }
  }

  if (
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      .includes(normalized)
  ) {
    return {
      oneField: `Weekday · ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`,
      required: false,
      optional: true,
      role: 'weekday',
    }
  }

  if (normalized === 'order') {
    return {
      oneField: 'Order (evidence)',
      required: false,
      optional: true,
      role: 'order',
    }
  }

  if (normalized === 'stock control' || normalized === 'stock_control') {
    return {
      oneField: 'Stock Control (evidence)',
      required: false,
      optional: true,
      role: 'stock_control',
    }
  }

  return {
    oneField: 'Unmapped',
    required: false,
    optional: false,
    role: 'unmapped',
  }
}

/**
 * @param {object|null|undefined} parseResult
 * @returns {{
 *   mapped: Array<{ columnIndex: number, sourceHeader: string, oneField: string, required: boolean }>,
 *   missingRequired: string[],
 *   optionalMapped: string[],
 *   unmappedCount: number,
 * }}
 */
export function buildInventoryImportColumnMappingSummary(parseResult) {
  const headers = Array.isArray(parseResult?.headers) ? parseResult.headers : []
  const mapped = []
  const optionalMapped = []
  let hasProductName = false
  let unmappedCount = 0

  headers.forEach((header) => {
    const field = mapInventoryImportHeaderToOneField(header)
    const sourceHeader = header?.isBlank
      ? '(blank)'
      : `${header?.sourceHeader ?? ''}`.trim() || '(blank)'

    mapped.push({
      columnIndex: header.columnIndex,
      sourceHeader,
      oneField: field.oneField,
      required: field.required,
      role: field.role,
    })

    if (field.role === 'product_name') hasProductName = true
    if (field.optional) optionalMapped.push(field.oneField)
    if (field.role === 'unmapped' || field.role === 'blank') unmappedCount += 1
  })

  const missingRequired = []
  if (!hasProductName) missingRequired.push('Product name')

  return {
    mapped,
    missingRequired,
    optionalMapped: [...new Set(optionalMapped)],
    unmappedCount,
  }
}

/**
 * Build a small sample matrix for Map Columns (max 5 data rows).
 *
 * @param {object|null|undefined} parseResult
 * @param {number} [limit]
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function buildInventoryImportMapSamplePreview(
  parseResult,
  limit = INVENTORY_IMPORT_MAP_PREVIEW_ROW_LIMIT,
) {
  const headers = Array.isArray(parseResult?.headers)
    ? parseResult.headers.map((header) => (
      header?.isBlank
        ? '(blank)'
        : `${header?.sourceHeader ?? ''}`.trim() || '(blank)'
    ))
    : []

  const sourceRows = Array.isArray(parseResult?.rows) ? parseResult.rows : []
  const rows = sourceRows.slice(0, Math.max(0, limit)).map((row) => {
    const cells = Array.isArray(row?.cells) ? row.cells : []
    return headers.map((_, index) => {
      const cell = cells[index]
      const value = cell?.normalized?.value
      if (value !== null && value !== undefined && `${value}`.trim() !== '') {
        return `${value}`
      }
      const raw = cell?.raw
      if (raw === null || raw === undefined || raw === '') return '—'
      return `${raw}`
    })
  })

  return { headers, rows }
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
function rowProductLabel(row) {
  const name = `${row?.source?.productName ?? row?.productName ?? ''}`.trim()
  return name || 'Untitled product'
}

/**
 * Quality groups for Validate Import.
 *
 * @param {object|null|undefined} preview
 * @returns {{
 *   summary: { rows: number, ready: number, warnings: number, errors: number },
 *   groups: Array<{ id: string, title: string, count: number, items: string[] }>,
 * }}
 */
export function buildInventoryImportValidateGroups(preview) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : []

  /** @type {Record<string, string[]>} */
  const buckets = {
    missing_units: [],
    missing_storage: [],
    missing_supplier: [],
    unknown_category: [],
    duplicate_products: [],
    blocked_rows: [],
    manual_review: [],
  }

  let ready = 0
  let warnings = 0
  let errors = 0

  /** @type {Map<string, string[]>} */
  const linkTargets = new Map()

  rows.forEach((row, index) => {
    const label = rowProductLabel(row)
    const blockers = Array.isArray(row?.blockers) ? row.blockers : []
    const rowWarnings = Array.isArray(row?.warnings) ? row.warnings : []
    const action = row?.proposedAction
    const hasBlockers = blockers.length > 0
      || action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED
      || action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID
    const needsReview = action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION

    if (rowWarnings.length > 0) warnings += 1
    if (hasBlockers || needsReview) errors += 1
    else ready += 1

    if (blockers.includes('unit_missing')) {
      buckets.missing_units.push(label)
    }
    if (
      rowWarnings.includes('source_location_requires_policy')
      || blockers.includes('location_policy_unset')
    ) {
      buckets.missing_storage.push(label)
    }
    if (rowWarnings.includes('category_defaulted_to_other')) {
      buckets.unknown_category.push(label)
    }
    if (needsReview) {
      buckets.manual_review.push(label)
    }
    if (
      action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED
      || action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID
      || blockers.some((code) => code !== 'unit_missing' && code !== 'possible_match_unresolved')
    ) {
      if (
        action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED
        || action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID
      ) {
        buckets.blocked_rows.push(label)
      }
    }

    const matchedId = `${row?.existingOne?.id
      ?? row?.match?.matchedStockItem?.id
      ?? ''}`.trim()
    if (matchedId && action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING) {
      const list = linkTargets.get(matchedId) ?? []
      list.push(label)
      linkTargets.set(matchedId, list)
    }

    // Supplier is not mapped in operational import today — keep group present but empty.
    void index
  })

  for (const labels of linkTargets.values()) {
    if (labels.length > 1) {
      buckets.duplicate_products.push(...labels)
    }
  }

  const groupDefs = [
    { id: 'missing_units', title: 'Missing Units' },
    { id: 'missing_storage', title: 'Missing Storage' },
    { id: 'missing_supplier', title: 'Missing Supplier' },
    { id: 'unknown_category', title: 'Unknown Category' },
    { id: 'duplicate_products', title: 'Duplicate Products' },
    { id: 'blocked_rows', title: 'Blocked Rows' },
    { id: 'manual_review', title: 'Manual Review' },
  ]

  const groups = groupDefs.map((def) => {
    const items = [...new Set(buckets[def.id])]
    return {
      id: def.id,
      title: def.title,
      count: items.length,
      items,
    }
  })

  return {
    summary: {
      rows: rows.length,
      ready,
      warnings,
      errors,
    },
    groups,
  }
}

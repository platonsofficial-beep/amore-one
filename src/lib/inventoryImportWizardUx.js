/**
 * P8.27.5 — Spreadsheet Import wizard presentation helpers.
 *
 * Pure UI grouping / mapping labels only. No parser, eligibility, or Apply changes.
 */

import { INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION } from './inventoryOperationalImportPreview'

export const INVENTORY_IMPORT_MAP_PREVIEW_ROW_LIMIT = 5

const WEEKDAY_NAMES = Object.freeze([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

/**
 * ONE fields a manager can assign on Map Columns.
 * `unmapped` clears a column. `ignore` keeps the column out of the import.
 */
const INVENTORY_IMPORT_COLUMN_FIELD_DEFS = Object.freeze([
  Object.freeze({ id: 'product_name', oneField: 'Product name', required: true, optional: false, role: 'product_name' }),
  Object.freeze({ id: 'category', oneField: 'Category', required: false, optional: true, role: 'category' }),
  Object.freeze({ id: 'unit', oneField: 'Unit', required: true, optional: false, role: 'unit' }),
  Object.freeze({ id: 'quantity', oneField: 'Quantity', required: true, optional: false, role: 'quantity' }),
  Object.freeze({ id: 'minimum', oneField: 'Minimum', required: false, optional: true, role: 'minimum' }),
  Object.freeze({ id: 'par', oneField: 'Par', required: false, optional: true, role: 'par' }),
  Object.freeze({ id: 'cost', oneField: 'Cost price', required: false, optional: true, role: 'cost' }),
  Object.freeze({ id: 'supplier', oneField: 'Supplier', required: false, optional: true, role: 'supplier' }),
  Object.freeze({ id: 'storage', oneField: 'Storage / location', required: false, optional: true, role: 'storage' }),
  Object.freeze({ id: 'brand', oneField: 'Brand', required: false, optional: true, role: 'brand' }),
  Object.freeze({ id: 'size', oneField: 'Size', required: false, optional: true, role: 'size' }),
  Object.freeze({ id: 'barcode', oneField: 'Barcode', required: false, optional: true, role: 'barcode' }),
  Object.freeze({ id: 'bar', oneField: 'Bar quantity', required: false, optional: true, role: 'bar' }),
  Object.freeze({ id: 'order', oneField: 'Order (evidence)', required: false, optional: true, role: 'order' }),
  Object.freeze({ id: 'stock_control', oneField: 'Stock Control (evidence)', required: false, optional: true, role: 'stock_control' }),
  ...WEEKDAY_NAMES.map((day) => Object.freeze({
    id: `weekday_${day}`,
    oneField: `Weekday · ${day.charAt(0).toUpperCase()}${day.slice(1)}`,
    required: false,
    optional: true,
    role: 'weekday',
  })),
  Object.freeze({ id: 'ignore', oneField: 'Ignore', required: false, optional: false, role: 'ignore' }),
  Object.freeze({ id: 'unmapped', oneField: 'Unmapped', required: false, optional: false, role: 'unmapped' }),
])

const COLUMN_FIELD_BY_ID = new Map(
  INVENTORY_IMPORT_COLUMN_FIELD_DEFS.map((field) => [field.id, field]),
)

/** Dropdown order: clear, ignore, then ONE fields. */
export const INVENTORY_IMPORT_COLUMN_FIELD_OPTIONS = Object.freeze(
  [
    COLUMN_FIELD_BY_ID.get('unmapped'),
    COLUMN_FIELD_BY_ID.get('ignore'),
    ...INVENTORY_IMPORT_COLUMN_FIELD_DEFS.filter((field) => (
      field.id !== 'ignore' && field.id !== 'unmapped'
    )),
  ].map((field) => Object.freeze({ id: field.id, label: field.oneField })),
)

const STANDARD_REQUIRED_COLUMN_FIELDS = Object.freeze([
  Object.freeze({ role: 'product_name', label: 'Product name', message: 'Map a Product name column' }),
  Object.freeze({ role: 'unit', label: 'Unit', message: 'Map a Unit column' }),
  Object.freeze({ role: 'quantity', label: 'Quantity', message: 'Map a Quantity column' }),
])

/** Operational sheets repeat these roles on purpose (several storages, one column per weekday). */
const REPEATABLE_COLUMN_ROLES = new Set([
  'storage',
  'bar',
  'weekday',
  'order',
  'stock_control',
  'ignore',
  'unmapped',
  'blank',
])

/**
 * Case- and space-insensitive header key.
 * Strips Greek tonos and folds final sigma so Τιμή κόστους and ΤΙΜΗ ΚΟΣΤΟΥΣ match.
 *
 * @param {unknown} header
 * @returns {string}
 */
function normalizeHeaderLabel(header) {
  if (header === null || header === undefined) return ''
  return `${header}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @type {Map<string, string>} */
const HEADER_ALIAS_TO_FIELD_ID = new Map()

/**
 * @param {string[]} aliases
 * @param {string} fieldId
 */
function registerHeaderAliases(aliases, fieldId) {
  aliases.forEach((alias) => {
    HEADER_ALIAS_TO_FIELD_ID.set(normalizeHeaderLabel(alias), fieldId)
  })
}

registerHeaderAliases(['name', 'product', 'product name', 'προϊόν', 'προιον'], 'product_name')
registerHeaderAliases(['category', 'κατηγορία', 'κατηγορια'], 'category')
registerHeaderAliases(['unit', 'μονάδα', 'μοναδα'], 'unit')
registerHeaderAliases(['quantity', 'qty', 'ποσότητα', 'ποσοτητα'], 'quantity')
registerHeaderAliases(['minimum', 'min', 'ελάχιστο', 'ελαχιστο'], 'minimum')
registerHeaderAliases(['par', 'par level'], 'par')
registerHeaderAliases(['cost', 'cost price', 'τιμή κόστους', 'τιμη κοστους', 'τιμή κόστος'], 'cost')
registerHeaderAliases(['supplier', 'προμηθευτής', 'προμηθευτης'], 'supplier')
registerHeaderAliases(['storage', 'location', 'storage location', 'αποθήκη', 'αποθηκη'], 'storage')
registerHeaderAliases(['brand', 'μάρκα', 'μαρκα'], 'brand')
registerHeaderAliases(['size', 'μέγεθος', 'μεγεθος'], 'size')
registerHeaderAliases(['barcode', 'bar code'], 'barcode')
registerHeaderAliases(['bar'], 'bar')
registerHeaderAliases(['order'], 'order')
registerHeaderAliases(['stock control', 'stock_control'], 'stock_control')
WEEKDAY_NAMES.forEach((day) => {
  registerHeaderAliases([day], `weekday_${day}`)
})

/**
 * @param {string} fieldId
 * @returns {{
 *   id: string,
 *   oneField: string,
 *   required: boolean,
 *   optional: boolean,
 *   role: string,
 * }}
 */
function columnFieldById(fieldId) {
  const field = COLUMN_FIELD_BY_ID.get(fieldId) ?? COLUMN_FIELD_BY_ID.get('unmapped')
  return {
    id: field.id,
    oneField: field.oneField,
    required: field.required,
    optional: field.optional,
    role: field.role,
  }
}

/**
 * Map a source header to a ONE field role for Map Columns.
 * A blank first column stays Product name so operational weekly sheets keep working.
 * Any other header is matched by alias, including Greek labels.
 *
 * @param {{
 *   columnIndex?: number,
 *   sourceHeader?: unknown,
 *   normalized?: string,
 *   isBlank?: boolean,
 * }} header
 * @returns {{
 *   id: string,
 *   oneField: string,
 *   required: boolean,
 *   optional: boolean,
 *   role: string,
 * }}
 */
export function mapInventoryImportHeaderToOneField(header) {
  const columnIndex = Number.isInteger(header?.columnIndex) ? header.columnIndex : -1

  // Operational weekly sheets use a blank header for the product-name column.
  if (columnIndex === 0 && header?.isBlank) {
    return columnFieldById('product_name')
  }

  if (header?.isBlank) {
    return {
      ...columnFieldById('unmapped'),
      role: 'blank',
    }
  }

  const normalized = normalizeHeaderLabel(header?.normalized || header?.sourceHeader)
  const aliasId = HEADER_ALIAS_TO_FIELD_ID.get(normalized)
  if (aliasId) return columnFieldById(aliasId)

  if (
    normalized === 'storage'
    || normalized.startsWith('storage ')
    || normalized.includes(' storage')
  ) {
    return columnFieldById('storage')
  }

  return columnFieldById('unmapped')
}

/**
 * Manual choice wins over the header alias.
 *
 * @param {object} header
 * @param {unknown} overrideId
 */
export function resolveInventoryImportColumnField(header, overrideId) {
  if (typeof overrideId === 'string' && COLUMN_FIELD_BY_ID.has(overrideId)) {
    const chosen = columnFieldById(overrideId)
    if (chosen.id === 'unmapped' && header?.isBlank) {
      return { ...chosen, role: 'blank' }
    }
    return chosen
  }
  return mapInventoryImportHeaderToOneField(header)
}

/**
 * @param {object|null|undefined} parseResult
 * @param {{
 *   overrides?: Record<string, string>|null,
 *   requireStandardFields?: boolean,
 * }} [options]
 * @returns {{
 *   mapped: Array<{
 *     columnIndex: number,
 *     sourceHeader: string,
 *     id: string,
 *     oneField: string,
 *     required: boolean,
 *     optional: boolean,
 *     role: string,
 *     duplicate: boolean,
 *   }>,
 *   missingRequired: string[],
 *   optionalMapped: string[],
 *   unmappedCount: number,
 * }}
 */
export function buildInventoryImportColumnMappingSummary(parseResult, options = {}) {
  const headers = Array.isArray(parseResult?.headers) ? parseResult.headers : []
  const overrides = options?.overrides && typeof options.overrides === 'object'
    ? options.overrides
    : null
  const mapped = []
  let hasProductName = false
  let hasUnit = false
  let hasQuantity = false
  let unmappedCount = 0

  headers.forEach((header) => {
    const overrideId = overrides?.[header.columnIndex] ?? overrides?.[String(header.columnIndex)]
    const field = resolveInventoryImportColumnField(header, overrideId)
    const sourceHeader = header?.isBlank
      ? '(blank)'
      : `${header?.sourceHeader ?? ''}`.trim() || '(blank)'

    mapped.push({
      columnIndex: header.columnIndex,
      sourceHeader,
      id: field.id,
      oneField: field.oneField,
      required: field.required,
      optional: field.optional,
      role: field.role,
      duplicate: false,
    })

    if (field.role === 'product_name') hasProductName = true
    if (field.role === 'unit') hasUnit = true
    if (field.role === 'quantity') hasQuantity = true
    if (field.role === 'unmapped' || field.role === 'blank' || field.role === 'ignore') {
      unmappedCount += 1
    }
  })

  // A field that can belong to only one column is a duplicate on every column that uses it.
  const roleCounts = new Map()
  mapped.forEach((field) => {
    if (REPEATABLE_COLUMN_ROLES.has(field.role)) return
    roleCounts.set(field.role, (roleCounts.get(field.role) ?? 0) + 1)
  })
  mapped.forEach((field) => {
    if ((roleCounts.get(field.role) ?? 0) > 1) field.duplicate = true
  })
  const optionalMapped = mapped
    .filter((field) => field.optional && !field.duplicate)
    .map((field) => field.oneField)

  const missingRequired = []
  if (!hasProductName) missingRequired.push('Product name')
  if (options?.requireStandardFields === true) {
    if (!hasUnit) missingRequired.push('Unit')
    if (!hasQuantity) missingRequired.push('Quantity')
  }

  return {
    mapped,
    missingRequired,
    optionalMapped: [...new Set(optionalMapped)],
    unmappedCount,
  }
}

/**
 * Plain reasons for a disabled Map Columns Continue button.
 * Operational weekly sheets keep their existing product-count gate.
 * Every other worksheet needs one Product name, one Unit, and one Quantity.
 *
 * @param {{
 *   isOperational?: boolean,
 *   operationalProductCount?: number,
 *   mappings?: Array<{ role?: string, oneField?: string, duplicate?: boolean }>,
 * }} [input]
 * @returns {string[]}
 */
export function listInventoryImportColumnsContinueMessages({
  isOperational = false,
  operationalProductCount = 0,
  mappings = [],
} = {}) {
  if (isOperational) {
    if (Number.isFinite(operationalProductCount) && operationalProductCount > 0) return []
    return ['No products were found in this worksheet.']
  }

  const fields = Array.isArray(mappings) ? mappings : []
  /** @type {Map<string, { count: number, label: string }>} */
  const counts = new Map()
  fields.forEach((field) => {
    const role = field?.role
    if (!role || REPEATABLE_COLUMN_ROLES.has(role)) return
    const current = counts.get(role) ?? { count: 0, label: field.oneField || role }
    current.count += 1
    counts.set(role, current)
  })

  /** @type {string[]} */
  const messages = []
  STANDARD_REQUIRED_COLUMN_FIELDS.forEach((required) => {
    const count = counts.get(required.role)?.count ?? 0
    if (count === 0) messages.push(required.message)
    else if (count > 1) messages.push(`${required.label} is mapped more than once`)
  })

  counts.forEach((entry, role) => {
    if (entry.count < 2) return
    if (STANDARD_REQUIRED_COLUMN_FIELDS.some((required) => required.role === role)) return
    messages.push(`${entry.label} is mapped more than once`)
  })

  return messages
}

/**
 * @param {object|null|undefined} row
 * @param {number} columnIndex
 * @returns {string}
 */
function mappedCellText(row, columnIndex) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0) return ''
  const cell = Array.isArray(row?.cells) ? row.cells[columnIndex] : null
  const value = cell?.normalized?.value
  if (value !== null && value !== undefined && `${value}`.trim() !== '') return `${value}`.trim()
  const raw = cell?.raw
  if (raw === null || raw === undefined || `${raw}`.trim() === '') return ''
  return `${raw}`.trim()
}

/**
 * Row check for a standard inventory table after Map Columns.
 * Uses the mapped Product name, Unit, and Quantity columns only.
 *
 * @param {object|null|undefined} parseResult
 * @param {{ mapped?: Array<{ role?: string, columnIndex?: number, duplicate?: boolean }> }|null} [columnMappingSummary]
 * @returns {{
 *   rows: Array<{
 *     sourceRowNumber: number,
 *     productName: string,
 *     unit: string,
 *     quantity: string,
 *     status: 'Ready'|'Needs attention',
 *     issues: string[],
 *   }>,
 *   groups: {
 *     summary: { rows: number, ready: number, warnings: number, errors: number },
 *     groups: Array<{ id: string, title: string, count: number, items: string[] }>,
 *   },
 * }|null}
 */
export function buildStandardInventoryImportRowReview(parseResult, columnMappingSummary = null) {
  if (!parseResult || !Array.isArray(parseResult.headers)) return null

  const mappings = Array.isArray(columnMappingSummary?.mapped) ? columnMappingSummary.mapped : []
  const columnForRole = (role) => {
    const match = mappings.find((field) => field.role === role && field.duplicate !== true)
    return Number.isInteger(match?.columnIndex) ? match.columnIndex : -1
  }
  const nameIndex = columnForRole('product_name')
  const unitIndex = columnForRole('unit')
  const quantityIndex = columnForRole('quantity')

  const sourceRows = Array.isArray(parseResult.rows) ? parseResult.rows : []
  const rows = sourceRows.filter((row) => row?.isBlank !== true).map((row) => {
    const productName = mappedCellText(row, nameIndex)
    const unit = mappedCellText(row, unitIndex)
    const quantity = mappedCellText(row, quantityIndex)
    /** @type {string[]} */
    const issues = []
    if (!productName) issues.push('Product name is empty')
    if (!unit) issues.push('Unit is empty')
    if (!quantity) issues.push('Quantity is empty')
    return {
      sourceRowNumber: Number(row?.sourceRowNumber) || 0,
      productName,
      unit,
      quantity,
      status: issues.length === 0 ? 'Ready' : 'Needs attention',
      issues,
    }
  })

  const ready = rows.filter((row) => row.status === 'Ready').length
  const errors = rows.length - ready
  return {
    rows,
    groups: {
      summary: {
        rows: rows.length,
        ready,
        warnings: 0,
        errors,
      },
      groups: [
        {
          id: 'blocked_rows',
          title: 'Blocked Rows',
          count: 0,
          items: [],
        },
      ],
    },
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

/** @typedef {'blocked'|'decisions_required'|'warnings_only'|'ready'} InventoryImportValidateAssistantState */

const VALIDATE_ASSISTANT_BLOCKER_DEFS = {
  missing_units: {
    title: 'Products need a unit',
    explanation: 'Choose a unit for each new product before continuing.',
    actionHint: 'Confirm units in New Products below.',
  },
  missing_storage: {
    title: 'Products need a storage',
    explanation: 'Choose a storage for each new product, or set a fallback later in Import Preview.',
    actionHint: 'Confirm storage in New Products below.',
  },
  duplicate_products: {
    title: 'Duplicate existing targets',
    explanation: 'Multiple rows are set to link to the same existing product.',
    actionHint: 'Review link decisions before applying.',
  },
  blocked_rows: {
    title: 'Remaining blocked rows',
    explanation: 'These products cannot continue until their data is fixed or they are skipped.',
    actionHint: null,
  },
}

const VALIDATE_ASSISTANT_WARNING_DEFS = {
  missing_supplier: {
    title: 'Missing supplier',
    explanation: 'Supplier is not set. You may continue and assign suppliers later.',
  },
  unknown_category: {
    title: 'Category set to Other',
    explanation: 'ONE could not recognize the source category and used Other as a default.',
  },
  matched_item_inactive: {
    title: 'Existing item inactive',
    explanation: 'A matched ONE product is inactive. Review before linking.',
  },
  source_quantity_evidence: {
    title: 'Source quantity retained as evidence',
    explanation: 'Spreadsheet quantities are kept as evidence only until you choose a stock policy.',
  },
}

/**
 * @param {Array<{ id?: string, title?: string, count?: number, items?: string[] }>|null|undefined} groups
 * @param {string} id
 * @returns {{ id: string, title: string, count: number, items: string[] }}
 */
function findValidateGroup(groups, id) {
  const found = Array.isArray(groups)
    ? groups.find((group) => group?.id === id)
    : null
  return {
    id,
    title: `${found?.title ?? id}`,
    count: Number(found?.count) || 0,
    items: Array.isArray(found?.items) ? found.items.map((item) => `${item}`) : [],
  }
}

/**
 * Presentation-only warning labels from existing preview warning codes.
 * Does not change preview, eligibility, or validate group counts.
 *
 * @param {object|null|undefined} preview
 * @returns {Array<{ id: string, title: string, count: number, items: string[], explanation: string }>}
 */
function buildValidateAssistantWarningExtras(preview) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : []
  /** @type {Record<string, string[]>} */
  const buckets = {
    matched_item_inactive: [],
    source_quantity_evidence: [],
  }

  rows.forEach((row) => {
    const label = rowProductLabel(row)
    const warnings = Array.isArray(row?.warnings) ? row.warnings : []
    if (warnings.includes('matched_item_inactive')) {
      buckets.matched_item_inactive.push(label)
    }
    if (warnings.includes('source_quantity_requires_policy')) {
      buckets.source_quantity_evidence.push(label)
    }
  })

  return Object.entries(buckets)
    .map(([id, items]) => {
      const unique = [...new Set(items)]
      const def = VALIDATE_ASSISTANT_WARNING_DEFS[id]
      return {
        id,
        title: def.title,
        explanation: def.explanation,
        count: unique.length,
        items: unique,
      }
    })
    .filter((group) => group.count > 0)
}

/**
 * Guided Validate Import assistant model (P8.28.0).
 * Presentation only — consumes existing validate groups / preview / match counts.
 *
 * @param {{
 *   validateImportGroups?: {
 *     summary?: { rows?: number, ready?: number, warnings?: number, errors?: number },
 *     groups?: Array<{ id?: string, title?: string, count?: number, items?: string[] }>,
 *   }|null,
 *   preview?: object|null,
 *   unresolvedPossibleMatches?: number|null,
 *   possibleMatchCount?: number|null,
 * }} [input]
 * @returns {{
 *   state: InventoryImportValidateAssistantState,
 *   guidance: { headline: string, supporting: string, status: string },
 *   progress: { resolved: number, remaining: number, ready: number },
 *   blockers: Array<{
 *     id: string, title: string, count: number, items: string[],
 *     explanation: string, actionHint: string|null,
 *   }>,
 *   decisions: { count: number, total: number, hasDecisions: boolean },
 *   warnings: Array<{
 *     id: string, title: string, count: number, items: string[], explanation: string,
 *   }>,
 * }}
 */
export function buildInventoryImportValidateAssistant({
  validateImportGroups = null,
  preview = null,
  unresolvedPossibleMatches = null,
  possibleMatchCount = null,
} = {}) {
  const groups = validateImportGroups?.groups
  const summary = validateImportGroups?.summary ?? {}
  const resolved = Number(summary.ready) || 0
  const remaining = Number(summary.errors) || 0
  const warningRowCount = Number(summary.warnings) || 0
  const totalRows = Number(summary.rows) || 0

  const unresolvedCount = Number.isFinite(unresolvedPossibleMatches)
    ? Math.max(0, Number(unresolvedPossibleMatches))
    : findValidateGroup(groups, 'manual_review').count
  const totalPossibleMatches = Number.isFinite(possibleMatchCount)
    ? Math.max(0, Number(possibleMatchCount))
    : findValidateGroup(groups, 'manual_review').count

  /** @type {Array<{ id: string, title: string, count: number, items: string[], explanation: string, actionHint: string|null }>} */
  const blockers = []
  for (const id of Object.keys(VALIDATE_ASSISTANT_BLOCKER_DEFS)) {
    const group = findValidateGroup(groups, id)
    if (group.count <= 0) continue
    const def = VALIDATE_ASSISTANT_BLOCKER_DEFS[id]
    blockers.push({
      id,
      title: def.title,
      explanation: def.explanation,
      actionHint: def.actionHint,
      count: group.count,
      items: group.items,
    })
  }

  /** @type {Array<{ id: string, title: string, count: number, items: string[], explanation: string }>} */
  const warnings = []
  for (const id of ['missing_supplier', 'unknown_category']) {
    const group = findValidateGroup(groups, id)
    if (group.count <= 0) continue
    const def = VALIDATE_ASSISTANT_WARNING_DEFS[id]
    warnings.push({
      id,
      title: def.title,
      explanation: def.explanation,
      count: group.count,
      items: group.items,
    })
  }
  for (const extra of buildValidateAssistantWarningExtras(preview)) {
    if (warnings.some((group) => group.id === extra.id)) continue
    warnings.push(extra)
  }

  const blockerCount = blockers.reduce((sum, group) => sum + group.count, 0)
  const warningIssueCount = warnings.reduce((sum, group) => sum + group.count, 0)

  /** @type {InventoryImportValidateAssistantState} */
  let state = 'ready'
  if (blockerCount > 0) state = 'blocked'
  else if (unresolvedCount > 0) state = 'decisions_required'
  else if (warningIssueCount > 0 || warningRowCount > 0) state = 'warnings_only'

  const progressReady = remaining === 0 ? resolved : 0

  /** @type {{ headline: string, supporting: string, status: string }} */
  let guidance
  if (state === 'blocked') {
    const attention = Math.max(blockerCount, remaining, totalRows - resolved)
    guidance = {
      headline: attention === 1
        ? '1 product needs attention before this import can continue.'
        : `${attention} products need attention before this import can continue.`,
      supporting: 'Resolve required units, storage locations, and any invalid product data first.',
      status: 'Blocked',
    }
  } else if (state === 'decisions_required') {
    guidance = {
      headline: unresolvedCount === 1
        ? '1 product may already exist in ONE.'
        : `${unresolvedCount} products may already exist in ONE.`,
      supporting: 'Choose whether to link each row to an existing product, create a new product, or skip it.',
      status: 'Decisions required',
    }
  } else if (state === 'warnings_only') {
    const warnCount = Math.max(warningIssueCount, warningRowCount)
    guidance = {
      headline: warnCount === 1
        ? 'The import is valid, but 1 warning should be reviewed.'
        : `The import is valid, but ${warnCount} warnings should be reviewed.`,
      supporting: 'You may continue after reviewing supplier or source-data warnings.',
      status: 'Ready with warnings',
    }
  } else {
    guidance = {
      headline: 'All products are ready for preview.',
      supporting: 'Review what ONE will create, link, and skip before applying the import.',
      status: 'Ready',
    }
  }

  return {
    state,
    guidance,
    progress: {
      resolved,
      remaining,
      ready: progressReady,
    },
    blockers,
    decisions: {
      count: unresolvedCount,
      total: totalPossibleMatches,
      hasDecisions: totalPossibleMatches > 0,
    },
    warnings,
  }
}

/**
 * Compact persistent Step Summary Header items for wizard steps 2–5.
 *
 * @param {{
 *   wizardView?: string,
 *   selectedFile?: { name?: string }|null,
 *   selectedWorksheetName?: string,
 *   parseResult?: object|null,
 *   columnMappingSummary?: {
 *     mapped?: Array<{ role?: string }>,
 *     missingRequired?: string[],
 *   }|null,
 *   operationalModel?: { summary?: { productCount?: number } }|null,
 *   validateImportGroups?: {
 *     summary?: { rows?: number, ready?: number, errors?: number },
 *     groups?: Array<{ id?: string, count?: number }>,
 *   }|null,
 *   readyEligibility?: {
 *     isReady?: boolean,
 *     counts?: { create?: number, link?: number, skip?: number },
 *   }|null,
 *   importSessionPolicy?: {
 *     quantityPolicy?: string,
 *     newProductLocationFallback?: string|null,
 *   }|null,
 * }} [input]
 * @returns {{
 *   stepId: string,
 *   items: Array<{ id: string, label: string, value: string, tone?: string }>,
 * }|null}
 */
export function buildInventoryImportStepSummary({
  wizardView = '',
  selectedFile = null,
  selectedWorksheetName = '',
  parseResult = null,
  columnMappingSummary = null,
  operationalModel = null,
  validateImportGroups = null,
  readyEligibility = null,
  importSessionPolicy = null,
} = {}) {
  const fileName = `${selectedFile?.name ?? ''}`.trim() || '—'
  const worksheet = `${selectedWorksheetName ?? ''}`.trim() || '—'
  const openingStock = importSessionPolicy?.quantityPolicy === 'opening_stock'
    ? 'Yes'
    : 'No'
  const destination = `${importSessionPolicy?.newProductLocationFallback ?? ''}`.trim() || '—'

  if (wizardView === 'columns') {
    const mappedRows = Array.isArray(columnMappingSummary?.mapped)
      ? columnMappingSummary.mapped
      : []
    const mappedCount = mappedRows.filter(
      (item) => item.role !== 'unmapped' && item.role !== 'blank' && item.role !== 'ignore',
    ).length
    const detected = Number.isFinite(parseResult?.summary?.sourceColumnCount)
      ? parseResult.summary.sourceColumnCount
      : mappedRows.length
    const missing = Array.isArray(columnMappingSummary?.missingRequired)
      && columnMappingSummary.missingRequired.length > 0
      ? columnMappingSummary.missingRequired.join(', ')
      : 'None'

    return {
      stepId: 'columns',
      items: [
        { id: 'file', label: 'File', value: fileName },
        { id: 'worksheet', label: 'Worksheet', value: worksheet },
        { id: 'detected', label: 'Detected', value: String(detected) },
        { id: 'mapped', label: 'Mapped', value: String(mappedCount) },
        {
          id: 'missing',
          label: 'Missing',
          value: missing,
          tone: missing === 'None' ? 'ok' : 'warn',
        },
      ],
    }
  }

  if (wizardView === 'data') {
    const products = Number.isFinite(operationalModel?.summary?.productCount)
      ? operationalModel.summary.productCount
      : (validateImportGroups?.summary?.rows ?? 0)
    const ready = Number(validateImportGroups?.summary?.ready) || 0
    const blocked = Number(
      validateImportGroups?.groups?.find((group) => group.id === 'blocked_rows')?.count,
    ) || 0
    const errors = Number(validateImportGroups?.summary?.errors) || 0
    const needAttention = Math.max(0, errors - blocked)

    return {
      stepId: 'data',
      items: [
        { id: 'file', label: 'File', value: fileName },
        { id: 'worksheet', label: 'Worksheet', value: worksheet },
        { id: 'products', label: 'Products', value: String(products) },
        { id: 'ready', label: 'Ready', value: String(ready), tone: 'ok' },
        {
          id: 'attention',
          label: 'Need Attention',
          value: String(needAttention),
          tone: needAttention > 0 ? 'warn' : 'ok',
        },
        {
          id: 'blocked',
          label: 'Blocked',
          value: String(blocked),
          tone: blocked > 0 ? 'danger' : 'ok',
        },
      ],
    }
  }

  if (wizardView === 'preview') {
    const create = Number(readyEligibility?.counts?.create) || 0
    const link = Number(readyEligibility?.counts?.link) || 0
    const skip = Number(readyEligibility?.counts?.skip) || 0

    return {
      stepId: 'preview',
      items: [
        { id: 'create', label: 'Create', value: String(create), tone: 'create' },
        { id: 'link', label: 'Link', value: String(link), tone: 'link' },
        { id: 'skip', label: 'Skip', value: String(skip) },
        { id: 'opening', label: 'Opening Stock', value: openingStock },
        { id: 'storage', label: 'Storage', value: destination },
      ],
    }
  }

  if (wizardView === 'ready' || wizardView === 'completed') {
    const create = Number(readyEligibility?.counts?.create) || 0
    const link = Number(readyEligibility?.counts?.link) || 0
    const skip = Number(readyEligibility?.counts?.skip) || 0
    const total = create + link + skip
    const readyStatus = readyEligibility?.isReady === true ? 'Ready' : 'Not ready'

    return {
      stepId: wizardView === 'completed' ? 'completed' : 'ready',
      items: [
        { id: 'total', label: 'Total', value: String(total) },
        { id: 'create', label: 'Create', value: String(create), tone: 'create' },
        { id: 'link', label: 'Link', value: String(link), tone: 'link' },
        { id: 'skip', label: 'Skip', value: String(skip) },
        { id: 'opening', label: 'Opening Stock', value: openingStock },
        { id: 'destination', label: 'Destination', value: destination },
        {
          id: 'status',
          label: 'Status',
          value: readyStatus,
          tone: readyEligibility?.isReady === true ? 'ok' : 'warn',
        },
      ],
    }
  }

  return null
}

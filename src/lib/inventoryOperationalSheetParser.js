/**
 * P8.16.5 — Operational weekly stock sheet parser foundation.
 *
 * Pure in-memory structural model for AMORE-style operational worksheets.
 * Does not mutate input, persist, map to ONE fields, validate business rules,
 * or touch network / UI / database.
 */

export const INVENTORY_OPERATIONAL_SHEET_PARSER_VERSION = 'operational_sheet_parser_v1'

const WEEKDAY_KEYS = Object.freeze([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

export class InventoryOperationalSheetParserError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryOperationalSheetParserError'
    this.code = code
  }
}

/**
 * @param {unknown} header
 * @returns {string}
 */
function normalizeHeader(header) {
  if (header === null || header === undefined) return ''
  if (typeof header === 'number' || typeof header === 'boolean') {
    return `${header}`.trim().toLowerCase().replace(/\s+/g, ' ')
  }
  if (typeof header !== 'string') return ''
  return header
    .trim()
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isBlankCell(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMeaningfulNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return false
  return Number.isFinite(Number(trimmed))
}

/**
 * @param {unknown} value
 * @returns {string|number|boolean|null}
 */
function normalizeCellValue(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'boolean') return value
  return null
}

/**
 * @param {unknown[]} headers
 */
function buildColumnMap(headers) {
  const map = {
    productNameIndex: 0,
    storageIndex: -1,
    barIndex: -1,
    orderIndex: -1,
    stockControlIndex: -1,
    weekdayIndexes: Object.create(null),
  }

  for (const key of WEEKDAY_KEYS) {
    map.weekdayIndexes[key] = -1
  }

  if (!Array.isArray(headers)) return map

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    if (!normalized) return

    if (
      normalized === 'storage'
      || normalized.startsWith('storage ')
      || normalized.includes(' storage')
    ) {
      if (map.storageIndex < 0) map.storageIndex = index
      return
    }

    if (normalized === 'bar' || normalized.startsWith('bar ')) {
      if (map.barIndex < 0) map.barIndex = index
      return
    }

    if (normalized === 'order' || normalized.startsWith('order ')) {
      if (map.orderIndex < 0) map.orderIndex = index
      return
    }

    if (
      normalized === 'stock control'
      || normalized === 'stockcontrol'
      || normalized.includes('stock control')
    ) {
      if (map.stockControlIndex < 0) map.stockControlIndex = index
      return
    }

    if (WEEKDAY_KEYS.includes(normalized) && map.weekdayIndexes[normalized] < 0) {
      map.weekdayIndexes[normalized] = index
    }
  })

  return map
}

/**
 * @param {unknown[]} row
 * @param {number} columnCount
 */
function isCategoryRow(row, columnCount) {
  if (!Array.isArray(row) || row.length === 0) return false
  if (isBlankCell(row[0])) return false
  if (typeof normalizeCellValue(row[0]) !== 'string') return false

  let blankTail = 0
  let inspectedTail = 0
  let numericCount = 0

  for (let index = 1; index < columnCount; index += 1) {
    const cell = index < row.length ? row[index] : null
    inspectedTail += 1
    if (isBlankCell(cell)) blankTail += 1
    if (isMeaningfulNumber(cell)) numericCount += 1
  }

  if (numericCount > 0) return false
  if (inspectedTail === 0) return true
  return blankTail / inspectedTail >= 0.7
}

/**
 * @param {unknown[]} row
 */
function isBlankRow(row) {
  if (!Array.isArray(row) || row.length === 0) return true
  return row.every((cell) => isBlankCell(cell))
}

/**
 * @param {unknown[]} row
 * @param {ReturnType<typeof buildColumnMap>} columnMap
 */
function parseProductRow(row, columnMap) {
  const name = normalizeCellValue(row[columnMap.productNameIndex])
  if (typeof name !== 'string' || !name) return null

  const weekdays = {}
  for (const key of WEEKDAY_KEYS) {
    const index = columnMap.weekdayIndexes[key]
    weekdays[key] = index >= 0 ? normalizeCellValue(row[index]) : null
  }

  return {
    name,
    storage: columnMap.storageIndex >= 0
      ? normalizeCellValue(row[columnMap.storageIndex])
      : null,
    bar: columnMap.barIndex >= 0
      ? normalizeCellValue(row[columnMap.barIndex])
      : null,
    weekdays,
    order: columnMap.orderIndex >= 0
      ? normalizeCellValue(row[columnMap.orderIndex])
      : null,
    stockControl: columnMap.stockControlIndex >= 0
      ? normalizeCellValue(row[columnMap.stockControlIndex])
      : null,
  }
}

/**
 * Parse an operational weekly stock worksheet into an in-memory category model.
 *
 * @param {{
 *   headers?: unknown[],
 *   rows?: unknown[][],
 *   headerRowNumber?: number,
 *   sourceFormat?: string,
 * }} tabularData
 */
export function parseInventoryOperationalSheet(tabularData) {
  if (tabularData === null || typeof tabularData !== 'object' || Array.isArray(tabularData)) {
    throw new InventoryOperationalSheetParserError(
      'INVALID_INPUT',
      'Operational sheet parser expects an object with headers and rows.',
    )
  }

  const headers = Array.isArray(tabularData.headers) ? tabularData.headers : []
  const rows = Array.isArray(tabularData.rows) ? tabularData.rows : []
  const columnCount = Math.max(headers.length, 1)
  const columnMap = buildColumnMap(headers)

  /** @type {Array<{ name: string|null, products: object[] }>} */
  const categories = []
  /** @type {{ name: string|null, products: object[] }|null} */
  let currentCategory = null

  function ensureUncategorized() {
    if (currentCategory) return
    currentCategory = { name: null, products: [] }
    categories.push(currentCategory)
  }

  for (const row of rows) {
    if (!Array.isArray(row) || isBlankRow(row)) continue

    if (isCategoryRow(row, columnCount)) {
      const categoryName = normalizeCellValue(row[0])
      currentCategory = {
        name: typeof categoryName === 'string' ? categoryName : null,
        products: [],
      }
      categories.push(currentCategory)
      continue
    }

    const product = parseProductRow(row, columnMap)
    if (!product) continue

    ensureUncategorized()
    currentCategory.products.push(product)
  }

  return Object.freeze({
    parserVersion: INVENTORY_OPERATIONAL_SHEET_PARSER_VERSION,
    categories: Object.freeze(categories.map((category) => Object.freeze({
      name: category.name,
      products: Object.freeze(category.products.map((product) => Object.freeze({
        name: product.name,
        storage: product.storage,
        bar: product.bar,
        weekdays: Object.freeze({ ...product.weekdays }),
        order: product.order,
        stockControl: product.stockControl,
      }))),
    }))),
    summary: Object.freeze({
      categoryCount: categories.length,
      productCount: categories.reduce((total, category) => total + category.products.length, 0),
    }),
  })
}

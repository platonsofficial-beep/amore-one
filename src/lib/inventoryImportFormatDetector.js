/**
 * P8.16.4 — Inventory Import workbook format detection foundation.
 *
 * Pure, deterministic layout classification of already-decoded tabular data.
 * Does not mutate input, map fields, validate business rules, parse structure,
 * or touch persistence / network / UI.
 */

export const INVENTORY_IMPORT_FORMAT_DETECTOR_VERSION = 'import_format_detector_v1'

export const INVENTORY_IMPORT_FORMAT = Object.freeze({
  STANDARD: 'standard_inventory_table',
  OPERATIONAL: 'operational_weekly_stock_sheet',
  UNKNOWN: 'unknown_layout',
})

export const INVENTORY_IMPORT_FORMAT_LABEL = Object.freeze({
  [INVENTORY_IMPORT_FORMAT.STANDARD]: 'Standard Inventory Table',
  [INVENTORY_IMPORT_FORMAT.OPERATIONAL]: 'Operational Weekly Stock Sheet',
  [INVENTORY_IMPORT_FORMAT.UNKNOWN]: 'Unknown Worksheet Layout',
})

/** Bounded row sample for category-separator scanning. */
export const INVENTORY_IMPORT_FORMAT_MAX_ROW_SAMPLE = 80

const WEEKDAY_HEADERS = Object.freeze([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

const PRODUCT_NAME_PATTERNS = Object.freeze([
  'name',
  'product',
  'product name',
  'item',
  'item name',
  'description',
])

const INVENTORY_DETAIL_PATTERNS = Object.freeze([
  'sku',
  'barcode',
  'unit',
  'quantity',
  'qty',
  'stock',
  'current stock',
  'category',
  'supplier',
  'cost',
  'price',
  'location',
])

export class InventoryImportFormatDetectorError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryImportFormatDetectorError'
    this.code = code
  }
}

/**
 * Detector-only header normalization. Does not mutate source values.
 *
 * @param {unknown} header
 * @returns {string}
 */
export function normalizeInventoryImportFormatHeader(header) {
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
 * @returns {boolean}
 */
function looksLikeCategoryLabel(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length < 2 || trimmed.length > 48) return false
  if (isMeaningfulNumber(trimmed)) return false
  // Prefer short label-like tokens; uppercase-heavy text is a strong hint but not required.
  const letters = trimmed.replace(/[^A-Za-z]/g, '')
  if (letters.length < 2) return false
  const upper = letters.replace(/[^A-Z]/g, '').length
  return upper / letters.length >= 0.6 || /^[A-Za-z][A-Za-z0-9 &/-]*$/.test(trimmed)
}

/**
 * @param {unknown[]} headers
 * @returns {string[]}
 */
function normalizeHeaderList(headers) {
  if (!Array.isArray(headers)) return []
  return headers.map((header) => normalizeInventoryImportFormatHeader(header))
}

/**
 * @param {string} normalized
 * @returns {boolean}
 */
function isStorageHeader(normalized) {
  return (
    normalized === 'storage'
    || normalized.startsWith('storage ')
    || normalized.includes(' storage')
  )
}

/**
 * @param {string} normalized
 * @returns {boolean}
 */
function isBarHeader(normalized) {
  return normalized === 'bar' || normalized.startsWith('bar ')
}

/**
 * @param {string} normalized
 * @returns {boolean}
 */
function isOrderHeader(normalized) {
  return normalized === 'order' || normalized.startsWith('order ')
}

/**
 * @param {string} normalized
 * @returns {boolean}
 */
function isStockControlHeader(normalized) {
  return (
    normalized === 'stock control'
    || normalized === 'stockcontrol'
    || normalized.includes('stock control')
  )
}

/**
 * @param {string} normalized
 * @returns {boolean}
 */
function isProductNameHeader(normalized) {
  return PRODUCT_NAME_PATTERNS.includes(normalized)
}

/**
 * @param {string} normalized
 * @returns {boolean}
 */
function isInventoryDetailHeader(normalized) {
  if (isStockControlHeader(normalized)) return false
  return INVENTORY_DETAIL_PATTERNS.includes(normalized)
}

/**
 * @param {unknown[][]} rows
 * @param {number} columnCount
 */
function scanCategorySeparatorRows(rows, columnCount) {
  if (!Array.isArray(rows) || rows.length === 0 || columnCount < 2) {
    return {
      categorySeparatorCount: 0,
      sampledRowCount: 0,
    }
  }

  const sample = rows.slice(0, INVENTORY_IMPORT_FORMAT_MAX_ROW_SAMPLE)
  let categorySeparatorCount = 0

  for (const row of sample) {
    if (!Array.isArray(row) || row.length === 0) continue
    const first = row[0]
    if (isBlankCell(first) || !looksLikeCategoryLabel(first)) continue

    let blankTail = 0
    let inspectedTail = 0
    let numericCount = 0

    for (let index = 1; index < Math.max(columnCount, row.length); index += 1) {
      const cell = index < row.length ? row[index] : null
      inspectedTail += 1
      if (isBlankCell(cell)) blankTail += 1
      if (isMeaningfulNumber(cell)) numericCount += 1
    }

    if (inspectedTail === 0) continue
    if (numericCount > 0) continue
    if (blankTail / inspectedTail < 0.7) continue
    categorySeparatorCount += 1
  }

  return {
    categorySeparatorCount,
    sampledRowCount: sample.length,
  }
}

/**
 * @param {string[]} normalizedHeaders
 */
function collectHeaderSignals(normalizedHeaders) {
  const weekdayHeaders = []
  const weekdaySet = new Set()
  const operationalHeaders = []
  const productNameHeaders = []
  const inventoryDetailHeaders = []

  let hasStorage = false
  let hasBar = false
  let hasOrder = false
  let hasStockControl = false

  for (const normalized of normalizedHeaders) {
    if (!normalized) continue

    if (WEEKDAY_HEADERS.includes(normalized) && !weekdaySet.has(normalized)) {
      weekdaySet.add(normalized)
      weekdayHeaders.push(normalized)
    }

    if (isStorageHeader(normalized)) {
      hasStorage = true
      operationalHeaders.push(normalized)
    } else if (isBarHeader(normalized)) {
      hasBar = true
      operationalHeaders.push(normalized)
    } else if (isOrderHeader(normalized)) {
      hasOrder = true
      operationalHeaders.push(normalized)
    } else if (isStockControlHeader(normalized)) {
      hasStockControl = true
      operationalHeaders.push(normalized)
    }

    if (isProductNameHeader(normalized)) {
      productNameHeaders.push(normalized)
    }
    if (isInventoryDetailHeader(normalized)) {
      inventoryDetailHeaders.push(normalized)
    }
  }

  return {
    weekdayHeaders,
    weekdayCount: weekdayHeaders.length,
    operationalHeaders,
    operationalHeaderCount: operationalHeaders.length,
    hasStorage,
    hasBar,
    hasOrder,
    hasStockControl,
    productNameHeaders,
    productNameCount: productNameHeaders.length,
    inventoryDetailHeaders,
    inventoryDetailCount: inventoryDetailHeaders.length,
  }
}

/**
 * @param {object} signals
 * @returns {string[]}
 */
function buildOperationalEvidence(signals) {
  const evidence = []
  if (signals.weekdayCount > 0) {
    evidence.push(`${signals.weekdayCount} weekday columns detected`)
  }
  if (signals.hasStorage) evidence.push('Storage-related column detected')
  if (signals.hasBar) evidence.push('Bar column detected')
  if (signals.hasOrder) evidence.push('Order column detected')
  if (signals.hasStockControl) evidence.push('Stock Control column detected')
  if (signals.categorySeparatorCount > 0) {
    evidence.push('Category-separator row pattern detected')
  }
  return evidence
}

/**
 * @param {object} signals
 * @returns {string[]}
 */
function buildStandardEvidence(signals) {
  const evidence = []
  if (signals.productNameCount > 0) {
    evidence.push('Product-name column pattern detected')
  }
  if (signals.inventoryDetailCount > 0) {
    const hasQtyOrStock = signals.inventoryDetailHeaders.some((header) => (
      header === 'quantity'
      || header === 'qty'
      || header === 'stock'
      || header === 'current stock'
    ))
    if (hasQtyOrStock) {
      evidence.push('Quantity or stock column pattern detected')
    }
    evidence.push('Unit, SKU, barcode, category, or supplier columns detected')
  }
  return evidence
}

/**
 * Detect the probable inventory import layout family.
 *
 * Classification thresholds:
 * - operational_weekly_stock_sheet:
 *   weekdayCount >= 4 AND (operationalHeaderCount >= 1 OR categorySeparatorCount >= 2)
 * - standard_inventory_table:
 *   productNameCount >= 1 AND inventoryDetailCount >= 1
 *   (and operational threshold not met)
 * - unknown_layout: otherwise
 *
 * @param {{
 *   headers?: unknown[],
 *   rows?: unknown[][],
 *   headerRowNumber?: number,
 *   sourceFormat?: string,
 * }} tabularData
 */
export function detectInventoryImportFormat(tabularData) {
  if (tabularData === null || typeof tabularData !== 'object' || Array.isArray(tabularData)) {
    throw new InventoryImportFormatDetectorError(
      'INVALID_INPUT',
      'Format detector expects an object with headers and rows.',
    )
  }

  const headers = Array.isArray(tabularData.headers) ? tabularData.headers : []
  const rows = Array.isArray(tabularData.rows) ? tabularData.rows : []
  const headerRowNumber = Number.isInteger(tabularData.headerRowNumber)
    ? tabularData.headerRowNumber
    : 1
  const sourceFormat = typeof tabularData.sourceFormat === 'string'
    ? tabularData.sourceFormat
    : ''

  const normalizedHeaders = normalizeHeaderList(headers)
  const headerSignals = collectHeaderSignals(normalizedHeaders)
  const categoryScan = scanCategorySeparatorRows(rows, headers.length)

  const signals = Object.freeze({
    detectorVersion: INVENTORY_IMPORT_FORMAT_DETECTOR_VERSION,
    sourceFormat,
    headerRowNumber,
    headerCount: headers.length,
    rowCount: rows.length,
    weekdayCount: headerSignals.weekdayCount,
    weekdayHeaders: Object.freeze(headerSignals.weekdayHeaders.slice()),
    operationalHeaderCount: headerSignals.operationalHeaderCount,
    hasStorage: headerSignals.hasStorage,
    hasBar: headerSignals.hasBar,
    hasOrder: headerSignals.hasOrder,
    hasStockControl: headerSignals.hasStockControl,
    categorySeparatorCount: categoryScan.categorySeparatorCount,
    sampledRowCount: categoryScan.sampledRowCount,
    maxRowSample: INVENTORY_IMPORT_FORMAT_MAX_ROW_SAMPLE,
    productNameCount: headerSignals.productNameCount,
    inventoryDetailCount: headerSignals.inventoryDetailCount,
    productNameHeaders: Object.freeze(headerSignals.productNameHeaders.slice()),
    inventoryDetailHeaders: Object.freeze(headerSignals.inventoryDetailHeaders.slice()),
  })

  const isOperational = (
    signals.weekdayCount >= 4
    && (
      signals.operationalHeaderCount >= 1
      || signals.categorySeparatorCount >= 2
    )
  )

  const isStandard = (
    !isOperational
    && signals.productNameCount >= 1
    && signals.inventoryDetailCount >= 1
  )

  let format = INVENTORY_IMPORT_FORMAT.UNKNOWN
  let score = 0
  let matchStrength = 'none'
  /** @type {string[]} */
  let evidence = []
  let summary = 'ONE could not confidently identify this worksheet structure yet.'

  if (isOperational) {
    format = INVENTORY_IMPORT_FORMAT.OPERATIONAL
    evidence = buildOperationalEvidence(signals)
    score = (
      signals.weekdayCount * 10
      + signals.operationalHeaderCount * 12
      + Math.min(signals.categorySeparatorCount, 6) * 8
    )
    matchStrength = score >= 70 ? 'strong' : 'possible'
    summary = matchStrength === 'strong'
      ? 'This worksheet looks like an operational weekly stock sheet.'
      : 'This worksheet may be an operational weekly stock sheet.'
  } else if (isStandard) {
    format = INVENTORY_IMPORT_FORMAT.STANDARD
    evidence = buildStandardEvidence(signals)
    score = signals.productNameCount * 20 + signals.inventoryDetailCount * 15
    matchStrength = score >= 35 ? 'strong' : 'possible'
    summary = matchStrength === 'strong'
      ? 'This worksheet looks like a standard flat inventory table.'
      : 'This worksheet may be a standard flat inventory table.'
  } else {
    // Keep evidence empty for unknown — do not invent signals.
    evidence = []
    score = 0
    matchStrength = 'none'
  }

  return Object.freeze({
    format,
    label: INVENTORY_IMPORT_FORMAT_LABEL[format],
    summary,
    evidence: Object.freeze(evidence.slice()),
    signals,
    score,
    matchStrength,
  })
}

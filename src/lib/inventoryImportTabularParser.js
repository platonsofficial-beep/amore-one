/**
 * P8.15.3 — Inventory Import tabular parser foundation.
 *
 * Pure, deterministic structural parse of already-decoded tabular data.
 * Does not decode CSV/XLSX, map contract fields, validate business rules,
 * or touch persistence / UI.
 *
 * Contract: docs/stock_inventory_import_v1_contract.md (import_v1.0)
 * Parser version: import_tabular_parser_v1
 */

export const INVENTORY_IMPORT_TABULAR_PARSER_VERSION = 'import_tabular_parser_v1'

export class InventoryImportParserError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'InventoryImportParserError'
    this.code = code
  }
}

/**
 * Normalize a source header for future mapping comparison.
 * Preserves original separately; this value is comparison-only.
 */
export function normalizeInventoryImportHeader(header) {
  if (header === null || header === undefined) return ''
  if (typeof header === 'string') {
    return header.trim().toLowerCase().replace(/\s+/g, ' ')
  }
  if (typeof header === 'number' || typeof header === 'boolean') {
    return `${header}`.trim().toLowerCase().replace(/\s+/g, ' ')
  }
  return ''
}

function isPlainEmptyNormalizedHeader(normalized) {
  return normalized === ''
}

function assertPositiveInteger(value, code, message) {
  if (!Number.isInteger(value) || value < 1) {
    throw new InventoryImportParserError(code, message)
  }
}

function describeUnsupportedType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  if (typeof value === 'object') return 'object'
  return typeof value
}

/**
 * Conservatively normalize one cell for structural staging.
 * Does not guess booleans from text or locale-format numbers.
 *
 * @returns {{ kind: 'empty'|'string'|'number'|'boolean'|'unsupported', value: *, raw: *, unsupportedType?: string }}
 */
export function normalizeInventoryImportCell(raw) {
  if (raw === null || raw === undefined) {
    return { kind: 'empty', value: null, raw }
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') {
      return { kind: 'empty', value: null, raw }
    }
    return { kind: 'string', value: trimmed, raw }
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return {
        kind: 'unsupported',
        value: null,
        raw,
        unsupportedType: Number.isNaN(raw) ? 'nan' : 'non_finite_number',
      }
    }
    return { kind: 'number', value: raw, raw }
  }

  if (typeof raw === 'boolean') {
    return { kind: 'boolean', value: raw, raw }
  }

  return {
    kind: 'unsupported',
    value: null,
    raw,
    unsupportedType: describeUnsupportedType(raw),
  }
}

function isCellBlank(normalizedCell) {
  return normalizedCell.kind === 'empty'
}

function buildHeaderRecords(headers) {
  const normalizedList = headers.map((header) => normalizeInventoryImportHeader(header))
  const occurrenceCounts = new Map()

  for (const normalized of normalizedList) {
    if (isPlainEmptyNormalizedHeader(normalized)) continue
    occurrenceCounts.set(normalized, (occurrenceCounts.get(normalized) ?? 0) + 1)
  }

  const records = headers.map((sourceHeader, columnIndex) => {
    const normalized = normalizedList[columnIndex]
    const isBlank = isPlainEmptyNormalizedHeader(normalized)
    const isDuplicate = !isBlank && (occurrenceCounts.get(normalized) ?? 0) > 1

    return {
      columnIndex,
      sourceHeader,
      normalized,
      isBlank,
      isDuplicate,
    }
  })

  const blankHeaderCount = records.filter((record) => record.isBlank).length
  const duplicateNormalizedHeaderCount = records.filter((record) => record.isDuplicate).length

  const headerIssues = []
  for (const record of records) {
    if (record.isBlank) {
      headerIssues.push({
        code: 'BLANK_HEADER',
        columnIndex: record.columnIndex,
        sourceHeader: record.sourceHeader,
        message: `Blank header at column index ${record.columnIndex}.`,
      })
    }
    if (record.isDuplicate) {
      headerIssues.push({
        code: 'DUPLICATE_NORMALIZED_HEADER',
        columnIndex: record.columnIndex,
        sourceHeader: record.sourceHeader,
        normalized: record.normalized,
        message: `Duplicate normalized header "${record.normalized}" at column index ${record.columnIndex}.`,
      })
    }
  }

  return { records, blankHeaderCount, duplicateNormalizedHeaderCount, headerIssues }
}

function parseDataRow(row, rowIndex, headerRecords, headerRowNumber) {
  const sourceRowNumber = headerRowNumber + rowIndex + 1
  const columnCount = headerRecords.length
  const structuralIssues = []
  const cells = []
  const overflowCells = []
  const missingColumnIndexes = []

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const header = headerRecords[columnIndex]
    const hasCell = columnIndex < row.length
    const raw = hasCell ? row[columnIndex] : undefined
    const normalized = hasCell
      ? normalizeInventoryImportCell(raw)
      : { kind: 'empty', value: null, raw: undefined }

    if (!hasCell) {
      missingColumnIndexes.push(columnIndex)
      structuralIssues.push({
        code: 'MISSING_CELL',
        columnIndex,
        sourceHeader: header.sourceHeader,
        message: `Row ${sourceRowNumber} is missing a cell for column index ${columnIndex}.`,
      })
    } else if (normalized.kind === 'unsupported') {
      structuralIssues.push({
        code: 'UNSUPPORTED_CELL_VALUE',
        columnIndex,
        sourceHeader: header.sourceHeader,
        unsupportedType: normalized.unsupportedType,
        message: `Row ${sourceRowNumber} column ${columnIndex} has unsupported cell type "${normalized.unsupportedType}".`,
      })
    }

    cells.push({
      columnIndex,
      sourceHeader: header.sourceHeader,
      normalizedHeader: header.normalized,
      raw: hasCell ? raw : undefined,
      normalized,
      isMissing: !hasCell,
    })
  }

  for (let overflowIndex = columnCount; overflowIndex < row.length; overflowIndex += 1) {
    const raw = row[overflowIndex]
    const normalized = normalizeInventoryImportCell(raw)
    overflowCells.push({
      columnIndex: overflowIndex,
      sourceHeader: null,
      normalizedHeader: null,
      raw,
      normalized,
      isOverflow: true,
    })
    structuralIssues.push({
      code: 'OVERFLOW_CELL',
      columnIndex: overflowIndex,
      message: `Row ${sourceRowNumber} has overflow cell at column index ${overflowIndex}.`,
    })
    if (normalized.kind === 'unsupported') {
      structuralIssues.push({
        code: 'UNSUPPORTED_CELL_VALUE',
        columnIndex: overflowIndex,
        unsupportedType: normalized.unsupportedType,
        message: `Row ${sourceRowNumber} overflow column ${overflowIndex} has unsupported cell type "${normalized.unsupportedType}".`,
      })
    }
  }

  const alignedBlank = cells.every((cell) => isCellBlank(cell.normalized))
  const overflowBlank = overflowCells.every((cell) => isCellBlank(cell.normalized))
  const isBlank = alignedBlank && overflowBlank

  return {
    sourceRowNumber,
    cells,
    overflowCells,
    missingColumnIndexes,
    isBlank,
    structuralIssues,
  }
}

/**
 * Parse already-decoded tabular import data.
 *
 * Input boundary:
 * - `headers`: ordered array of source header cells (sheet header row)
 * - `rows`: ordered array of data-row arrays (excludes the header row)
 * - `headerRowNumber`: 1-based sheet row number of the header (default 1)
 *
 * Source row numbering:
 * - First data row → `headerRowNumber + 1` (default 2), matching Import V1
 *   `sourceRowNumber` examples where the header occupies sheet row 1.
 *
 * Does not map headers to Inventory Import contract fields.
 * Does not mutate caller-provided arrays or nested row arrays.
 *
 * @param {{ headers: unknown[], rows?: unknown[][], headerRowNumber?: number }} input
 */
export function parseInventoryImportTable(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InventoryImportParserError(
      'INVALID_INPUT',
      'Inventory import parser expects an object with headers and rows arrays.',
    )
  }

  const { headers, rows = [], headerRowNumber = 1 } = input

  if (!Array.isArray(headers)) {
    throw new InventoryImportParserError(
      'INVALID_INPUT',
      'Inventory import parser requires headers to be an array.',
    )
  }

  if (headers.length === 0) {
    throw new InventoryImportParserError(
      'MISSING_HEADERS',
      'Inventory import parser requires at least one header cell.',
    )
  }

  if (!Array.isArray(rows)) {
    throw new InventoryImportParserError(
      'INVALID_INPUT',
      'Inventory import parser requires rows to be an array.',
    )
  }

  assertPositiveInteger(
    headerRowNumber,
    'INVALID_HEADER_ROW_NUMBER',
    'headerRowNumber must be a positive integer.',
  )

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (!Array.isArray(rows[rowIndex])) {
      throw new InventoryImportParserError(
        'INVALID_ROW',
        `Inventory import parser requires row at index ${rowIndex} to be an array.`,
      )
    }
  }

  const headerSnapshot = headers.slice()
  const {
    records: headerRecords,
    blankHeaderCount,
    duplicateNormalizedHeaderCount,
    headerIssues,
  } = buildHeaderRecords(headerSnapshot)

  const parsedRows = rows.map((row, rowIndex) => (
    parseDataRow(row.slice(), rowIndex, headerRecords, headerRowNumber)
  ))

  let blankRowCount = 0
  let structurallyValidRowCount = 0
  let structurallyProblematicRowCount = 0

  for (const row of parsedRows) {
    if (row.isBlank) blankRowCount += 1
    if (row.structuralIssues.length === 0) {
      structurallyValidRowCount += 1
    } else {
      structurallyProblematicRowCount += 1
    }
  }

  return {
    parserVersion: INVENTORY_IMPORT_TABULAR_PARSER_VERSION,
    headerRowNumber,
    headers: headerRecords,
    headerIssues,
    rows: parsedRows,
    summary: {
      sourceColumnCount: headerRecords.length,
      sourceRowCount: parsedRows.length,
      blankRowCount,
      structurallyValidRowCount,
      structurallyProblematicRowCount,
      blankHeaderCount,
      duplicateNormalizedHeaderCount,
    },
  }
}

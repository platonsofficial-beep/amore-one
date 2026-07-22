/**
 * P8.15.4 — Inventory Import structural validation foundation.
 *
 * Pure, deterministic validation of locked P8.15.3 parser output.
 * Does not map fields, look up stock, persist, or wire UI.
 *
 * Contract: docs/stock_inventory_import_v1_contract.md (import_v1.0)
 * Validation version: import_validation_structural_v1
 */

import { INVENTORY_IMPORT_TABULAR_PARSER_VERSION } from './inventoryImportTabularParser'

export const INVENTORY_IMPORT_VALIDATION_VERSION = 'import_validation_structural_v1'

/** V1 contract hard limits (structural; no mapping required). */
export const INVENTORY_IMPORT_MAX_DATA_ROWS = 5000
export const INVENTORY_IMPORT_MAX_SOURCE_COLUMNS = 100

export class InventoryImportValidationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'InventoryImportValidationError'
    this.code = code
  }
}

const DATASET_CODE_ORDER = [
  'EXCESSIVE_COLUMNS',
  'EXCESSIVE_ROWS',
  'NO_DATA_ROWS',
  'ALL_ROWS_BLANK',
]

const SCOPE_ORDER = {
  dataset: 0,
  header: 1,
  row: 2,
  cell: 3,
}

const SEVERITY_ORDER = {
  error: 0,
  warning: 1,
  info: 2,
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isJsonSafeScalar(value) {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  )
}

function jsonSafeHeaderEvidence(sourceHeader) {
  if (sourceHeader === undefined) return null
  if (isJsonSafeScalar(sourceHeader)) return sourceHeader
  return null
}

function compareIssues(a, b) {
  const scopeDelta = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]
  if (scopeDelta !== 0) return scopeDelta

  if (a.scope === 'dataset') {
    return DATASET_CODE_ORDER.indexOf(a.code) - DATASET_CODE_ORDER.indexOf(b.code)
  }

  if (a.scope === 'header') {
    const colDelta = (a.columnIndex ?? -1) - (b.columnIndex ?? -1)
    if (colDelta !== 0) return colDelta
    return a.code.localeCompare(b.code)
  }

  const rowDelta = (a.sourceRowNumber ?? -1) - (b.sourceRowNumber ?? -1)
  if (rowDelta !== 0) return rowDelta

  const colDelta = (a.columnIndex ?? -1) - (b.columnIndex ?? -1)
  if (colDelta !== 0) return colDelta

  const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  if (severityDelta !== 0) return severityDelta

  return a.code.localeCompare(b.code)
}

function assertParserResultShape(parsedTable) {
  if (parsedTable === null || typeof parsedTable !== 'object' || Array.isArray(parsedTable)) {
    throw new InventoryImportValidationError(
      'INVALID_PARSER_RESULT',
      'Inventory import validator expects parseInventoryImportTable output.',
    )
  }

  if (!Object.prototype.hasOwnProperty.call(parsedTable, 'parserVersion')) {
    throw new InventoryImportValidationError(
      'MISSING_PARSER_VERSION',
      'Inventory import validator requires parserVersion on parser output.',
    )
  }

  if (parsedTable.parserVersion !== INVENTORY_IMPORT_TABULAR_PARSER_VERSION) {
    throw new InventoryImportValidationError(
      'UNSUPPORTED_PARSER_VERSION',
      `Inventory import validator supports parserVersion "${INVENTORY_IMPORT_TABULAR_PARSER_VERSION}" only.`,
    )
  }

  if (!Array.isArray(parsedTable.headers)) {
    throw new InventoryImportValidationError(
      'INVALID_PARSER_RESULT',
      'Inventory import validator requires headers to be an array.',
    )
  }

  if (!Array.isArray(parsedTable.rows)) {
    throw new InventoryImportValidationError(
      'INVALID_PARSER_RESULT',
      'Inventory import validator requires rows to be an array.',
    )
  }

  if (!isPlainObject(parsedTable.summary)) {
    throw new InventoryImportValidationError(
      'INVALID_PARSER_RESULT',
      'Inventory import validator requires a summary object.',
    )
  }

  const requiredSummaryKeys = [
    'sourceColumnCount',
    'sourceRowCount',
    'blankRowCount',
    'structurallyValidRowCount',
    'structurallyProblematicRowCount',
    'blankHeaderCount',
    'duplicateNormalizedHeaderCount',
  ]

  for (const key of requiredSummaryKeys) {
    if (!Object.prototype.hasOwnProperty.call(parsedTable.summary, key)) {
      throw new InventoryImportValidationError(
        'INVALID_PARSER_RESULT',
        `Inventory import validator requires summary.${key}.`,
      )
    }
  }

  if (!Number.isInteger(parsedTable.headerRowNumber) || parsedTable.headerRowNumber < 1) {
    throw new InventoryImportValidationError(
      'INVALID_PARSER_RESULT',
      'Inventory import validator requires a positive integer headerRowNumber.',
    )
  }

  for (let headerIndex = 0; headerIndex < parsedTable.headers.length; headerIndex += 1) {
    const header = parsedTable.headers[headerIndex]
    if (!isPlainObject(header) || !Number.isInteger(header.columnIndex)) {
      throw new InventoryImportValidationError(
        'INVALID_PARSER_RESULT',
        `Inventory import validator requires header metadata at index ${headerIndex}.`,
      )
    }
  }

  for (let rowIndex = 0; rowIndex < parsedTable.rows.length; rowIndex += 1) {
    const row = parsedTable.rows[rowIndex]
    if (
      !isPlainObject(row)
      || !Number.isInteger(row.sourceRowNumber)
      || !Array.isArray(row.cells)
      || !Array.isArray(row.overflowCells)
      || !Array.isArray(row.structuralIssues)
      || typeof row.isBlank !== 'boolean'
    ) {
      throw new InventoryImportValidationError(
        'INVALID_PARSER_RESULT',
        `Inventory import validator requires row metadata at index ${rowIndex}.`,
      )
    }
  }
}

function makeIssue({
  code,
  severity,
  scope,
  message,
  sourceRowNumber = null,
  rowIndex = null,
  columnIndex = null,
  sourceHeader = null,
  normalizedHeader = null,
  unsupportedType = null,
  cellKind = null,
}) {
  return {
    code,
    severity,
    scope,
    message,
    sourceRowNumber,
    rowIndex,
    columnIndex,
    sourceHeader: jsonSafeHeaderEvidence(sourceHeader),
    normalizedHeader: typeof normalizedHeader === 'string' ? normalizedHeader : null,
    unsupportedType,
    cellKind,
  }
}

function collectDatasetIssues(parsedTable) {
  const issues = []
  const { summary } = parsedTable

  if (summary.sourceColumnCount > INVENTORY_IMPORT_MAX_SOURCE_COLUMNS) {
    issues.push(makeIssue({
      code: 'EXCESSIVE_COLUMNS',
      severity: 'error',
      scope: 'dataset',
      message: `Source column count ${summary.sourceColumnCount} exceeds the V1 maximum of ${INVENTORY_IMPORT_MAX_SOURCE_COLUMNS}.`,
    }))
  }

  if (summary.sourceRowCount > INVENTORY_IMPORT_MAX_DATA_ROWS) {
    issues.push(makeIssue({
      code: 'EXCESSIVE_ROWS',
      severity: 'error',
      scope: 'dataset',
      message: `Source data row count ${summary.sourceRowCount} exceeds the V1 maximum of ${INVENTORY_IMPORT_MAX_DATA_ROWS}.`,
    }))
  }

  if (summary.sourceRowCount === 0) {
    issues.push(makeIssue({
      code: 'NO_DATA_ROWS',
      severity: 'info',
      scope: 'dataset',
      message: 'Parsed table has headers but no data rows.',
    }))
  } else if (
    summary.blankRowCount === summary.sourceRowCount
    && summary.sourceRowCount > 0
  ) {
    issues.push(makeIssue({
      code: 'ALL_ROWS_BLANK',
      severity: 'warning',
      scope: 'dataset',
      message: 'Every source data row is blank.',
    }))
  }

  return issues
}

function collectHeaderIssues(parsedTable) {
  const issues = []

  for (const header of parsedTable.headers) {
    if (header.isBlank) {
      issues.push(makeIssue({
        code: 'BLANK_HEADER',
        severity: 'error',
        scope: 'header',
        message: `Blank header at column index ${header.columnIndex}.`,
        columnIndex: header.columnIndex,
        sourceHeader: header.sourceHeader,
        normalizedHeader: header.normalized,
      }))
    }

    if (header.isDuplicate) {
      issues.push(makeIssue({
        code: 'DUPLICATE_NORMALIZED_HEADER',
        severity: 'error',
        scope: 'header',
        message: `Duplicate normalized header "${header.normalized}" at column index ${header.columnIndex}.`,
        columnIndex: header.columnIndex,
        sourceHeader: header.sourceHeader,
        normalizedHeader: header.normalized,
      }))
    }
  }

  return issues
}

function collectRowAndCellIssues(parsedTable) {
  const rowIssues = []
  const cellIssues = []

  for (let rowIndex = 0; rowIndex < parsedTable.rows.length; rowIndex += 1) {
    const row = parsedTable.rows[rowIndex]

    if (row.isBlank) {
      rowIssues.push(makeIssue({
        code: 'BLANK_ROW',
        severity: 'warning',
        scope: 'row',
        message: `Source row ${row.sourceRowNumber} is completely blank.`,
        sourceRowNumber: row.sourceRowNumber,
        rowIndex,
      }))
    }

    for (const structuralIssue of row.structuralIssues) {
      if (structuralIssue.code === 'MISSING_CELL') {
        rowIssues.push(makeIssue({
          code: 'MISSING_CELL',
          severity: 'warning',
          scope: 'row',
          message: structuralIssue.message
            ?? `Row ${row.sourceRowNumber} is missing a cell for column index ${structuralIssue.columnIndex}.`,
          sourceRowNumber: row.sourceRowNumber,
          rowIndex,
          columnIndex: structuralIssue.columnIndex,
          sourceHeader: structuralIssue.sourceHeader,
        }))
        continue
      }

      if (structuralIssue.code === 'OVERFLOW_CELL') {
        rowIssues.push(makeIssue({
          code: 'OVERFLOW_CELL',
          severity: 'warning',
          scope: 'row',
          message: structuralIssue.message
            ?? `Row ${row.sourceRowNumber} has overflow cell at column index ${structuralIssue.columnIndex}.`,
          sourceRowNumber: row.sourceRowNumber,
          rowIndex,
          columnIndex: structuralIssue.columnIndex,
        }))
        continue
      }

      if (structuralIssue.code === 'UNSUPPORTED_CELL_VALUE') {
        const alignedCell = row.cells.find(
          (cell) => cell.columnIndex === structuralIssue.columnIndex,
        )
        const overflowCell = row.overflowCells.find(
          (cell) => cell.columnIndex === structuralIssue.columnIndex,
        )
        const cell = alignedCell ?? overflowCell
        const unsupportedType = structuralIssue.unsupportedType
          ?? cell?.normalized?.unsupportedType
          ?? null

        cellIssues.push(makeIssue({
          code: 'UNSUPPORTED_CELL_VALUE',
          severity: 'error',
          scope: 'cell',
          message: structuralIssue.message
            ?? `Row ${row.sourceRowNumber} column ${structuralIssue.columnIndex} has an unsupported cell value.`,
          sourceRowNumber: row.sourceRowNumber,
          rowIndex,
          columnIndex: structuralIssue.columnIndex,
          sourceHeader: structuralIssue.sourceHeader ?? cell?.sourceHeader ?? null,
          normalizedHeader: cell?.normalizedHeader ?? null,
          unsupportedType,
          cellKind: cell?.normalized?.kind ?? 'unsupported',
        }))
      }
    }
  }

  return { rowIssues, cellIssues }
}

function buildSummary(issues) {
  let errorCount = 0
  let warningCount = 0
  let infoCount = 0
  let datasetIssueCount = 0
  let headerIssueCount = 0
  let rowIssueCount = 0
  let cellIssueCount = 0

  const affectedRows = new Set()
  const affectedColumns = new Set()

  for (const issue of issues) {
    if (issue.severity === 'error') errorCount += 1
    else if (issue.severity === 'warning') warningCount += 1
    else if (issue.severity === 'info') infoCount += 1

    if (issue.scope === 'dataset') datasetIssueCount += 1
    else if (issue.scope === 'header') headerIssueCount += 1
    else if (issue.scope === 'row') rowIssueCount += 1
    else if (issue.scope === 'cell') cellIssueCount += 1

    if (Number.isInteger(issue.sourceRowNumber)) {
      affectedRows.add(issue.sourceRowNumber)
    }
    if (Number.isInteger(issue.columnIndex)) {
      affectedColumns.add(issue.columnIndex)
    }
  }

  let structuralStatus = 'ok'
  if (errorCount > 0) structuralStatus = 'has_errors'
  else if (warningCount > 0) structuralStatus = 'has_warnings'
  else if (infoCount > 0) structuralStatus = 'has_info'

  return {
    totalIssueCount: issues.length,
    errorCount,
    warningCount,
    infoCount,
    datasetIssueCount,
    headerIssueCount,
    rowIssueCount,
    cellIssueCount,
    affectedRowCount: affectedRows.size,
    affectedColumnCount: affectedColumns.size,
    structuralStatus,
  }
}

/**
 * Validate locked Inventory Import tabular parser output.
 *
 * Accepts only `parseInventoryImportTable(...)` results.
 * Does not mutate the parser output.
 * Does not perform field mapping or domain/catalog validation.
 *
 * @param {object} parsedTable
 * @returns {{
 *   validationVersion: string,
 *   parserVersion: string,
 *   structuralStatus: 'ok'|'has_info'|'has_warnings'|'has_errors',
 *   issues: object[],
 *   summary: object,
 * }}
 */
export function validateInventoryImportTable(parsedTable) {
  assertParserResultShape(parsedTable)

  const datasetIssues = collectDatasetIssues(parsedTable)
  const headerIssues = collectHeaderIssues(parsedTable)
  const { rowIssues, cellIssues } = collectRowAndCellIssues(parsedTable)

  const issues = [
    ...datasetIssues,
    ...headerIssues,
    ...rowIssues,
    ...cellIssues,
  ].sort(compareIssues)

  const summary = buildSummary(issues)

  return {
    validationVersion: INVENTORY_IMPORT_VALIDATION_VERSION,
    parserVersion: parsedTable.parserVersion,
    structuralStatus: summary.structuralStatus,
    issues,
    summary,
  }
}

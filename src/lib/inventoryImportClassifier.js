/**
 * P8.15.6 — Inventory Import structural classification foundation.
 *
 * Pure, deterministic per-row classification from locked parser, validator,
 * and mapper outputs. No product matching, persistence, Preview, or Apply.
 *
 * Contract: docs/stock_inventory_import_v1_contract.md (import_v1.0)
 * Classification version: import_classification_structural_v1
 */

import { INVENTORY_IMPORT_TABULAR_PARSER_VERSION } from './inventoryImportTabularParser'
import { INVENTORY_IMPORT_VALIDATION_VERSION } from './inventoryImportTableValidator'
import {
  INVENTORY_IMPORT_CANONICAL_FIELDS,
  INVENTORY_IMPORT_MAPPING_VERSION,
  INVENTORY_IMPORT_REQUIRED_FIELDS,
} from './inventoryImportFieldMapper'

export const INVENTORY_IMPORT_CLASSIFICATION_VERSION = 'import_classification_structural_v1'

export const INVENTORY_IMPORT_CLASSIFICATION_STATUSES = Object.freeze([
  'unmapped',
  'partially_mapped',
  'structurally_blocked',
  'structurally_valid',
])

export class InventoryImportClassificationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'InventoryImportClassificationError'
    this.code = code
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertParserResult(parsedTable) {
  if (!isPlainObject(parsedTable)) {
    throw new InventoryImportClassificationError(
      'INVALID_PARSER_RESULT',
      'Inventory import classifier expects parseInventoryImportTable output.',
    )
  }
  if (parsedTable.parserVersion !== INVENTORY_IMPORT_TABULAR_PARSER_VERSION) {
    throw new InventoryImportClassificationError(
      'UNSUPPORTED_PARSER_VERSION',
      `Inventory import classifier supports parserVersion "${INVENTORY_IMPORT_TABULAR_PARSER_VERSION}" only.`,
    )
  }
  if (!Array.isArray(parsedTable.rows) || !Array.isArray(parsedTable.headers)) {
    throw new InventoryImportClassificationError(
      'INVALID_PARSER_RESULT',
      'Inventory import classifier requires headers and rows arrays.',
    )
  }
}

function assertValidationResult(validationResult) {
  if (!isPlainObject(validationResult)) {
    throw new InventoryImportClassificationError(
      'INVALID_VALIDATION_RESULT',
      'Inventory import classifier expects validateInventoryImportTable output.',
    )
  }
  if (validationResult.validationVersion !== INVENTORY_IMPORT_VALIDATION_VERSION) {
    throw new InventoryImportClassificationError(
      'UNSUPPORTED_VALIDATION_VERSION',
      `Inventory import classifier supports validationVersion "${INVENTORY_IMPORT_VALIDATION_VERSION}" only.`,
    )
  }
  if (!Array.isArray(validationResult.issues)) {
    throw new InventoryImportClassificationError(
      'INVALID_VALIDATION_RESULT',
      'Inventory import classifier requires validation issues to be an array.',
    )
  }
}

function assertMappingResult(mappingResult) {
  if (!isPlainObject(mappingResult)) {
    throw new InventoryImportClassificationError(
      'INVALID_MAPPING_RESULT',
      'Inventory import classifier expects mapInventoryImportFields output.',
    )
  }
  if (mappingResult.mappingVersion !== INVENTORY_IMPORT_MAPPING_VERSION) {
    throw new InventoryImportClassificationError(
      'UNSUPPORTED_MAPPING_VERSION',
      `Inventory import classifier supports mappingVersion "${INVENTORY_IMPORT_MAPPING_VERSION}" only.`,
    )
  }
  if (!Array.isArray(mappingResult.bindings) || !Array.isArray(mappingResult.issues)) {
    throw new InventoryImportClassificationError(
      'INVALID_MAPPING_RESULT',
      'Inventory import classifier requires bindings and issues arrays.',
    )
  }
  if (!Array.isArray(mappingResult.requiredFields) || !Array.isArray(mappingResult.canonicalFields)) {
    throw new InventoryImportClassificationError(
      'INVALID_MAPPING_RESULT',
      'Inventory import classifier requires requiredFields and canonicalFields arrays.',
    )
  }
}

function resolveMappingCoverage(mappingResult) {
  const requiredFields = mappingResult.requiredFields
  const mappedRequired = requiredFields.filter((field) => (
    mappingResult.bindings.some((binding) => binding.destinationField === field)
  ))
  const requiredMappedCount = mappedRequired.length
  const requiredFieldCount = requiredFields.length

  if (requiredMappedCount === 0) return 'none'
  if (requiredMappedCount < requiredFieldCount) return 'partial'
  return 'complete'
}

function toIssueReference(source, issue) {
  return {
    source,
    code: issue.code,
    severity: issue.severity,
    scope: issue.scope,
    sourceRowNumber: Number.isInteger(issue.sourceRowNumber) ? issue.sourceRowNumber : null,
    sourceColumnIndex: Number.isInteger(issue.sourceColumnIndex ?? issue.columnIndex)
      ? (issue.sourceColumnIndex ?? issue.columnIndex)
      : null,
    destinationField: typeof issue.destinationField === 'string' ? issue.destinationField : null,
  }
}

function issueAffectsRow(issue, sourceRowNumber) {
  if (issue.scope === 'dataset' || issue.scope === 'header') return true
  if (issue.scope === 'row' || issue.scope === 'cell') {
    return issue.sourceRowNumber === sourceRowNumber
  }
  return false
}

function resolveClassificationStatus({
  mappingCoverage,
  hasBlockingIssues,
}) {
  if (mappingCoverage === 'none') return 'unmapped'
  if (mappingCoverage === 'partial') return 'partially_mapped'
  if (hasBlockingIssues) return 'structurally_blocked'
  return 'structurally_valid'
}

/**
 * Classify Inventory Import rows from locked parser/validator/mapper outputs.
 *
 * Mapping coverage is table-level (column bindings). Every row inherits the same
 * mappingCoverage. Classification statuses are structural only and never imply
 * Apply eligibility or stock-item matching.
 *
 * @param {object} parsedTable
 * @param {object} validationResult
 * @param {object} mappingResult
 */
export function classifyInventoryImport(parsedTable, validationResult, mappingResult) {
  assertParserResult(parsedTable)
  assertValidationResult(validationResult)
  assertMappingResult(mappingResult)

  const mappingCoverage = resolveMappingCoverage(mappingResult)
  const mappedDestinationFields = mappingResult.bindings
    .map((binding) => binding.destinationField)
    .slice()
    .sort((a, b) => a.localeCompare(b))

  const unmappedDestinationFields = INVENTORY_IMPORT_CANONICAL_FIELDS
    .filter((field) => !mappedDestinationFields.includes(field))

  const requiredUnmappedFields = INVENTORY_IMPORT_REQUIRED_FIELDS
    .filter((field) => !mappedDestinationFields.includes(field))

  const sourceBindings = mappingResult.bindings.map((binding) => ({
    sourceColumnIndex: binding.sourceColumnIndex,
    sourceHeader: binding.sourceHeader,
    normalizedHeader: binding.normalizedHeader,
    destinationField: binding.destinationField,
    matchKind: binding.matchKind,
  }))

  const tableValidationBlocking = validationResult.issues.filter((issue) => (
    issue.severity === 'error'
    && (issue.scope === 'dataset' || issue.scope === 'header')
  ))
  const mappingBlocking = mappingResult.issues.filter((issue) => issue.severity === 'error')
  const tableHasMappingBlocking = mappingBlocking.length > 0
    && mappingCoverage === 'complete'

  const rows = parsedTable.rows.map((row, rowIndex) => {
    const rowValidationIssues = validationResult.issues.filter((issue) => (
      issueAffectsRow(issue, row.sourceRowNumber)
    ))
    const rowBlockingValidation = rowValidationIssues.filter((issue) => issue.severity === 'error')
    const rowWarningValidation = rowValidationIssues.filter((issue) => issue.severity === 'warning')

    const hasBlockingIssues = rowBlockingValidation.length > 0
      || tableHasMappingBlocking
    const hasWarnings = rowWarningValidation.length > 0

    const issueReferences = [
      ...rowValidationIssues.map((issue) => toIssueReference('validation', issue)),
      ...((mappingCoverage !== 'complete' || tableHasMappingBlocking)
        ? mappingBlocking.map((issue) => toIssueReference('mapping', issue))
        : []),
    ]

    // Stable unique-ish references without inventing IDs: sort by source/code/scope.
    issueReferences.sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source)
      if ((a.sourceRowNumber ?? -1) !== (b.sourceRowNumber ?? -1)) {
        return (a.sourceRowNumber ?? -1) - (b.sourceRowNumber ?? -1)
      }
      if ((a.sourceColumnIndex ?? -1) !== (b.sourceColumnIndex ?? -1)) {
        return (a.sourceColumnIndex ?? -1) - (b.sourceColumnIndex ?? -1)
      }
      if (a.severity !== b.severity) {
        const rank = { error: 0, warning: 1, info: 2 }
        return rank[a.severity] - rank[b.severity]
      }
      return a.code.localeCompare(b.code)
    })

    const classificationStatus = resolveClassificationStatus({
      mappingCoverage,
      hasBlockingIssues,
    })

    return {
      sourceRowNumber: row.sourceRowNumber,
      rowIndex,
      isBlank: Boolean(row.isBlank),
      classificationStatus,
      mappingCoverage,
      structuralValidity: hasBlockingIssues ? 'blocked' : 'valid',
      hasBlockingIssues,
      hasWarnings,
      mappedDestinationFields: [...mappedDestinationFields],
      unmappedDestinationFields: [...unmappedDestinationFields],
      requiredUnmappedFields: [...requiredUnmappedFields],
      sourceBindings: sourceBindings.map((binding) => ({ ...binding })),
      issueReferences,
    }
  })

  let structurallyValidRows = 0
  let structurallyBlockedRows = 0
  let warningRows = 0
  let fullyMappedRows = 0
  let partiallyMappedRows = 0
  let unmappedRows = 0

  for (const row of rows) {
    if (row.classificationStatus === 'structurally_valid') structurallyValidRows += 1
    if (row.classificationStatus === 'structurally_blocked') structurallyBlockedRows += 1
    if (row.hasWarnings) warningRows += 1
    if (row.mappingCoverage === 'complete') fullyMappedRows += 1
    if (row.mappingCoverage === 'partial') partiallyMappedRows += 1
    if (row.mappingCoverage === 'none') unmappedRows += 1
  }

  const summary = {
    totalRows: rows.length,
    structurallyValidRows,
    structurallyBlockedRows,
    warningRows,
    fullyMappedRows,
    partiallyMappedRows,
    unmappedRows,
    mappingCoverage,
    tableValidationBlockingCount: tableValidationBlocking.length,
    mappingBlockingCount: mappingBlocking.length,
  }

  return {
    classificationVersion: INVENTORY_IMPORT_CLASSIFICATION_VERSION,
    parserVersion: parsedTable.parserVersion,
    validationVersion: validationResult.validationVersion,
    mappingVersion: mappingResult.mappingVersion,
    mappingCoverage,
    rows,
    summary,
  }
}

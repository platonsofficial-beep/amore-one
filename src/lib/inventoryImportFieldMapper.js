/**
 * P8.15.5 — Inventory Import field mapping foundation.
 *
 * Pure, deterministic column → canonical-field mapping.
 * Consumes locked parser + validator outputs plus an explicit mapping definition.
 *
 * Contract: docs/stock_inventory_import_v1_contract.md (import_v1.0)
 * Mapping version: import_mapping_v1
 *
 * Header aliases: none are defined in the V1 contract. The only automatic
 * resolution is exact match of a normalized source header to a canonical
 * field name (e.g. "name" → name). Operator aliases such as Product → name
 * require an explicit binding.
 */

import {
  INVENTORY_IMPORT_TABULAR_PARSER_VERSION,
  normalizeInventoryImportHeader,
} from './inventoryImportTabularParser'
import { INVENTORY_IMPORT_VALIDATION_VERSION } from './inventoryImportTableValidator'

export const INVENTORY_IMPORT_MAPPING_VERSION = 'import_mapping_v1'

/** Persistable + staged-only V1 fields from the locked field contract. */
export const INVENTORY_IMPORT_CANONICAL_FIELDS = Object.freeze([
  'name',
  'unit',
  'currentQuantity',
  'category',
  'itemType',
  'minimumQuantity',
  'targetQuantity',
  'storageLocation',
  'costPrice',
  'supplier',
  'active',
  'sku',
  'barcode',
  'notes',
])

/** Required destinations for mapping completeness (V1 apply eligibility). */
export const INVENTORY_IMPORT_REQUIRED_FIELDS = Object.freeze([
  'name',
  'unit',
  'currentQuantity',
])

/**
 * Approved header aliases from the V1 contract.
 * Empty: the locked contract does not define header alias lists.
 */
export const INVENTORY_IMPORT_APPROVED_HEADER_ALIASES = Object.freeze({})

export class InventoryImportMappingError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'InventoryImportMappingError'
    this.code = code
  }
}

const CANONICAL_FIELD_SET = new Set(INVENTORY_IMPORT_CANONICAL_FIELDS)

const EXACT_FIELD_NAME_BY_NORMALIZED = new Map(
  INVENTORY_IMPORT_CANONICAL_FIELDS.map((field) => [
    normalizeInventoryImportHeader(field),
    field,
  ]),
)

const SCOPE_ORDER = {
  mapping: 0,
  destination: 1,
  source: 2,
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

function jsonSafeHeader(sourceHeader) {
  if (sourceHeader === undefined) return null
  if (isJsonSafeScalar(sourceHeader)) return sourceHeader
  return null
}

function makeIssue({
  code,
  severity,
  scope,
  message,
  sourceColumnIndex = null,
  sourceHeader = null,
  normalizedHeader = null,
  destinationField = null,
}) {
  return {
    code,
    severity,
    scope,
    message,
    sourceColumnIndex,
    sourceHeader: jsonSafeHeader(sourceHeader),
    normalizedHeader: typeof normalizedHeader === 'string' ? normalizedHeader : null,
    destinationField,
  }
}

function compareIssues(a, b) {
  const scopeDelta = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]
  if (scopeDelta !== 0) return scopeDelta

  const colDelta = (a.sourceColumnIndex ?? -1) - (b.sourceColumnIndex ?? -1)
  if (colDelta !== 0) return colDelta

  const fieldA = a.destinationField ?? ''
  const fieldB = b.destinationField ?? ''
  const fieldDelta = fieldA.localeCompare(fieldB)
  if (fieldDelta !== 0) return fieldDelta

  const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  if (severityDelta !== 0) return severityDelta

  return a.code.localeCompare(b.code)
}

function assertParserResult(parsedTable) {
  if (!isPlainObject(parsedTable)) {
    throw new InventoryImportMappingError(
      'INVALID_PARSER_RESULT',
      'Inventory import mapper expects parseInventoryImportTable output.',
    )
  }
  if (parsedTable.parserVersion !== INVENTORY_IMPORT_TABULAR_PARSER_VERSION) {
    throw new InventoryImportMappingError(
      'UNSUPPORTED_PARSER_VERSION',
      `Inventory import mapper supports parserVersion "${INVENTORY_IMPORT_TABULAR_PARSER_VERSION}" only.`,
    )
  }
  if (!Array.isArray(parsedTable.headers)) {
    throw new InventoryImportMappingError(
      'INVALID_PARSER_RESULT',
      'Inventory import mapper requires headers to be an array.',
    )
  }
}

function assertValidationResult(validationResult) {
  if (!isPlainObject(validationResult)) {
    throw new InventoryImportMappingError(
      'INVALID_VALIDATION_RESULT',
      'Inventory import mapper expects validateInventoryImportTable output.',
    )
  }
  if (validationResult.validationVersion !== INVENTORY_IMPORT_VALIDATION_VERSION) {
    throw new InventoryImportMappingError(
      'UNSUPPORTED_VALIDATION_VERSION',
      `Inventory import mapper supports validationVersion "${INVENTORY_IMPORT_VALIDATION_VERSION}" only.`,
    )
  }
  if (!Array.isArray(validationResult.issues)) {
    throw new InventoryImportMappingError(
      'INVALID_VALIDATION_RESULT',
      'Inventory import mapper requires validation issues to be an array.',
    )
  }
}

function normalizeMappingDefinition(mappingDefinition) {
  if (mappingDefinition === undefined || mappingDefinition === null) {
    return { bindings: [] }
  }
  if (!isPlainObject(mappingDefinition)) {
    throw new InventoryImportMappingError(
      'INVALID_MAPPING_DEFINITION',
      'Inventory import mapper expects mappingDefinition to be an object.',
    )
  }
  const bindings = mappingDefinition.bindings ?? []
  if (!Array.isArray(bindings)) {
    throw new InventoryImportMappingError(
      'INVALID_MAPPING_DEFINITION',
      'Inventory import mapper expects mappingDefinition.bindings to be an array.',
    )
  }
  return { bindings }
}

function resolveExactCanonicalField(normalizedHeader) {
  if (!normalizedHeader) return null
  return EXACT_FIELD_NAME_BY_NORMALIZED.get(normalizedHeader) ?? null
}

/**
 * Resolve an approved header alias to a canonical field.
 * Always returns null until the V1 contract defines aliases.
 */
export function resolveApprovedHeaderAlias(normalizedHeader) {
  const aliases = INVENTORY_IMPORT_APPROVED_HEADER_ALIASES
  if (!normalizedHeader || !isPlainObject(aliases)) return null
  const destination = aliases[normalizedHeader]
  return typeof destination === 'string' && CANONICAL_FIELD_SET.has(destination)
    ? destination
    : null
}

function buildSummary(issues, bindings, unmappedSourceColumns, unusedDestinationFields) {
  let errorCount = 0
  let warningCount = 0
  let infoCount = 0

  for (const issue of issues) {
    if (issue.severity === 'error') errorCount += 1
    else if (issue.severity === 'warning') warningCount += 1
    else if (issue.severity === 'info') infoCount += 1
  }

  let mappingStatus = 'ok'
  if (errorCount > 0) mappingStatus = 'has_errors'
  else if (warningCount > 0) mappingStatus = 'has_warnings'
  else if (infoCount > 0) mappingStatus = 'has_info'

  const requiredMappedCount = INVENTORY_IMPORT_REQUIRED_FIELDS.filter((field) => (
    bindings.some((binding) => binding.destinationField === field)
  )).length

  return {
    totalIssueCount: issues.length,
    errorCount,
    warningCount,
    infoCount,
    bindingCount: bindings.length,
    unmappedSourceColumnCount: unmappedSourceColumns.length,
    unusedDestinationFieldCount: unusedDestinationFields.length,
    requiredFieldCount: INVENTORY_IMPORT_REQUIRED_FIELDS.length,
    requiredMappedCount,
    requiredMissingCount: INVENTORY_IMPORT_REQUIRED_FIELDS.length - requiredMappedCount,
    mappingStatus,
  }
}

/**
 * Map source columns to Inventory Import V1 canonical fields.
 *
 * @param {object} parsedTable parseInventoryImportTable output
 * @param {object} validationResult validateInventoryImportTable output
 * @param {{ bindings?: { sourceColumnIndex: number, destinationField: string }[] }} [mappingDefinition]
 */
export function mapInventoryImportFields(
  parsedTable,
  validationResult,
  mappingDefinition = {},
) {
  assertParserResult(parsedTable)
  assertValidationResult(validationResult)
  const definition = normalizeMappingDefinition(mappingDefinition)

  const issues = []
  const bindings = []
  const boundColumns = new Set()
  const destinationOwners = new Map()

  const headersByIndex = new Map(
    parsedTable.headers.map((header) => [header.columnIndex, header]),
  )

  for (let bindingIndex = 0; bindingIndex < definition.bindings.length; bindingIndex += 1) {
    const entry = definition.bindings[bindingIndex]
    if (!isPlainObject(entry)) {
      issues.push(makeIssue({
        code: 'INVALID_MAPPING_BINDING',
        severity: 'error',
        scope: 'mapping',
        message: `Mapping binding at index ${bindingIndex} must be an object.`,
      }))
      continue
    }

    const { sourceColumnIndex, destinationField } = entry

    if (!Number.isInteger(sourceColumnIndex)) {
      issues.push(makeIssue({
        code: 'INVALID_SOURCE_COLUMN',
        severity: 'error',
        scope: 'source',
        message: `Mapping binding at index ${bindingIndex} requires an integer sourceColumnIndex.`,
        destinationField: typeof destinationField === 'string' ? destinationField : null,
      }))
      continue
    }

    const header = headersByIndex.get(sourceColumnIndex)
    if (!header) {
      issues.push(makeIssue({
        code: 'INVALID_SOURCE_COLUMN',
        severity: 'error',
        scope: 'source',
        message: `Source column index ${sourceColumnIndex} does not exist on the parsed table.`,
        sourceColumnIndex,
        destinationField: typeof destinationField === 'string' ? destinationField : null,
      }))
      continue
    }

    if (typeof destinationField !== 'string' || !CANONICAL_FIELD_SET.has(destinationField)) {
      issues.push(makeIssue({
        code: 'UNKNOWN_DESTINATION_FIELD',
        severity: 'error',
        scope: 'destination',
        message: `Unknown destination field "${destinationField}".`,
        sourceColumnIndex,
        sourceHeader: header.sourceHeader,
        normalizedHeader: header.normalized,
        destinationField: typeof destinationField === 'string' ? destinationField : null,
      }))
      continue
    }

    if (boundColumns.has(sourceColumnIndex)) {
      issues.push(makeIssue({
        code: 'SOURCE_COLUMN_MAPPED_MORE_THAN_ONCE',
        severity: 'error',
        scope: 'source',
        message: `Source column ${sourceColumnIndex} is mapped more than once.`,
        sourceColumnIndex,
        sourceHeader: header.sourceHeader,
        normalizedHeader: header.normalized,
        destinationField,
      }))
      continue
    }

    if (destinationOwners.has(destinationField)) {
      issues.push(makeIssue({
        code: 'DESTINATION_MAPPED_MORE_THAN_ONCE',
        severity: 'error',
        scope: 'destination',
        message: `Destination field "${destinationField}" is mapped more than once.`,
        sourceColumnIndex,
        sourceHeader: header.sourceHeader,
        normalizedHeader: header.normalized,
        destinationField,
      }))
      continue
    }

    boundColumns.add(sourceColumnIndex)
    destinationOwners.set(destinationField, sourceColumnIndex)
    bindings.push({
      sourceColumnIndex,
      sourceHeader: jsonSafeHeader(header.sourceHeader),
      normalizedHeader: header.normalized,
      destinationField,
      matchKind: 'explicit',
    })
  }

  for (const header of parsedTable.headers) {
    if (boundColumns.has(header.columnIndex)) continue
    if (header.isBlank) continue

    const aliasField = resolveApprovedHeaderAlias(header.normalized)
    const exactField = resolveExactCanonicalField(header.normalized)
    const destinationField = aliasField ?? exactField
    if (!destinationField) continue
    if (destinationOwners.has(destinationField)) continue

    const matchKind = aliasField ? 'approved_alias' : 'exact_field_name'
    boundColumns.add(header.columnIndex)
    destinationOwners.set(destinationField, header.columnIndex)
    bindings.push({
      sourceColumnIndex: header.columnIndex,
      sourceHeader: jsonSafeHeader(header.sourceHeader),
      normalizedHeader: header.normalized,
      destinationField,
      matchKind,
    })
  }

  bindings.sort((a, b) => a.sourceColumnIndex - b.sourceColumnIndex)

  for (const requiredField of INVENTORY_IMPORT_REQUIRED_FIELDS) {
    if (!destinationOwners.has(requiredField)) {
      issues.push(makeIssue({
        code: 'REQUIRED_DESTINATION_UNMAPPED',
        severity: 'error',
        scope: 'destination',
        message: `Required destination field "${requiredField}" is not mapped.`,
        destinationField: requiredField,
      }))
    }
  }

  const unmappedSourceColumns = []
  for (const header of parsedTable.headers) {
    if (boundColumns.has(header.columnIndex)) continue
    unmappedSourceColumns.push({
      sourceColumnIndex: header.columnIndex,
      sourceHeader: jsonSafeHeader(header.sourceHeader),
      normalizedHeader: header.normalized,
      isBlank: Boolean(header.isBlank),
    })
    issues.push(makeIssue({
      code: 'UNMAPPED_SOURCE_COLUMN',
      severity: 'info',
      scope: 'source',
      message: header.isBlank
        ? `Source column ${header.columnIndex} is blank and unmapped.`
        : `Source column ${header.columnIndex} is not mapped to a destination field.`,
      sourceColumnIndex: header.columnIndex,
      sourceHeader: header.sourceHeader,
      normalizedHeader: header.normalized,
    }))
  }

  const unusedDestinationFields = []
  for (const field of INVENTORY_IMPORT_CANONICAL_FIELDS) {
    if (destinationOwners.has(field)) continue
    unusedDestinationFields.push(field)
    if (INVENTORY_IMPORT_REQUIRED_FIELDS.includes(field)) continue
    issues.push(makeIssue({
      code: 'UNUSED_DESTINATION_FIELD',
      severity: 'info',
      scope: 'destination',
      message: `Canonical destination field "${field}" is unused.`,
      destinationField: field,
    }))
  }

  issues.sort(compareIssues)
  const summary = buildSummary(
    issues,
    bindings,
    unmappedSourceColumns,
    unusedDestinationFields,
  )

  return {
    mappingVersion: INVENTORY_IMPORT_MAPPING_VERSION,
    parserVersion: parsedTable.parserVersion,
    validationVersion: validationResult.validationVersion,
    mappingStatus: summary.mappingStatus,
    canonicalFields: [...INVENTORY_IMPORT_CANONICAL_FIELDS],
    requiredFields: [...INVENTORY_IMPORT_REQUIRED_FIELDS],
    bindings,
    unmappedSourceColumns,
    unusedDestinationFields,
    issues,
    summary,
  }
}

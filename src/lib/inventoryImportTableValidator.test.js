// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INVENTORY_IMPORT_TABULAR_PARSER_VERSION,
  parseInventoryImportTable,
} from './inventoryImportTabularParser'
import {
  INVENTORY_IMPORT_MAX_DATA_ROWS,
  INVENTORY_IMPORT_MAX_SOURCE_COLUMNS,
  INVENTORY_IMPORT_VALIDATION_VERSION,
  InventoryImportValidationError,
  validateInventoryImportTable,
} from './inventoryImportTableValidator'

function parseAndValidate(input) {
  return validateInventoryImportTable(parseInventoryImportTable(input))
}

describe('inventoryImportTableValidator', () => {
  it('produces deterministic validation output for valid parser results', () => {
    const parsed = parseInventoryImportTable({
      headers: ['Name', 'Unit'],
      rows: [['Ketel One', 'bottle']],
    })
    const result = validateInventoryImportTable(parsed)

    expect(result.validationVersion).toBe(INVENTORY_IMPORT_VALIDATION_VERSION)
    expect(result.parserVersion).toBe(INVENTORY_IMPORT_TABULAR_PARSER_VERSION)
    expect(result.structuralStatus).toBe('ok')
    expect(result.issues).toEqual([])
    expect(result.summary.errorCount).toBe(0)
  })

  it('does not mutate parser output', () => {
    const parsed = parseInventoryImportTable({
      headers: ['Name'],
      rows: [['A'], ['']],
    })
    const before = JSON.stringify(parsed)

    validateInventoryImportTable(parsed)

    expect(JSON.stringify(parsed)).toBe(before)
  })

  it('returns deeply equivalent results for repeated validation', () => {
    const parsed = parseInventoryImportTable({
      headers: ['Name', 'Name'],
      rows: [['A'], ['', null], [{ x: 1 }]],
    })

    const first = validateInventoryImportTable(parsed)
    const second = validateInventoryImportTable(parsed)

    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('rejects malformed top-level validator input', () => {
    expect(() => validateInventoryImportTable(null)).toThrow(InventoryImportValidationError)
    expect(() => validateInventoryImportTable([])).toThrow(InventoryImportValidationError)
    expect(() => validateInventoryImportTable('nope')).toThrow(InventoryImportValidationError)
  })

  it('does not accept raw parser input shape as parser output', () => {
    expect(() => validateInventoryImportTable({
      headers: ['Name'],
      rows: [['A']],
    })).toThrow(InventoryImportValidationError)
  })

  it('rejects missing parser version', () => {
    const parsed = parseInventoryImportTable({ headers: ['Name'], rows: [] })
    const { parserVersion: _ignored, ...withoutVersion } = parsed

    try {
      validateInventoryImportTable(withoutVersion)
      throw new Error('expected throw')
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryImportValidationError)
      expect(error.code).toBe('MISSING_PARSER_VERSION')
    }
  })

  it('rejects unsupported parser versions', () => {
    const parsed = parseInventoryImportTable({ headers: ['Name'], rows: [] })

    try {
      validateInventoryImportTable({ ...parsed, parserVersion: 'not-a-real-parser' })
      throw new Error('expected throw')
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryImportValidationError)
      expect(error.code).toBe('UNSUPPORTED_PARSER_VERSION')
    }
  })

  it('rejects missing headers collection', () => {
    const parsed = parseInventoryImportTable({ headers: ['Name'], rows: [] })
    const broken = { ...parsed, headers: undefined }

    expect(() => validateInventoryImportTable(broken)).toThrow(InventoryImportValidationError)
  })

  it('rejects missing rows collection', () => {
    const parsed = parseInventoryImportTable({ headers: ['Name'], rows: [] })
    const broken = { ...parsed, rows: undefined }

    expect(() => validateInventoryImportTable(broken)).toThrow(InventoryImportValidationError)
  })

  it('rejects missing summary', () => {
    const parsed = parseInventoryImportTable({ headers: ['Name'], rows: [] })
    const broken = { ...parsed, summary: undefined }

    expect(() => validateInventoryImportTable(broken)).toThrow(InventoryImportValidationError)
  })

  it('returns no structural errors for a clean table', () => {
    const result = parseAndValidate({
      headers: ['Product', 'Unit'],
      rows: [['Lime', 'kg'], ['Gin', 'bottle']],
    })

    expect(result.issues).toEqual([])
    expect(result.summary.structuralStatus).toBe('ok')
    expect(result.structuralStatus).toBe('ok')
  })

  it('classifies empty data-row collection as info NO_DATA_ROWS', () => {
    const result = parseAndValidate({
      headers: ['Name'],
      rows: [],
    })

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'NO_DATA_ROWS',
        severity: 'info',
        scope: 'dataset',
      }),
    ])
    expect(result.structuralStatus).toBe('has_info')
  })

  it('detects a fully blank dataset', () => {
    const result = parseAndValidate({
      headers: ['Name', 'Unit'],
      rows: [['', null], [undefined, '   ']],
    })

    expect(result.issues.some((issue) => (
      issue.code === 'ALL_ROWS_BLANK' && issue.severity === 'warning'
    ))).toBe(true)
  })

  it('surfaces blank headers as errors with column evidence', () => {
    const result = parseAndValidate({
      headers: ['Name', '  '],
      rows: [['A', 'B']],
    })

    const blank = result.issues.find((issue) => issue.code === 'BLANK_HEADER')
    expect(blank).toMatchObject({
      severity: 'error',
      scope: 'header',
      columnIndex: 1,
    })
  })

  it('surfaces duplicate normalized headers as errors', () => {
    const result = parseAndValidate({
      headers: ['Name', 'name'],
      rows: [['A', 'B']],
    })

    const duplicates = result.issues.filter((issue) => issue.code === 'DUPLICATE_NORMALIZED_HEADER')
    expect(duplicates).toHaveLength(2)
    expect(duplicates.every((issue) => issue.severity === 'error')).toBe(true)
  })

  it('retains source-column evidence for duplicate headers', () => {
    const result = parseAndValidate({
      headers: ['Stock Name', '  stock   name  '],
      rows: [],
    })

    const duplicates = result.issues.filter((issue) => issue.code === 'DUPLICATE_NORMALIZED_HEADER')
    expect(duplicates.map((issue) => issue.columnIndex)).toEqual([0, 1])
    expect(duplicates.map((issue) => issue.normalizedHeader)).toEqual([
      'stock name',
      'stock name',
    ])
    expect(duplicates[0].sourceHeader).toBe('Stock Name')
  })

  it('surfaces missing-cell row issues', () => {
    const result = parseAndValidate({
      headers: ['Name', 'Unit'],
      rows: [['OnlyName']],
    })

    expect(result.issues.some((issue) => (
      issue.code === 'MISSING_CELL'
      && issue.scope === 'row'
      && issue.severity === 'warning'
      && issue.columnIndex === 1
      && issue.sourceRowNumber === 2
    ))).toBe(true)
  })

  it('surfaces overflow-cell row issues', () => {
    const result = parseAndValidate({
      headers: ['Name'],
      rows: [['A', 'extra']],
    })

    expect(result.issues.some((issue) => (
      issue.code === 'OVERFLOW_CELL'
      && issue.scope === 'row'
      && issue.severity === 'warning'
      && issue.columnIndex === 1
    ))).toBe(true)
  })

  it('surfaces blank rows as warnings', () => {
    const result = parseAndValidate({
      headers: ['Name'],
      rows: [['A'], [''], ['B']],
    })

    const blank = result.issues.find((issue) => issue.code === 'BLANK_ROW')
    expect(blank).toMatchObject({
      severity: 'warning',
      scope: 'row',
      sourceRowNumber: 3,
      rowIndex: 1,
    })
  })

  it('surfaces unsupported cells with row and column evidence', () => {
    const result = parseAndValidate({
      headers: ['Name', 'Meta'],
      rows: [['A', { nested: true }]],
    })

    const unsupported = result.issues.find((issue) => issue.code === 'UNSUPPORTED_CELL_VALUE')
    expect(unsupported).toMatchObject({
      severity: 'error',
      scope: 'cell',
      sourceRowNumber: 2,
      columnIndex: 1,
      sourceHeader: 'Meta',
      cellKind: 'unsupported',
      unsupportedType: 'object',
    })
  })

  it('does not stringify unsupported values in issue evidence', () => {
    const result = parseAndValidate({
      headers: ['Name'],
      rows: [[{ secret: 'nope' }]],
    })

    const unsupported = result.issues.find((issue) => issue.code === 'UNSUPPORTED_CELL_VALUE')
    const serialized = JSON.stringify(unsupported)

    expect(serialized).not.toContain('secret')
    expect(unsupported).not.toHaveProperty('raw')
    expect(unsupported).not.toHaveProperty('value')
  })

  it('preserves source row numbers from the parser', () => {
    const result = parseAndValidate({
      headers: ['Name'],
      rows: [['a'], ['']],
      headerRowNumber: 5,
    })

    expect(result.issues.find((issue) => issue.code === 'BLANK_ROW').sourceRowNumber).toBe(7)
  })

  it('preserves source column order in issue evidence', () => {
    const result = parseAndValidate({
      headers: ['A', '', 'C', ''],
      rows: [],
    })

    const blanks = result.issues.filter((issue) => issue.code === 'BLANK_HEADER')
    expect(blanks.map((issue) => issue.columnIndex)).toEqual([1, 3])
  })

  it('orders multiple findings deterministically', () => {
    const result = parseAndValidate({
      headers: ['Name', 'Name', ''],
      rows: [
        ['ok', 'x', 'y'],
        [''],
        [{ bad: true }, 'b', 'c', 'overflow'],
      ],
    })

    const keys = result.issues.map((issue) => ([
      issue.scope,
      issue.sourceRowNumber,
      issue.columnIndex,
      issue.code,
      issue.severity,
    ]))
    const sorted = keys.slice().sort((left, right) => {
      const scopeRank = { dataset: 0, header: 1, row: 2, cell: 3 }
      if (scopeRank[left[0]] !== scopeRank[right[0]]) {
        return scopeRank[left[0]] - scopeRank[right[0]]
      }
      if ((left[1] ?? -1) !== (right[1] ?? -1)) return (left[1] ?? -1) - (right[1] ?? -1)
      if ((left[2] ?? -1) !== (right[2] ?? -1)) return (left[2] ?? -1) - (right[2] ?? -1)
      return String(left[3]).localeCompare(String(right[3]))
    })

    expect(keys).toEqual(sorted)
  })

  it('counts summary errors, warnings, and info correctly', () => {
    const result = parseAndValidate({
      headers: ['Name', ''],
      rows: [],
    })

    expect(result.summary.errorCount).toBe(1)
    expect(result.summary.warningCount).toBe(0)
    expect(result.summary.infoCount).toBe(1)
    expect(result.summary.totalIssueCount).toBe(2)
  })

  it('counts summary scopes correctly', () => {
    const result = parseAndValidate({
      headers: ['Name', 'Name'],
      rows: [['A'], [''], [{ x: 1 }]],
    })

    expect(result.summary.datasetIssueCount).toBe(0)
    expect(result.summary.headerIssueCount).toBe(2)
    expect(result.summary.rowIssueCount).toBeGreaterThan(0)
    expect(result.summary.cellIssueCount).toBe(1)
  })

  it('deduplicates affected-row count', () => {
    const result = parseAndValidate({
      headers: ['A', 'B', 'C'],
      rows: [['only']],
    })

    const missing = result.issues.filter((issue) => issue.code === 'MISSING_CELL')
    expect(missing.length).toBeGreaterThan(1)
    expect(result.summary.affectedRowCount).toBe(1)
  })

  it('deduplicates affected-column count', () => {
    const result = parseAndValidate({
      headers: ['Name', ''],
      rows: [['A', { nested: true }]],
    })

    expect(result.issues.filter((issue) => issue.columnIndex === 1).length).toBeGreaterThan(1)
    expect(result.summary.affectedColumnCount).toBe(1)
  })

  it('does not return Apply eligibility fields', () => {
    const result = parseAndValidate({
      headers: ['Name'],
      rows: [['A']],
    })

    expect(result).not.toHaveProperty('canApply')
    expect(result).not.toHaveProperty('readyToImport')
    expect(result).not.toHaveProperty('importable')
    expect(result).not.toHaveProperty('canPersist')
    expect(result).not.toHaveProperty('validForProduction')
    expect(result.summary).not.toHaveProperty('canApply')
  })

  it('does not generate IDs or timestamps', () => {
    const result = parseAndValidate({
      headers: ['Name'],
      rows: [['A']],
    })
    const serialized = JSON.stringify(result)

    expect(serialized).not.toMatch(/createdAt|updatedAt|timestamp|uuid|random/i)
    expect(result).not.toHaveProperty('id')
  })

  it('leaves parser output deeply unchanged after validation', () => {
    const parsed = parseInventoryImportTable({
      headers: ['Name', 'Unit'],
      rows: [['A', 'kg'], ['', ''], [{ a: 1 }, 'x']],
    })
    const snapshot = structuredClone(parsed)

    validateInventoryImportTable(parsed)

    expect(parsed).toEqual(snapshot)
  })

  it('contains no database or network dependency in the validator module', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'inventoryImportTableValidator.js'),
      'utf8',
    )

    expect(source).not.toMatch(/supabase|fetch\(|XMLHttpRequest|localStorage|sessionStorage/i)
    expect(source).not.toMatch(/from ['"].*supabase/i)
  })

  it('returns JSON-serializable validation output', () => {
    const result = parseAndValidate({
      headers: ['Name', 'Meta'],
      rows: [['A', { nested: true }], [''], ['B', 'extra']],
    })

    expect(() => JSON.stringify(result)).not.toThrow()
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('flags excessive columns and rows using V1 contract limits', () => {
    const manyHeaders = Array.from(
      { length: INVENTORY_IMPORT_MAX_SOURCE_COLUMNS + 1 },
      (_, index) => `H${index}`,
    )
    const columnsResult = parseAndValidate({
      headers: manyHeaders,
      rows: [manyHeaders.map(() => 'x')],
    })
    expect(columnsResult.issues.some((issue) => issue.code === 'EXCESSIVE_COLUMNS')).toBe(true)

    const manyRows = Array.from(
      { length: INVENTORY_IMPORT_MAX_DATA_ROWS + 1 },
      (_, index) => [`row-${index}`],
    )
    const rowsResult = parseAndValidate({
      headers: ['Name'],
      rows: manyRows,
    })
    expect(rowsResult.issues.some((issue) => issue.code === 'EXCESSIVE_ROWS')).toBe(true)
  })
})

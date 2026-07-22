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
  INVENTORY_IMPORT_VALIDATION_VERSION,
  validateInventoryImportTable,
} from './inventoryImportTableValidator'
import {
  INVENTORY_IMPORT_MAPPING_VERSION,
  mapInventoryImportFields,
} from './inventoryImportFieldMapper'
import {
  INVENTORY_IMPORT_CLASSIFICATION_VERSION,
  InventoryImportClassificationError,
  classifyInventoryImport,
} from './inventoryImportClassifier'

function classifyFrom(headers, rows, mappingDefinition = {}) {
  const parsedTable = parseInventoryImportTable({ headers, rows })
  const validationResult = validateInventoryImportTable(parsedTable)
  const mappingResult = mapInventoryImportFields(
    parsedTable,
    validationResult,
    mappingDefinition,
  )
  const classification = classifyInventoryImport(
    parsedTable,
    validationResult,
    mappingResult,
  )
  return {
    parsedTable,
    validationResult,
    mappingResult,
    classification,
  }
}

const COMPLETE_HEADERS = ['name', 'unit', 'currentQuantity']

describe('inventoryImportClassifier', () => {
  it('classifies a clean fully mapped table', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['Ketel One', 'bottle', 12], ['Lime', 'kg', 3]],
      {},
    )

    expect(classification.classificationVersion).toBe(INVENTORY_IMPORT_CLASSIFICATION_VERSION)
    expect(classification.mappingCoverage).toBe('complete')
    expect(classification.rows).toHaveLength(2)
    expect(classification.rows.every((row) => row.classificationStatus === 'structurally_valid'))
      .toBe(true)
    expect(classification.summary).toMatchObject({
      totalRows: 2,
      structurallyValidRows: 2,
      structurallyBlockedRows: 0,
      fullyMappedRows: 2,
      partiallyMappedRows: 0,
      unmappedRows: 0,
    })
  })

  it('produces deterministic output for repeated calls', () => {
    const parsedTable = parseInventoryImportTable({
      headers: COMPLETE_HEADERS,
      rows: [['A', 'kg', 1], ['', '', '']],
    })
    const validationResult = validateInventoryImportTable(parsedTable)
    const mappingResult = mapInventoryImportFields(parsedTable, validationResult, {})

    const first = classifyInventoryImport(parsedTable, validationResult, mappingResult)
    const second = classifyInventoryImport(parsedTable, validationResult, mappingResult)

    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('does not mutate parser, validator, or mapper outputs', () => {
    const parsedTable = parseInventoryImportTable({
      headers: COMPLETE_HEADERS,
      rows: [['A', 'kg', 1]],
    })
    const validationResult = validateInventoryImportTable(parsedTable)
    const mappingResult = mapInventoryImportFields(parsedTable, validationResult, {})
    const parsedSnapshot = structuredClone(parsedTable)
    const validationSnapshot = structuredClone(validationResult)
    const mappingSnapshot = structuredClone(mappingResult)

    classifyInventoryImport(parsedTable, validationResult, mappingResult)

    expect(parsedTable).toEqual(parsedSnapshot)
    expect(validationResult).toEqual(validationSnapshot)
    expect(mappingResult).toEqual(mappingSnapshot)
  })

  it('marks rows with unsupported cells as structurally blocked', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['A', 'kg', { bad: true }]],
      {},
    )

    expect(classification.rows[0].classificationStatus).toBe('structurally_blocked')
    expect(classification.rows[0].hasBlockingIssues).toBe(true)
    expect(classification.summary.structurallyBlockedRows).toBe(1)
  })

  it('surfaces warning rows without treating them as blocked when mapping is complete', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['A', 'kg', 1], ['', '', '']],
      {},
    )

    const blankRow = classification.rows.find((row) => row.isBlank)
    expect(blankRow.classificationStatus).toBe('structurally_valid')
    expect(blankRow.hasWarnings).toBe(true)
    expect(classification.summary.warningRows).toBeGreaterThan(0)
  })

  it('classifies unmapped tables when required destinations are missing', () => {
    const { classification } = classifyFrom(
      ['Notes Extra'],
      [['hello']],
      {},
    )

    expect(classification.mappingCoverage).toBe('none')
    expect(classification.rows.every((row) => row.classificationStatus === 'unmapped')).toBe(true)
    expect(classification.summary.unmappedRows).toBe(1)
    expect(classification.summary.fullyMappedRows).toBe(0)
  })

  it('classifies partially mapped tables', () => {
    const { classification } = classifyFrom(
      ['name', 'unit'],
      [['A', 'kg'], ['B', 'bottle']],
      {},
    )

    expect(classification.mappingCoverage).toBe('partial')
    expect(classification.rows.every((row) => row.classificationStatus === 'partially_mapped'))
      .toBe(true)
    expect(classification.summary.partiallyMappedRows).toBe(2)
    expect(classification.summary.fullyMappedRows).toBe(0)
  })

  it('counts fully mapped rows when required destinations are bound', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['A', 'kg', 1]],
      {},
    )

    expect(classification.summary.fullyMappedRows).toBe(1)
    expect(classification.rows[0].mappedDestinationFields).toEqual([
      'currentQuantity',
      'name',
      'unit',
    ])
    expect(classification.rows[0].requiredUnmappedFields).toEqual([])
  })

  it('returns deterministic summary counts', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [
        ['A', 'kg', 1],
        ['', '', ''],
        ['B', 'kg', { x: 1 }],
      ],
      {},
    )

    expect(classification.summary).toEqual({
      totalRows: 3,
      structurallyValidRows: 2,
      structurallyBlockedRows: 1,
      warningRows: classification.summary.warningRows,
      fullyMappedRows: 3,
      partiallyMappedRows: 0,
      unmappedRows: 0,
      mappingCoverage: 'complete',
      tableValidationBlockingCount: 0,
      mappingBlockingCount: 0,
    })
    expect(classification.summary.warningRows).toBeGreaterThan(0)
  })

  it('attaches machine-readable issue references', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['A', 'kg', { bad: true }]],
      {},
    )

    expect(classification.rows[0].issueReferences.some((ref) => (
      ref.source === 'validation'
      && ref.code === 'UNSUPPORTED_CELL_VALUE'
      && ref.severity === 'error'
      && ref.sourceRowNumber === 2
    ))).toBe(true)
  })

  it('orders classified rows by source row number / rowIndex', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['A', 'kg', 1], ['B', 'kg', 2], ['C', 'kg', 3]],
      {},
    )

    expect(classification.rows.map((row) => row.sourceRowNumber)).toEqual([2, 3, 4])
    expect(classification.rows.map((row) => row.rowIndex)).toEqual([0, 1, 2])
  })

  it('does not generate timestamps or IDs', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['A', 'kg', 1]],
      {},
    )
    const serialized = JSON.stringify(classification)

    expect(serialized).not.toMatch(/createdAt|updatedAt|timestamp|uuid|random/i)
    expect(classification).not.toHaveProperty('id')
    expect(classification.rows[0]).not.toHaveProperty('id')
  })

  it('returns JSON-serializable classification output', () => {
    const { classification } = classifyFrom(
      COMPLETE_HEADERS,
      [['A', 'kg', { nested: true }], ['', '', '']],
      {},
    )

    expect(() => JSON.stringify(classification)).not.toThrow()
    expect(JSON.parse(JSON.stringify(classification))).toEqual(classification)
  })

  it('rejects invalid upstream results', () => {
    const parsedTable = parseInventoryImportTable({
      headers: COMPLETE_HEADERS,
      rows: [],
    })
    const validationResult = validateInventoryImportTable(parsedTable)
    const mappingResult = mapInventoryImportFields(parsedTable, validationResult, {})

    expect(() => classifyInventoryImport(null, validationResult, mappingResult))
      .toThrow(InventoryImportClassificationError)
    expect(() => classifyInventoryImport(parsedTable, null, mappingResult))
      .toThrow(InventoryImportClassificationError)
    expect(() => classifyInventoryImport(parsedTable, validationResult, null))
      .toThrow(InventoryImportClassificationError)
  })

  it('keeps locked parser, validator, and mapper sources unchanged by this sprint', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const classifierSource = readFileSync(join(dir, 'inventoryImportClassifier.js'), 'utf8')

    expect(classifierSource).not.toMatch(/supabase|fetch\(/i)
    expect(INVENTORY_IMPORT_TABULAR_PARSER_VERSION).toBe('import_tabular_parser_v1')
    expect(INVENTORY_IMPORT_VALIDATION_VERSION).toBe('import_validation_structural_v1')
    expect(INVENTORY_IMPORT_MAPPING_VERSION).toBe('import_mapping_v1')
  })
})

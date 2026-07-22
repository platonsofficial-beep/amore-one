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
  INVENTORY_IMPORT_APPROVED_HEADER_ALIASES,
  INVENTORY_IMPORT_CANONICAL_FIELDS,
  INVENTORY_IMPORT_MAPPING_VERSION,
  INVENTORY_IMPORT_REQUIRED_FIELDS,
  InventoryImportMappingError,
  mapInventoryImportFields,
  resolveApprovedHeaderAlias,
} from './inventoryImportFieldMapper'

function prepare(headers, rows, mappingDefinition) {
  const parsedTable = parseInventoryImportTable({ headers, rows })
  const validationResult = validateInventoryImportTable(parsedTable)
  const mappingResult = mapInventoryImportFields(
    parsedTable,
    validationResult,
    mappingDefinition,
  )
  return { parsedTable, validationResult, mappingResult }
}

describe('inventoryImportFieldMapper', () => {
  it('maps a clean explicit binding set', () => {
    const { mappingResult } = prepare(
      ['Product', 'Unit', 'Qty'],
      [['Ketel One', 'bottle', 12]],
      {
        bindings: [
          { sourceColumnIndex: 0, destinationField: 'name' },
          { sourceColumnIndex: 1, destinationField: 'unit' },
          { sourceColumnIndex: 2, destinationField: 'currentQuantity' },
        ],
      },
    )

    expect(mappingResult.mappingVersion).toBe(INVENTORY_IMPORT_MAPPING_VERSION)
    expect(mappingResult.summary.errorCount).toBe(0)
    expect(mappingResult.summary.requiredMissingCount).toBe(0)
    expect(['ok', 'has_info']).toContain(mappingResult.mappingStatus)
    expect(mappingResult.bindings).toEqual([
      expect.objectContaining({
        sourceColumnIndex: 0,
        destinationField: 'name',
        matchKind: 'explicit',
      }),
      expect.objectContaining({
        sourceColumnIndex: 1,
        destinationField: 'unit',
        matchKind: 'explicit',
      }),
      expect.objectContaining({
        sourceColumnIndex: 2,
        destinationField: 'currentQuantity',
        matchKind: 'explicit',
      }),
    ])
    expect(mappingResult.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('produces deterministic output for repeated calls', () => {
    const parsedTable = parseInventoryImportTable({
      headers: ['name', 'unit', 'currentQuantity'],
      rows: [['A', 'kg', 1]],
    })
    const validationResult = validateInventoryImportTable(parsedTable)

    const first = mapInventoryImportFields(parsedTable, validationResult, {})
    const second = mapInventoryImportFields(parsedTable, validationResult, {})

    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('does not mutate parser output, validator output, or mapping definition', () => {
    const parsedTable = parseInventoryImportTable({
      headers: ['name', 'unit', 'currentQuantity'],
      rows: [['A', 'kg', 1]],
    })
    const validationResult = validateInventoryImportTable(parsedTable)
    const mappingDefinition = {
      bindings: [
        { sourceColumnIndex: 0, destinationField: 'name' },
      ],
    }
    const parsedSnapshot = structuredClone(parsedTable)
    const validationSnapshot = structuredClone(validationResult)
    const mappingSnapshot = structuredClone(mappingDefinition)

    mapInventoryImportFields(parsedTable, validationResult, mappingDefinition)

    expect(parsedTable).toEqual(parsedSnapshot)
    expect(validationResult).toEqual(validationSnapshot)
    expect(mappingDefinition).toEqual(mappingSnapshot)
  })

  it('supports exact canonical field-name mapping and reports empty approved aliases', () => {
    expect(INVENTORY_IMPORT_APPROVED_HEADER_ALIASES).toEqual({})
    expect(resolveApprovedHeaderAlias('product')).toBeNull()
    expect(resolveApprovedHeaderAlias('name')).toBeNull()

    const { mappingResult } = prepare(
      ['name', 'unit', 'currentQuantity'],
      [['A', 'kg', 1]],
      {},
    )

    expect(mappingResult.bindings.map((binding) => binding.matchKind)).toEqual([
      'exact_field_name',
      'exact_field_name',
      'exact_field_name',
    ])
    expect(mappingResult.bindings.map((binding) => binding.destinationField)).toEqual([
      'name',
      'unit',
      'currentQuantity',
    ])
  })

  it('does not invent aliases for unknown headers like Product', () => {
    const { mappingResult } = prepare(
      ['Product', 'unit', 'currentQuantity'],
      [['A', 'kg', 1]],
      {},
    )

    expect(mappingResult.bindings.some((binding) => binding.destinationField === 'name')).toBe(false)
    expect(mappingResult.issues.some((issue) => (
      issue.code === 'REQUIRED_DESTINATION_UNMAPPED'
      && issue.destinationField === 'name'
    ))).toBe(true)
    expect(mappingResult.issues.some((issue) => (
      issue.code === 'UNMAPPED_SOURCE_COLUMN'
      && issue.sourceColumnIndex === 0
    ))).toBe(true)
  })

  it('detects duplicate destination mappings', () => {
    const { mappingResult } = prepare(
      ['A', 'B', 'unit', 'currentQuantity'],
      [['x', 'y', 'kg', 1]],
      {
        bindings: [
          { sourceColumnIndex: 0, destinationField: 'name' },
          { sourceColumnIndex: 1, destinationField: 'name' },
          { sourceColumnIndex: 2, destinationField: 'unit' },
          { sourceColumnIndex: 3, destinationField: 'currentQuantity' },
        ],
      },
    )

    expect(mappingResult.issues.some((issue) => (
      issue.code === 'DESTINATION_MAPPED_MORE_THAN_ONCE'
      && issue.severity === 'error'
      && issue.destinationField === 'name'
    ))).toBe(true)
  })

  it('reports unmapped source columns', () => {
    const { mappingResult } = prepare(
      ['name', 'unit', 'currentQuantity', 'Notes Extra'],
      [['A', 'kg', 1, 'x']],
      {},
    )

    expect(mappingResult.unmappedSourceColumns).toEqual([
      expect.objectContaining({
        sourceColumnIndex: 3,
        normalizedHeader: 'notes extra',
      }),
    ])
    expect(mappingResult.issues.some((issue) => (
      issue.code === 'UNMAPPED_SOURCE_COLUMN' && issue.severity === 'info'
    ))).toBe(true)
  })

  it('reports unused destination fields', () => {
    const { mappingResult } = prepare(
      ['name', 'unit', 'currentQuantity'],
      [['A', 'kg', 1]],
      {},
    )

    expect(mappingResult.unusedDestinationFields).toContain('category')
    expect(mappingResult.unusedDestinationFields).toContain('sku')
    expect(mappingResult.issues.some((issue) => (
      issue.code === 'UNUSED_DESTINATION_FIELD'
      && issue.destinationField === 'category'
      && issue.severity === 'info'
    ))).toBe(true)
  })

  it('enforces required field coverage from the V1 contract', () => {
    expect(INVENTORY_IMPORT_REQUIRED_FIELDS).toEqual([
      'name',
      'unit',
      'currentQuantity',
    ])

    const { mappingResult } = prepare(
      ['name', 'unit'],
      [['A', 'kg']],
      {},
    )

    expect(mappingResult.summary.requiredMissingCount).toBe(1)
    expect(mappingResult.issues.filter((issue) => issue.code === 'REQUIRED_DESTINATION_UNMAPPED'))
      .toEqual([
        expect.objectContaining({
          destinationField: 'currentQuantity',
          severity: 'error',
        }),
      ])
    expect(mappingResult.mappingStatus).toBe('has_errors')
  })

  it('orders issues and bindings stably', () => {
    const { mappingResult } = prepare(
      ['extra', 'unit', 'name', 'currentQuantity'],
      [['x', 'kg', 'A', 1]],
      {
        bindings: [
          { sourceColumnIndex: 2, destinationField: 'name' },
        ],
      },
    )

    expect(mappingResult.bindings.map((binding) => binding.sourceColumnIndex))
      .toEqual([1, 2, 3])

    const keys = mappingResult.issues.map((issue) => ([
      issue.scope,
      issue.sourceColumnIndex,
      issue.destinationField,
      issue.code,
    ]))
    const sorted = keys.slice().sort((left, right) => {
      const scopeRank = { mapping: 0, destination: 1, source: 2 }
      if (scopeRank[left[0]] !== scopeRank[right[0]]) {
        return scopeRank[left[0]] - scopeRank[right[0]]
      }
      if ((left[1] ?? -1) !== (right[1] ?? -1)) return (left[1] ?? -1) - (right[1] ?? -1)
      const fieldCmp = String(left[2] ?? '').localeCompare(String(right[2] ?? ''))
      if (fieldCmp !== 0) return fieldCmp
      return String(left[3]).localeCompare(String(right[3]))
    })
    expect(keys).toEqual(sorted)
  })

  it('returns a deterministic mapping summary', () => {
    const { mappingResult } = prepare(
      ['name', 'unit', 'currentQuantity', 'Extra'],
      [['A', 'kg', 1, 'z']],
      {},
    )

    expect(mappingResult.summary).toEqual({
      totalIssueCount: mappingResult.issues.length,
      errorCount: 0,
      warningCount: 0,
      infoCount: mappingResult.issues.length,
      bindingCount: 3,
      unmappedSourceColumnCount: 1,
      unusedDestinationFieldCount: INVENTORY_IMPORT_CANONICAL_FIELDS.length - 3,
      requiredFieldCount: 3,
      requiredMappedCount: 3,
      requiredMissingCount: 0,
      mappingStatus: 'has_info',
    })
  })

  it('emits machine-readable mapping issues with required evidence fields', () => {
    const { mappingResult } = prepare(
      ['Product'],
      [['A']],
      {
        bindings: [
          { sourceColumnIndex: 0, destinationField: 'notAField' },
        ],
      },
    )

    const unknown = mappingResult.issues.find((issue) => issue.code === 'UNKNOWN_DESTINATION_FIELD')
    expect(unknown).toMatchObject({
      code: 'UNKNOWN_DESTINATION_FIELD',
      severity: 'error',
      scope: 'destination',
      sourceColumnIndex: 0,
      sourceHeader: 'Product',
      destinationField: 'notAField',
    })
    expect(typeof unknown.message).toBe('string')
  })

  it('does not return Apply eligibility flags', () => {
    const { mappingResult } = prepare(
      ['name', 'unit', 'currentQuantity'],
      [['A', 'kg', 1]],
      {},
    )

    expect(mappingResult).not.toHaveProperty('canApply')
    expect(mappingResult).not.toHaveProperty('readyToImport')
    expect(mappingResult).not.toHaveProperty('importable')
    expect(mappingResult.summary).not.toHaveProperty('canApply')
  })

  it('does not generate timestamps or IDs', () => {
    const { mappingResult } = prepare(
      ['name', 'unit', 'currentQuantity'],
      [['A', 'kg', 1]],
      {},
    )
    const serialized = JSON.stringify(mappingResult)

    expect(serialized).not.toMatch(/createdAt|updatedAt|timestamp|uuid|random/i)
    expect(mappingResult).not.toHaveProperty('id')
  })

  it('rejects invalid parser or validation inputs deliberately', () => {
    const parsedTable = parseInventoryImportTable({
      headers: ['name'],
      rows: [],
    })
    const validationResult = validateInventoryImportTable(parsedTable)

    expect(() => mapInventoryImportFields(null, validationResult, {}))
      .toThrow(InventoryImportMappingError)
    expect(() => mapInventoryImportFields(parsedTable, null, {}))
      .toThrow(InventoryImportMappingError)
    expect(() => mapInventoryImportFields(
      { ...parsedTable, parserVersion: 'other' },
      validationResult,
      {},
    )).toThrow(InventoryImportMappingError)
  })

  it('returns JSON-serializable mapping output', () => {
    const { mappingResult } = prepare(
      ['name', 'unit', 'currentQuantity', 'Extra'],
      [['A', 'kg', 1, { nested: true }]],
      {},
    )

    expect(() => JSON.stringify(mappingResult)).not.toThrow()
    expect(JSON.parse(JSON.stringify(mappingResult))).toEqual(mappingResult)
  })

  it('keeps locked parser and validator module sources unchanged by this sprint', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const mapperSource = readFileSync(join(dir, 'inventoryImportFieldMapper.js'), 'utf8')

    expect(mapperSource).not.toMatch(/supabase|fetch\(/i)
    expect(INVENTORY_IMPORT_TABULAR_PARSER_VERSION).toBe('import_tabular_parser_v1')
    expect(INVENTORY_IMPORT_VALIDATION_VERSION).toBe('import_validation_structural_v1')
  })
})

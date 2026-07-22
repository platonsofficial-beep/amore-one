// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  INVENTORY_IMPORT_TABULAR_PARSER_VERSION,
  InventoryImportParserError,
  normalizeInventoryImportCell,
  normalizeInventoryImportHeader,
  parseInventoryImportTable,
} from './inventoryImportTabularParser'

describe('inventoryImportTabularParser', () => {
  it('parses a normal header plus multiple rows deterministically', () => {
    const result = parseInventoryImportTable({
      headers: ['Product', 'Unit', 'Qty'],
      rows: [
        ['Ketel One', 'bottle', 12],
        ['Lime', 'kg', 3],
      ],
    })

    expect(result.parserVersion).toBe(INVENTORY_IMPORT_TABULAR_PARSER_VERSION)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].cells.map((cell) => cell.normalized.value)).toEqual([
      'Ketel One',
      'bottle',
      12,
    ])
    expect(result.rows[1].cells.map((cell) => cell.normalized.value)).toEqual([
      'Lime',
      'kg',
      3,
    ])
  })

  it('preserves source column order', () => {
    const result = parseInventoryImportTable({
      headers: ['C', 'A', 'B'],
      rows: [['c', 'a', 'b']],
    })

    expect(result.headers.map((header) => header.sourceHeader)).toEqual(['C', 'A', 'B'])
    expect(result.rows[0].cells.map((cell) => cell.sourceHeader)).toEqual(['C', 'A', 'B'])
  })

  it('preserves source row order', () => {
    const result = parseInventoryImportTable({
      headers: ['Name'],
      rows: [['first'], ['second'], ['third']],
    })

    expect(result.rows.map((row) => row.cells[0].normalized.value)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('does not mutate input arrays', () => {
    const headers = ['Name', 'Unit']
    const row = ['A', 'bottle']
    const rows = [row]
    const headersCopy = headers.slice()
    const rowCopy = row.slice()

    parseInventoryImportTable({ headers, rows })

    expect(headers).toEqual(headersCopy)
    expect(row).toEqual(rowCopy)
    expect(rows[0]).toBe(row)
  })

  it('trims headers and normalizes comparison keys', () => {
    expect(normalizeInventoryImportHeader('  Product Name  ')).toBe('product name')
    expect(normalizeInventoryImportHeader('Product\t\tName')).toBe('product name')

    const result = parseInventoryImportTable({
      headers: ['  Product Name  '],
      rows: [],
    })

    expect(result.headers[0].sourceHeader).toBe('  Product Name  ')
    expect(result.headers[0].normalized).toBe('product name')
  })

  it('detects blank headers', () => {
    const result = parseInventoryImportTable({
      headers: ['Name', '   ', ''],
      rows: [],
    })

    expect(result.summary.blankHeaderCount).toBe(2)
    expect(result.headers[1].isBlank).toBe(true)
    expect(result.headers[2].isBlank).toBe(true)
    expect(result.headerIssues.some((issue) => issue.code === 'BLANK_HEADER')).toBe(true)
  })

  it('detects duplicate normalized headers', () => {
    const result = parseInventoryImportTable({
      headers: ['Name', 'Unit', 'Name'],
      rows: [],
    })

    expect(result.summary.duplicateNormalizedHeaderCount).toBe(2)
    expect(result.headers[0].isDuplicate).toBe(true)
    expect(result.headers[2].isDuplicate).toBe(true)
    expect(result.headers[1].isDuplicate).toBe(false)
  })

  it('treats headers that differ only by case as duplicates', () => {
    const result = parseInventoryImportTable({
      headers: ['Product', 'product'],
      rows: [],
    })

    expect(result.summary.duplicateNormalizedHeaderCount).toBe(2)
    expect(result.headerIssues.filter((issue) => issue.code === 'DUPLICATE_NORMALIZED_HEADER'))
      .toHaveLength(2)
  })

  it('treats headers that differ only by surrounding or repeated whitespace as duplicates', () => {
    const result = parseInventoryImportTable({
      headers: ['Stock Name', '  stock   name  '],
      rows: [],
    })

    expect(result.headers.map((header) => header.normalized)).toEqual([
      'stock name',
      'stock name',
    ])
    expect(result.summary.duplicateNormalizedHeaderCount).toBe(2)
  })

  it('normalizes empty string cells to a stable empty representation', () => {
    expect(normalizeInventoryImportCell('')).toEqual({
      kind: 'empty',
      value: null,
      raw: '',
    })
    expect(normalizeInventoryImportCell('   ')).toEqual({
      kind: 'empty',
      value: null,
      raw: '   ',
    })
  })

  it('handles null and undefined cells deterministically', () => {
    expect(normalizeInventoryImportCell(null)).toEqual({
      kind: 'empty',
      value: null,
      raw: null,
    })
    expect(normalizeInventoryImportCell(undefined)).toEqual({
      kind: 'empty',
      value: null,
      raw: undefined,
    })
  })

  it('preserves numeric scalars without locale reformatting', () => {
    expect(normalizeInventoryImportCell(12.5)).toEqual({
      kind: 'number',
      value: 12.5,
      raw: 12.5,
    })
    expect(normalizeInventoryImportCell(0)).toEqual({
      kind: 'number',
      value: 0,
      raw: 0,
    })
  })

  it('preserves boolean scalars without guessing from text', () => {
    expect(normalizeInventoryImportCell(true)).toEqual({
      kind: 'boolean',
      value: true,
      raw: true,
    })
    expect(normalizeInventoryImportCell('true')).toEqual({
      kind: 'string',
      value: 'true',
      raw: 'true',
    })
  })

  it('marks unsupported cell types without silent coercion', () => {
    const objectCell = normalizeInventoryImportCell({ a: 1 })
    const arrayCell = normalizeInventoryImportCell([1])
    const dateCell = normalizeInventoryImportCell(new Date('2026-01-01T00:00:00.000Z'))

    expect(objectCell.kind).toBe('unsupported')
    expect(objectCell.value).toBeNull()
    expect(objectCell.unsupportedType).toBe('object')
    expect(arrayCell.kind).toBe('unsupported')
    expect(arrayCell.unsupportedType).toBe('array')
    expect(dateCell.kind).toBe('unsupported')
    expect(dateCell.unsupportedType).toBe('date')

    const result = parseInventoryImportTable({
      headers: ['Name'],
      rows: [[{ nested: true }]],
    })

    expect(result.rows[0].structuralIssues.some((issue) => issue.code === 'UNSUPPORTED_CELL_VALUE'))
      .toBe(true)
    expect(result.summary.structurallyProblematicRowCount).toBe(1)
  })

  it('detects completely blank rows without removing them', () => {
    const result = parseInventoryImportTable({
      headers: ['Name', 'Unit'],
      rows: [
        ['Keep', 'kg'],
        ['', null],
        [undefined, '   '],
      ],
    })

    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].isBlank).toBe(false)
    expect(result.rows[1].isBlank).toBe(true)
    expect(result.rows[2].isBlank).toBe(true)
    expect(result.summary.blankRowCount).toBe(2)
  })

  it('handles rows with fewer cells than headers', () => {
    const result = parseInventoryImportTable({
      headers: ['Name', 'Unit', 'Qty'],
      rows: [['OnlyName']],
    })

    expect(result.rows[0].missingColumnIndexes).toEqual([1, 2])
    expect(result.rows[0].cells).toHaveLength(3)
    expect(result.rows[0].cells[1].isMissing).toBe(true)
    expect(result.rows[0].cells[1].normalized).toEqual({
      kind: 'empty',
      value: null,
      raw: undefined,
    })
    expect(result.rows[0].structuralIssues.some((issue) => issue.code === 'MISSING_CELL')).toBe(true)
  })

  it('handles rows with more cells than headers and keeps overflow values', () => {
    const result = parseInventoryImportTable({
      headers: ['Name'],
      rows: [['A', 'extra-1', 'extra-2']],
    })

    expect(result.rows[0].overflowCells).toHaveLength(2)
    expect(result.rows[0].overflowCells.map((cell) => cell.normalized.value)).toEqual([
      'extra-1',
      'extra-2',
    ])
    expect(result.rows[0].structuralIssues.filter((issue) => issue.code === 'OVERFLOW_CELL'))
      .toHaveLength(2)
  })

  it('does not silently discard overflow values', () => {
    const result = parseInventoryImportTable({
      headers: ['A', 'B'],
      rows: [['1', '2', 'kept-overflow']],
    })

    expect(result.rows[0].overflowCells[0].raw).toBe('kept-overflow')
    expect(JSON.stringify(result)).toContain('kept-overflow')
  })

  it('uses stable source row numbering accounting for the header row', () => {
    const defaultHeader = parseInventoryImportTable({
      headers: ['Name'],
      rows: [['a'], ['b']],
    })
    expect(defaultHeader.rows.map((row) => row.sourceRowNumber)).toEqual([2, 3])
    expect(defaultHeader.headerRowNumber).toBe(1)

    const customHeader = parseInventoryImportTable({
      headers: ['Name'],
      rows: [['a']],
      headerRowNumber: 4,
    })
    expect(customHeader.rows[0].sourceRowNumber).toBe(5)
  })

  it('returns deterministic structural summary counts', () => {
    const result = parseInventoryImportTable({
      headers: ['Name', 'Name', ''],
      rows: [
        ['ok', 'x', 'y'],
        ['', '', ''],
        ['short'],
        ['a', 'b', 'c', 'overflow'],
      ],
    })

    expect(result.summary).toEqual({
      sourceColumnCount: 3,
      sourceRowCount: 4,
      blankRowCount: 1,
      structurallyValidRowCount: 2,
      structurallyProblematicRowCount: 2,
      blankHeaderCount: 1,
      duplicateNormalizedHeaderCount: 2,
    })
  })

  it('supports an empty data-row collection', () => {
    const result = parseInventoryImportTable({
      headers: ['Name'],
      rows: [],
    })

    expect(result.rows).toEqual([])
    expect(result.summary.sourceRowCount).toBe(0)
    expect(result.summary.blankRowCount).toBe(0)
  })

  it('rejects structurally invalid top-level input', () => {
    expect(() => parseInventoryImportTable(null)).toThrow(InventoryImportParserError)
    expect(() => parseInventoryImportTable([])).toThrow(InventoryImportParserError)
    expect(() => parseInventoryImportTable({ rows: [] })).toThrow(InventoryImportParserError)
    expect(() => parseInventoryImportTable({ headers: 'Name', rows: [] })).toThrow(
      InventoryImportParserError,
    )
    expect(() => parseInventoryImportTable({ headers: [], rows: [] })).toThrow(
      InventoryImportParserError,
    )
    expect(() => parseInventoryImportTable({ headers: ['Name'], rows: {} })).toThrow(
      InventoryImportParserError,
    )
    expect(() => parseInventoryImportTable({ headers: ['Name'], rows: ['bad'] })).toThrow(
      InventoryImportParserError,
    )

    try {
      parseInventoryImportTable({ headers: [] })
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryImportParserError)
      expect(error.code).toBe('MISSING_HEADERS')
    }
  })

  it('returns deeply equivalent output for repeated identical inputs', () => {
    const input = {
      headers: ['Name', 'Qty'],
      rows: [
        ['A', 1],
        ['', null],
        ['B', true],
      ],
    }

    const first = parseInventoryImportTable(input)
    const second = parseInventoryImportTable(input)

    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('does not generate timestamps or random identifiers in output', () => {
    const result = parseInventoryImportTable({
      headers: ['Name'],
      rows: [['A']],
    })
    const serialized = JSON.stringify(result)

    expect(serialized).not.toMatch(/createdAt|updatedAt|timestamp|uuid|random/i)
    expect(result).not.toHaveProperty('id')
    expect(result.rows[0]).not.toHaveProperty('id')
    expect(Object.keys(result).sort()).toEqual([
      'headerIssues',
      'headerRowNumber',
      'headers',
      'parserVersion',
      'rows',
      'summary',
    ].sort())
  })
})

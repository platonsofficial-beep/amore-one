/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import {
  InventoryImportDecoderError,
  decodeInventoryImportFile,
  parseInventoryImportCsvText,
} from './inventoryImportFileDecoder'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * @param {string} name
 * @param {unknown[][]} matrix
 * @param {'xlsx'|'xls'} bookType
 */
function createSpreadsheetFile(name, matrix, bookType = 'xlsx') {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(matrix)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory')
  const bytes = XLSX.write(workbook, { type: 'array', bookType })
  const type = bookType === 'xls'
    ? 'application/vnd.ms-excel'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return new File([bytes], name, { type })
}

describe('parseInventoryImportCsvText', () => {
  it('parses a simple CSV with headers and rows in source order', () => {
    const matrix = parseInventoryImportCsvText('Name,Unit,Qty\nFlour,kg,10\nSugar,kg,2\n')
    expect(matrix).toEqual([
      ['Name', 'Unit', 'Qty'],
      ['Flour', 'kg', '10'],
      ['Sugar', 'kg', '2'],
    ])
  })

  it('supports quoted commas and escaped double quotes', () => {
    const matrix = parseInventoryImportCsvText('Name,Note\n"Flour, AP","""Grade A"""\n')
    expect(matrix).toEqual([
      ['Name', 'Note'],
      ['Flour, AP', '"Grade A"'],
    ])
  })

  it('supports CRLF and LF line endings', () => {
    expect(parseInventoryImportCsvText('A,B\r\n1,2\r\n')).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ])
    expect(parseInventoryImportCsvText('A,B\n1,2\n')).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ])
  })

  it('preserves empty cells, trailing empty cells, and blank rows', () => {
    const matrix = parseInventoryImportCsvText('A,B,C\n1,,3\n,,\n4,5,\n')
    expect(matrix).toEqual([
      ['A', 'B', 'C'],
      ['1', '', '3'],
      ['', '', ''],
      ['4', '5', ''],
    ])
  })

  it('strips a UTF-8 BOM', () => {
    const matrix = parseInventoryImportCsvText('\uFEFFName,Unit\nSalt,g\n')
    expect(matrix[0]).toEqual(['Name', 'Unit'])
    expect(matrix[1]).toEqual(['Salt', 'g'])
  })

  it('rejects malformed unclosed quotes', () => {
    expect(() => parseInventoryImportCsvText('Name\n"open\n')).toThrow(InventoryImportDecoderError)
    try {
      parseInventoryImportCsvText('Name\n"open\n')
    } catch (error) {
      expect(error.code).toBe('MALFORMED_CSV')
    }
  })
})

describe('decodeInventoryImportFile', () => {
  it('decodes a valid CSV File into parser-compatible tabular data', async () => {
    const file = new File(['Name,Unit\nFlour,kg\n'], 'stock.csv', { type: 'text/csv' })
    const decoded = await decodeInventoryImportFile(file)

    expect(decoded).toEqual({
      headers: ['Name', 'Unit'],
      rows: [['Flour', 'kg']],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    })
  })

  it('decodes a valid XLSX workbook using the first worksheet only', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Name', 'Qty'],
        ['Flour', 10],
        ['Sugar', 2],
      ]),
      'First',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Ignored', 'Sheet'],
        ['Nope', 99],
      ]),
      'Second',
    )
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const file = new File([bytes], 'inventory.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const decoded = await decodeInventoryImportFile(file)
    expect(decoded.sourceFormat).toBe('xlsx')
    expect(decoded.headerRowNumber).toBe(1)
    expect(decoded.headers).toEqual(['Name', 'Qty'])
    expect(decoded.rows).toEqual([
      ['Flour', 10],
      ['Sugar', 2],
    ])
  })

  it('decodes a valid XLS workbook path with the same SheetJS API', async () => {
    const file = createSpreadsheetFile(
      'legacy.xls',
      [
        ['Name', 'Unit'],
        ['Oil', 'L'],
      ],
      'xls',
    )
    const decoded = await decodeInventoryImportFile(file)
    expect(decoded.sourceFormat).toBe('xls')
    expect(decoded.headers).toEqual(['Name', 'Unit'])
    expect(decoded.rows).toEqual([['Oil', 'L']])
  })

  it('preserves spreadsheet source order, scalars, blanks, and uneven rows', async () => {
    const file = createSpreadsheetFile('matrix.xlsx', [
      ['A', 'B', 'C'],
      ['x', null, 3],
      ['only'],
      [true, false],
    ])
    const decoded = await decodeInventoryImportFile(file)

    expect(decoded.headers).toEqual(['A', 'B', 'C'])
    expect(decoded.rows[0]).toEqual(['x', null, 3])
    expect(decoded.rows[1]).toEqual(['only'])
    expect(decoded.rows[2]).toEqual([true, false])
    expect(typeof decoded.rows[0][2]).toBe('number')
    expect(typeof decoded.rows[2][0]).toBe('boolean')
  })

  it('rejects a workbook with no worksheets', async () => {
    const file = createSpreadsheetFile('empty-ish.xlsx', [['A'], ['1']])

    await expect(decodeInventoryImportFile(file, {
      readWorkbook: () => ({ SheetNames: [], Sheets: {} }),
    })).rejects.toMatchObject({
      name: 'InventoryImportDecoderError',
      code: 'NO_WORKSHEETS',
    })
  })

  it('does not mutate the File input object', async () => {
    const file = new File(['Name\nA\n'], 'items.csv', { type: 'text/csv' })
    const before = { name: file.name, size: file.size, type: file.type }
    await decodeInventoryImportFile(file)
    expect(file.name).toBe(before.name)
    expect(file.size).toBe(before.size)
    expect(file.type).toBe(before.type)
  })

  it('rejects unsupported extensions', async () => {
    const file = new File(['{}'], 'notes.json', { type: 'application/json' })
    await expect(decodeInventoryImportFile(file)).rejects.toMatchObject({
      code: 'UNSUPPORTED_EXTENSION',
    })
  })

  it('returns deterministic output for equivalent CSV bytes', async () => {
    const bytes = 'Name,Unit\nFlour,kg\n'
    const a = await decodeInventoryImportFile(new File([bytes], 'a.csv', { type: 'text/csv' }))
    const b = await decodeInventoryImportFile(new File([bytes], 'b.csv', { type: 'text/csv' }))
    expect(a).toEqual(b)
  })

  it('does not use FileReader, network, or Supabase', () => {
    const source = readFileSync(join(HERE, 'inventoryImportFileDecoder.js'), 'utf8')
    expect(source).not.toMatch(/FileReader/)
    expect(source).not.toMatch(/fetch\(/)
    expect(source).not.toMatch(/supabase/i)
    expect(source).not.toMatch(/from ['"].*services\//)
    expect(source).not.toMatch(/from ['"].*inventoryImportTabularParser/)
    expect(source).not.toMatch(/stockCsvImport/)
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INVENTORY_IMPORT_FORMAT,
  INVENTORY_IMPORT_FORMAT_MAX_ROW_SAMPLE,
  detectInventoryImportFormat,
  normalizeInventoryImportFormatHeader,
} from './inventoryImportFormatDetector'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Anonymized AMORE-style operational weekly stock sheet fixture. */
const AMORE_STYLE_HEADERS = [
  '',
  'Storage Tasos',
  'BAR',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'Order',
  'Stock Control',
]

const AMORE_STYLE_ROWS = [
  ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
  ['Product Alpha', 2, 1, '', '', '', '', '', '', '', '', ''],
  ['Product Beta', 0, 3, '', '', '', '', '', '', '', '', ''],
  ['GIN', '', '', '', '', '', '', '', '', '', '', ''],
  ['Product Gamma', 1, 0, '', '', '', '', '', '', '', '', ''],
  ['TEQUILA', '', '', '', '', '', '', '', '', '', '', ''],
  ['Product Delta', 4, 2, '', '', '', '', '', '', '', '', ''],
]

describe('detectInventoryImportFormat', () => {
  it('classifies AMORE-style headers as operational_weekly_stock_sheet', () => {
    const result = detectInventoryImportFormat({
      headers: AMORE_STYLE_HEADERS,
      rows: AMORE_STYLE_ROWS,
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })

    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.OPERATIONAL)
    expect(result.label).toBe('Operational Weekly Stock Sheet')
    expect(result.signals.weekdayCount).toBe(7)
    expect(result.evidence).toEqual([
      '7 weekday columns detected',
      'Storage-related column detected',
      'Bar column detected',
      'Order column detected',
      'Stock Control column detected',
      'Category-separator row pattern detected',
    ])
    expect(result.summary).not.toMatch(/%/)
    expect(JSON.stringify(result)).not.toMatch(/\d{2,3}%/)
  })

  it('treats four or more weekday headers as a strong weekly signal', () => {
    const result = detectInventoryImportFormat({
      headers: ['Item', 'Storage', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      rows: [['Alpha', 1, '', '', '', '']],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.signals.weekdayCount).toBe(4)
    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.OPERATIONAL)
  })

  it('does not classify a single weekday header as operational', () => {
    const result = detectInventoryImportFormat({
      headers: ['Name', 'Quantity', 'Monday'],
      rows: [['Flour', 2, '']],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    })
    expect(result.format).not.toBe(INVENTORY_IMPORT_FORMAT.OPERATIONAL)
    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.STANDARD)
  })

  it('detects storage-prefixed custom headers such as Storage Tasos', () => {
    expect(normalizeInventoryImportFormatHeader('Storage Tasos')).toBe('storage tasos')
    const result = detectInventoryImportFormat({
      headers: AMORE_STYLE_HEADERS,
      rows: AMORE_STYLE_ROWS,
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.signals.hasStorage).toBe(true)
    expect(result.evidence).toContain('Storage-related column detected')
  })

  it('detects BAR, Order, and Stock Control operational signals', () => {
    const result = detectInventoryImportFormat({
      headers: AMORE_STYLE_HEADERS,
      rows: AMORE_STYLE_ROWS,
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.signals.hasBar).toBe(true)
    expect(result.signals.hasOrder).toBe(true)
    expect(result.signals.hasStockControl).toBe(true)
  })

  it('detects category-separator structure without depending on drink name literals', () => {
    const result = detectInventoryImportFormat({
      headers: [
        '',
        'Storage Room',
        'Bar',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
      ],
      rows: [
        ['SECTION A', '', '', '', '', '', '', ''],
        ['Item One', 1, 0, '', '', '', '', ''],
        ['SECTION B', '', '', '', '', '', '', ''],
        ['Item Two', 2, 1, '', '', '', '', ''],
      ],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.OPERATIONAL)
    expect(result.signals.categorySeparatorCount).toBeGreaterThanOrEqual(2)
    expect(result.evidence).toContain('Category-separator row pattern detected')
  })

  it('does not classify weekday-only schedule tables as operational inventory', () => {
    const result = detectInventoryImportFormat({
      headers: ['Employee', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      rows: [
        ['Alex', '9-5', '9-5', 'off', '9-5', '9-5', 'off', 'off'],
        ['Sam', 'off', '9-5', '9-5', '9-5', 'off', '9-5', 'off'],
      ],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.UNKNOWN)
  })

  it('does not classify operational headers alone as operational weekly sheet', () => {
    const result = detectInventoryImportFormat({
      headers: ['Storage', 'Bar', 'Order', 'Stock Control'],
      rows: [['Shelf A', 1, 2, 3]],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.UNKNOWN)
  })

  it('classifies flat product + quantity headers as standard inventory table', () => {
    const result = detectInventoryImportFormat({
      headers: ['Product Name', 'Quantity', 'Unit'],
      rows: [['Flour', 10, 'kg']],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    })
    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.STANDARD)
    expect(result.label).toBe('Standard Inventory Table')
    expect(result.evidence[0]).toBe('Product-name column pattern detected')
  })

  it('classifies product + SKU and item + barcode as standard', () => {
    expect(detectInventoryImportFormat({
      headers: ['Product', 'SKU'],
      rows: [['Flour', 'F-1']],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    }).format).toBe(INVENTORY_IMPORT_FORMAT.STANDARD)

    expect(detectInventoryImportFormat({
      headers: ['Item', 'Barcode'],
      rows: [['Salt', '123']],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    }).format).toBe(INVENTORY_IMPORT_FORMAT.STANDARD)
  })

  it('does not treat Stock Control alone as a standard inventory table', () => {
    const result = detectInventoryImportFormat({
      headers: ['Stock Control'],
      rows: [[12]],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.UNKNOWN)
  })

  it('returns unknown_layout for ambiguous or empty tables', () => {
    expect(detectInventoryImportFormat({
      headers: ['Alpha', 'Beta'],
      rows: [['x', 'y']],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    }).format).toBe(INVENTORY_IMPORT_FORMAT.UNKNOWN)

    expect(detectInventoryImportFormat({
      headers: [],
      rows: [],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    }).format).toBe(INVENTORY_IMPORT_FORMAT.UNKNOWN)

    expect(detectInventoryImportFormat({
      headers: [],
      rows: [],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    }).evidence).toEqual([])
  })

  it('handles non-string scalar headers safely and does not mutate input', () => {
    const headers = ['Name', 'Quantity', 12, true, null]
    const rows = [['Flour', 1, 9, false, null]]
    const snapshot = JSON.stringify({ headers, rows })

    const result = detectInventoryImportFormat({
      headers,
      rows,
      headerRowNumber: 1,
      sourceFormat: 'csv',
    })

    expect(result.format).toBe(INVENTORY_IMPORT_FORMAT.STANDARD)
    expect(JSON.stringify({ headers, rows })).toBe(snapshot)
  })

  it('is deterministic for equivalent inputs and keeps evidence ordered', () => {
    const input = {
      headers: AMORE_STYLE_HEADERS,
      rows: AMORE_STYLE_ROWS,
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    }
    const a = detectInventoryImportFormat(input)
    const b = detectInventoryImportFormat(input)
    expect(a).toEqual(b)
    expect(a.evidence).toEqual(b.evidence)
  })

  it('enforces a bounded row sample for category scanning', () => {
    const rows = Array.from({ length: 200 }, (_, index) => (
      index % 2 === 0
        ? [`SECTION ${index}`, '', '', '', '', '']
        : [`Item ${index}`, 1, 0, '', '', '']
    ))
    const result = detectInventoryImportFormat({
      headers: ['', 'Storage', 'Bar', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      rows,
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })
    expect(result.signals.sampledRowCount).toBe(INVENTORY_IMPORT_FORMAT_MAX_ROW_SAMPLE)
    expect(result.signals.sampledRowCount).toBeLessThanOrEqual(80)
  })

  it('has no parser, validator, mapper, classifier, services, or network imports', () => {
    const source = readFileSync(join(HERE, 'inventoryImportFormatDetector.js'), 'utf8')
    expect(source).not.toMatch(/inventoryImportTabularParser/)
    expect(source).not.toMatch(/inventoryImportTableValidator/)
    expect(source).not.toMatch(/inventoryImportFieldMapper/)
    expect(source).not.toMatch(/inventoryImportClassifier/)
    expect(source).not.toMatch(/inventoryImportFileDecoder/)
    expect(source).not.toMatch(/from ['"].*services\//)
    expect(source).not.toMatch(/supabase/i)
    expect(source).not.toMatch(/fetch\(/)
    expect(source).not.toMatch(/localStorage|sessionStorage/)
    expect(source).not.toMatch(/\d{2,3}% confidence|AI detected/i)
  })
})

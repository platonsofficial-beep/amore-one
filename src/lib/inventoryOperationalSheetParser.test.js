/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseInventoryOperationalSheet,
} from './inventoryOperationalSheetParser'

const HERE = dirname(fileURLToPath(import.meta.url))

const OPERATIONAL_HEADERS = [
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

describe('parseInventoryOperationalSheet', () => {
  it('detects categories and groups products correctly', () => {
    const result = parseInventoryOperationalSheet({
      headers: OPERATIONAL_HEADERS,
      rows: [
        ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
        ['Product Alpha', 2, 1, '', '', '', '', '', '', '', 3, 4],
        ['Product Beta', 0, 3, 1, '', '', '', '', '', '', '', ''],
        ['GIN', '', '', '', '', '', '', '', '', '', '', ''],
        ['Product Gamma', 1, 0, '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', ''],
        ['SECTION PAD', '', '', '', '', '', '', '', '', '', '', ''],
      ],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })

    expect(result.categories).toHaveLength(3)
    expect(result.categories[0].name).toBe('VODKA')
    expect(result.categories[0].products).toHaveLength(2)
    expect(result.categories[0].products[0]).toMatchObject({
      name: 'Product Alpha',
      storage: 2,
      bar: 1,
      order: 3,
      stockControl: 4,
    })
    expect(result.categories[0].products[0].weekdays.monday).toBeNull()
    expect(result.categories[0].products[1].weekdays.monday).toBe(1)
    expect(result.categories[1].name).toBe('GIN')
    expect(result.categories[1].products[0].name).toBe('Product Gamma')
    expect(result.categories[2].name).toBe('SECTION PAD')
    expect(result.categories[2].products).toHaveLength(0)
    expect(result.summary).toEqual({
      categoryCount: 3,
      productCount: 3,
    })
  })

  it('supports multiple independent category labels by structure, not drink literals', () => {
    const result = parseInventoryOperationalSheet({
      headers: OPERATIONAL_HEADERS,
      rows: [
        ['SECTION A', '', '', '', '', '', '', '', '', '', '', ''],
        ['Item One', 5, 2, '', '', '', '', '', '', '', '', ''],
        ['SECTION B', '', '', '', '', '', '', '', '', '', '', ''],
        ['Item Two', 1, 1, '', '', '', '', '', '', '', 9, 8],
      ],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })

    expect(result.categories.map((category) => category.name)).toEqual([
      'SECTION A',
      'SECTION B',
    ])
    expect(result.categories[0].products[0].storage).toBe(5)
    expect(result.categories[0].products[0].bar).toBe(2)
    expect(result.categories[1].products[0].order).toBe(9)
    expect(result.categories[1].products[0].stockControl).toBe(8)
  })

  it('ignores blank and trailing padding rows', () => {
    const result = parseInventoryOperationalSheet({
      headers: OPERATIONAL_HEADERS,
      rows: [
        ['', '', '', '', '', '', '', '', '', '', '', ''],
        ['RUM', '', '', '', '', '', '', '', '', '', '', ''],
        ['Spiced', 2, null, '', '', '', '', '', '', '', '', ''],
        [],
        ['', '', '', '', '', '', '', '', '', '', '', ''],
      ],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })

    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].products).toHaveLength(1)
    expect(result.categories[0].products[0].bar).toBeNull()
  })

  it('places products before the first category into an uncategorized group', () => {
    const result = parseInventoryOperationalSheet({
      headers: OPERATIONAL_HEADERS,
      rows: [
        ['Loose Item', 4, 1, '', '', '', '', '', '', '', '', ''],
        ['WHISKY', '', '', '', '', '', '', '', '', '', '', ''],
        ['Cask', 2, 2, '', '', '', '', '', '', '', '', ''],
      ],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })

    expect(result.categories[0].name).toBeNull()
    expect(result.categories[0].products[0].name).toBe('Loose Item')
    expect(result.categories[1].name).toBe('WHISKY')
    expect(result.categories[1].products[0].name).toBe('Cask')
  })

  it('preserves missing values as null and trims product names', () => {
    const result = parseInventoryOperationalSheet({
      headers: OPERATIONAL_HEADERS,
      rows: [
        ['COGNAC', '', '', '', '', '', '', '', '', '', '', ''],
        ['  Fine Bottle  ', '', '', '', '2', '', '', '', '', '', '', ''],
      ],
      headerRowNumber: 1,
      sourceFormat: 'xlsx',
    })

    const product = result.categories[0].products[0]
    expect(product.name).toBe('Fine Bottle')
    expect(product.storage).toBeNull()
    expect(product.bar).toBeNull()
    expect(product.weekdays.tuesday).toBe('2')
    expect(product.weekdays.wednesday).toBeNull()
    expect(product.order).toBeNull()
    expect(product.stockControl).toBeNull()
  })

  it('is deterministic and does not mutate input', () => {
    const headers = OPERATIONAL_HEADERS.slice()
    const rows = [
      ['TEQUILA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Repo', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    ]
    const snapshot = JSON.stringify({ headers, rows })

    const a = parseInventoryOperationalSheet({ headers, rows, headerRowNumber: 1, sourceFormat: 'xlsx' })
    const b = parseInventoryOperationalSheet({ headers, rows, headerRowNumber: 1, sourceFormat: 'xlsx' })

    expect(a).toEqual(b)
    expect(JSON.stringify({ headers, rows })).toBe(snapshot)
    expect(a.categories[0].products[0].weekdays).toEqual({
      monday: 3,
      tuesday: 4,
      wednesday: 5,
      thursday: 6,
      friday: 7,
      saturday: 8,
      sunday: 9,
    })
  })

  it('has no decoder, detector, parser, validator, mapper, classifier, or service imports', () => {
    const source = readFileSync(join(HERE, 'inventoryOperationalSheetParser.js'), 'utf8')
    expect(source).not.toMatch(/inventoryImportFileDecoder/)
    expect(source).not.toMatch(/inventoryImportFormatDetector/)
    expect(source).not.toMatch(/inventoryImportTabularParser/)
    expect(source).not.toMatch(/inventoryImportTableValidator/)
    expect(source).not.toMatch(/inventoryImportFieldMapper/)
    expect(source).not.toMatch(/inventoryImportClassifier/)
    expect(source).not.toMatch(/from ['"].*services\//)
    expect(source).not.toMatch(/supabase/i)
  })
})

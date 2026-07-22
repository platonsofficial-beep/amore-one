/**
 * P8.16.7 — Operational Product Matching Engine Foundation tests.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INVENTORY_OPERATIONAL_MATCH_CANDIDATE_LIMIT,
  INVENTORY_OPERATIONAL_MATCH_STATUS,
  INVENTORY_OPERATIONAL_PRODUCT_MATCHER_VERSION,
  InventoryOperationalProductMatcherError,
  matchInventoryOperationalProducts,
  normalizeInventoryOperationalProductName,
} from './inventoryOperationalProductMatcher.js'

const MATCHER_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'inventoryOperationalProductMatcher.js'),
  'utf8',
)

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? null,
    unit: partial.unit ?? 'Bottle 0.7L',
    sku: partial.sku ?? null,
    active: partial.active ?? true,
  }
}

function model(categories) {
  return { categories }
}

function category(name, products) {
  return { name, products }
}

function product(name, extras = {}) {
  return {
    name,
    storage: extras.storage ?? null,
    bar: extras.bar ?? null,
    weekdays: extras.weekdays ?? null,
    order: extras.order ?? null,
    stockControl: extras.stockControl ?? null,
  }
}

describe('matchInventoryOperationalProducts', () => {
  it('1. exact normalized-name match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [product('Belvedere')]),
      ]),
      existingStockItems: [
        stock({ id: 's1', name: 'Belvedere', category: 'Vodka' }),
      ],
    })

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].matchedStockItem?.id).toBe('s1')
    expect(result.matches[0].evidence).toContain('normalized_name_equal')
  })

  it('2. case-insensitive exact match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('BELVEDERE')])]),
      existingStockItems: [stock({ id: 's1', name: 'belvedere' })],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].normalizedSourceName).toBe('belvedere')
  })

  it('3. whitespace-normalized exact match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('  Absolut   Blue  ')])]),
      existingStockItems: [stock({ id: 's1', name: 'Absolut Blue' })],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].normalizedSourceName).toBe('absolut blue')
  })

  it('4. apostrophe normalization', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('WHISKY', [product('Maker\u2019s Mark')]),
      ]),
      existingStockItems: [stock({ id: 's1', name: "Maker's Mark" })],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
  })

  it('5. dash normalization', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('GIN', [product('Bombay\u2013Sapphire')]),
      ]),
      existingStockItems: [stock({ id: 's1', name: 'Bombay-Sapphire' })],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
  })

  it('6. original names preserved', () => {
    const sourceName = '  Belvedere  '
    const stockName = 'Belvedere'
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product(sourceName)])]),
      existingStockItems: [stock({ id: 's1', name: stockName })],
    })

    expect(result.matches[0].source.product.name).toBe(sourceName)
    expect(result.matches[0].matchedStockItem?.name).toBe(stockName)
  })

  it('7. no exact match becomes new_product', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Grey Goose')])]),
      existingStockItems: [stock({ id: 's1', name: 'Belvedere' })],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT)
    expect(result.matches[0].matchedStockItem).toBeNull()
    expect(result.matches[0].candidates).toEqual([])
    expect(result.matches[0].evidence).toContain('no_credible_candidate')
  })

  it('8. conservative possible match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Belvedere')])]),
      existingStockItems: [
        stock({ id: 's1', name: 'Belvedere Vodka', category: 'Vodka' }),
      ],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH)
    expect(result.matches[0].matchedStockItem).toBeNull()
    expect(result.matches[0].candidates).toHaveLength(1)
    expect(result.matches[0].candidates[0].stockItem.id).toBe('s1')
    expect(result.matches[0].evidence).toContain('shared_name_tokens')
    expect(result.matches[0].evidence.every((code) => typeof code === 'string')).toBe(true)
    expect(result.matches[0].evidence.join(' ')).not.toMatch(/%|confidence|percent/i)
  })

  it('9. unrelated products are not possible matches', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('GIN', [product('Tanqueray')])]),
      existingStockItems: [
        stock({ id: 's1', name: 'Bombay Sapphire' }),
        stock({ id: 's2', name: 'Absolut Blue' }),
      ],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT)
    expect(result.matches[0].candidates).toEqual([])
  })

  it('10. bottle size differences are not collapsed into exact match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('GIN', [product('Tanqueray')])]),
      existingStockItems: [stock({ id: 's1', name: 'Tanqueray 0.0' })],
    })

    expect(result.matches[0].status).not.toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].normalizedSourceName).not.toBe(
      normalizeInventoryOperationalProductName('Tanqueray 0.0'),
    )
  })

  it('11. age-statement differences are not collapsed into exact match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('WHISKY', [product('Chivas 12')])]),
      existingStockItems: [stock({ id: 's1', name: 'Chivas 18' })],
    })

    expect(result.matches[0].status).not.toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT)
  })

  it('12. flavour differences are not collapsed into exact match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('WHISKY', [product('Johnnie Walker Black')]),
      ]),
      existingStockItems: [
        stock({ id: 's1', name: 'Johnnie Walker Red' }),
      ],
    })

    expect(result.matches[0].status).not.toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT)
  })

  it('13. duplicate normalized existing names become possible_match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Belvedere')])]),
      existingStockItems: [
        stock({ id: 'a', name: 'Belvedere', category: 'Bar' }),
        stock({ id: 'b', name: 'BELVEDERE', category: 'Storage' }),
      ],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH)
    expect(result.matches[0].matchedStockItem).toBeNull()
    expect(result.matches[0].candidates).toHaveLength(2)
    expect(result.matches[0].evidence).toContain('duplicate_normalized_name')
  })

  it('14. duplicate candidates are not arbitrarily selected', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Belvedere')])]),
      existingStockItems: [
        stock({ id: 'inactive-id', name: 'Belvedere', active: false }),
        stock({ id: 'active-id', name: 'Belvedere', active: true }),
      ],
    })

    expect(result.matches[0].matchedStockItem).toBeNull()
    expect(result.matches[0].candidates.map((c) => c.stockItem.id).sort()).toEqual([
      'active-id',
      'inactive-id',
    ])
  })

  it('15. candidate ordering is deterministic', () => {
    const existingStockItems = [
      stock({ id: 'z', name: 'Absolut Blue Extra' }),
      stock({ id: 'a', name: 'Absolut' }),
      stock({ id: 'm', name: 'Absolut Blue Bottle' }),
    ]

    const first = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Absolut Blue')])]),
      existingStockItems,
    })
    const second = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Absolut Blue')])]),
      existingStockItems: [...existingStockItems].reverse(),
    })

    expect(first.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH)
    expect(first.matches[0].candidates.map((c) => c.stockItem.id)).toEqual(
      second.matches[0].candidates.map((c) => c.stockItem.id),
    )
  })

  it('16. candidate limit enforced', () => {
    const existingStockItems = Array.from({ length: 8 }, (_, index) => (
      stock({ id: `id-${index}`, name: `Belvedere Reserve ${index}` })
    ))

    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Belvedere')])]),
      existingStockItems,
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH)
    expect(result.matches[0].candidates.length).toBeLessThanOrEqual(
      INVENTORY_OPERATIONAL_MATCH_CANDIDATE_LIMIT,
    )
    expect(result.matches[0].candidates).toHaveLength(3)
  })

  it('17. category preserved', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [product('Belvedere')]),
      ]),
      existingStockItems: [stock({ id: 's1', name: 'Belvedere', category: 'Spirits' })],
    })

    expect(result.matches[0].source.category).toBe('VODKA')
  })

  it('18. uncategorized product supported', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category(null, [product('Belvedere')]),
      ]),
      existingStockItems: [stock({ id: 's1', name: 'Belvedere' })],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].source.category).toBeNull()
  })

  it('19. category alone cannot create a match', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [product('Mystery Spirit')]),
      ]),
      existingStockItems: [
        stock({ id: 's1', name: 'Completely Different', category: 'VODKA' }),
      ],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT)
  })

  it('20. inactive exact match remains detectable', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('GIN', [product('Tanqueray')])]),
      existingStockItems: [
        stock({ id: 's1', name: 'Tanqueray', active: false }),
      ],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)
    expect(result.matches[0].matchedStockItem?.active).toBe(false)
  })

  it('21. invalid null product name', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [product(null)]),
      ]),
      existingStockItems: [],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE)
    expect(result.matches[0].evidence).toContain('invalid_source_name')
  })

  it('22. invalid blank product name', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [product('   ')]),
      ]),
      existingStockItems: [],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE)
  })

  it('23. invalid row does not remove other rows', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [
          product(''),
          product('Belvedere'),
          product(null),
        ]),
      ]),
      existingStockItems: [stock({ id: 's1', name: 'Belvedere' })],
    })

    expect(result.matches).toHaveLength(3)
    expect(result.matches.map((row) => row.status)).toEqual([
      INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE,
      INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH,
      INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE,
    ])
  })

  it('24. multiple categories flattened correctly', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [product('Belvedere'), product('Absolut Blue')]),
        category('GIN', [product('Tanqueray')]),
      ]),
      existingStockItems: [
        stock({ id: '1', name: 'Belvedere' }),
        stock({ id: '2', name: 'Absolut Blue' }),
        stock({ id: '3', name: 'Tanqueray' }),
      ],
    })

    expect(result.matches).toHaveLength(3)
    expect(result.matches.map((row) => row.source.category)).toEqual([
      'VODKA',
      'VODKA',
      'GIN',
    ])
    expect(result.matches.every((row) => row.status === INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH)).toBe(true)
  })

  it('25. summary counts correct', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([
        category('VODKA', [
          product('Belvedere'),
          product('Belvedere Extra'),
          product('Unknown Spirit'),
          product(''),
        ]),
      ]),
      existingStockItems: [
        stock({ id: '1', name: 'Belvedere' }),
        stock({ id: '2', name: 'Belvedere Extra Premium' }),
      ],
    })

    expect(result.summary).toEqual({
      total: 4,
      exactMatch: 1,
      possibleMatch: 1,
      newProduct: 1,
      invalidSource: 1,
    })
    expect(result.matcherVersion).toBe(INVENTORY_OPERATIONAL_PRODUCT_MATCHER_VERSION)
  })

  it('26. empty operational model', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([]),
      existingStockItems: [stock({ id: '1', name: 'Belvedere' })],
    })

    expect(result.matches).toEqual([])
    expect(result.summary).toEqual({
      total: 0,
      exactMatch: 0,
      possibleMatch: 0,
      newProduct: 0,
      invalidSource: 0,
    })
  })

  it('27. empty existing-stock list', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Belvedere')])]),
      existingStockItems: [],
    })

    expect(result.matches[0].status).toBe(INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT)
  })

  it('28. invalid top-level inputs throw typed error', () => {
    expect(() => matchInventoryOperationalProducts({
      operationalModel: null,
      existingStockItems: [],
    })).toThrow(InventoryOperationalProductMatcherError)

    expect(() => matchInventoryOperationalProducts({
      operationalModel: model([]),
      existingStockItems: null,
    })).toThrow(InventoryOperationalProductMatcherError)

    try {
      matchInventoryOperationalProducts({
        operationalModel: { categories: 'nope' },
        existingStockItems: [],
      })
      expect.unreachable('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryOperationalProductMatcherError)
      expect(error.code).toBe('INVALID_OPERATIONAL_MODEL')
    }
  })

  it('29. input immutability', () => {
    const operationalModel = model([
      category('VODKA', [product('Belvedere', { storage: 6 })]),
    ])
    const existingStockItems = [stock({ id: 's1', name: 'Belvedere' })]
    const modelBefore = JSON.stringify(operationalModel)
    const stockBefore = JSON.stringify(existingStockItems)

    matchInventoryOperationalProducts({ operationalModel, existingStockItems })

    expect(JSON.stringify(operationalModel)).toBe(modelBefore)
    expect(JSON.stringify(existingStockItems)).toBe(stockBefore)
    expect(Object.isExtensible(operationalModel)).toBe(true)
    expect(Object.isExtensible(existingStockItems[0])).toBe(true)
  })

  it('30. frozen output', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: model([category('VODKA', [product('Belvedere')])]),
      existingStockItems: [stock({ id: 's1', name: 'Belvedere' })],
    })

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.matches)).toBe(true)
    expect(Object.isFrozen(result.matches[0])).toBe(true)
    expect(Object.isFrozen(result.matches[0].evidence)).toBe(true)
    expect(Object.isFrozen(result.summary)).toBe(true)
    expect(() => {
      result.summary.total = 99
    }).toThrow()
  })

  it('31. repeated calls produce equal output', () => {
    const input = {
      operationalModel: model([
        category('WHISKY', [
          product('Johnnie Walker Black'),
          product('Chivas 12'),
        ]),
        category('GIN', [product('Bombay Sapphire')]),
      ]),
      existingStockItems: [
        stock({ id: '1', name: 'Johnnie Walker Black' }),
        stock({ id: '2', name: 'Bombay Sapphire' }),
        stock({ id: '3', name: 'Chivas 12 Reserve' }),
      ],
    }

    const first = matchInventoryOperationalProducts(input)
    const second = matchInventoryOperationalProducts(input)

    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('32. no forbidden imports', () => {
    expect(MATCHER_SOURCE).not.toMatch(/from ['"][^'"]*supabase/i)
    expect(MATCHER_SOURCE).not.toMatch(/from ['"]react['"]/)
    expect(MATCHER_SOURCE).not.toMatch(/from ['"][^'"]*\/services\//)
    expect(MATCHER_SOURCE).not.toMatch(/fetch\s*\(/)
  })
})

describe('normalizeInventoryOperationalProductName', () => {
  it('collapses case and whitespace without inventing synonyms', () => {
    expect(normalizeInventoryOperationalProductName(' Belvedere ')).toBe('belvedere')
    expect(normalizeInventoryOperationalProductName('BELVEDERE')).toBe('belvedere')
    expect(normalizeInventoryOperationalProductName('Johnnie Walker Black'))
      .not.toBe(normalizeInventoryOperationalProductName('Johnnie Walker Red'))
    expect(normalizeInventoryOperationalProductName('Tanqueray'))
      .not.toBe(normalizeInventoryOperationalProductName('Tanqueray 0.0'))
    expect(normalizeInventoryOperationalProductName('Chivas 12'))
      .not.toBe(normalizeInventoryOperationalProductName('Chivas 18'))
  })
})

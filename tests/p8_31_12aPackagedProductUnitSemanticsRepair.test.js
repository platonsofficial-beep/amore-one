/**
 * P8.31.12a — Packaged Product Unit Semantics Repair (unit-label-only).
 * Does not execute SQL. No production service imports.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateTemporaryRealLabelCatalog } from '../src/lib/p8_31_9TemporaryRealLabelCatalog.js'
import { productUuid, buildSeed } from '../scripts/generate_p8_31_11_seed.mjs'

const DATASET = JSON.parse(
  readFileSync(resolve('supabase/data/p8_31_9_temporary_real_label_catalog.json'), 'utf8'),
)
const SEED = readFileSync(
  resolve('supabase/p8_31_11_temporary_real_label_catalog_seed.sql'),
  'utf8',
)
const REPAIR = readFileSync(
  resolve('supabase/p8_31_12a_packaged_product_unit_semantics_repair.sql'),
  'utf8',
)

const REPAIRED = Object.freeze([
  { sequence: 151, name: 'Mango Purée', brand: 'Funkin' },
  { sequence: 152, name: 'Passion Fruit Purée', brand: 'Funkin' },
  { sequence: 153, name: 'Classico Coffee Beans', brand: 'Illy' },
  { sequence: 154, name: 'Qualità Rossa Beans', brand: 'Lavazza' },
  { sequence: 158, name: 'Fresh Mint', brand: '' },
  { sequence: 160, name: 'Fresh Milk', brand: '' },
  { sequence: 161, name: 'Single Cream', brand: '' },
  { sequence: 162, name: 'Strawberries', brand: '' },
  { sequence: 163, name: 'Fresh Basil', brand: '' },
])

describe('P8.31.12a packaged product unit semantics repair', () => {
  it('sets approved products to Piece without changing quantities', () => {
    for (const target of REPAIRED) {
      const product = DATASET.products.find((row) => row.sequence === target.sequence)
      expect(product).toBeTruthy()
      expect(product.name).toBe(target.name)
      expect(product.brand ?? '').toBe(target.brand)
      expect(product.unit).toBe('Piece')
      const sum = product.locationQuantities.reduce((s, r) => s + r.quantity, 0)
      expect(product.currentQuantity).toBe(sum)
      expect(product.currentQuantity).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps citrus produce as Kilogram (not converted to Piece)', () => {
    for (const sequence of [155, 156, 157, 159]) {
      const product = DATASET.products.find((row) => row.sequence === sequence)
      expect(product.unit).toBe('Kilogram')
    }
  })

  it('passes dataset validator and keeps seed synchronized', () => {
    const result = validateTemporaryRealLabelCatalog(DATASET)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(SEED).toBe(buildSeed(DATASET))
    for (const target of REPAIRED) {
      const id = productUuid(target.sequence)
      const idx = SEED.indexOf(`'${id}'::uuid`)
      expect(idx).toBeGreaterThan(-1)
      const block = SEED.slice(idx, idx + 500)
      expect(block).toContain("'Piece'::text")
      expect(block).not.toMatch(/'(Gram|Kilogram|Liter|Milliliter)'::text/)
    }
  })

  it('live repair SQL updates unit only for batch targets', () => {
    expect(REPAIR).toContain('P8.31.12a')
    expect(REPAIR).toContain("unit = 'Piece'")
    expect(REPAIR).toContain('current_quantity')
    expect(REPAIR).toContain('item aggregate quantity changed')
    expect(REPAIR).toContain('balance aggregate quantity changed')
    expect(REPAIR).not.toMatch(/update\s+public\.stock_item_location_balances/i)
    expect(REPAIR).not.toMatch(/update\s+public\.stock_movements/i)
    expect(REPAIR).not.toMatch(/set\s+current_quantity\s*=/i)
    for (const target of REPAIRED) {
      expect(REPAIR).toContain(productUuid(target.sequence))
    }
  })
})

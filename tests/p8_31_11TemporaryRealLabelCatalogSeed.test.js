/**
 * P8.31.11 — Temporary Real-Label Test Catalog Seed SQL contract suite.
 * Reads SQL as text only. Does not execute SQL. No production service imports.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProductIdentityKey } from '../src/lib/stockProductIdentity.js'
import { isAcceptedInventoryUnitValue } from '../src/lib/inventoryUnitStandard.js'
import {
  P8_31_11_BATCH_ID,
  P8_31_11_SUPPLIERS,
  productUuid,
  supplierUuid,
  balanceUuid,
  movementUuid,
  buildSeed,
} from '../scripts/generate_p8_31_11_seed.mjs'

const SEED = readFileSync(
  resolve('supabase/p8_31_11_temporary_real_label_catalog_seed.sql'),
  'utf8',
)
const VERIFY = readFileSync(
  resolve('supabase/p8_31_11_temporary_real_label_catalog_verification.sql'),
  'utf8',
)
const DATASET = JSON.parse(
  readFileSync(resolve('supabase/data/p8_31_9_temporary_real_label_catalog.json'), 'utf8'),
)

describe('P8.31.11 temporary real-label catalog seed SQL contract', () => {
  it('uses exact-one workspace gate and empty-catalog precondition', () => {
    expect(SEED).toContain("slug = 'amore-nicosia'")
    expect(SEED).toContain("name = 'AMORE.NICOSIA'")
    expect(SEED).toContain('expected exactly one')
    expect(SEED).toContain('stock_items count is % (expected 0)')
    expect(SEED).toMatch(/begin;\s*\n\s*do \$p8_31_11/)
    expect(SEED.trimEnd()).toMatch(/commit;\s*$/)
  })

  it('locks batch marker and deterministic UUID namespaces', () => {
    expect(SEED).toContain(P8_31_11_BATCH_ID)
    expect(SEED).toContain('c0318a00-2026-4000-8000-')
    expect(SEED).toContain('c0318b00-2026-4000-8000-')
    expect(SEED).toContain('c0318c00-2026-4000-8000-')
    expect(SEED).toContain('d0318a00-2026-4000-8000-')
    expect(SEED).not.toContain('a0172a00-2026-4000-8000-')
    expect(productUuid(1)).toBe('c0318a00-2026-4000-8000-000000000001')
    expect(productUuid(180)).toBe('c0318a00-2026-4000-8000-0000000000b4')
    expect(supplierUuid(7)).toBe('c0318b00-2026-4000-8000-000000000007')
    expect(balanceUuid(336)).toBe('c0318c00-2026-4000-8000-000000000150')
    expect(movementUuid(1)).toBe('d0318a00-2026-4000-8000-000000000001')

    for (let seq = 1; seq <= 180; seq += 1) {
      expect(SEED).toContain(`'${productUuid(seq)}'::uuid`)
    }
    for (let i = 1; i <= 7; i += 1) {
      expect(SEED).toContain(`'${supplierUuid(i)}'::uuid`)
    }
  })

  it('aborts clearly on second run / supplier name conflicts', () => {
    expect(SEED).toContain('batch product UUID namespace already present')
    expect(SEED).toContain('batch supplier markers already present')
    expect(SEED).toContain('without this batch marker')
    expect(SEED).toContain('Refusing to collide with non-test suppliers')
  })

  it('does not prefix visible Brand or Product Name with the batch id', () => {
    expect(SEED).toContain('Visible Brand / Product Name are realistic (no batch prefix)')
    for (const product of DATASET.products) {
      expect(product.name.includes(P8_31_11_BATCH_ID)).toBe(false)
      expect(`${product.brand ?? ''}`.includes(P8_31_11_BATCH_ID)).toBe(false)
      expect(SEED).toContain(`'${product.name.replace(/'/g, "''")}'::text`)
    }
  })

  it('maps dataset fields, suppliers, storages, balances, and aggregate equality', () => {
    expect(SEED).toContain('insert into public.suppliers')
    expect(SEED).toContain('insert into public.stock_items')
    expect(SEED).toContain('insert into public.stock_item_location_balances')
    expect(SEED).toContain('quantity_version')
    expect(SEED).toContain('1::bigint')
    expect(SEED).toContain('expected 180 stock_items')
    expect(SEED).toContain('expected 336 balances')
    expect(SEED).toContain('aggregate item qty % != aggregate balance qty %')
    expect(SEED).toContain('active/inactive expected 172/8')
    expect(SEED).toContain('multi-location expected 156')

    for (const name of P8_31_11_SUPPLIERS) {
      expect(SEED).toContain(`'${name}'::text`)
    }

    const keys = new Set()
    const identityKeys = new Set()
    let balanceCount = 0
    for (const product of DATASET.products) {
      expect(isAcceptedInventoryUnitValue(product.unit)).toBe(true)
      const idKey = buildProductIdentityKey({
        brand: product.brand,
        name: product.name,
        size: product.size,
      })
      expect(identityKeys.has(idKey)).toBe(false)
      identityKeys.add(idKey)
      expect(SEED).toContain(`'${productUuid(product.sequence)}'::uuid`)
      expect(SEED).toContain(`'${product.defaultStorage}'::text`)
      for (const row of product.locationQuantities) {
        keys.add(row.locationKey)
        balanceCount += 1
        expect(row.quantity).toBeGreaterThanOrEqual(0)
      }
      const sum = product.locationQuantities.reduce((s, r) => s + r.quantity, 0)
      expect(sum).toBe(product.currentQuantity)
    }
    expect(balanceCount).toBe(336)
    for (const key of keys) {
      expect(SEED).toContain(`'${key}'`)
    }
  })

  it('creates opening stock_count movements with batch note and migration origin', () => {
    expect(SEED).toContain('insert into public.stock_movements')
    expect(SEED).toContain("'stock_count'")
    expect(SEED).toContain("'migration'")
    expect(SEED).toContain("v_batch_marker || ' | opening balance seed'")
    expect(SEED).toContain('expected 336 movements')
  })

  it('does not store Variant or Display Name columns', () => {
    expect(SEED).not.toMatch(/\bvariant\b/i)
    expect(SEED).not.toMatch(/display_name/i)
    expect(SEED).not.toMatch(/buildProductDisplayName/)
  })

  it('keeps committed seed SQL in sync with the generator + dataset', () => {
    const regenerated = buildSeed(DATASET)
    expect(SEED).toBe(regenerated)
  })

  it('verification SQL reports required metrics and expected core results', () => {
    expect(VERIFY).toContain('temporary_suppliers')
    expect(VERIFY).toContain('batch_products')
    expect(VERIFY).toContain('active_count')
    expect(VERIFY).toContain('inactive_count')
    expect(VERIFY).toContain('balances_inserted')
    expect(VERIFY).toContain('distinct_products_with_balances')
    expect(VERIFY).toContain('aggregate_item_quantity')
    expect(VERIFY).toContain('aggregate_balance_quantity')
    expect(VERIFY).toContain('multi_location_product_count')
    expect(VERIFY).toContain('healthy_count')
    expect(VERIFY).toContain('low_count')
    expect(VERIFY).toContain('out_count')
    expect(VERIFY).toContain('batch_movement_rows')
    expect(VERIFY).toContain('non_batch_stock_item_count')
    expect(VERIFY).toContain('temporary_suppliers = 7')
    expect(VERIFY).toContain('batch_products = 180')
    expect(VERIFY).toContain('active_count = 172')
    expect(VERIFY).toContain('inactive_count = 8')
    expect(VERIFY).toContain('balances_inserted = 336')
    expect(VERIFY).toContain('multi_location_product_count = 156')
    expect(VERIFY).toContain('non_batch_stock_item_count = 0')
    expect(VERIFY).toContain('Do NOT modify data')
  })

  it('does not execute SQL and does not import production stock services', () => {
    const testSource = readFileSync(
      resolve('tests/p8_31_11TemporaryRealLabelCatalogSeed.test.js'),
      'utf8',
    )
    const importLines = testSource
      .split('\n')
      .filter((line) => line.startsWith('import '))
      .join('\n')
    expect(testSource).toContain('Does not execute SQL')
    expect(importLines).not.toMatch(/stockItemService|inventoryImportService/)
    expect(importLines).not.toMatch(/supabaseClient|stockMutationService/)
  })
})

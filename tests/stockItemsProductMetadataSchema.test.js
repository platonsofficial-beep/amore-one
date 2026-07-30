/**
 * P8.31.6a — Product metadata schema foundation contract (read SQL files only).
 */
// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const additivePath = join(HERE, '../supabase/stock_items_product_metadata.sql')
const greenfieldPath = join(HERE, '../supabase/stock_items_schema.sql')
const packagingNotePath = join(HERE, '../supabase/stock_items_packaging_note.sql')

const additiveSql = readFileSync(additivePath, 'utf8')
const greenfieldSql = readFileSync(greenfieldPath, 'utf8')
const packagingNoteSql = readFileSync(packagingNotePath, 'utf8')

/** Recommended write-path limits (enforced in P8.31.6b app wiring). */
export const PRODUCT_METADATA_LENGTH_CONTRACT = Object.freeze({
  brand: 120,
  size: 80,
  barcode: 64,
})

describe('stock_items_product_metadata.sql — P8.31.6a additive contract', () => {
  it('adds nullable brand, size, and barcode columns only', () => {
    expect(additiveSql).toMatch(/add column if not exists brand text/i)
    expect(additiveSql).toMatch(/add column if not exists size text/i)
    expect(additiveSql).toMatch(/add column if not exists barcode text/i)
    expect(additiveSql).not.toMatch(/brand text not null/i)
    expect(additiveSql).not.toMatch(/size text not null/i)
    expect(additiveSql).not.toMatch(/barcode text not null/i)
  })

  it('documents recommended max lengths without inventing uniqueness', () => {
    expect(additiveSql).toContain('Recommended max length 120')
    expect(additiveSql).toContain('Recommended max length 80')
    expect(additiveSql).toContain('Recommended max length 64')
    expect(PRODUCT_METADATA_LENGTH_CONTRACT.brand).toBe(120)
    expect(PRODUCT_METADATA_LENGTH_CONTRACT.size).toBe(80)
    expect(PRODUCT_METADATA_LENGTH_CONTRACT.barcode).toBe(64)
    expect(additiveSql).toMatch(/No uniqueness constraint in P8\.31\.6a/i)
    expect(additiveSql).not.toMatch(/add\s+constraint\s+\w*barcode\w*\s+unique/i)
    expect(additiveSql).not.toMatch(/unique\s*\([^)]*barcode/i)
    expect(additiveSql).not.toMatch(/create\s+unique\s+index[\s\S]{0,80}barcode/i)
  })

  it('locks informational semantics and forbids quantity/unit side effects', () => {
    expect(additiveSql).toMatch(/Descriptive metadata only/i)
    expect(additiveSql).toMatch(/Never an inventory unit or quantity multiplier/i)
    expect(additiveSql).toMatch(/Never affects quantity or valuation/i)
    expect(additiveSql).not.toMatch(/update\s+public\.stock_items/i)
    expect(additiveSql).not.toMatch(/current_quantity/i)
    expect(additiveSql).not.toMatch(/minimum_quantity/i)
    expect(additiveSql).not.toMatch(/cost_price/i)
    expect(additiveSql).not.toMatch(/alter\s+column\s+unit/i)
  })

  it('follows packaging_note optional-metadata convention (nullable text, no DB length CHECK)', () => {
    expect(packagingNoteSql).toMatch(/add column if not exists packaging_note text/i)
    expect(packagingNoteSql).not.toMatch(/char_length\(packaging_note\)/i)
    expect(additiveSql).not.toMatch(/char_length\(brand\)/i)
    expect(additiveSql).not.toMatch(/char_length\(size\)/i)
    expect(additiveSql).not.toMatch(/char_length\(barcode\)/i)
    expect(additiveSql).toMatch(/same pattern as[\s\S]*packaging_note/i)
  })

  it('does not touch operational SQL surfaces', () => {
    expect(additiveSql).not.toMatch(/stock_movements/i)
    expect(additiveSql).not.toMatch(/inventory_count/i)
    expect(additiveSql).not.toMatch(/inventory_import/i)
    expect(additiveSql).not.toMatch(/stock_transfer/i)
    expect(additiveSql).not.toMatch(/create\s+or\s+replace\s+function/i)
    expect(additiveSql).not.toMatch(/create\s+policy/i)
  })
})

describe('stock_items_schema.sql — P8.31.6a greenfield parity', () => {
  it('includes brand, size, and barcode as nullable text beside packaging_note', () => {
    expect(greenfieldSql).toContain('packaging_note text')
    expect(greenfieldSql).toContain('brand text')
    expect(greenfieldSql).toContain('size text')
    expect(greenfieldSql).toContain('barcode text')
    expect(greenfieldSql).not.toMatch(/brand text not null/i)
    expect(greenfieldSql).not.toMatch(/size text not null/i)
    expect(greenfieldSql).not.toMatch(/barcode text not null/i)
  })

  it('preserves quantity defaults and does not unique-index barcode', () => {
    expect(greenfieldSql).toContain('current_quantity numeric(12, 3) not null default 0')
    expect(greenfieldSql).toContain('minimum_quantity numeric(12, 3) not null default 0')
    expect(greenfieldSql).toContain('cost_price numeric(12, 2) not null default 0')
    expect(greenfieldSql).not.toMatch(/unique\s*\(.*barcode/i)
    expect(greenfieldSql).not.toMatch(/barcode.*unique/i)
  })
})

describe('P8.31.6b boundary — product metadata is wired in create/edit path', () => {
  it('wires brand, size, and barcode through service, catalog, and form modal', () => {
    const service = readFileSync(
      join(HERE, '../src/services/stockItemService.js'),
      'utf8',
    )
    const catalog = readFileSync(
      join(HERE, '../src/lib/stockCatalog.js'),
      'utf8',
    )
    const formModal = readFileSync(
      join(HERE, '../src/components/stock/StockItemFormModal.jsx'),
      'utf8',
    )

    expect(service).toMatch(/normalizeProductBrand/)
    expect(service).toMatch(/normalizeProductSize/)
    expect(service).toMatch(/normalizeProductBarcode/)
    expect(service).toMatch(/\bbrand:/)
    expect(service).toMatch(/\bbarcode:/)
    expect(catalog).toMatch(/PRODUCT_METADATA_LIMITS/)
    expect(catalog).toMatch(/normalizeProductBrand/)
    expect(formModal).toMatch(/Identity/)
    expect(formModal).toMatch(/Inventory/)
    expect(formModal).toMatch(/Purchasing/)
    expect(formModal).toMatch(/Storage/)
    expect(formModal).toMatch(/Subcategory/)
    expect(formModal).toMatch(/form\.brand/)
    expect(formModal).toMatch(/form\.size/)
    expect(formModal).toMatch(/form\.barcode/)
  })
})

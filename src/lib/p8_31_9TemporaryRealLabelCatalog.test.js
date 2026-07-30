/**
 * P8.31.9 — Temporary Real-Label Test Catalog dataset contract suite
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STOCK_CATEGORIES,
  STOCK_LOCATIONS,
  STOCK_TYPES_BY_CATEGORY,
} from './stockCatalog.js'
import { buildProductIdentityKey } from './stockProductIdentity.js'
import {
  P8_31_9_BATCH_ID,
  P8_31_9_DOMAIN_TARGETS,
  P8_31_9_EXPECTED_PRODUCT_COUNT,
  P8_31_9_FICTIONAL_SUPPLIERS,
  classifyStockState,
  sumLocationQuantities,
  validateTemporaryRealLabelCatalog,
} from './p8_31_9TemporaryRealLabelCatalog.js'

const DATASET_PATH = resolve('supabase/data/p8_31_9_temporary_real_label_catalog.json')

function loadDataset() {
  return JSON.parse(readFileSync(DATASET_PATH, 'utf8'))
}

describe('P8.31.9 temporary real-label catalog dataset', () => {
  const dataset = loadDataset()
  const result = validateTemporaryRealLabelCatalog(dataset)

  it('passes the full dataset contract validator', () => {
    if (!result.ok) {
      // Loud failure surface for contract violations
      expect(result.errors).toEqual([])
    }
    expect(result.ok).toBe(true)
  })

  it('locks exact size, batch id, and sequence coverage', () => {
    expect(dataset.batchId).toBe(P8_31_9_BATCH_ID)
    expect(dataset.products).toHaveLength(P8_31_9_EXPECTED_PRODUCT_COUNT)
    const sequences = dataset.products.map((p) => p.sequence).sort((a, b) => a - b)
    expect(sequences).toEqual(
      Array.from({ length: P8_31_9_EXPECTED_PRODUCT_COUNT }, (_, i) => i + 1),
    )
  })

  it('enforces unique Brand + Name + Size identity keys', () => {
    const keys = dataset.products.map((p) => buildProductIdentityKey({
      brand: p.brand,
      name: p.name,
      size: p.size,
    }))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses only repository categories, item types, storages, and fictional suppliers', () => {
    for (const product of dataset.products) {
      expect(STOCK_CATEGORIES).toContain(product.category)
      expect(STOCK_TYPES_BY_CATEGORY[product.category]).toContain(product.itemType)
      expect(STOCK_LOCATIONS).toContain(product.defaultStorage)
      expect(P8_31_9_FICTIONAL_SUPPLIERS).toContain(product.supplierName)
      for (const row of product.locationQuantities) {
        expect(STOCK_LOCATIONS).toContain(row.locationKey)
      }
    }
  })

  it('keeps aggregate quantity equal to location sum and never negative', () => {
    for (const product of dataset.products) {
      expect(sumLocationQuantities(product)).toBe(product.currentQuantity)
      expect(product.currentQuantity).toBeGreaterThanOrEqual(0)
      for (const row of product.locationQuantities) {
        expect(row.quantity).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('matches locked domain distribution targets', () => {
    expect(result.summary.domainCounts).toEqual(P8_31_9_DOMAIN_TARGETS)
  })

  it('does not import runtime stock services or mutate production modules', () => {
    const validatorSource = readFileSync(
      resolve('src/lib/p8_31_9TemporaryRealLabelCatalog.js'),
      'utf8',
    )
    expect(validatorSource).not.toMatch(/stockItemService|inventoryImportService|createStockItem/)
    expect(validatorSource).toContain('No production side effects')
  })

  it('reports composition summary required by the sprint contract', () => {
    const {
      totalProducts,
      categoryCounts,
      supplierCounts,
      activeCount,
      inactiveCount,
      singleLocationCount,
      multiLocationCount,
      healthyCount,
      lowCount,
      outCount,
      verifiedBarcodeCount,
      nullBarcodeCount,
    } = result.summary

    // Explicit report surface for CI / Final Report
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      totalProducts,
      distributionByCategory: categoryCounts,
      distributionBySupplier: supplierCounts,
      activeCount,
      inactiveCount,
      singleLocationCount,
      multiLocationCount,
      healthyCount,
      lowCount,
      outCount,
      verifiedBarcodeCount,
      nullBarcodeCount,
    }, null, 2))

    expect(totalProducts).toBe(180)
    expect(activeCount + inactiveCount).toBe(180)
    expect(singleLocationCount + multiLocationCount).toBe(180)
    expect(healthyCount + lowCount + outCount).toBe(180)
    expect(verifiedBarcodeCount + nullBarcodeCount).toBe(180)
    expect(inactiveCount).toBeGreaterThanOrEqual(8)
    expect(inactiveCount).toBeLessThanOrEqual(12)
    expect(multiLocationCount).toBeGreaterThanOrEqual(72)
    expect(nullBarcodeCount).toBe(180)
    expect(verifiedBarcodeCount).toBe(0)

    // Spot-check stock-state helper alignment
    const derived = { healthy: 0, low: 0, out: 0 }
    for (const product of dataset.products) {
      derived[classifyStockState(product)] += 1
    }
    expect(derived).toEqual({
      healthy: healthyCount,
      low: lowCount,
      out: outCount,
    })
  })
})

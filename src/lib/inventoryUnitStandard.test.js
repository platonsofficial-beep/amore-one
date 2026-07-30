/**
 * P8.31.1 — Consumable Unit Product Contract Lock
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_INVENTORY_UNIT_TERMS,
  CANONICAL_PHYSICAL_INVENTORY_UNITS,
  EXISTING_UNIT_DATA_REPAIR_CLASSES,
  INVENTORY_UNIT_HISTORICAL_CONTRACT,
  LEGACY_UNIT_PRESET_SOURCES,
  PACKAGING_NOTE_CONTRACT,
  PACKAGING_ONLY_INVENTORY_UNIT_TERMS,
  SELECTABLE_INVENTORY_UNIT_PRESETS,
  classifyInventoryUnit,
  isCanonicalPhysicalInventoryUnit,
  isPackagingOnlyInventoryUnit,
  normalizeInventoryUnitInput,
} from './inventoryUnitStandard.js'
import {
  STOCK_GENERAL_UNIT_PRESETS,
  STOCK_UNIT_PRESETS_BY_CATEGORY,
} from './stockCatalog.js'
import { INVENTORY_NEW_PRODUCT_UNITS } from './inventoryNewProductDrafts.js'
import { INVENTORY_UNIT_PRESETS } from './inventoryUtils.js'

describe('inventoryUnitStandard — canonical physical units', () => {
  it.each([
    ['Bottle', 'Bottle'],
    ['bottle', 'Bottle'],
    ['BOTTLE', 'Bottle'],
    ['Can', 'Can'],
    ['Piece', 'Piece'],
    ['Kilogram', 'Kilogram'],
    ['Kg', 'Kilogram'],
    ['Gram', 'Gram'],
    ['Liter', 'Liter'],
    ['Litre', 'Liter'],
    ['Milliliter', 'Milliliter'],
    ['ml', 'Milliliter'],
    ['Keg', 'Keg'],
    ['Roll', 'Roll'],
  ])('classifies %s as canonical → %s', (input, canonical) => {
    const result = classifyInventoryUnit(input)
    expect(result).toMatchObject({
      classification: 'canonical_physical_unit',
      canonicalUnit: canonical,
      requiresReview: false,
      packagingEvidence: null,
    })
    expect(result.normalizedInput).toBe(normalizeInventoryUnitInput(input))
    expect(isCanonicalPhysicalInventoryUnit(input)).toBe(true)
  })

  it('documents optional Keg and Roll as allowed physical objects', () => {
    expect(CANONICAL_PHYSICAL_INVENTORY_UNITS).toEqual(expect.arrayContaining(['Keg', 'Roll']))
    expect(CANONICAL_PHYSICAL_INVENTORY_UNITS).not.toContain('Portion')
    expect(CANONICAL_PHYSICAL_INVENTORY_UNITS).not.toContain('Pack')
    expect(CANONICAL_PHYSICAL_INVENTORY_UNITS).not.toContain('Bag')
    expect(CANONICAL_PHYSICAL_INVENTORY_UNITS).not.toContain('Container')
    expect(CANONICAL_PHYSICAL_INVENTORY_UNITS).not.toContain('Case')
  })
})

describe('inventoryUnitStandard — legacy composites', () => {
  it.each([
    ['Bottle 250ml', 'Bottle'],
    ['Bottle 700ml', 'Bottle'],
    ['Bottle 1L', 'Bottle'],
    ['bottle 1l', 'Bottle'],
    ['Can 330ml', 'Can'],
  ])('classifies %s as legacy composite → %s (review required)', (input, canonical) => {
    const result = classifyInventoryUnit(input)
    expect(result).toMatchObject({
      classification: 'legacy_composite_physical_unit',
      canonicalUnit: canonical,
      requiresReview: true,
    })
    expect(result.packagingEvidence).toMatch(/legacy size composite/i)
    expect(isCanonicalPhysicalInventoryUnit(input)).toBe(false)
  })
})

describe('inventoryUnitStandard — packaging-only', () => {
  it.each([
    'Case',
    'case',
    'Case 6',
    'Case 12 bottles',
    'Case of 24',
    'case 6 bottles',
    'Carton',
    'Tray',
    'Pallet',
    'Box of 24',
  ])('classifies %s as packaging_only_unit requiring review', (input) => {
    const result = classifyInventoryUnit(input)
    expect(result.classification).toBe('packaging_only_unit')
    expect(result.canonicalUnit).toBeNull()
    expect(result.requiresReview).toBe(true)
    expect(result.packagingEvidence).toBeTruthy()
    expect(isPackagingOnlyInventoryUnit(input)).toBe(true)
  })

  it('never treats Case 6 bottles as an accepted stock UoM', () => {
    const result = classifyInventoryUnit('Case 6 bottles')
    expect(result.classification).toBe('packaging_only_unit')
    expect(result.canonicalUnit).toBeNull()
    expect(result.packagingEvidence).toMatch(/never multiply/i)
    expect(result.packagingEvidence).toMatch(/Bottle|6/i)
  })

  it('lists minimum blocked packaging terms', () => {
    expect(PACKAGING_ONLY_INVENTORY_UNIT_TERMS).toEqual(
      expect.arrayContaining(['case', 'carton', 'tray', 'pallet']),
    )
  })
})

describe('inventoryUnitStandard — ambiguous', () => {
  it.each(['Pack', 'pack', 'Box', 'Bag', 'Container', 'Portion'])(
    'classifies %s as ambiguous_unit',
    (input) => {
      const result = classifyInventoryUnit(input)
      expect(result).toMatchObject({
        classification: 'ambiguous_unit',
        canonicalUnit: null,
        requiresReview: true,
      })
    },
  )

  it('keeps ambiguous vocabulary locked', () => {
    expect(AMBIGUOUS_INVENTORY_UNIT_TERMS).toEqual(
      expect.arrayContaining(['pack', 'box', 'bag', 'container', 'portion']),
    )
  })
})

describe('inventoryUnitStandard — unknown / empty', () => {
  it('classifies custom unknown text', () => {
    expect(classifyInventoryUnit('Widget')).toMatchObject({
      classification: 'unknown_unit',
      canonicalUnit: null,
      requiresReview: true,
    })
  })

  it.each([null, undefined, '', '   ', '\t'])('classifies empty input %j', (input) => {
    expect(classifyInventoryUnit(input)).toMatchObject({
      normalizedInput: '',
      classification: 'empty_unit',
      canonicalUnit: null,
      requiresReview: true,
    })
  })
})

describe('inventoryUnitStandard — safety / purity', () => {
  it('does not accept quantity or expose conversion helpers', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/inventoryUnitStandard.js'),
      'utf8',
    )
    expect(source).not.toMatch(/function\s+\w*convert/i)
    expect(source).not.toMatch(/export function \w*(multiply|convert|scale)/i)
    expect(source).not.toMatch(/\bpack_size\b|\bbottles_per\b|\bunits_per\b/)
    expect(source).not.toMatch(/classifyInventoryUnit\s*\([^)]*quantity/i)
    expect(classifyInventoryUnit.length).toBe(1)
    // Classifier API is unit-text only — no quantity argument in the result shape.
    const sample = classifyInventoryUnit('Case 6 bottles')
    expect(sample).not.toHaveProperty('quantity')
    expect(sample).not.toHaveProperty('convertedQuantity')
    expect(sample).not.toHaveProperty('multiplier')
  })

  it('is deterministic and does not mutate input objects', () => {
    const input = { toString: () => ' Bottle ' }
    const first = classifyInventoryUnit(input)
    const second = classifyInventoryUnit(input)
    expect(first).toEqual(second)
    expect(first.normalizedInput).toBe('Bottle')
  })

  it('locks packaging_note and historical contracts without schema changes', () => {
    expect(PACKAGING_NOTE_CONTRACT.fieldName).toBe('packaging_note')
    expect(PACKAGING_NOTE_CONTRACT.affectsQuantity).toBe(false)
    expect(INVENTORY_UNIT_HISTORICAL_CONTRACT.neverAutoMultiplyQuantities).toBe(true)
    expect(INVENTORY_UNIT_HISTORICAL_CONTRACT.movementUnitFreezeDeferredTo).toBe('P8.31.9')
    expect(EXISTING_UNIT_DATA_REPAIR_CLASSES.AMBIGUOUS_MANUAL_REVIEW)
      .toBe('ambiguous_manual_review')
  })
})

describe('inventoryUnitStandard — repository boundary', () => {
  it('is only imported by the known vocabulary consumer modules', () => {
    const { readdirSync, readFileSync, statSync } = require('node:fs')
    const { join } = require('node:path')

    /** @param {string} dir */
    function walk(dir) {
      /** @type {string[]} */
      const files = []
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          files.push(...walk(full))
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry)) {
          files.push(full)
        }
      }
      return files
    }

    const allowed = new Set([
      resolve(process.cwd(), 'src/lib/stockCatalog.js'),
      resolve(process.cwd(), 'src/lib/inventoryNewProductDrafts.js'),
      resolve(process.cwd(), 'src/lib/inventoryUtils.js'),
    ])

    const offenders = walk(resolve(process.cwd(), 'src'))
      .filter((file) => !file.includes('inventoryUnitStandard'))
      .filter((file) => readFileSync(file, 'utf8').includes('inventoryUnitStandard'))
      .filter((file) => !allowed.has(file))

    expect(offenders).toEqual([])
  })

  it('documents legacy preset sources as thin consumers of the canonical list', () => {
    expect(LEGACY_UNIT_PRESET_SOURCES.length).toBeGreaterThanOrEqual(3)

    expect(STOCK_GENERAL_UNIT_PRESETS).toEqual([...SELECTABLE_INVENTORY_UNIT_PRESETS])
    expect(INVENTORY_NEW_PRODUCT_UNITS).toEqual([...SELECTABLE_INVENTORY_UNIT_PRESETS])
    expect(INVENTORY_UNIT_PRESETS).toEqual([...SELECTABLE_INVENTORY_UNIT_PRESETS])

    for (const presets of Object.values(STOCK_UNIT_PRESETS_BY_CATEGORY)) {
      expect(presets).toEqual([...SELECTABLE_INVENTORY_UNIT_PRESETS])
      for (const blocked of ['Case', 'Case 6 bottles', 'Box', 'Pack', 'Kg', 'Litre']) {
        expect(presets).not.toContain(blocked)
      }
    }

    expect(STOCK_GENERAL_UNIT_PRESETS).not.toContain('Case')
    expect(INVENTORY_NEW_PRODUCT_UNITS).not.toContain('Case')
    expect(INVENTORY_UNIT_PRESETS).not.toContain('Case 6')
  })
})

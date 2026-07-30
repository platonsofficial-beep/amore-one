/**
 * P8.31.13 — Inventory Unit display formatting (presentation only).
 */
import { describe, expect, it } from 'vitest'
import {
  formatInventoryUnit,
  formatInventoryUnitLabel,
  formatInventoryQuantityNumber,
} from './inventoryUnitDisplay.js'
import { formatStockQuantity } from './stockUtils.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('formatInventoryUnit', () => {
  it('pluralizes countable units and keeps singular for exactly 1', () => {
    expect(formatInventoryUnit(1, 'Piece')).toBe('1 Piece')
    expect(formatInventoryUnit(2, 'Piece')).toBe('2 Pieces')
    expect(formatInventoryUnit(6, 'Piece')).toBe('6 Pieces')
    expect(formatInventoryUnit(0, 'Piece')).toBe('0 Pieces')

    expect(formatInventoryUnit(1, 'Bottle')).toBe('1 Bottle')
    expect(formatInventoryUnit(2, 'Bottle')).toBe('2 Bottles')
    expect(formatInventoryUnit(6, 'Bottle')).toBe('6 Bottles')
    expect(formatInventoryUnit(0, 'Bottle')).toBe('0 Bottles')

    expect(formatInventoryUnit(1, 'Can')).toBe('1 Can')
    expect(formatInventoryUnit(4, 'Can')).toBe('4 Cans')

    expect(formatInventoryUnit(1, 'Roll')).toBe('1 Roll')
    expect(formatInventoryUnit(2, 'Roll')).toBe('2 Rolls')

    expect(formatInventoryUnit(1, 'Keg')).toBe('1 Keg')
    expect(formatInventoryUnit(3, 'Keg')).toBe('3 Kegs')
  })

  it('formats measured units with abbreviations and never pluralizes them', () => {
    expect(formatInventoryUnit(250, 'Gram')).toBe('250 g')
    expect(formatInventoryUnit(1, 'Kilogram')).toBe('1 kg')
    expect(formatInventoryUnit(2, 'Kilogram')).toBe('2 kg')
    expect(formatInventoryUnit(0.5, 'Kilogram')).toBe('0.5 kg')
    expect(formatInventoryUnit(500, 'Milliliter')).toBe('500 mL')
    expect(formatInventoryUnit(250, 'Milliliter')).toBe('250 mL')
    expect(formatInventoryUnit(1, 'Liter')).toBe('1 L')
    expect(formatInventoryUnit(2, 'Liter')).toBe('2 L')

    expect(formatInventoryUnit(1, 'kg')).toBe('1 kg')
    expect(formatInventoryUnit(250, 'g')).toBe('250 g')
    expect(formatInventoryUnit(1, 'L')).toBe('1 L')
    expect(formatInventoryUnit(500, 'ml')).toBe('500 mL')

    expect(formatInventoryUnit(2, 'Kilogram')).not.toContain('Kilograms')
    expect(formatInventoryUnit(2, 'Gram')).not.toContain('Grams')
    expect(formatInventoryUnit(2, 'Liter')).not.toContain('Liters')
    expect(formatInventoryUnit(2, 'Milliliter')).not.toContain('Milliliters')
  })

  it('is case-insensitive for canonical countable and measured units', () => {
    expect(formatInventoryUnit(2, 'piece')).toBe('2 Pieces')
    expect(formatInventoryUnit(2, 'BOTTLE')).toBe('2 Bottles')
    expect(formatInventoryUnit(1, 'kilogram')).toBe('1 kg')
  })

  it('leaves unknown / legacy unit strings unchanged after the quantity', () => {
    expect(formatInventoryUnit(3, 'Bottle 700ml')).toBe('3 Bottle 700ml')
    expect(formatInventoryUnit(1, '')).toBe('1')
    expect(formatInventoryQuantityNumber(12.5)).toBe('12.5')
  })

  it('exposes singular labels for unit-only presentation', () => {
    expect(formatInventoryUnitLabel('Piece')).toBe('Piece')
    expect(formatInventoryUnitLabel('Kilogram')).toBe('kg')
    expect(formatInventoryUnitLabel('Milliliter')).toBe('mL')
  })

  it('is reused by formatStockQuantity for Stock workspaces', () => {
    expect(formatStockQuantity(6, 'Piece')).toBe('6 Pieces')
    expect(formatStockQuantity(1, 'Bottle')).toBe('1 Bottle')
    expect(formatStockQuantity(250, 'Gram')).toBe('250 g')

    const stockUtils = readFileSync(resolve('src/lib/stockUtils.js'), 'utf8')
    expect(stockUtils).toContain("from './inventoryUnitDisplay'")
    expect(stockUtils).toContain('return formatInventoryUnit(value, unit)')

    const count = readFileSync(
      resolve('src/components/stock/InventoryCountSessionWorkspace.jsx'),
      'utf8',
    )
    expect(count).not.toContain('formatInventoryUnit')
    expect(count).not.toContain('inventoryUnitDisplay')
  })
})

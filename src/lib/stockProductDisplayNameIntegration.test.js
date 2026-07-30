/**
 * P8.31.7b — Computed Display Name Integration
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildProductDisplayName,
  buildProductDisplayNameFromItem,
} from './stockProductIdentity.js'

const SAMPLE = Object.freeze({
  brand: 'Belvedere',
  name: 'Vodka',
  size: '1 L',
  unit: 'Bottle',
  packagingNote: 'Case of 6',
  barcode: '5901234123457',
})

describe('P8.31.7b computed display name integration', () => {
  it('Dashboard / Storage / Drawer / Picker / movement modals render computed display', () => {
    const surfaces = [
      'src/components/stock/StockDashboardView.jsx',
      'src/components/stock/StockStorageDetailWorkspace.jsx',
      'src/components/stock/StockProductHistoryDrawer.jsx',
      'src/components/stock/StockStorageReceiveProductPicker.jsx',
      'src/components/stock/StockMovementModal.jsx',
      'src/components/stock/StockTransferModal.jsx',
    ]

    for (const relative of surfaces) {
      const source = readFileSync(resolve(relative), 'utf8')
      expect(source).toContain('buildProductDisplayNameFromItem')
      expect(source).toContain("from '../../lib/stockProductIdentity'")
    }
  })

  it('covers missing Brand, missing Size, Unicode, and deterministic rendering', () => {
    expect(buildProductDisplayNameFromItem({
      brand: '',
      name: 'House Ice',
      size: '1 kg',
    })).toBe('House Ice 1 kg')

    expect(buildProductDisplayNameFromItem({
      brand: 'Coca-Cola',
      name: 'Zero',
      size: null,
    })).toBe('Coca-Cola Zero')

    expect(buildProductDisplayNameFromItem({
      brand: ' Κτήμα Καριπίδη ',
      name: ' Μαλαγουζιά ',
      size: '750 ml',
    })).toBe('Κτήμα Καριπίδη Μαλαγουζιά 750 ml')

    const first = buildProductDisplayNameFromItem(SAMPLE)
    const second = buildProductDisplayNameFromItem(SAMPLE)
    expect(first).toBe('Belvedere Vodka 1 L')
    expect(second).toBe(first)
    expect(first).toBe(buildProductDisplayName({
      brand: SAMPLE.brand,
      name: SAMPLE.name,
      size: SAMPLE.size,
    }))
  })

  it('does not mutate stored Product Name on the item object', () => {
    const item = {
      brand: 'Belvedere',
      name: 'Vodka',
      size: '1 L',
    }
    const before = { ...item }
    const title = buildProductDisplayNameFromItem(item)
    expect(title).toBe('Belvedere Vodka 1 L')
    expect(item).toEqual(before)
    expect(item.name).toBe('Vodka')
  })

  it('defers Inventory Count — no identity display wiring', () => {
    const count = readFileSync(
      resolve('src/components/stock/InventoryCountSessionWorkspace.jsx'),
      'utf8',
    )
    expect(count).not.toContain('stockProductIdentity')
    expect(count).not.toContain('buildProductDisplayName')
    expect(count).not.toContain('buildProductDisplayNameFromItem')
    expect(count).toContain('{item.name}')
  })
})

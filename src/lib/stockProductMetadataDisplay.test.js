/**
 * P8.31.6d — Product Metadata Display Integration
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildStockProductInformationRows,
  buildStockProductSearchHaystack,
  formatStockProductBrandSizeLine,
} from './stockProductMetadataDisplay.js'
import { filterStockDashboardItems } from './stockDashboardBrowse.js'
import { buildStorageProductRows } from '../services/stockStorageCenterService.js'

describe('formatStockProductBrandSizeLine', () => {
  it('joins brand and size, omits empties', () => {
    expect(formatStockProductBrandSizeLine({ brand: 'Belvedere', size: '1 L' }))
      .toBe('Belvedere · 1 L')
    expect(formatStockProductBrandSizeLine({ brand: 'Belvedere', size: '' }))
      .toBe('Belvedere')
    expect(formatStockProductBrandSizeLine({ brand: '', size: '700 ml' }))
      .toBe('700 ml')
    expect(formatStockProductBrandSizeLine({ brand: null, size: null })).toBe('')
  })
})

describe('buildStockProductInformationRows', () => {
  it('includes present metadata and omits empty labels', () => {
    const rows = buildStockProductInformationRows({
      brand: 'Belvedere',
      size: '1 L',
      barcode: '5901234123457',
      packagingNote: 'Usually supplied in cases',
      supplier: 'Supplier Co',
      storageLocation: 'Main Storage',
      unit: 'Bottle',
    })
    expect(rows.map((row) => row.key)).toEqual([
      'brand',
      'size',
      'barcode',
      'packagingNote',
      'supplier',
      'storage',
      'unit',
    ])
  })

  it('omits missing brand/size/barcode/packaging without N/A', () => {
    const rows = buildStockProductInformationRows({
      brand: '',
      size: null,
      barcode: '   ',
      packagingNote: null,
      unit: 'Can',
    })
    expect(rows.map((row) => row.key)).toEqual(['unit'])
    expect(rows.every((row) => row.value && row.value !== 'N/A')).toBe(true)
  })
})

describe('Stock search includes brand/size/barcode but not packaging note', () => {
  const catalog = [
    {
      id: '1',
      name: 'Vodka',
      brand: 'Belvedere',
      size: '1 L',
      barcode: '111',
      packagingNote: 'secret-case-phrase',
      category: 'Spirits',
      itemType: 'Vodka',
      supplier: 'A',
      storageLocation: 'Bar',
      unit: 'Bottle',
      currentQuantity: 10,
      minimumQuantity: 2,
      active: true,
      status: 'ok',
    },
    {
      id: '2',
      name: 'Cola',
      brand: 'Coca-Cola',
      size: '250 ml',
      barcode: '222',
      packagingNote: 'Often delivered in cases of 24',
      category: 'Beverages',
      itemType: 'Soft Drink',
      supplier: 'B',
      storageLocation: 'Main Storage',
      unit: 'Bottle',
      currentQuantity: 48,
      minimumQuantity: 12,
      active: true,
      status: 'ok',
    },
  ]

  it('matches Brand, Size, and Barcode', () => {
    expect(filterStockDashboardItems(catalog, { searchTerm: 'Belvedere' }).map((i) => i.id))
      .toEqual(['1'])
    expect(filterStockDashboardItems(catalog, { searchTerm: '250 ml' }).map((i) => i.id))
      .toEqual(['2'])
    expect(filterStockDashboardItems(catalog, { searchTerm: '222' }).map((i) => i.id))
      .toEqual(['2'])
  })

  it('does not match Packaging Note in general search', () => {
    expect(filterStockDashboardItems(catalog, { searchTerm: 'secret-case-phrase' })).toEqual([])
    expect(filterStockDashboardItems(catalog, { searchTerm: 'Often delivered' })).toEqual([])
  })

  it('haystack excludes packaging note', () => {
    const haystack = buildStockProductSearchHaystack(catalog[0], {
      itemType: 'Vodka',
      location: 'Bar',
    })
    expect(haystack).toContain('belvedere')
    expect(haystack).toContain('1 l')
    expect(haystack).toContain('111')
    expect(haystack).not.toContain('secret-case-phrase')
  })
})

describe('storage product rows carry brand/size without changing quantity', () => {
  it('maps brand/size onto rows and keeps this-storage quantity', () => {
    const rows = buildStorageProductRows({
      balances: [{
        stock_item_id: 'i1',
        quantity: 7,
        quantity_version: 1,
      }],
      items: [{
        id: 'i1',
        name: 'Vodka',
        brand: 'Belvedere',
        size: '1 L',
        barcode: '111',
        packaging_note: 'Cases',
        category: 'Spirits',
        item_type: 'Vodka',
        unit: 'Bottle',
        current_quantity: 99,
        minimum_quantity: 2,
        cost_price: 30,
        storage_location: 'Main Storage',
        supplier: '',
        active: true,
      }],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(7)
    expect(rows[0].brand).toBe('Belvedere')
    expect(rows[0].size).toBe('1 L')
    expect(rows[0].item.currentQuantity).toBe(99)
  })
})

describe('surface wiring and count deferral', () => {
  it('wires Brand/Size on dashboard, storage, history, and picker sources', () => {
    const dashboard = readFileSync(resolve('src/components/stock/StockDashboardView.jsx'), 'utf8')
    const storage = readFileSync(resolve('src/components/stock/StockStorageDetailWorkspace.jsx'), 'utf8')
    const history = readFileSync(resolve('src/components/stock/StockProductHistoryDrawer.jsx'), 'utf8')
    const picker = readFileSync(resolve('src/components/stock/StockStorageReceiveProductPicker.jsx'), 'utf8')
    const count = readFileSync(resolve('src/components/stock/InventoryCountSessionWorkspace.jsx'), 'utf8')

    expect(dashboard).toContain('formatStockProductBrandSizeLine')
    expect(storage).toContain('formatStockProductBrandSizeLine')
    expect(history).toContain('buildStockProductInformationRows')
    expect(history).toContain('Product information')
    expect(picker).toContain('formatStockProductBrandSizeLine')
    expect(count).not.toContain('formatStockProductBrandSizeLine')
    expect(count).not.toContain('stock-product-brand-size')
  })

  it('does not introduce scanner or mutation helpers', () => {
    const helper = readFileSync(resolve('src/lib/stockProductMetadataDisplay.js'), 'utf8')
    expect(helper).not.toMatch(/scan|zxing|quagga|multiply|convert/i)
  })
})

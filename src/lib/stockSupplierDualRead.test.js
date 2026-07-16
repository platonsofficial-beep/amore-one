import { describe, expect, it } from 'vitest'
import {
  resolveSupplierForRead,
  resolveSupplierForStockItem,
  resolveSupplierForStockOrder,
} from './stockSupplierUtils'

describe('resolveSupplierForRead', () => {
  const suppliers = [
    { id: 10, companyName: 'Malakakos AE', active: true },
    { id: 20, companyName: 'Wine House', active: true },
    { id: 30, companyName: 'Old Co', active: false },
  ]

  it('prefers supplier_id over text', () => {
    const result = resolveSupplierForRead({
      supplierId: 20,
      supplierName: 'Malakakos AE',
      suppliers,
    })
    expect(result?.id).toBe(20)
    expect(result?.companyName).toBe('Wine House')
  })

  it('falls back to supplier text when id is missing', () => {
    const result = resolveSupplierForRead({
      supplierId: null,
      supplierName: 'Malakakos AE',
      suppliers,
    })
    expect(result?.id).toBe(10)
  })

  it('falls back to text when id is not found in directory', () => {
    const result = resolveSupplierForRead({
      supplierId: 999,
      supplierName: 'Wine House',
      suppliers,
    })
    expect(result?.id).toBe(20)
  })

  it('returns null when supplier is missing', () => {
    expect(resolveSupplierForRead({
      supplierId: null,
      supplierName: 'Unknown Co',
      suppliers,
    })).toBeNull()
  })

  it('returns null when both id and text are empty', () => {
    expect(resolveSupplierForRead({
      supplierId: null,
      supplierName: '  ',
      suppliers,
    })).toBeNull()
  })

  it('id + text mismatch: id wins', () => {
    const result = resolveSupplierForRead({
      supplierId: 30,
      supplierName: 'Wine House',
      suppliers,
    })
    expect(result?.id).toBe(30)
    expect(result?.companyName).toBe('Old Co')
  })

  it('is null-safe for bad inputs', () => {
    expect(resolveSupplierForRead()).toBeNull()
    expect(resolveSupplierForRead({
      supplierId: 'abc',
      supplierName: null,
      suppliers: null,
    })).toBeNull()
    expect(resolveSupplierForRead({
      supplierId: undefined,
      supplierName: undefined,
      suppliers: undefined,
    })).toBeNull()
  })
})

describe('resolveSupplierForStockItem / Order', () => {
  const suppliers = [
    { id: 10, companyName: 'Malakakos AE' },
    { id: 20, companyName: 'Wine House' },
  ]

  it('resolves stock item by supplierId first', () => {
    const result = resolveSupplierForStockItem({
      supplierId: 20,
      supplier: 'Malakakos AE',
    }, suppliers)
    expect(result?.id).toBe(20)
  })

  it('resolves stock order by text when id missing', () => {
    const result = resolveSupplierForStockOrder({
      supplier_id: null,
      supplier: 'Wine House',
    }, suppliers)
    expect(result?.id).toBe(20)
  })
})

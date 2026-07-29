import { describe, expect, it } from 'vitest'
import { resolveSupplierIdForWrite } from './stockSupplierUtils'
import { serializeStockItem } from '../services/stockItemService'
import { serializeStockOrder } from '../services/stockOrderService'

describe('resolveSupplierIdForWrite', () => {
  const suppliers = [
    { id: 10, companyName: 'Malakakos AE' },
    { id: 20, companyName: 'Wine House' },
  ]

  it('resolves supplier_id from matching company name', () => {
    expect(resolveSupplierIdForWrite({
      supplierName: 'Malakakos AE',
      suppliers,
    })).toBe('10')
  })

  it('returns null when supplier name cannot be resolved', () => {
    expect(resolveSupplierIdForWrite({
      supplierName: 'Unknown Co',
      suppliers,
    })).toBeNull()
  })

  it('returns null when supplier name is empty', () => {
    expect(resolveSupplierIdForWrite({
      supplierName: '  ',
      suppliers,
    })).toBeNull()
  })

  it('prefers explicit supplierId when valid', () => {
    expect(resolveSupplierIdForWrite({
      supplierName: 'Wine House',
      supplierId: 99,
      suppliers,
    })).toBe('99')
  })
})

describe('stock item dual-write serialize', () => {
  it('writes supplier text and resolved supplier_id', () => {
    const payload = serializeStockItem({
      name: 'Ketel One',
      category: 'Spirits',
      itemType: 'Vodka',
      supplier: 'Malakakos AE',
      unit: 'bottle',
      currentQuantity: 12,
      minimumQuantity: 6,
      costPrice: 24.5,
      storageLocation: 'Bar',
    }, 'ws-1', { supplierId: 10 })

    expect(payload.supplier).toBe('Malakakos AE')
    expect(payload.supplier_id).toBe(10)
  })

  it('preserves supplier text and writes null FK when unresolved', () => {
    const payload = serializeStockItem({
      name: 'Ketel One',
      supplier: 'Unknown Co',
      unit: 'bottle',
      currentQuantity: 1,
      minimumQuantity: 0,
    }, 'ws-1', { supplierId: null })

    expect(payload.supplier).toBe('Unknown Co')
    expect(payload.supplier_id).toBeNull()
  })

  it('update path still dual-writes supplier + supplier_id', () => {
    const payload = serializeStockItem({
      name: 'Updated',
      supplier: 'Wine House',
      unit: 'case',
      currentQuantity: 2,
      minimumQuantity: 1,
    }, 'ws-1', { supplierId: 20 })

    const { workspace_id: _workspaceId, ...updatePayload } = payload
    expect(updatePayload.supplier).toBe('Wine House')
    expect(updatePayload.supplier_id).toBe(20)
    expect(updatePayload).not.toHaveProperty('workspace_id')
  })
})

describe('stock order dual-write serialize', () => {
  it('writes supplier text and resolved supplier_id', () => {
    const payload = serializeStockOrder({
      supplier: 'Malakakos AE',
      status: 'draft',
      notes: '',
      items: [{
        stockItemId: 'item-1',
        itemName: 'Ketel One',
        quantity: 2,
        unit: 'bottle',
        costPrice: 24.5,
      }],
    }, 'ws-1', { supplierId: 10 })

    expect(payload.supplier).toBe('Malakakos AE')
    expect(payload.supplier_id).toBe(10)
  })

  it('preserves supplier text and writes null FK when unresolved', () => {
    const payload = serializeStockOrder({
      supplier: 'Unassigned supplier',
      status: 'draft',
      items: [{
        stockItemId: 'item-1',
        itemName: 'Ketel One',
        quantity: 1,
        unit: 'bottle',
        costPrice: 10,
      }],
    }, 'ws-1', { supplierId: null })

    expect(payload.supplier).toBe('Unassigned supplier')
    expect(payload.supplier_id).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeSupplierId,
  resolveSupplierForRead,
  resolveSupplierIdForWrite,
} from './stockSupplierUtils'
import { serializeStockItem } from '../services/stockItemService'
import { serializeStockOrder } from '../services/stockOrderService'
import { buildSupplierOrderGroups, resolveOrderGroupIdentity } from './stockOrderUtils'

const SUPPLIER_UUID_A = '11111111-1111-4111-8111-111111111111'
const SUPPLIER_UUID_B = '22222222-2222-4222-8222-222222222222'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

describe('normalizeSupplierId (P8.26.6c opaque IDs)', () => {
  it('returns null for blank inputs', () => {
    expect(normalizeSupplierId(null)).toBeNull()
    expect(normalizeSupplierId(undefined)).toBeNull()
    expect(normalizeSupplierId('')).toBeNull()
    expect(normalizeSupplierId('   ')).toBeNull()
  })

  it('preserves UUID strings unchanged after trim', () => {
    expect(normalizeSupplierId(SUPPLIER_UUID_A)).toBe(SUPPLIER_UUID_A)
    expect(normalizeSupplierId(`  ${SUPPLIER_UUID_A}  `)).toBe(SUPPLIER_UUID_A)
  })

  it('stringifies legacy numeric fixtures without Number() validation', () => {
    expect(normalizeSupplierId(10)).toBe('10')
    expect(normalizeSupplierId('99')).toBe('99')
  })
})

describe('resolveSupplierIdForWrite UUID directory resolution', () => {
  const suppliers = [
    { id: SUPPLIER_UUID_A, companyName: 'Malakakos AE' },
    { id: SUPPLIER_UUID_B, companyName: 'Wine House' },
  ]

  it('resolves UUID from matching same-workspace directory name', () => {
    expect(resolveSupplierIdForWrite({
      supplierName: 'Malakakos AE',
      suppliers,
    })).toBe(SUPPLIER_UUID_A)
  })

  it('prefers explicit UUID supplierId', () => {
    expect(resolveSupplierIdForWrite({
      supplierName: 'Wine House',
      supplierId: SUPPLIER_UUID_B,
      suppliers,
    })).toBe(SUPPLIER_UUID_B)
  })

  it('returns null for unmatched / blank / no-supplier', () => {
    expect(resolveSupplierIdForWrite({
      supplierName: 'Unknown Co',
      suppliers,
    })).toBeNull()
    expect(resolveSupplierIdForWrite({
      supplierName: '  ',
      suppliers,
    })).toBeNull()
    expect(resolveSupplierIdForWrite({
      supplierName: '',
      supplierId: null,
      suppliers,
    })).toBeNull()
  })

  it('uses only the provided workspace supplier list for name resolution', () => {
    const otherWorkspaceOnly = [
      { id: '33333333-3333-4333-8333-333333333333', companyName: 'Malakakos AE' },
    ]
    expect(resolveSupplierIdForWrite({
      supplierName: 'Malakakos AE',
      suppliers: otherWorkspaceOnly,
    })).toBe('33333333-3333-4333-8333-333333333333')
    expect(resolveSupplierIdForWrite({
      supplierName: 'Wine House',
      suppliers: otherWorkspaceOnly,
    })).toBeNull()
  })
})

describe('resolveSupplierForRead UUID', () => {
  const suppliers = [
    { id: SUPPLIER_UUID_A, companyName: 'Malakakos AE', active: true },
    { id: SUPPLIER_UUID_B, companyName: 'Wine House', active: true },
  ]

  it('prefers UUID supplier_id over text', () => {
    const result = resolveSupplierForRead({
      supplierId: SUPPLIER_UUID_B,
      supplierName: 'Malakakos AE',
      suppliers,
    })
    expect(result?.id).toBe(SUPPLIER_UUID_B)
    expect(result?.companyName).toBe('Wine House')
  })
})

describe('stock item dual-write serialize with UUID', () => {
  it('writes supplier text and UUID supplier_id', () => {
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
    }, 'ws-1', { supplierId: SUPPLIER_UUID_A })

    expect(payload.supplier).toBe('Malakakos AE')
    expect(payload.supplier_id).toBe(SUPPLIER_UUID_A)
  })

  it('writes null supplier_id for No Supplier', () => {
    const payload = serializeStockItem({
      name: 'Ketel One',
      supplier: '',
      unit: 'bottle',
      currentQuantity: 1,
      minimumQuantity: 0,
    }, 'ws-1', { supplierId: null })

    expect(payload.supplier).toBe('')
    expect(payload.supplier_id).toBeNull()
  })

  it('preserves unmatched supplier text with null FK', () => {
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
})

describe('stock order dual-write serialize with UUID', () => {
  it('writes supplier text and UUID supplier_id', () => {
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
    }, 'ws-1', { supplierId: SUPPLIER_UUID_A })

    expect(payload.supplier).toBe('Malakakos AE')
    expect(payload.supplier_id).toBe(SUPPLIER_UUID_A)
  })
})

describe('stock order grouping with UUID', () => {
  it('groups and compares by opaque UUID string equality', () => {
    const groups = buildSupplierOrderGroups([
      {
        id: 'a',
        name: 'A',
        active: true,
        currentQuantity: 1,
        minimumQuantity: 5,
        unit: 'bottle',
        costPrice: 10,
        supplierId: SUPPLIER_UUID_A,
        supplier: 'Wrong Text',
      },
      {
        id: 'b',
        name: 'B',
        active: true,
        currentQuantity: 1,
        minimumQuantity: 5,
        unit: 'bottle',
        costPrice: 10,
        supplierId: SUPPLIER_UUID_A,
        supplier: 'Malakakos AE',
      },
    ], [{ id: SUPPLIER_UUID_A, companyName: 'Malakakos AE' }])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplierId).toBe(SUPPLIER_UUID_A)
    expect(groups[0].groupKey).toBe(`id:${SUPPLIER_UUID_A}`)
    expect(groups[0].supplier).toBe('Malakakos AE')
  })

  it('keeps distinct UUID suppliers separate with identical text', () => {
    const identityA = resolveOrderGroupIdentity(
      { supplierId: SUPPLIER_UUID_A, supplier: 'Acme' },
      [
        { id: SUPPLIER_UUID_A, companyName: 'Acme' },
        { id: SUPPLIER_UUID_B, companyName: 'Acme' },
      ],
    )
    const identityB = resolveOrderGroupIdentity(
      { supplierId: SUPPLIER_UUID_B, supplier: 'Acme' },
      [
        { id: SUPPLIER_UUID_A, companyName: 'Acme' },
        { id: SUPPLIER_UUID_B, companyName: 'Acme' },
      ],
    )

    expect(identityA.groupKey).not.toBe(identityB.groupKey)
    expect(identityA.supplierId).toBe(SUPPLIER_UUID_A)
    expect(identityB.supplierId).toBe(SUPPLIER_UUID_B)
  })
})

describe('mapStockItem / mapStockOrder UUID mapping via list services', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('maps stock_items.supplier_id UUID unchanged', async () => {
    const { getStockItems } = await import('../services/stockItemService.js')
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({
        data: [{
          id: 'item-1',
          workspace_id: 'ws-1',
          name: 'Ketel One',
          category: 'Spirits',
          item_type: 'Vodka',
          supplier: 'Malakakos AE',
          supplier_id: SUPPLIER_UUID_A,
          unit: 'bottle',
          current_quantity: 1,
          minimum_quantity: 0,
          cost_price: 10,
          storage_location: 'Bar',
          active: true,
        }],
        error: null,
      })),
    }
    fromMock.mockReturnValue(query)

    const items = await getStockItems('ws-1')
    expect(items[0].supplierId).toBe(SUPPLIER_UUID_A)
    expect(items[0].supplier).toBe('Malakakos AE')
  })

  it('maps stock_orders.supplier_id UUID unchanged', async () => {
    const { getStockOrders } = await import('../services/stockOrderService.js')
    const ordersQuery = {
      select: vi.fn(() => ordersQuery),
      eq: vi.fn(() => ordersQuery),
      order: vi.fn(() => Promise.resolve({
        data: [{
          id: 'ord-1',
          workspace_id: 'ws-1',
          supplier: 'Malakakos AE',
          supplier_id: SUPPLIER_UUID_A,
          status: 'draft',
          total_cost: 0,
          notes: '',
        }],
        error: null,
      })),
    }
    const emptyItemsQuery = {
      select: vi.fn(() => emptyItemsQuery),
      in: vi.fn(() => emptyItemsQuery),
      order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }
    fromMock.mockImplementation((table) => (
      table === 'stock_orders' ? ordersQuery : emptyItemsQuery
    ))

    const orders = await getStockOrders('ws-1')
    expect(orders[0].supplierId).toBe(SUPPLIER_UUID_A)
  })
})

describe('no numeric supplier-id normalization in relevant helpers', () => {
  it('source helpers do not Number()/parseInt() supplier identities', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const here = dirname(fileURLToPath(import.meta.url))
    const files = [
      join(here, 'stockSupplierUtils.js'),
      join(here, 'stockOrderUtils.js'),
      join(here, '../services/stockItemService.js'),
      join(here, '../services/stockOrderService.js'),
    ]
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/Number\(\s*(explicit|parsed|raw|match\.id|supplierId|supplier_id|supplier\?\.id)/)
      expect(source).not.toMatch(/parseInt\(\s*(explicit|raw|supplier)/)
    }
  })
})

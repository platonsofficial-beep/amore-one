import { describe, expect, it } from 'vitest'
import {
  buildStockOrdersOperationsSummary,
  buildSupplierOrderGroups,
  getActiveStockItemsForDraftReplace,
  isStockOrderLineInactive,
  replaceDraftOrderLineProduct,
  resolveOrderGroupIdentity,
  UNASSIGNED_SUPPLIER,
} from './stockOrderUtils'

function needsOrderItem(overrides = {}) {
  return {
    id: 'item-1',
    name: 'Ketel One',
    active: true,
    currentQuantity: 2,
    minimumQuantity: 6,
    targetQuantity: null,
    unit: 'bottle',
    costPrice: 24.5,
    supplier: '',
    supplierId: null,
    ...overrides,
  }
}

describe('stockOrderUtils', () => {
  it('counts draft, awaiting, and partial orders for manager workflow', () => {
    const summary = buildStockOrdersOperationsSummary([
      { id: '1', status: 'draft' },
      { id: '2', status: 'sent', items: [{ quantity: 10, receivedQuantity: 0 }] },
      {
        id: '3',
        status: 'sent',
        items: [{ quantity: 10, receivedQuantity: 4 }],
      },
      { id: '4', status: 'received', items: [{ quantity: 5, receivedQuantity: 5 }] },
    ])

    expect(summary).toEqual({
      draftCount: 1,
      awaitingDeliveryCount: 1,
      partialCount: 1,
      pendingCount: 3,
    })
  })
})

describe('buildSupplierOrderGroups (FK-first)', () => {
  it('groups by supplier_id when present', () => {
    const groups = buildSupplierOrderGroups([
      needsOrderItem({
        id: 'a',
        supplierId: 10,
        supplier: 'Wrong Text',
        name: 'A',
      }),
      needsOrderItem({
        id: 'b',
        supplierId: 10,
        supplier: 'Malakakos AE',
        name: 'B',
      }),
    ], [{ id: 10, companyName: 'Malakakos AE' }])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplierId).toBe(10)
    expect(groups[0].supplier).toBe('Malakakos AE')
    expect(groups[0].groupKey).toBe('id:10')
    expect(groups[0].items).toHaveLength(2)
  })

  it('falls back to legacy text when FK missing', () => {
    const groups = buildSupplierOrderGroups([
      needsOrderItem({
        id: 'a',
        supplierId: null,
        supplier: 'Wine House',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplierId).toBeNull()
    expect(groups[0].supplier).toBe('Wine House')
    expect(groups[0].groupKey).toBe('name:Wine House')
  })

  it('supports mixed FK + legacy datasets without merging', () => {
    const groups = buildSupplierOrderGroups([
      needsOrderItem({
        id: 'fk',
        supplierId: 10,
        supplier: 'Malakakos AE',
      }),
      needsOrderItem({
        id: 'legacy',
        supplierId: null,
        supplier: 'Malakakos AE',
      }),
    ], [{ id: 10, companyName: 'Malakakos AE' }])

    expect(groups).toHaveLength(2)
    const keys = groups.map((group) => group.groupKey).sort()
    expect(keys).toEqual(['id:10', 'name:Malakakos AE'])
  })

  it('preserves Unassigned supplier', () => {
    const groups = buildSupplierOrderGroups([
      needsOrderItem({
        id: 'u',
        supplierId: null,
        supplier: '  ',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplier).toBe(UNASSIGNED_SUPPLIER)
    expect(groups[0].supplierId).toBeNull()
    expect(groups[0].groupKey).toBe(`name:${UNASSIGNED_SUPPLIER}`)
  })

  it('supplier_id precedence: text does not split or reassign FK groups', () => {
    const groups = buildSupplierOrderGroups([
      needsOrderItem({
        id: 'a',
        supplierId: 20,
        supplier: 'Malakakos AE',
      }),
      needsOrderItem({
        id: 'b',
        supplierId: 20,
        supplier: 'Totally Different Text',
      }),
    ], [{ id: 20, companyName: 'Wine House' }])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplierId).toBe(20)
    expect(groups[0].supplier).toBe('Wine House')
  })

  it('never creates duplicate groups for the same supplier_id', () => {
    const groups = buildSupplierOrderGroups([
      needsOrderItem({ id: '1', supplierId: 7, supplier: 'A' }),
      needsOrderItem({ id: '2', supplierId: 7, supplier: 'B' }),
      needsOrderItem({ id: '3', supplierId: 7, supplier: 'C' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(3)
  })

  it('keeps different supplier ids separate even with identical text', () => {
    const identityA = resolveOrderGroupIdentity(
      { supplierId: 1, supplier: 'Acme' },
      [{ id: 1, companyName: 'Acme' }, { id: 2, companyName: 'Acme' }],
    )
    const identityB = resolveOrderGroupIdentity(
      { supplierId: 2, supplier: 'Acme' },
      [{ id: 1, companyName: 'Acme' }, { id: 2, companyName: 'Acme' }],
    )

    expect(identityA.groupKey).not.toBe(identityB.groupKey)
    expect(identityA.supplierId).toBe(1)
    expect(identityB.supplierId).toBe(2)
  })

  it('excludes inactive products from new purchase order suggestions', () => {
    const groups = buildSupplierOrderGroups([
      needsOrderItem({ id: 'active', name: 'Belvedere', active: true }),
      needsOrderItem({ id: 'gone', name: 'KETEL ONE', active: false }),
    ], [{ id: 10, companyName: 'Malakakos AE' }])

    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((item) => item.stockItemId)).toEqual(['active'])
  })
})

describe('draft inactive line helpers (P8.16.15)', () => {
  it('detects inactive lines from live catalog only', () => {
    expect(isStockOrderLineInactive(
      { stockItemId: 'ko' },
      [{ id: 'ko', active: false }],
    )).toBe(true)

    expect(isStockOrderLineInactive(
      { stockItemId: 'ko' },
      [{ id: 'ko', active: true }],
    )).toBe(false)

    expect(isStockOrderLineInactive(
      { stockItemId: 'missing' },
      [{ id: 'ko', active: false }],
    )).toBe(false)

    expect(isStockOrderLineInactive({ stockItemId: null }, [{ id: 'ko', active: false }])).toBe(false)
  })

  it('lists only active unused products for replace', () => {
    const options = getActiveStockItemsForDraftReplace([
      { id: 'a', name: 'Absolut', active: true },
      { id: 'b', name: 'Belvedere', active: true },
      { id: 'c', name: 'KETEL ONE', active: false },
    ], { excludeStockItemIds: ['a'] })

    expect(options.map((item) => item.id)).toEqual(['b'])
  })

  it('replace preserves draft line id and quantity', () => {
    const next = replaceDraftOrderLineProduct(
      {
        id: 'line-1',
        stockItemId: 'ko',
        itemName: 'KETEL ONE',
        quantity: 7,
        unit: 'Bottle',
        costPrice: 22,
        totalPrice: 154,
      },
      {
        id: 'bel',
        name: 'Belvedere',
        unit: 'Bottle',
        costPrice: 30,
      },
    )

    expect(next).toMatchObject({
      id: 'line-1',
      stockItemId: 'bel',
      itemName: 'Belvedere',
      quantity: 7,
      unit: 'Bottle',
      costPrice: 30,
      totalPrice: 210,
    })
  })
})

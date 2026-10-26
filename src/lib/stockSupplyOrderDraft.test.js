import { describe, expect, it } from 'vitest'
import {
  buildSupplyOrderDraftGroups,
  findOpenSupplierDraft,
  formatSupplyOrderDraftNotice,
  formatSupplyOrderDraftPreview,
  isOrderSourceStorage,
  planSupplyOrderDraftWrites,
  SUPPLY_ORDER_DRAFT_EMPTY_MESSAGE,
  supplyOrderQuantity,
} from './stockSupplyOrderDraft'

const cola = {
  id: 'cola',
  name: 'Cola',
  active: true,
  unit: 'btl',
  costPrice: 2,
  currentQuantity: 0,
  targetQuantity: 2,
  supplierId: 'sup-wine',
  supplier: 'Wrong text',
}

const tonic = {
  id: 'tonic',
  name: 'Tonic',
  active: true,
  unit: 'btl',
  costPrice: 1.5,
  currentQuantity: 0,
  minimumQuantity: 1,
  supplierId: null,
  supplier: 'Local',
}

describe('supply order drafts', () => {
  it('sums par minus on-hand for supply and buying storages only', () => {
    const storages = [
      { id: 'soft', active: true, isSupply: true },
      { id: 'bar', active: true, isSupply: false, isBuying: true },
      { id: 'shelf', active: true, isSupply: false, isBuying: false },
      { id: 'old', active: false, isSupply: true },
    ]

    expect(isOrderSourceStorage(storages[0])).toBe(true)
    expect(isOrderSourceStorage(storages[1])).toBe(true)
    expect(isOrderSourceStorage(storages[2])).toBe(false)
    expect(isOrderSourceStorage(storages[3])).toBe(false)

    expect(supplyOrderQuantity({
      itemId: 'cola',
      storages,
      balances: [
        { stock_item_id: 'cola', workspace_storage_id: 'soft', quantity: 2 },
        { stock_item_id: 'cola', workspace_storage_id: 'bar', quantity: 1 },
        { stock_item_id: 'cola', workspace_storage_id: 'shelf', quantity: 0 },
      ],
      pars: [
        { stock_item_id: 'cola', workspace_storage_id: 'soft', par_quantity: 6 },
        { stock_item_id: 'cola', workspace_storage_id: 'bar', par_quantity: 4 },
        { stock_item_id: 'cola', workspace_storage_id: 'shelf', par_quantity: 20 },
        { stock_item_id: 'cola', workspace_storage_id: 'old', par_quantity: 9 },
        { stock_item_id: 'cola', workspace_storage_id: 'soft', par_quantity: null },
      ],
    })).toBe(7)
  })

  it('treats a missing balance as zero and ignores a blank par', () => {
    expect(supplyOrderQuantity({
      itemId: 'cola',
      storages: [{ id: 'soft', active: true, isSupply: true }],
      balances: [],
      pars: [{ stock_item_id: 'cola', workspace_storage_id: 'soft', par_quantity: 3 }],
    })).toBe(3)

    expect(supplyOrderQuantity({
      itemId: 'cola',
      storages: [{ id: 'soft', active: true, is_supply: true }],
      balances: [],
      pars: [{ stock_item_id: 'cola', workspace_storage_id: 'soft', par_quantity: null }],
    })).toBe(0)
  })

  it('builds one group per supplier from the shared to-order set', () => {
    const groups = buildSupplyOrderDraftGroups({
      items: [
        { ...cola, currentQuantity: 1, targetQuantity: 4 },
        { ...tonic, minimumQuantity: 2 },
        { ...cola, id: 'full', name: 'Full', currentQuantity: 5, targetQuantity: 5, minimumQuantity: 5 },
      ],
      suppliers: [{ id: 'sup-wine', companyName: 'Wine House' }],
      storages: [{ id: 'soft', active: true, isSupply: true }],
      balances: [
        { stock_item_id: 'cola', workspace_storage_id: 'soft', quantity: 1 },
        { stock_item_id: 'full', workspace_storage_id: 'soft', quantity: 5 },
      ],
      pars: [
        { stock_item_id: 'cola', workspace_storage_id: 'soft', par_quantity: 4 },
        { stock_item_id: 'tonic', workspace_storage_id: 'soft', par_quantity: 2 },
        { stock_item_id: 'full', workspace_storage_id: 'soft', par_quantity: 5 },
      ],
    })

    expect(groups.map((group) => group.supplier)).toEqual(['Local', 'Wine House'])
    expect(groups[1].supplierId).toBe('sup-wine')
    expect(groups[1].items.map((item) => [item.itemName, item.quantity])).toEqual([['Cola', 3]])
    expect(groups[0].items[0].quantity).toBe(2)
  })

  it('refreshes the open supplier draft and creates one when none exists', () => {
    const groups = buildSupplyOrderDraftGroups({
      items: [cola, tonic],
      suppliers: [{ id: 'sup-wine', companyName: 'Wine House' }],
      storages: [{ id: 'soft', active: true, isSupply: true }],
      balances: [],
      pars: [
        { stock_item_id: 'cola', workspace_storage_id: 'soft', par_quantity: 2 },
        { stock_item_id: 'tonic', workspace_storage_id: 'soft', par_quantity: 1 },
      ],
    })
    const plan = planSupplyOrderDraftWrites(groups, [
      {
        id: 'draft-wine',
        status: 'draft',
        supplierId: 'sup-wine',
        supplier: 'Wine House',
        notes: 'Call before noon',
        expectedDeliveryDate: '2026-11-02',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'older-wine',
        status: 'draft',
        supplierId: 'sup-wine',
        supplier: 'Wine House',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'sent-local',
        status: 'sent',
        supplierId: null,
        supplier: 'Local',
      },
    ])

    const wine = plan.find((step) => step.group.supplierId === 'sup-wine')
    const local = plan.find((step) => step.group.supplier === 'Local')
    expect(formatSupplyOrderDraftPreview(plan, [{
      id: 'draft-wine',
      status: 'draft',
      supplierId: 'sup-wine',
      supplier: 'Wine House',
      orderNumber: 1,
      totalCost: 0,
    }])).toEqual(expect.arrayContaining([
      'Update order #0001 for Wine House · €0 → €4',
      expect.stringContaining('Create an order for Local · €'),
    ]))
    expect(wine).toMatchObject({
      action: 'update',
      orderId: 'draft-wine',
      notes: 'Call before noon',
      expectedDeliveryDate: '2026-11-02',
    })
    expect(local).toMatchObject({ action: 'create' })
    expect(findOpenSupplierDraft([{ id: 'sent', status: 'sent', supplier: 'Local' }], local.group)).toBeNull()
  })

  it('describes an empty prepare and a mixed create and update', () => {
    expect(formatSupplyOrderDraftNotice()).toBe(SUPPLY_ORDER_DRAFT_EMPTY_MESSAGE)
    expect(formatSupplyOrderDraftNotice({
      created: [{ id: 'a' }],
      updated: [{ id: 'b' }, { id: 'c' }],
    })).toBe('Created 1 order and updated 2 orders. Edit them before sending.')
  })
})

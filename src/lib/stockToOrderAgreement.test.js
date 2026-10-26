import { describe, expect, it } from 'vitest'
import { selectItemsToOrder } from './stockCatalog'
import { filterStockDashboardItems } from './stockDashboardBrowse'
import { buildToOrderSupplierGroups } from './stockInsights'
import { buildSupplierOrderGroups, computeOrderTotalCost, sumSuggestedOrderCost } from './stockOrderUtils'
import { buildSupplyOrderDraftGroups } from './stockSupplyOrderDraft'
import { countWorkspaceItemsBelowPar, sumBelowParCounts } from './stockLiveCard'
import { countBelowParByStorage } from './stockStoragePar'
import { buildStockDashboardSummary } from './stockUtils'

/**
 * Live dashboard bug: KPI To order counted catalog shortfall (131) while the
 * card added Out + Low (40). Every To order surface has to use one list.
 */
describe('to order agreement', () => {
  const catalog = [
    {
      id: 'out',
      name: 'Ramnista',
      active: true,
      supplier: 'Premium Spirits Distribution Ltd',
      supplierId: 'sup-spirits',
      currentQuantity: 0,
      minimumQuantity: 2,
      targetQuantity: 10,
      costPrice: 5,
      unit: 'btl',
      status: 'out',
    },
    {
      id: 'between',
      name: 'Ramnista',
      size: '70cl',
      active: true,
      supplier: 'Premium Spirits Distribution Ltd',
      supplierId: 'sup-spirits',
      currentQuantity: 4,
      minimumQuantity: 2,
      targetQuantity: 10,
      costPrice: 2,
      unit: 'btl',
      status: 'ok',
    },
    {
      id: 'low',
      name: 'House wine',
      size: '1 L',
      active: true,
      supplier: 'Cyprus Fine Wines Trading',
      supplierId: 'sup-wine',
      currentQuantity: 1,
      minimumQuantity: 3,
      targetQuantity: 8,
      costPrice: 4,
      unit: 'btl',
      status: 'low',
    },
    {
      id: 'healthy',
      name: 'Soda',
      active: true,
      supplier: 'FreshServe Food Solutions',
      currentQuantity: 20,
      minimumQuantity: 2,
      targetQuantity: 10,
      costPrice: 1,
      unit: 'btl',
      status: 'ok',
    },
    {
      id: 'inactive',
      name: 'Old gin',
      active: false,
      supplier: 'Premium Spirits Distribution Ltd',
      currentQuantity: 0,
      minimumQuantity: 1,
      targetQuantity: 5,
      costPrice: 9,
      unit: 'btl',
      status: 'out',
    },
  ]

  it('uses one set for the KPI, card, filter, create order, and suggest order', () => {
    const toOrder = selectItemsToOrder(catalog)
    const summary = buildStockDashboardSummary(catalog)
    const cardGroups = buildToOrderSupplierGroups(catalog)
    const filtered = filterStockDashboardItems(catalog, { statusFilter: 'order' })
    const createGroups = buildSupplierOrderGroups(catalog)
    const suggestGroups = buildSupplyOrderDraftGroups({
      items: catalog,
      storages: [{ id: 'bar', active: true, isSupply: true }],
      balances: [],
      pars: [{ stock_item_id: 'healthy', workspace_storage_id: 'bar', par_quantity: 99 }],
    })

    const cardCount = cardGroups.reduce((sum, group) => sum + group.count, 0)
    const createCount = createGroups.reduce((sum, group) => sum + group.items.length, 0)
    const suggestCount = suggestGroups.reduce((sum, group) => sum + group.items.length, 0)
    const createTotal = createGroups.reduce((sum, group) => sum + group.totalCost, 0)
    const suggestTotal = suggestGroups.reduce((sum, group) => sum + group.totalCost, 0)
    const expectedTotal = sumSuggestedOrderCost(catalog)

    expect(toOrder.map((item) => item.id)).toEqual(['out', 'between', 'low'])
    expect(summary.outOfStock + summary.lowStock).toBe(2)
    expect(summary.toOrder).toBe(3)
    expect(summary.toOrder).not.toBe(summary.outOfStock + summary.lowStock)
    expect(cardCount).toBe(summary.toOrder)
    expect(filtered.map((item) => item.id)).toEqual(toOrder.map((item) => item.id))
    expect(createCount).toBe(summary.toOrder)
    expect(suggestCount).toBe(summary.toOrder)
    expect(createTotal).toBe(expectedTotal)
    expect(suggestTotal).toBe(expectedTotal)
    expect(computeOrderTotalCost(suggestGroups.flatMap((group) => group.items))).toBe(expectedTotal)
    expect(suggestGroups.some((group) => group.items.some((item) => item.stockItemId === 'healthy'))).toBe(false)
  })

  it('keeps shelf below-par totals equal to the sum of each storage list', () => {
    const balances = [
      { stock_item_id: 'a', workspace_storage_id: 'bar', quantity: 1 },
      { stock_item_id: 'b', workspace_storage_id: 'fridge', quantity: 0 },
    ]
    const pars = [
      { stock_item_id: 'a', workspace_storage_id: 'bar', par_quantity: 4 },
      { stock_item_id: 'b', workspace_storage_id: 'fridge', par_quantity: 2 },
      { stock_item_id: 'c', workspace_storage_id: 'bar', par_quantity: 0 },
    ]
    const byStorage = countBelowParByStorage({ balances, pars })
    expect(countWorkspaceItemsBelowPar({ balances, pars })).toBe(sumBelowParCounts(byStorage))
    expect(countWorkspaceItemsBelowPar({ balances, pars })).toBe(2)
  })
})

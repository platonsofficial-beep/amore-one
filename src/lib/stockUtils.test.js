import { describe, expect, it } from 'vitest'
import {
  buildStockDashboardSummary,
  buildStockManagerDailySnapshot,
  buildTodayStockActivitySummary,
  formatTodayStockActivityLine,
  getStockModuleAlertItems,
  isStockMovementOnDate,
  resolveDashboardStockAlerts,
  resolveStockItemStatus,
} from './stockUtils'

const TODAY = '2026-07-08'

function makeItem(overrides = {}) {
  return {
    id: 'item-1',
    name: 'Tomatoes',
    active: true,
    currentQuantity: 5,
    minimumQuantity: 10,
    unit: 'kg',
    ...overrides,
  }
}

describe('stockUtils', () => {
  it('resolves out and low stock status from quantity thresholds', () => {
    expect(resolveStockItemStatus(makeItem({ currentQuantity: 0 }))).toBe('out')
    expect(resolveStockItemStatus(makeItem({ currentQuantity: 4, minimumQuantity: 10 }))).toBe('low')
    expect(resolveStockItemStatus(makeItem({ currentQuantity: 12, minimumQuantity: 10 }))).toBe('ok')
    expect(resolveStockItemStatus(makeItem({ active: false }))).toBe('inactive')
  })

  it('builds dashboard summary counts for manager daily view', () => {
    const summary = buildStockDashboardSummary([
      makeItem({ id: '1', currentQuantity: 0, minimumQuantity: 5 }),
      makeItem({ id: '2', currentQuantity: 2, minimumQuantity: 10 }),
      makeItem({ id: '3', currentQuantity: 20, minimumQuantity: 10, targetQuantity: 25 }),
      makeItem({ id: '4', currentQuantity: 30, minimumQuantity: 10 }),
    ])

    expect(summary.totalItems).toBe(4)
    expect(summary.outOfStock).toBe(1)
    expect(summary.lowStock).toBe(1)
    expect(summary.toOrder).toBe(3)
  })

  it('maps stock module alerts with out items ranked before low items', () => {
    const alerts = getStockModuleAlertItems([
      makeItem({ id: 'low-1', name: 'Basil', currentQuantity: 2, minimumQuantity: 8 }),
      makeItem({ id: 'out-1', name: 'Avocado', currentQuantity: 0, minimumQuantity: 4 }),
    ])

    expect(alerts).toHaveLength(2)
    expect(alerts[0]).toMatchObject({
      id: 'out-1',
      name: 'Avocado',
      severity: 'critical',
      status: 'Out of Stock',
    })
    expect(alerts[1]).toMatchObject({
      id: 'low-1',
      severity: 'low',
      status: 'Low Stock',
    })
  })

  it('prefers stock module alerts and falls back to inventory alerts', () => {
    const inventoryAlerts = [
      { id: 'legacy-1', name: 'Legacy item', severity: 'low' },
    ]

    expect(resolveDashboardStockAlerts([], inventoryAlerts)).toEqual(inventoryAlerts)

    expect(resolveDashboardStockAlerts(
      [makeItem({ id: '1', currentQuantity: 12, minimumQuantity: 5 })],
      inventoryAlerts,
    )).toEqual(inventoryAlerts)

    expect(resolveDashboardStockAlerts(
      [makeItem({ id: '1', currentQuantity: 0, minimumQuantity: 5 })],
      inventoryAlerts,
    )).toEqual([expect.objectContaining({ id: '1', severity: 'critical' })])
  })

  it('detects stock movements on a given date key', () => {
    expect(isStockMovementOnDate({ createdAt: '2026-07-08T14:30:00.000Z' }, TODAY)).toBe(true)
    expect(isStockMovementOnDate({ createdAt: '2026-07-06T12:00:00.000Z' }, TODAY)).toBe(false)
  })

  it('summarizes today stock activity from latest item movements', () => {
    const summary = buildTodayStockActivitySummary([
      makeItem({
        id: '1',
        lastMovement: { type: 'stock_count', quantity: 12, createdAt: '2026-07-08T09:00:00.000Z' },
      }),
      makeItem({
        id: '2',
        lastMovement: { type: 'receive', quantity: 6, createdAt: '2026-07-08T11:00:00.000Z' },
      }),
      makeItem({
        id: '3',
        lastMovement: { type: 'usage', quantity: 2, createdAt: '2026-07-07T18:00:00.000Z' },
      }),
    ], TODAY)

    expect(summary.hasActivity).toBe(true)
    expect(summary.itemsTouched).toBe(2)
    expect(summary.counts).toBe(1)
    expect(summary.received).toBe(6)
    expect(formatTodayStockActivityLine(summary)).toBe('1 count · 6 received')
  })

  it('builds a manager daily snapshot with orders and activity', () => {
    const snapshot = buildStockManagerDailySnapshot(
      [
        makeItem({ id: '1', currentQuantity: 0, minimumQuantity: 4 }),
        makeItem({
          id: '2',
          currentQuantity: 8,
          minimumQuantity: 10,
          lastMovement: { type: 'receive', quantity: 3, createdAt: '2026-07-08T08:00:00.000Z' },
        }),
      ],
      {
        draftCount: 1,
        awaitingDeliveryCount: 2,
        partialCount: 1,
        pendingCount: 4,
      },
      TODAY,
    )

    expect(snapshot.outOfStock).toBe(1)
    expect(snapshot.pendingDeliveries).toBe(3)
    expect(snapshot.pendingOrders).toBe(4)
    expect(snapshot.activityLine).toBe('3 received')
  })
})

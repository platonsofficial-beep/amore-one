import { describe, expect, it } from 'vitest'
import {
  REPORT_PERIOD_TODAY,
  REPORT_PERIOD_WEEK,
  buildInsightsAttentionItems,
  buildInsightsHealthSummary,
  buildInsightsStockReport,
  buildReportsBundle,
  buildReportsOverview,
  buildReservationsReport,
  buildScheduleReport,
  buildTasksReport,
} from './reportsUtils'

const TODAY = '2026-07-08'
const WEEK_START = '2026-07-06'

function makeReservation(overrides = {}) {
  return {
    id: 'r1',
    date: TODAY,
    time: '19:00',
    guests: 4,
    status: 'Pending',
    ...overrides,
  }
}

function makeStockItem(overrides = {}) {
  return {
    id: 's1',
    name: 'Tomatoes',
    active: true,
    currentQuantity: 2,
    minimumQuantity: 10,
    costPrice: 5,
    unit: 'kg',
    ...overrides,
  }
}

describe('reportsUtils', () => {
  it('filters reservations by today and week periods', () => {
    const reservations = [
      makeReservation({ id: 'today', date: TODAY }),
      makeReservation({ id: 'week', date: '2026-07-07' }),
      makeReservation({ id: 'outside', date: '2026-07-13' }),
    ]

    const todayReport = buildReservationsReport(reservations, {
      period: REPORT_PERIOD_TODAY,
      todayKey: TODAY,
      weekStartDate: WEEK_START,
      connected: true,
    })
    const weekReport = buildReservationsReport(reservations, {
      period: REPORT_PERIOD_WEEK,
      todayKey: TODAY,
      weekStartDate: WEEK_START,
      connected: true,
    })

    expect(todayReport.metrics.bookings).toBe(1)
    expect(weekReport.metrics.bookings).toBe(2)
  })

  it('returns disconnected placeholders for tasks when module is off', () => {
    const report = buildTasksReport([{ id: '1', status: 'active' }], {
      connected: false,
      todayKey: TODAY,
    })

    expect(report.connected).toBe(false)
    expect(report.metrics.active).toBeNull()
    expect(report.metrics.overdue).toBeNull()
  })

  it('prefers stock module metrics when stock items are available', () => {
    const report = buildInsightsStockReport({
      stockItems: [
        makeStockItem({ currentQuantity: 0, minimumQuantity: 4 }),
        makeStockItem({ id: 's2', currentQuantity: 8, minimumQuantity: 10 }),
      ],
      stockOrders: [
        { id: 'o1', status: 'draft' },
        { id: 'o2', status: 'sent', items: [] },
      ],
      inventoryItems: [{ id: 'legacy', quantity: 99, cost: 1, status: 'In Stock' }],
      stockModuleConnected: true,
      inventoryConnected: true,
      barRefillsConnected: true,
      period: REPORT_PERIOD_TODAY,
      todayKey: TODAY,
    })

    expect(report.stockModuleConnected).toBe(true)
    expect(report.metrics.outOfStock).toBe(1)
    expect(report.metrics.lowStock).toBe(1)
    expect(report.metrics.pendingOrders).toBe(2)
    expect(report.metrics.totalStockValue).toBe(40)
  })

  it('falls back to legacy inventory when stock module data is unavailable', () => {
    const report = buildInsightsStockReport({
      stockItems: [],
      inventoryItems: [
        { id: '1', quantity: 2, cost: 10, status: 'Low Stock' },
        { id: '2', quantity: 0, cost: 5, status: 'Out of Stock', reorderLevel: 5 },
      ],
      stockModuleConnected: false,
      inventoryConnected: true,
      barRefillsConnected: false,
      period: REPORT_PERIOD_TODAY,
      todayKey: TODAY,
    })

    expect(report.stockModuleConnected).toBe(false)
    expect(report.metrics.lowStock).toBe(1)
    expect(report.metrics.outOfStock).toBe(1)
    expect(report.metrics.pendingOrders).toBeNull()
  })

  it('calculates schedule issues for today only', () => {
    const shifts = [
      {
        id: 'shift-1',
        date: TODAY,
        employeeId: 'e1',
        startTime: '09:00',
        endTime: '17:00',
      },
    ]

    const todayReport = buildScheduleReport({
      shifts,
      shiftTemplates: [],
      scheduleCapacities: [],
      employees: [{ id: 'e1', name: 'Alex' }],
      period: REPORT_PERIOD_TODAY,
      todayKey: TODAY,
      weekStartDate: WEEK_START,
      connected: true,
      coverageBreakdown: { gapCount: 1, summaryLine: '1 gap · Kitchen missing 1' },
    })

    const weekReport = buildScheduleReport({
      shifts,
      shiftTemplates: [],
      scheduleCapacities: [],
      employees: [{ id: 'e1', name: 'Alex' }],
      period: REPORT_PERIOD_WEEK,
      todayKey: TODAY,
      weekStartDate: WEEK_START,
      connected: true,
    })

    expect(todayReport.metrics.issues).not.toBeNull()
    expect(weekReport.metrics.issues).toBeNull()
    if (todayReport.metrics.issues > 0) {
      expect(todayReport.coverageDetail).toContain('gap')
    }
  })

  it('builds today overview with covers and pending orders when available', () => {
    const overview = buildReportsOverview({
      period: REPORT_PERIOD_TODAY,
      reservationsReport: {
        connected: true,
        metrics: { bookings: 3, guests: 10, covers: 12 },
      },
      tasksReport: {
        connected: true,
        metrics: { overdue: 2 },
      },
      stockReport: {
        connected: true,
        stockModuleConnected: true,
        metrics: { itemsToOrder: 1, pendingOrders: 4, totalStockValue: 500 },
      },
      scheduleReport: {
        connected: true,
        metrics: { issues: 1 },
      },
    })

    expect(overview.find((card) => card.key === 'covers')?.value).toBe(12)
    expect(overview.find((card) => card.key === 'pending-orders')?.value).toBe(4)
    expect(overview.find((card) => card.key === 'tasks-overdue')?.value).toBe(2)
  })

  it('limits actionable attention items for insights', () => {
    const items = buildInsightsAttentionItems(
      [
        { key: 'task:1', label: 'One' },
        { key: 'task:2', label: 'Two' },
        { key: 'task:3', label: 'Three' },
      ],
      { limit: 2 },
    )

    expect(items).toHaveLength(2)
    expect(items[0].key).toBe('task:1')
  })

  it('summarizes health from attention and service snapshot', () => {
    const stable = buildInsightsHealthSummary({
      period: REPORT_PERIOD_TODAY,
      attentionItems: [],
      tasksReport: { connected: true, metrics: { overdue: 0 } },
      stockReport: { connected: true, metrics: { outOfStock: 0 } },
      scheduleReport: { connected: true, metrics: { issues: 0 } },
      serviceSnapshot: { overallStatus: 'On track' },
    })

    const urgent = buildInsightsHealthSummary({
      period: REPORT_PERIOD_TODAY,
      attentionItems: [{ key: 'task:1' }, { key: 'stock:1' }],
      tasksReport: { connected: true, metrics: { overdue: 0 } },
      stockReport: { connected: true, metrics: { outOfStock: 0 } },
      scheduleReport: { connected: true, metrics: { issues: 0 } },
    })

    expect(stable).toBe('Service: On track')
    expect(urgent).toBe('2 areas need attention today')
  })

  it('builds a reports bundle with service pressure and stock module data', () => {
    const bundle = buildReportsBundle({
      period: REPORT_PERIOD_TODAY,
      todayKey: TODAY,
      weekStartDate: WEEK_START,
      reservations: [makeReservation()],
      tasks: [{ id: 't1', status: 'active', dueDate: TODAY }],
      inventoryItems: [],
      stockItems: [makeStockItem()],
      stockOrders: [{ id: 'o1', status: 'draft' }],
      barRefills: [],
      suppliers: [],
      schedule: { shifts: [], shiftTemplates: [], scheduleCapacities: [], employees: [] },
      connections: {
        reservationsConnected: true,
        tasksConnected: true,
        inventoryConnected: false,
        stockModuleConnected: true,
        barRefillsConnected: false,
        scheduleConnected: true,
        suppliersConnected: true,
      },
      serviceSnapshot: {
        totalCovers: 8,
        seatedGuests: 4,
        waitingCount: 1,
        lateCount: 0,
        overallStatus: 'Busy service',
        overallTone: 'active',
      },
      attentionItems: [{ key: 'task:1', label: 'Overdue task', detail: 'Kitchen' }],
    })

    expect(bundle.reservationsReport.metrics.covers).toBe(8)
    expect(bundle.stockReport.stockModuleConnected).toBe(true)
    expect(bundle.stockReport.metrics.pendingOrders).toBe(1)
    expect(bundle.insightsAttention).toHaveLength(1)
    expect(bundle.healthSummary).toContain('attention')
  })
})

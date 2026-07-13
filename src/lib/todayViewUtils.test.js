import { describe, expect, it } from 'vitest'
import {
  buildAnnouncementAttentionItems,
  buildReservationAttentionItems,
  buildTodayAttentionItems,
  buildTodayStatusSummary,
  getTodayAttentionBucket,
  sortTodayAttentionItems,
} from './todayViewUtils'
import { buildTodayCommandCenterAttentionItems } from './mobileManagerTodayUtils'

const TODAY = '2026-07-08'

describe('todayViewUtils', () => {
  it('includes schedule issue detail with coverage gaps', () => {
    const items = buildTodayAttentionItems({
      todayKey: TODAY,
      snapshot: { issues: 1, coverageGaps: 1 },
      coverageBreakdown: {
        gapCount: 1,
        summaryLine: '1 gap · Kitchen missing 1',
      },
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      key: 'schedule-issues',
      detail: '1 gap · Kitchen missing 1',
    })
  })

  it('builds a richer status summary with covers, open tasks, and stock', () => {
    const summary = buildTodayStatusSummary({
      liveFloor: { state: 'live', onShiftCount: 3 },
      snapshot: { scheduledStaff: 8 },
      reservationsSummary: { bookings: 4, guests: 12 },
      reservationsConnected: true,
      serviceSnapshot: { totalCovers: 18 },
      tasksOverview: { active: 5, overdue: 2, completedToday: 1, showEmptyToday: false },
      tasksConnected: true,
      stockSummary: { outOfStock: 1, lowStock: 2 },
      stockOrdersSummary: { awaitingDeliveryCount: 0, partialCount: 0 },
      stockConnected: true,
      hasStockModuleData: true,
    })

    expect(summary.onShiftSummary).toBe('3 working now')
    expect(summary.reservationsSummaryLine).toContain('4 bookings')
    expect(summary.reservationsSummaryLine).toContain('18 covers')
    expect(summary.tasksSummary).toContain('5 open tasks')
    expect(summary.tasksSummary).toContain('2 overdue')
    expect(summary.stockSummaryLine).toBe('1 out · 2 low')
  })

  it('shows no products copy when stock module has no inventory yet', () => {
    const summary = buildTodayStatusSummary({
      liveFloor: { state: 'idle', onShiftCount: 0 },
      stockConnected: true,
      hasStockModuleData: false,
    })

    expect(summary.stockSummaryLine).toBe('No products yet')
  })

  it('includes coverage gaps in team scheduled summary', () => {
    const summary = buildTodayStatusSummary({
      liveFloor: { state: 'live', onShiftCount: 2 },
      snapshot: { scheduledStaff: 5, coverageGaps: 2 },
    })

    expect(summary.teamScheduledSummary).toBe('5 scheduled · 2 gaps')
  })

  it('prioritizes urgent issues before service actions and information', () => {
    const sorted = sortTodayAttentionItems([
      { key: 'orders:draft', tone: 'warning', priority: 'reminder', label: 'Draft' },
      { key: 'task-due:1', tone: 'info', priority: 'reminder', label: 'Due today' },
      { key: 'task:9', tone: 'warning', priority: 'urgent', label: 'Overdue' },
      { key: 'reservation:service-pressure', tone: 'critical', priority: 'urgent', label: 'Guests' },
      { key: 'announcement:1', tone: 'info', priority: 'reminder', label: 'Note' },
    ])

    expect(sorted.map((item) => item.key)).toEqual([
      'reservation:service-pressure',
      'task:9',
      'orders:draft',
      'task-due:1',
      'announcement:1',
    ])
  })

  it('places schedule issues in the urgent bucket', () => {
    expect(getTodayAttentionBucket({
      key: 'schedule-issues',
      tone: 'warning',
      priority: 'reminder',
    })).toBe(0)
  })

  it('includes stock module alerts when stock data is available', () => {
    const items = buildTodayAttentionItems({
      hasStockModuleData: true,
      stockAlerts: [
        { id: 's1', name: 'Olive oil', severity: 'critical' },
        { id: 's2', name: 'Flour', severity: 'low' },
      ],
      todayKey: TODAY,
    })

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      key: 'stock:s1',
      label: 'Olive oil',
      detail: 'Out of stock',
    })
    expect(items[1]).toMatchObject({
      key: 'stock:s2',
      detail: 'Low stock',
    })
  })

  it('adds due-today tasks without duplicating overdue tasks', () => {
    const items = buildTodayAttentionItems({
      tasks: [
        { id: '1', title: 'Overdue prep', status: 'active', dueDate: '2026-07-07' },
        { id: '2', title: 'Close checklist', status: 'active', dueDate: TODAY },
        { id: '3', title: 'Done task', status: 'completed', dueDate: TODAY },
      ],
      todayKey: TODAY,
    })

    expect(items.some((item) => item.key === 'task:1')).toBe(true)
    expect(items.some((item) => item.key === 'task-due:2')).toBe(true)
    expect(items.some((item) => item.key === 'task-due:3')).toBe(false)
  })

  it('builds reservation attention from service pressure', () => {
    const items = buildReservationAttentionItems({
      reservationsConnected: true,
      reservations: [
        { id: 'r1', date: TODAY, time: '18:00', status: 'Waiting', guests: 2 },
      ],
      nowMinutes: 19 * 60,
      todayKey: TODAY,
      serviceSnapshot: {
        waitingLateCount: 1,
        lateCount: 0,
        waitingCount: 1,
      },
    })

    expect(items[0]).toMatchObject({
      key: 'reservation:service-pressure',
      priority: 'urgent',
    })
  })

  it('builds unread announcement attention items', () => {
    const items = buildAnnouncementAttentionItems({
      announcements: [
        {
          id: 'a1',
          title: 'Menu change',
          priority: 'important',
          audience: 'all',
          isRead: false,
          startsAt: '2026-07-08T08:00:00',
        },
        {
          id: 'a2',
          title: 'Old note',
          priority: 'normal',
          audience: 'all',
          isRead: false,
          startsAt: '2026-07-08T07:00:00',
        },
      ],
      role: 'manager',
      now: new Date('2026-07-08T12:00:00'),
    })

    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('announcement:a1')
  })
})

describe('buildTodayCommandCenterAttentionItems', () => {
  it('merges reservations, stock orders, and tasks into one prioritized feed', () => {
    const items = buildTodayCommandCenterAttentionItems({
      operationsTasks: [
        { id: 't1', title: 'Count safe', status: 'pending', dueDate: '2026-07-07' },
      ],
      todayKey: TODAY,
      reservationsConnected: true,
      reservations: [
        { id: 'r1', date: TODAY, time: '18:00', status: 'Waiting', guests: 2 },
      ],
      nowMinutes: 19 * 60,
      now: new Date('2026-07-08T19:30:00'),
      serviceSnapshot: {
        waitingLateCount: 1,
        lateCount: 0,
        waitingCount: 1,
      },
      stockOrdersSummary: { awaitingDeliveryCount: 2, partialCount: 0, draftCount: 1 },
      stockSummary: { outOfStock: 0, lowStock: 0 },
      hasStockModuleData: false,
      issuesSummary: { count: 1, message: 'Review coverage' },
    })

    expect(items[0].key).toBe('reservation:service-pressure')
    expect(items.some((item) => item.key === 'orders:awaiting')).toBe(true)
    expect(items.some((item) => item.key === 'task:t1')).toBe(true)
    expect(items.some((item) => item.key === 'schedule-issues')).toBe(true)
  })
})

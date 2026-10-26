import { describe, expect, it } from 'vitest'
import {
  buildAnnouncementAttentionItems,
  buildReservationAttentionItems,
  buildTodayAttentionItems,
  buildTodayStatusSummary,
  getTodayAttentionBucket,
  shouldLoadOperationalStockSnapshot,
  sortTodayAttentionItems,
} from './todayViewUtils'
import { buildTodayCommandCenterAttentionItems } from './mobileManagerTodayUtils'
import { buildOperationalSnapshot } from './operationalSnapshotUtils'
import { buildScheduleReport } from './reportsUtils'

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

  it('names the schedule issue with the same count the insights card uses', () => {
    const templateId = '11111111-1111-4111-8111-111111111111'
    const shifts = [{
      id: 's1',
      date: TODAY,
      employeeId: 'e1',
      shiftTemplateId: templateId,
      startTime: '18:00',
      endTime: '23:00',
    }]
    const shiftTemplates = [{
      id: templateId,
      name: 'Dinner',
      defaultArea: 'Service',
      startTime: '18:00',
      endTime: '22:00',
      defaultRequiredCount: 1,
    }]
    const employees = [{ id: 'e1', name: 'Alex', weeklyHours: 40 }]
    const snapshot = buildOperationalSnapshot({
      shifts,
      shiftTemplates,
      employees,
      todayKey: TODAY,
    })
    const report = buildScheduleReport({
      shifts,
      shiftTemplates,
      employees,
      period: 'today',
      todayKey: TODAY,
      weekStartDate: '2026-07-06',
      connected: true,
    })

    expect(report.metrics.issues).toBe(snapshot.issues)
    const items = buildTodayAttentionItems({
      todayKey: TODAY,
      snapshot,
      coverageBreakdown: { gapCount: snapshot.coverageGaps },
    })
    expect(items.find((item) => item.key === 'schedule-issues')?.detail).toBe(
      "Alex's shift runs longer than the template",
    )
  })

  it('hides the schedule attention item when that shared count is zero', () => {
    const items = buildTodayAttentionItems({
      todayKey: TODAY,
      snapshot: { issues: 0, coverageGaps: 0, otherIssueLabels: [] },
    })

    expect(items.some((item) => item.key === 'schedule-issues')).toBe(false)
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

  it('uses the shared out and low counts even when a shelf below-par count exists', () => {
    const summary = buildTodayStatusSummary({
      stockSummary: { outOfStock: 16, lowStock: 116 },
      stockConnected: true,
      hasStockModuleData: true,
      parsReady: true,
      belowParCount: 4,
    })

    expect(summary.stockSummaryLine).toBe('16 out · 116 low')
  })

  it('adds open operations tasks to the board task count', () => {
    const summary = buildTodayStatusSummary({
      tasksOverview: { active: 3, overdue: 3, completedToday: 0, showEmptyToday: false },
      tasksConnected: true,
      operationsOpenCount: 2,
    })

    expect(summary.tasksSummary).toContain('5 open tasks')
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

    expect(summary.teamScheduledSummary).toBe('5 scheduled · 2 Open shifts')
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
      detail: 'Low',
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

  it('loads the stock snapshot on the today dashboard that can open stock', () => {
    expect(shouldLoadOperationalStockSnapshot({
      canAccessStock: true,
      activeView: 'today',
      useMobileExperience: false,
    })).toBe(true)
    expect(shouldLoadOperationalStockSnapshot({
      canAccessStock: true,
      activeView: 'team',
      useMobileExperience: false,
    })).toBe(false)
    expect(shouldLoadOperationalStockSnapshot({
      canAccessStock: false,
      activeView: 'today',
    })).toBe(false)
    expect(shouldLoadOperationalStockSnapshot({
      canAccessStock: true,
      useMobileExperience: true,
      isManagerMobileShell: true,
      mobileManagerTab: 'today',
    })).toBe(true)
  })
})

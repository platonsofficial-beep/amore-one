import { describe, expect, it } from 'vitest'
import { getTodayQuickActions } from './permissions'
import {
  formatAttentionCollapsedSummary,
  formatTeamTodayCollapsedSummary,
} from './todayDashboardUtils'
import { buildTodayStatusCardsFromSummary } from './todayStatusPresentationUtils'
import { buildTodayExecutiveMessage } from './todayExecutiveMessage'
import { buildTodayStatusSummary } from './todayViewUtils'

const TODAY_QUICK_ACTION_IDS = [
  'add-reservation',
  'add-task',
  'add-announcement',
  'create-order',
]

function quickActionAvailability(role) {
  return Object.fromEntries(
    getTodayQuickActions(role).map((action) => [action.id, action.available]),
  )
}

describe('todayDashboardRegression', () => {
  it('keeps Today quick-action identifiers and ordering stable', () => {
    expect(getTodayQuickActions('manager').map((action) => action.id)).toEqual(TODAY_QUICK_ACTION_IDS)
    expect(getTodayQuickActions('manager').map((action) => action.label)).toEqual([
      'Reservation',
      'Task',
      'Announcement',
      'Order',
    ])
  })

  it('keeps role-based Today quick-action availability locked', () => {
    expect(quickActionAvailability('staff')).toEqual({
      'add-reservation': false,
      'add-task': false,
      'add-announcement': false,
      'create-order': false,
    })

    expect(quickActionAvailability('host')).toEqual({
      'add-reservation': true,
      'add-task': false,
      'add-announcement': false,
      'create-order': false,
    })

    expect(quickActionAvailability('manager')).toEqual({
      'add-reservation': true,
      'add-task': true,
      'add-announcement': true,
      'create-order': true,
    })
  })

  it('keeps approved Attention collapsed summary copy', () => {
    expect(formatAttentionCollapsedSummary([
      { priority: 'urgent', tone: 'critical' },
      { priority: 'reminder', tone: 'info' },
      { priority: 'reminder', tone: 'info' },
      { priority: 'reminder', tone: 'info' },
      { priority: 'reminder', tone: 'info' },
      { priority: 'reminder', tone: 'info' },
    ])).toBe('1 Needs attention · 5 reminders')
  })

  it('keeps approved Team Today open-shift collapsed summary copy', () => {
    expect(formatTeamTodayCollapsedSummary({
      groups: [{ members: [{ id: '1' }, { id: '2' }] }],
      teamStatus: {
        scheduleValue: '2 team members on shift',
        coverageTone: 'warn',
        coverageDetail: '3 gaps · Kitchen',
      },
    })).toBe('2 working now · 3 Open shifts · Kitchen')
  })

  it('keeps open-shift warning tone on the Team status card', () => {
    const cards = buildTodayStatusCardsFromSummary({
      onShiftSummary: '4 working now',
      teamScheduledSummary: '8 scheduled · 3 Open shifts',
      reservationsSummaryLine: 'No reservations today',
      tasksSummary: 'No open tasks today',
    })

    expect(cards.find((card) => card.id === 'team')).toMatchObject({
      secondary: '3 Open shifts',
      tone: 'warning',
    })
  })

  it('keeps approved executive message presentation contract', () => {
    expect(buildTodayExecutiveMessage({
      hasUrgentAttention: true,
      isServiceInProgress: true,
    })).toEqual({
      tone: 'critical',
      indicator: 'dot',
      message: 'Service requires immediate attention.',
    })

    expect(buildTodayExecutiveMessage({
      reservationsTodayCount: 7,
    })).toMatchObject({
      tone: 'neutral',
      indicator: 'dot',
      message: '7 reservations are expected today.',
    })
  })

  it('keeps approved team scheduled summary copy in status summary', () => {
    const summary = buildTodayStatusSummary({
      liveFloor: { state: 'live', onShiftCount: 2 },
      snapshot: { scheduledStaff: 5, coverageGaps: 2 },
    })

    expect(summary.teamScheduledSummary).toBe('5 scheduled · 2 Open shifts')
  })
})

import { describe, expect, it } from 'vitest'
import { buildTodayCommandHeaderChips } from './todayCommandHeaderUtils'

describe('buildTodayCommandHeaderChips', () => {
  it('builds compact operational chips from existing summary data', () => {
    const chips = buildTodayCommandHeaderChips({
      dashboardLiveStatus: {
        tone: 'draft',
        chipValue: 'Draft',
      },
      todayStatusSummary: {
        stockSummaryLine: 'Stock levels OK',
      },
      dashboardTaskOverview: {
        active: 3,
      },
      todayReservationsSummary: {
        bookings: 37,
      },
      reservationsConnected: true,
      liveFloorState: {
        state: 'live',
        onShiftCount: 12,
      },
      showStock: true,
    })

    expect(chips).toEqual([
      {
        id: 'schedule',
        icon: '🟡',
        label: 'Schedule',
        value: '0',
        tone: 'draft',
      },
      {
        id: 'on-shift',
        icon: '👥',
        label: 'On Shift',
        value: '12',
        tone: 'live',
      },
      {
        id: 'reservations',
        icon: '🍽',
        label: 'Reservations',
        value: '37',
        tone: 'default',
      },
      {
        id: 'stock',
        icon: '📦',
        label: 'Stock',
        value: 'OK',
        tone: 'default',
      },
      {
        id: 'tasks',
        icon: '✅',
        label: 'Tasks',
        value: '3 Open',
        detail: '3 board',
        tone: 'warning',
      },
    ])
  })

  it('omits stock chip when stock module is unavailable', () => {
    const chips = buildTodayCommandHeaderChips({
      dashboardLiveStatus: { tone: 'standby', chipValue: 'Standby' },
      todayStatusSummary: {},
      dashboardTaskOverview: { active: 0 },
      todayReservationsSummary: { bookings: 0 },
      reservationsConnected: true,
      liveFloorState: { state: 'idle' },
      showStock: false,
    })

    expect(chips.map((chip) => chip.id)).toEqual([
      'schedule',
      'on-shift',
      'reservations',
      'tasks',
    ])
    expect(chips.find((chip) => chip.id === 'tasks')?.value).toBe('Clear')
    expect(chips.find((chip) => chip.id === 'schedule')?.value).toBe('0')
  })

  it('shows the shared schedule issue count on the Schedule chip', () => {
    const chips = buildTodayCommandHeaderChips({
      dashboardLiveStatus: { tone: 'live', chipValue: '2' },
      scheduleIssueCount: 1,
      liveFloorState: { state: 'live', onShiftCount: 2 },
    })

    expect(chips.find((chip) => chip.id === 'schedule')).toMatchObject({
      label: 'Schedule',
      value: '1',
      tone: 'warning',
    })
    expect(chips.find((chip) => chip.id === 'on-shift')?.value).toBe('2')
  })

  it('labels board tasks and operations tasks on the same chip', () => {
    const chips = buildTodayCommandHeaderChips({
      dashboardTaskOverview: { active: 3 },
      operationsOpenCount: 2,
    })
    const tasks = chips.find((chip) => chip.id === 'tasks')
    expect(tasks?.value).toBe('5 Open')
    expect(tasks?.detail).toBe('3 board · 2 ops')
  })
})

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
        value: 'Draft',
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
  })
})

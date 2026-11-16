import { describe, expect, it } from 'vitest'
import {
  buildTodayStatusCardsFromSummary,
  shouldShowAnnouncementPreviewToggle,
} from './todayStatusPresentationUtils'

describe('buildTodayStatusCardsFromSummary', () => {
  it('builds premium cards from counts, not English sentences', () => {
    const cards = buildTodayStatusCardsFromSummary({
      onShiftScheduledCount: 12,
      scheduledStaff: 18,
      reservationBookings: 7,
      reservationCovers: 37,
      tasksOpen: 3,
      tasksOverdue: 3,
      stockSummaryLine: 'Stock levels OK',
      stockOut: 0,
      stockLow: 0,
    }, { showStock: true })

    expect(cards).toHaveLength(5)
    expect(cards[0]).toMatchObject({
      id: 'on-shift',
      primary: '12 employees',
      secondary: 'Active now',
      tone: 'live',
    })
    expect(buildTodayStatusCardsFromSummary({
      onShiftScheduledCount: 1,
      clockedInCount: 0,
    })[0]).toMatchObject({
      primary: '1 employee',
      secondary: '0 clocked in',
      tone: 'live',
    })
    expect(cards[1]).toMatchObject({
      id: 'reservations',
      primary: '7 bookings',
      secondary: '37 covers',
    })
    expect(cards[2]).toMatchObject({
      id: 'tasks',
      primary: '3 Open',
      secondary: '3 overdue',
      tone: 'warning',
    })
    expect(cards[3]).toMatchObject({
      id: 'stock',
      primary: 'No alerts',
    })
    expect(cards[4]).toMatchObject({
      id: 'team',
      primary: '18 scheduled',
      secondary: 'On roster today',
    })
  })

  it('handles empty schedule states without parsing summary sentences', () => {
    const cards = buildTodayStatusCardsFromSummary({
      onShiftScheduledCount: 0,
      scheduledStaff: 0,
      reservationBookings: 0,
      tasksOpen: 0,
    })

    expect(cards[0].primary).toBe('0 employees')
    expect(cards[0].secondary).toBe('No active shifts')
    expect(cards[1].primary).toBe('0 bookings')
    expect(cards[2].primary).toBe('All clear')
    expect(cards.find((card) => card.id === 'team')?.primary).toBe('No schedule today')
  })
})

describe('shouldShowAnnouncementPreviewToggle', () => {
  it('shows toggle for long or multiline messages', () => {
    expect(shouldShowAnnouncementPreviewToggle('Short note')).toBe(false)
    expect(shouldShowAnnouncementPreviewToggle('x'.repeat(140))).toBe(true)
    expect(shouldShowAnnouncementPreviewToggle('Line one\nLine two\nLine three')).toBe(true)
  })
})

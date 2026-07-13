import { describe, expect, it } from 'vitest'
import {
  buildTodayStatusCardsFromSummary,
  shouldShowAnnouncementPreviewToggle,
} from './todayStatusPresentationUtils'

describe('buildTodayStatusCardsFromSummary', () => {
  it('maps existing summary strings into premium status cards', () => {
    const cards = buildTodayStatusCardsFromSummary({
      onShiftSummary: '12 working now',
      teamScheduledSummary: '18 scheduled today',
      reservationsSummaryLine: '7 bookings · 37 covers',
      tasksSummary: '3 open tasks · 3 overdue',
      stockSummaryLine: 'Stock levels OK',
    }, { showStock: true })

    expect(cards).toHaveLength(5)
    expect(cards[0]).toMatchObject({
      id: 'on-shift',
      primary: '12 employees',
      secondary: 'Active now',
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
    })
  })

  it('handles empty schedule states without new calculations', () => {
    const cards = buildTodayStatusCardsFromSummary({
      onShiftSummary: 'No one working now',
      teamScheduledSummary: 'No shifts scheduled today',
      reservationsSummaryLine: 'No reservations today',
      tasksSummary: 'No open tasks today',
      stockSummaryLine: '',
    })

    expect(cards[0].primary).toBe('0 employees')
    expect(cards[1].primary).toBe('0 bookings')
    expect(cards[2].primary).toBe('Clear')
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

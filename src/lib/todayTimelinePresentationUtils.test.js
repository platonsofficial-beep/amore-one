import { describe, expect, it } from 'vitest'
import {
  buildReservationTimelinePresentation,
  formatTimelineGuestsLine,
  formatTimelineTablesLine,
} from './todayTimelinePresentationUtils'

describe('todayTimelinePresentationUtils', () => {
  it('formats guests with presentation label only', () => {
    expect(formatTimelineGuestsLine(16)).toBe('👥 16 Guests')
    expect(formatTimelineGuestsLine(1)).toBe('👥 1 Guest')
    expect(formatTimelineGuestsLine(0)).toBe('')
  })

  it('formats table numbers with bullet separators', () => {
    expect(formatTimelineTablesLine('T101 + T102 + T103')).toBe('🪑 T101 • T102 • T103')
    expect(formatTimelineTablesLine('Table T101 + T102')).toBe('🪑 T101 • T102')
    expect(formatTimelineTablesLine('')).toBe('')
  })

  it('builds reservation presentation from existing event fields', () => {
    const presentation = buildReservationTimelinePresentation({
      guestName: 'Evie Samaridi',
      guests: 16,
      tableNumber: 'T101 + T102 + T103 + T104 + T105',
    })

    expect(presentation.guestName).toBe('Evie Samaridi')
    expect(presentation.guestsLine).toBe('👥 16 Guests')
    expect(presentation.tablesLine).toBe('🪑 T101 • T102 • T103 • T104 • T105')
    expect(presentation.fallbackLine).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { buildTimelineEventRows, getTimelineEventStatus, isTimelineEventCompleted } from './todayDashboardUtils'

describe('reservation timeline status', () => {
  it('keeps a seated reservation active after its time has passed', () => {
    const event = { type: 'reservation', time: '12:00', reservationStatus: 'Checked In' }
    expect(isTimelineEventCompleted(event, 20 * 60)).toBe(false)
    expect(getTimelineEventStatus(event, 20 * 60).state).not.toBe('completed')
  })

  it('places Now on the venue clock, not the device clock', () => {
    const now = new Date('2026-10-26T14:20:00.000Z')
    const rows = buildTimelineEventRows(
      [{ key: 'reservation:1', type: 'reservation', time: '17:00', timeLabel: '17:00', title: 'TEST GrokBot Timer' }],
      { now, showNow: true, timeZone: 'Europe/Nicosia' },
    )
    expect(rows.find((row) => row.kind === 'now')?.label).toBe('16:20')
    expect(rows.some((row) => row.event?.title === 'TEST GrokBot Timer')).toBe(true)
  })

  it('marks a checked-out reservation completed from its status', () => {
    const event = { type: 'reservation', time: '20:00', reservationStatus: 'Checked Out' }
    expect(isTimelineEventCompleted(event, 12 * 60)).toBe(true)
    expect(getTimelineEventStatus(event, 12 * 60).state).toBe('completed')
  })
})

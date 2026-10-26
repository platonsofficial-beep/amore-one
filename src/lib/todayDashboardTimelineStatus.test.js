import { describe, expect, it } from 'vitest'
import { getTimelineEventStatus, isTimelineEventCompleted } from './todayDashboardUtils'

describe('reservation timeline status', () => {
  it('keeps a seated reservation active after its time has passed', () => {
    const event = { type: 'reservation', time: '12:00', reservationStatus: 'Checked In' }
    expect(isTimelineEventCompleted(event, 20 * 60)).toBe(false)
    expect(getTimelineEventStatus(event, 20 * 60).state).not.toBe('completed')
  })

  it('marks a checked-out reservation completed from its status', () => {
    const event = { type: 'reservation', time: '20:00', reservationStatus: 'Checked Out' }
    expect(isTimelineEventCompleted(event, 12 * 60)).toBe(true)
    expect(getTimelineEventStatus(event, 12 * 60).state).toBe('completed')
  })
})

import { describe, expect, it } from 'vitest'
import { filterReservationsBySelectedSeating } from './hostQueuePipeline'
import { resolveHostDaySeatingFilter } from './reservationSeatings'
import {
  applyHostFloorAllServicesScope,
  resolveHostFloorSemanticClass,
} from './hostFloorTableVisualState'
import { buildHostFloorCompactTableContent } from './hostFloorTableContent'

const DATE = '2026-11-09'
const SEATINGS = [
  { id: 'brunch', name: 'Brunch', startTime: '10:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true },
  { id: 'lunch', name: 'Lunch', startTime: '13:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true },
  { id: 'dinner', name: 'Dinner', startTime: '19:00', durationMinutes: 150, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true },
]

const BOOKINGS = [
  { id: 'brunch-guest', date: DATE, time: '10:30', guestName: 'Brunch Guest', guests: 2, status: 'Confirmed', seatingId: 'brunch' },
  { id: 'lunch-guest', date: DATE, time: '13:15', guestName: 'Lunch Guest', guests: 3, status: 'Confirmed', seatingId: 'lunch' },
  { id: 'dinner-guest', date: DATE, time: '20:30', guestName: 'Kalamarou Kalamaras', guests: 2, status: 'Pending', seatingId: 'dinner' },
  { id: 'no-service', date: DATE, time: '', guestName: 'No Service', guests: 1, status: 'Pending' },
]

describe('host day seating filter', () => {
  it('All includes brunch, lunch, dinner, and a booking with no service, once each', () => {
    const listed = filterReservationsBySelectedSeating(BOOKINGS, null, SEATINGS, DATE)
    expect(listed.map((entry) => entry.guestName)).toEqual([
      'Brunch Guest',
      'Lunch Guest',
      'Kalamarou Kalamaras',
      'No Service',
    ])
    expect(new Set(listed.map((entry) => entry.id)).size).toBe(listed.length)
  })

  it('a specific seating narrows to that service and drops the no-service booking', () => {
    const dinner = SEATINGS.find((seating) => seating.id === 'dinner')
    const listed = filterReservationsBySelectedSeating(BOOKINGS, dinner, SEATINGS, DATE)
    expect(listed.map((entry) => entry.id)).toEqual(['dinner-guest'])
  })

  it('keeps All or the chosen seating across a rotation and does not fall back to Brunch', () => {
    expect(resolveHostDaySeatingFilter('', SEATINGS)).toBe('')
    expect(resolveHostDaySeatingFilter('dinner', SEATINGS)).toBe('dinner')
    expect(resolveHostDaySeatingFilter('dinner', [])).toBe('dinner')
    expect(resolveHostDaySeatingFilter('missing', SEATINGS)).toBe('')
  })

  it('All does not mark a booked table available for the whole day', () => {
    const scoped = applyHostFloorAllServicesScope([{
      table: { id: 't1', label: 'T1' },
      reservation: BOOKINGS[2],
      status: 'available',
      operational: { floorStatus: 'available', hostIndicator: 'empty', phase: 'available' },
    }])
    expect(scoped[0].status).toBe('all-services')
    expect(scoped[0].reservation).toBeNull()
    expect(resolveHostFloorSemanticClass(scoped[0].operational)).toBe('is-all-services')
    const content = buildHostFloorCompactTableContent({
      table: { id: 't1', label: 'T1', seats: 4 },
      operational: scoped[0].operational,
    })
    expect(content.mode).toBe('all-services')
    expect(content.mode).not.toBe('available')
    expect(content.statusBadgeText).toBeNull()
  })
})

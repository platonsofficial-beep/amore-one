import { describe, expect, it } from 'vitest'
import {
  buildLiveFloorState,
  buildReservationsFooter,
  buildTodayReservationsSummary,
} from './dashboardUtils'
import { buildReservationsReport, REPORT_PERIOD_TODAY } from './reportsUtils'

const TODAY = '2026-10-26'
const VENUE_NOW = new Date('2026-10-26T14:18:00.000Z')

describe('shared reservation and shift counts', () => {
  it('uses the same operational booking count on Today and Insights', () => {
    const reservations = [
      { id: 'seated', date: TODAY, time: '16:00', guests: 2, status: 'Checked In' },
      { id: 'later', date: TODAY, time: '19:30', guests: 4, status: 'Confirmed' },
      { id: 'cancelled', date: TODAY, time: '20:00', guests: 2, status: 'Cancelled' },
    ]

    expect(buildTodayReservationsSummary(reservations, TODAY).bookings).toBe(2)
    expect(buildReservationsReport(reservations, {
      period: REPORT_PERIOD_TODAY,
      todayKey: TODAY,
    }).metrics.bookings).toBe(2)
  })

  it('names the next reservation that has not arrived yet in venue time', () => {
    const reservations = [
      { id: 'seated', date: TODAY, time: '16:00', guests: 2, status: 'Checked In' },
      { id: 'later', date: TODAY, time: '19:30', guests: 4, status: 'Confirmed' },
    ]

    expect(buildReservationsFooter(reservations, TODAY, VENUE_NOW, {
      timeZone: 'Europe/Nicosia',
    })).toEqual({
      type: 'next',
      label: 'Next reservation',
      time: '19:30',
    })

    expect(buildReservationsFooter([reservations[0]], TODAY, VENUE_NOW, {
      timeZone: 'Europe/Nicosia',
    }).type).toBe('empty')
  })

  it('counts on-shift staff with the venue clock', () => {
    const shifts = [1, 2, 3].map((index) => ({
      id: `shift-${index}`,
      employeeId: `employee-${index}`,
      date: TODAY,
      startTime: '16:00',
      endTime: '23:00',
    }))
    const employees = shifts.map((shift) => ({ id: shift.employeeId, name: shift.employeeId }))

    const venue = buildLiveFloorState({
      publishedShifts: shifts,
      isWeekPublished: true,
      employees,
      todayKey: TODAY,
      now: VENUE_NOW,
      timeZone: 'Europe/Nicosia',
    })
    const deviceMorning = buildLiveFloorState({
      publishedShifts: shifts,
      isWeekPublished: true,
      employees,
      todayKey: TODAY,
      now: VENUE_NOW,
      timeZone: 'America/Los_Angeles',
    })

    expect(venue.onShiftCount).toBe(3)
    expect(venue.state).toBe('live')
    expect(deviceMorning.onShiftCount).toBe(0)
  })
})

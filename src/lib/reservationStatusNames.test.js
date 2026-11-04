import { describe, expect, it } from 'vitest'
import {
  HOST_RESERVATION_STATUSES,
  getHostListCompactStatusLabel,
  getHostStatusGroupId,
  getHostStatusPickerGroups,
  getReservationDisplayStatus,
  groupHostListReservations,
  isReservationInHouseStatus,
  isReservationLate,
  isReservationLateByTime,
  isTerminalReservationStatus,
  isUpcomingReservationStatus,
} from './reservationHostStatus'
import { sortMobileHostReservations } from './mobileHostReservationUtils'
import { summarizePortraitDay } from '../components/mobile/MobileManagerReservationsView'

const today = '2026-11-04'
const booking = (id, status, time = '12:00', guests = 2) => ({ id, status, time, date: today, guests })
const now = 14 * 60

describe('status names (Platon t447u)', () => {
  it('uses one label per status', () => {
    expect(Object.fromEntries(HOST_RESERVATION_STATUSES.map((s) => [s.id, s.label]))).toEqual({
      Pending: 'Pending',
      Waiting: 'Arrived',
      'Not Confirmed': 'Unconfirmed',
      Confirmed: 'Confirmed',
      'Late Booking': 'Late',
      'Checked In (Partial)': 'Seated · partly',
      'Checked In': 'Seated',
      'Walk In': 'Walk-in',
      'Checked Out': 'Completed',
      Cancelled: 'Cancelled',
      'Not Shown': 'No-show',
      Rejected: 'Rejected',
    })
    expect(getHostListCompactStatusLabel('Checked In')).toBe('Seated')
    expect(getHostListCompactStatusLabel('Checked In (Partial)')).toBe('Seated · partly')
    expect(getHostListCompactStatusLabel('Not Confirmed')).toBe('Unconfirmed')
  })

  it('picker groups: Upcoming, Arrived, Finished, Problems; Unconfirmed hidden', () => {
    const groups = getHostStatusPickerGroups()
    expect(groups.map((g) => [g.label, g.statuses.map((s) => s.id)])).toEqual([
      ['Upcoming', ['Pending', 'Confirmed', 'Late Booking']],
      ['Arrived', ['Waiting', 'Checked In (Partial)', 'Checked In', 'Walk In']],
      ['Finished', ['Checked Out']],
      ['Problems', ['Cancelled', 'Not Shown', 'Rejected']],
    ])
  })

  it('never shows an Arrived guest as Late', () => {
    const arrived = booking('a', 'Waiting', '12:00')
    expect(getReservationDisplayStatus(arrived, now, today)).toBe('Waiting')
    expect(getHostListCompactStatusLabel(getReservationDisplayStatus(arrived, now, today))).toBe('Arrived')
    // Counting logic is unchanged: the service snapshot still knows they waited past their time.
    expect(isReservationLateByTime(arrived, now, today)).toBe(true)
    expect(isReservationLate(arrived, now, today)).toBe(true)
    // Bookings that have not arrived are still flagged as before.
    expect(getReservationDisplayStatus(booking('p', 'Pending', '12:00'), now, today)).toBe('Late Booking')
    expect(getReservationDisplayStatus(booking('u', 'Not Confirmed', '12:00'), now, today)).toBe('Late Booking')
  })

  it('keeps logic groups, counts and sorting unchanged', () => {
    expect(Object.fromEntries(HOST_RESERVATION_STATUSES.map((s) => [s.id, getHostStatusGroupId(s.id)]))).toEqual({
      Pending: 'upcoming', Waiting: 'upcoming', 'Not Confirmed': 'upcoming', Confirmed: 'upcoming', 'Late Booking': 'upcoming',
      'Checked In (Partial)': 'in-house', 'Checked In': 'in-house', 'Walk In': 'in-house',
      'Checked Out': 'completed', Cancelled: 'problems', 'Not Shown': 'problems', Rejected: 'problems',
    })
    expect(isUpcomingReservationStatus('Waiting')).toBe(true)
    expect(isReservationInHouseStatus('Checked In (Partial)')).toBe(true)
    expect(isTerminalReservationStatus('Not Shown')).toBe(true)

    const day = HOST_RESERVATION_STATUSES.map((s, i) => booking(`r${i}`, s.id, `${String(10 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, i + 1))
    expect(summarizePortraitDay(day)).toBe('9 bookings · 45 guests · 3 cancelled')
    expect(groupHostListReservations(day).map((g) => [g.id, g.reservations.length])).toEqual([
      ['upcoming', 5], ['in-house', 3], ['completed', 1], ['problems', 3],
    ])
    expect(sortMobileHostReservations([...day].reverse()).map((r) => r.id)).toEqual(day.map((r) => r.id))
  })
})

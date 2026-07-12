import { describe, expect, it } from 'vitest'
import {
  getActiveSeatingsForDate,
  resolveHostStationInitialSeatingId,
  sortReservationSeatings,
} from './reservationSeatings'

const HOST_STATION_SEATINGS = [
  {
    id: 'brunch',
    name: 'Brunch',
    start_time: '10:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 0,
    is_active: true,
  },
  {
    id: 'lunch',
    name: 'Lunch',
    start_time: '12:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'dinner-1',
    name: 'Dinner 1',
    start_time: '19:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    start_time: '21:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 3,
    is_active: true,
  },
]

const SERVICE_DATE = '2026-07-10'

function minutesAt(hours, mins = 0) {
  return hours * 60 + mins
}

function activeSeatingsForHostStation() {
  return getActiveSeatingsForDate(HOST_STATION_SEATINGS, SERVICE_DATE)
}

function shouldRunHostStationTimeBasedSeatingInit(isViewingToday, hasInitialized, hasManualSelection) {
  return isViewingToday && !hasInitialized && !hasManualSelection
}

function pickHostStationInitialSeating(activeSeatings, nowMinutes, isViewingToday) {
  const sorted = sortReservationSeatings(activeSeatings)
  if (!sorted.length) return null
  if (!isViewingToday) return sorted[0].id
  return resolveHostStationInitialSeatingId(sorted, nowMinutes) ?? sorted[0].id
}

describe('resolveHostStationInitialSeatingId', () => {
  const activeSeatings = activeSeatingsForHostStation()

  it('selects Brunch at 09:00', () => {
    expect(resolveHostStationInitialSeatingId(activeSeatings, minutesAt(9))).toBe('brunch')
  })

  it('selects Lunch at 11:20', () => {
    expect(resolveHostStationInitialSeatingId(activeSeatings, minutesAt(11, 20))).toBe('lunch')
  })

  it('selects Dinner 1 at 18:20', () => {
    expect(resolveHostStationInitialSeatingId(activeSeatings, minutesAt(18, 20))).toBe('dinner-1')
  })

  it('selects Dinner 2 at 20:30', () => {
    expect(resolveHostStationInitialSeatingId(activeSeatings, minutesAt(20, 30))).toBe('dinner-2')
  })

  it('selects the final seating after the final seating start time', () => {
    expect(resolveHostStationInitialSeatingId(activeSeatings, minutesAt(22, 30))).toBe('dinner-2')
  })

  it('selects the first seating before the first seating start time', () => {
    expect(resolveHostStationInitialSeatingId(activeSeatings, minutesAt(7, 30))).toBe('brunch')
  })

  it('prefers the later seating on an exact tie', () => {
    const tiedSeatings = sortReservationSeatings([
      {
        id: 'early',
        name: 'Early',
        start_time: '10:00',
        duration_minutes: 120,
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        sort_order: 0,
        is_active: true,
      },
      {
        id: 'late',
        name: 'Late',
        start_time: '14:00',
        duration_minutes: 120,
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        sort_order: 1,
        is_active: true,
      },
    ])

    expect(resolveHostStationInitialSeatingId(tiedSeatings, minutesAt(12))).toBe('late')
  })
})

describe('Host Station seating initialization policy', () => {
  const activeSeatings = activeSeatingsForHostStation()

  it('does not run time-based auto-selection for a non-today reservation date', () => {
    expect(shouldRunHostStationTimeBasedSeatingInit(false, false, false)).toBe(false)
    expect(pickHostStationInitialSeating(activeSeatings, minutesAt(20, 30), false)).toBe('brunch')
  })

  it('runs time-based auto-selection only before initialization completes', () => {
    expect(shouldRunHostStationTimeBasedSeatingInit(true, false, false)).toBe(true)
    expect(shouldRunHostStationTimeBasedSeatingInit(true, true, false)).toBe(false)
  })

  it('does not run time-based auto-selection after manual seating selection', () => {
    expect(shouldRunHostStationTimeBasedSeatingInit(true, false, true)).toBe(false)
  })

  it('selects the closest seating when initialization runs for today', () => {
    expect(pickHostStationInitialSeating(activeSeatings, minutesAt(20, 30), true)).toBe('dinner-2')
  })
})

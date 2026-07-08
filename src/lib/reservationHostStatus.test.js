import { describe, expect, it } from 'vitest'
import {
  canCompleteReservation,
  canMarkReservationArrived,
  canMarkReservationNoShow,
  canSeatReservation,
  getHostReservationQuickActions,
} from './reservationHostStatus'

const TODAY = '2026-07-08'

function reservation(overrides = {}) {
  return {
    id: 'r1',
    date: TODAY,
    time: '19:00',
    status: 'Confirmed',
    guests: 2,
    ...overrides,
  }
}

describe('reservationHostStatus quick actions', () => {
  it('allows arrived for confirmed reservations at or past service time', () => {
    expect(canMarkReservationArrived(reservation(), 18 * 60, TODAY)).toBe(true)
    expect(canMarkReservationArrived(reservation({ status: 'Waiting' }), 18 * 60, TODAY)).toBe(false)
  })

  it('allows seat for upcoming and waiting reservations', () => {
    expect(canSeatReservation(reservation())).toBe(true)
    expect(canSeatReservation(reservation({ status: 'Waiting' }))).toBe(true)
    expect(canSeatReservation(reservation({ status: 'Checked In' }))).toBe(false)
  })

  it('allows no-show for upcoming reservations not in house', () => {
    expect(canMarkReservationNoShow(reservation())).toBe(true)
    expect(canMarkReservationNoShow(reservation({ status: 'Checked In' }))).toBe(false)
    expect(canMarkReservationNoShow(reservation({ status: 'Not Shown' }))).toBe(false)
  })

  it('allows complete only for in-house reservations', () => {
    expect(canCompleteReservation(reservation({ status: 'Checked In' }))).toBe(true)
    expect(canCompleteReservation(reservation())).toBe(false)
  })

  it('builds upcoming quick actions in host-friendly order', () => {
    const actions = getHostReservationQuickActions(reservation(), { nowMinutes: 18 * 60, todayKey: TODAY })
    expect(actions.map((action) => action.id)).toEqual(['arrived', 'seat', 'no-show'])
  })

  it('builds in-house complete action only', () => {
    const actions = getHostReservationQuickActions(
      reservation({ status: 'Checked In' }),
      { nowMinutes: 18 * 60, todayKey: TODAY },
    )
    expect(actions).toEqual([
      { id: 'complete', label: 'Complete', status: 'Checked Out', variant: 'primary' },
    ])
  })
})

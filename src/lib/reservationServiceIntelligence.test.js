import { describe, expect, it } from 'vitest'
import {
  HOST_ALERT_TYPES,
  WAITING_TOO_LONG_MINUTES,
  buildDailyServiceSnapshot,
  buildHostReservationAlerts,
  getHostListEmptyState,
  getHostReservationAlertReasons,
  getReservationOccupiedMinutes,
  getReservationWaitingMinutes,
  getServiceOrderRank,
  getTimelineEmptyState,
} from './reservationServiceIntelligence'

const TODAY = '2026-07-08'
const REFERENCE_DATE = new Date('2026-07-08T21:30:00')

function reservation(overrides = {}) {
  return {
    id: 'r1',
    date: TODAY,
    time: '19:00',
    status: 'Confirmed',
    guests: 4,
    ...overrides,
  }
}

describe('reservationServiceIntelligence', () => {
  it('builds a daily service snapshot from existing reservation data', () => {
    const snapshot = buildDailyServiceSnapshot([
      reservation({ id: 'a', guests: 4 }),
      reservation({ id: 'b', time: '21:00', status: 'Waiting', guests: 2 }),
      reservation({ id: 'c', time: '18:00', status: 'Checked In', guests: 3 }),
      reservation({ id: 'd', status: 'Checked Out', guests: 2 }),
      reservation({ id: 'e', status: 'Cancelled', guests: 6 }),
    ], 20 * 60 + 30, TODAY, REFERENCE_DATE)

    expect(snapshot.totalCovers).toBe(11)
    expect(snapshot.upcomingArrivals).toBe(1)
    expect(snapshot.seatedGuests).toBe(3)
    expect(snapshot.waitingCount).toBe(1)
    expect(snapshot.completedTables).toBe(1)
    expect(snapshot.overallStatus).toBe('Attention needed')
  })

  it('flags late and long-waiting guests without new database fields', () => {
    const lateReasons = getHostReservationAlertReasons(
      reservation({ time: '19:00', status: 'Confirmed' }),
      19 * 60 + 20,
      TODAY,
    )
    expect(lateReasons.some((reason) => reason.type === HOST_ALERT_TYPES.LATE)).toBe(true)

    const waitingMinutes = getReservationWaitingMinutes(
      reservation({ time: '19:00', status: 'Waiting' }),
      19 * 60 + WAITING_TOO_LONG_MINUTES,
      TODAY,
    )
    expect(waitingMinutes).toBe(WAITING_TOO_LONG_MINUTES)

    const waitingReasons = getHostReservationAlertReasons(
      reservation({ time: '19:00', status: 'Waiting' }),
      19 * 60 + WAITING_TOO_LONG_MINUTES,
      TODAY,
    )
    expect(waitingReasons.some((reason) => reason.type === HOST_ALERT_TYPES.WAITING_LONG)).toBe(true)
  })

  it('uses updatedAt for long seated alerts when timestamp data exists', () => {
    const occupiedMinutes = getReservationOccupiedMinutes(
      reservation({
        status: 'Checked In',
        updatedAt: '2026-07-08T19:00:00',
      }),
      REFERENCE_DATE,
    )
    expect(occupiedMinutes).toBe(150)

    const alerts = buildHostReservationAlerts([
      reservation({
        id: 'seated-long',
        guestName: 'Taylor',
        status: 'Checked In',
        updatedAt: '2026-07-08T19:00:00',
      }),
    ], 21 * 60 + 30, TODAY, REFERENCE_DATE)

    expect(alerts[0]?.type).toBe(HOST_ALERT_TYPES.OCCUPIED_LONG)
    expect(alerts[0]?.label).toContain('150 min')
  })

  it('prioritizes active service before upcoming and completed reservations', () => {
    const late = getServiceOrderRank(reservation({ time: '18:30', status: 'Confirmed' }), 19 * 60, TODAY)
    const waiting = getServiceOrderRank(reservation({ status: 'Waiting' }), 19 * 60, TODAY)
    const seated = getServiceOrderRank(reservation({ status: 'Checked In' }), 19 * 60, TODAY)
    const upcoming = getServiceOrderRank(reservation({ time: '20:00', status: 'Confirmed' }), 19 * 60, TODAY)
    const completed = getServiceOrderRank(reservation({ status: 'Checked Out' }), 19 * 60, TODAY)

    expect(late).toBeLessThan(waiting)
    expect(waiting).toBeLessThan(seated)
    expect(seated).toBeLessThan(upcoming)
    expect(upcoming).toBeLessThan(completed)
  })

  it('returns context-aware empty states for quiet service', () => {
    const quiet = getHostListEmptyState({
      filter: 'All',
      snapshot: buildDailyServiceSnapshot([], 18 * 60, TODAY),
      isViewingToday: true,
    })
    expect(quiet.title).toContain('Quiet service')

    const timeline = getTimelineEmptyState({
      snapshot: buildDailyServiceSnapshot([
        reservation({ status: 'Checked In', guests: 2 }),
      ], 21 * 60, TODAY),
      isViewingToday: true,
    })
    expect(timeline.title).toContain('Arrival board clear')
    expect(timeline.copy).toContain('2 guests')
  })
})

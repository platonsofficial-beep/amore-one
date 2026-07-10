import { describe, expect, it } from 'vitest'
import {
  buildHostServiceDashboard,
  countHostListFilterMatches,
  hostListFilterMatch,
} from './hostServiceDashboard'
import { getSeatingWindowTimeOptions } from './reservationSeatings'
import {
  resolveWorkspaceDefaultPhoneCountryCode,
  setWorkspaceDefaultPhoneCountryCode,
  getDefaultReservationPhoneCountryCode,
} from './reservationPhoneUtils'
import { buildPublishTransitionResult } from './publishFloorPlanTransition'

const DINNER = {
  id: 'dinner-1',
  name: 'Dinner 1',
  startTime: '19:00',
  durationMinutes: 120,
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  isActive: true,
}

describe('Host Station seatings and time model', () => {
  it('limits exact times to seating window at 15-minute intervals', () => {
    expect(getSeatingWindowTimeOptions(DINNER)).toEqual([
      '19:00', '19:15', '19:30', '19:45', '20:00', '20:15', '20:30', '20:45',
    ])
  })

  it('keeps seating separate from exact reservation time in filter matching', () => {
    const reservation = {
      id: 'r1',
      date: '2026-07-10',
      time: '19:45',
      guests: 4,
      status: 'Confirmed',
      seatingId: DINNER.id,
    }

    expect(hostListFilterMatch(reservation, 'Upcoming', 18 * 60, '2026-07-10')).toBe(true)
  })
})

describe('Host Service Dashboard', () => {
  it('calculates expected, arrived, remaining, and seated guests', () => {
    const dashboard = buildHostServiceDashboard({
      reservations: [
        { id: '1', date: '2026-07-10', time: '19:00', guests: 4, status: 'Confirmed' },
        { id: '2', date: '2026-07-10', time: '19:30', guests: 2, status: 'Waiting' },
        { id: '3', date: '2026-07-10', time: '20:00', guests: 3, status: 'Checked In' },
      ],
      nowMinutes: 18 * 60,
      todayKey: '2026-07-10',
      layout: { tables: [{ id: 't1' }, { id: 't2' }] },
      seatings: [DINNER],
    })

    expect(dashboard.expectedGuests).toBe(9)
    expect(dashboard.arrivedGuests).toBe(2)
    expect(dashboard.seatedGuests).toBe(3)
    expect(dashboard.remainingGuests).toBe(4)
    expect(dashboard.totalTables).toBe(2)
  })

  it('counts filter matches for full-label chips', () => {
    const reservations = [
      { id: '1', date: '2026-07-10', time: '20:00', guests: 2, status: 'Confirmed' },
      { id: '2', date: '2026-07-10', time: '19:00', guests: 2, status: 'Waiting' },
    ]

    expect(countHostListFilterMatches(reservations, 'Upcoming', 18 * 60, '2026-07-10')).toBe(1)
    expect(countHostListFilterMatches(reservations, 'Arrived', 18 * 60, '2026-07-10')).toBe(1)
  })
})

describe('workspace phone default resolution', () => {
  it('resolves Cyprus workspace country to +357', () => {
    expect(resolveWorkspaceDefaultPhoneCountryCode({
      countryCode: 'CY',
      countryName: 'Cyprus',
      city: 'Nicosia',
      timezone: 'Europe/Nicosia',
    })).toBe('+357')
  })

  it('uses workspace default before browser locale fallback', () => {
    setWorkspaceDefaultPhoneCountryCode('+357')
    expect(getDefaultReservationPhoneCountryCode()).toBe('+357')
  })
})

describe('publish stability', () => {
  it('hydrates host layout with valid active area before editor can close safely', () => {
    const transition = buildPublishTransitionResult({
      version: 1,
      floors: [{ id: 'main', label: 'Main', workspace: { width: 1000, height: 800, x: 0, y: 0 } }],
      activeFloorId: 'main',
      objects: [{
        id: 'table-1',
        type: 'table',
        floorId: 'main',
        position: { x: 100, y: 100 },
        size: { width: 120, height: 120 },
        rotation: 0,
        properties: { shape: 'round', tableNumber: '1', minGuests: 2, maxGuests: 4, visible: true },
      }],
    })

    expect(transition.ok).toBe(true)
    expect(transition.activeFloorAreaId).toBe('main')
    expect(transition.hostLayout?.tables?.length).toBeGreaterThan(0)
  })
})

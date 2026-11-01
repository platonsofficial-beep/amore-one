import { describe, expect, it } from 'vitest'
import {
  FLOOR_TABLE_OPERATIONAL_PHASES,
  getReservationOperationalPhase,
  resolveFloorTableOperationalState,
} from './floorTableOperationalState'
import { buildHostQueueServiceMetrics } from './hostQueueServiceMetrics'
import { summarizePortraitDay } from '../components/mobile/MobileManagerReservationsView'

const today = '2026-11-01'
const at = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const booking = (time, status = 'Confirmed', extra = {}) => ({ id: time, date: today, time, status, guests: 4, ...extra })

describe('reservations audit fixes', () => {
  it('a booking that is not checked in is late, not arrived', () => {
    expect(getReservationOperationalPhase(booking('20:00'), at('20:30'), today)).toBe(FLOOR_TABLE_OPERATIONAL_PHASES.LATE)
    const state = resolveFloorTableOperationalState([booking('20:00')], at('20:30'), today)
    expect(state.floorStatus).toBe('late')
  })

  it('a late booking holds its table for 45 minutes, then frees it', () => {
    expect(getReservationOperationalPhase(booking('20:00'), at('20:45'), today)).toBe(FLOOR_TABLE_OPERATIONAL_PHASES.LATE)
    expect(getReservationOperationalPhase(booking('20:00'), at('20:46'), today)).toBe(FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE)
  })

  it('a morning booking no longer holds the table in the evening', () => {
    expect(getReservationOperationalPhase(booking('10:00'), at('20:30'), today)).toBe(FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE)
  })

  it('an explicitly arrived guest is still arrived', () => {
    expect(getReservationOperationalPhase(booking('10:00', 'Waiting'), at('20:30'), today)).toBe(FLOOR_TABLE_OPERATIONAL_PHASES.WAITING)
  })

  it('late or old bookings are not counted as seated or in-house', () => {
    const metrics = buildHostQueueServiceMetrics([booking('10:00'), booking('20:00')], { dateKey: today, nowMinutes: at('20:30') })
    expect(metrics.seatedTables).toBe(0)
    expect(metrics.inHouseGuests).toBe(0)
    expect(metrics.expectedGuests).toBe(8)
  })

  it('summarises the day like the database count', () => {
    expect(summarizePortraitDay([
      booking('19:00'), booking('20:00', 'Pending', { guests: 2 }), booking('21:00', 'Cancelled'),
    ])).toBe('2 bookings · 6 guests · 1 cancelled')
  })
})

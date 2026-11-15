/**
 * Today's demo bookings, measured from the demo service clock.
 * Lateness stays within 15 minutes. Seated guests have been down 20–75 minutes.
 */

import { addMinutes, demoServiceInstant, venueClock, venueTimeLabel } from './demoMediaClock.js'

export const DEMO_LIVE_RESERVATIONS = [
  { id: 'res-m4', guest: 'maria', delta: 35, party: 4, table: '2', status: 'Confirmed', seating: 'dinner' },
  { id: 'res-e', guest: 'eleni', delta: -12, party: 6, table: '5', status: 'Confirmed', seating: 'dinner' },
  { id: 'res-a', guest: 'andreas', delta: -48, party: 2, table: '1', status: 'Checked In', seating: 'dinner', seatedDelta: -45 },
  { id: 'res-c', guest: 'christos', delta: -70, party: 3, table: '3', status: 'Checked In', seating: 'dinner', seatedDelta: -68 },
  { id: 'res-i', guest: 'irene', delta: -28, party: 2, table: '11', status: 'Checked In', seating: 'dinner', seatedDelta: -25 },
  { id: 'res-s', guest: 'sophia', delta: -8, party: 2, table: '', status: 'Waiting', seating: 'dinner' },
  { id: 'res-n', guest: 'nikos', delta: 80, party: 2, table: '12', status: 'Pending', seating: 'late' },
  { id: 'res-w', guest: 'walkIn', delta: -40, party: 2, table: '13', status: 'Walk In', seating: 'dinner', seatedDelta: -35 },
  { id: 'res-k', guest: 'markos', time: '13:00', party: 3, table: '6', status: 'Checked Out', seating: 'lunch' },
]

export function buildDemoLiveReservations(realNow = new Date()) {
  const instant = demoServiceInstant(realNow)
  const today = venueClock(instant).dateKey
  return DEMO_LIVE_RESERVATIONS.map((row) => {
    const when = row.time ? null : addMinutes(instant, row.delta)
    const seated = row.seatedDelta == null ? null : addMinutes(instant, row.seatedDelta)
    return {
      ...row,
      dateKey: when ? venueClock(when).dateKey : today,
      time: row.time || venueTimeLabel(when),
      seatedAt: seated ? seated.toISOString() : null,
      updatedAt: (seated || instant).toISOString(),
    }
  })
}

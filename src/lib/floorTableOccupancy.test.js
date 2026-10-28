import { describe, expect, it } from 'vitest'
import {
  collectArrivedFloorTableIds,
  reservationIsArrivedOnFloor,
} from './floorTableOccupancy'
import { buildHostSeatingTableAvailability } from './tableAvailability'
import { buildHostQueueServiceMetrics } from './hostQueueServiceMetrics'

const TODAY = '2026-10-28'
const LAYOUT = {
  tables: [
    { id: 'table-1783679867625-l9e4p', label: 'T10', displayLabel: 'T10', zoneId: 'main-dining' },
    { id: 'table-bar', label: 'B1', displayLabel: 'B1', zoneId: 'bar' },
  ],
}

describe('floor table occupancy', () => {
  it('treats ARRIVED bookings as occupying the matching table, including label-only assignments', () => {
    const reservations = [
      {
        id: 'papanikolaou',
        date: TODAY,
        time: '19:30',
        guests: 3,
        status: 'ARRIVED',
        guestName: 'Papanikolaou',
        seatingAssignment: {
          assignedUnits: [{ id: '', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      },
    ]

    expect(reservationIsArrivedOnFloor(reservations[0], 20 * 60, TODAY)).toBe(true)
    expect([...collectArrivedFloorTableIds(reservations, {
      layout: LAYOUT,
      dateKey: TODAY,
      nowMinutes: 20 * 60,
    })]).toEqual(['table-1783679867625-l9e4p'])

    const availability = buildHostSeatingTableAvailability(reservations, {
      dateKey: TODAY,
      layout: LAYOUT,
      nowMinutes: 20 * 60,
      seating: { id: 'dinner', startTime: '19:00', durationMinutes: 120 },
      seatingsById: new Map([
        ['dinner', { id: 'dinner', name: 'Dinner 1', startTime: '19:00', durationMinutes: 120, isActive: true }],
      ]),
    })
    expect(availability.availableTables).toBe(1)
    expect(availability.unavailableTableIds.has('table-1783679867625-l9e4p')).toBe(true)

    const metrics = buildHostQueueServiceMetrics(reservations, {
      layout: LAYOUT,
      dateKey: TODAY,
      nowMinutes: 20 * 60,
    })
    expect(metrics.inHouseGuests).toBe(3)
    expect(metrics.seatedTables).toBe(1)
    expect(metrics.freeTables).toBe(1)
  })

  it('does not treat another day as occupying today', () => {
    const reservations = [{
      id: 'old',
      date: '2026-07-11',
      time: '19:30',
      guests: 2,
      status: 'Confirmed',
      seatingAssignment: {
        assignedUnits: [{ id: 'table-1783679867625-l9e4p', label: 'T10' }],
      },
    }]

    expect(collectArrivedFloorTableIds(reservations, {
      layout: LAYOUT,
      dateKey: TODAY,
      nowMinutes: 20 * 60,
    }).size).toBe(0)
  })
})

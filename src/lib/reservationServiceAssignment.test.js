import { describe, expect, it } from 'vitest'
import {
  assignReservationTablesPayload,
  createSeatingAssignmentPayload,
} from '../services/reservationService'
import { getHostListGroupId } from './reservationHostStatus'
import { resolveSeatingFloorStatus } from './tableAvailability'
import { resolveHostFloorSemanticClass } from './hostFloorTableVisualState'
import { resolveFloorTableOperationalState } from './floorTableOperationalState'

const BASE_RESERVATION = {
  id: 'res-1',
  guestName: 'Alex',
  date: '2026-07-09',
  time: '20:00',
  guests: 4,
  area: 'Main',
  notes: '',
}

const ASSIGNMENT = {
  assignedUnits: [
    { id: 't15', label: 'T15', seatedCapacity: 2, maxGuestCapacity: 4 },
  ],
  extraChairs: 0,
  standingGuests: 0,
  seatingId: 'dinner-1',
}

describe('reservationService assignment payloads', () => {
  it('preserves Pending status when assigning a single table', () => {
    const payload = assignReservationTablesPayload(
      { ...BASE_RESERVATION, status: 'Pending' },
      ASSIGNMENT,
    )

    expect(payload.status).toBe('Pending')
    expect(payload.tableNumber).toBe('T15')
    expect(payload.seatingId).toBe('dinner-1')
    expect(payload.seatingAssignment.assignedUnits).toHaveLength(1)
    expect(payload.notes).toContain('@@SEATING@@')
  })

  it('preserves Confirmed status when assigning a single table', () => {
    const payload = assignReservationTablesPayload(
      { ...BASE_RESERVATION, status: 'Confirmed' },
      ASSIGNMENT,
    )

    expect(payload.status).toBe('Confirmed')
  })

  it('preserves Late Booking status for multi-table assignment', () => {
    const payload = assignReservationTablesPayload(
      { ...BASE_RESERVATION, status: 'Late Booking' },
      {
        ...ASSIGNMENT,
        assignedUnits: [
          { id: 't15', label: 'T15', seatedCapacity: 2, maxGuestCapacity: 4 },
          { id: 't16', label: 'T16', seatedCapacity: 2, maxGuestCapacity: 4 },
        ],
      },
    )

    expect(payload.status).toBe('Late Booking')
    expect(payload.seatingAssignment.assignedUnits).toHaveLength(2)
    expect(payload.tableNumber).toBe('T15 + T16')
  })

  it('preserves Waiting status during assignment', () => {
    const payload = assignReservationTablesPayload(
      { ...BASE_RESERVATION, status: 'Waiting' },
      ASSIGNMENT,
    )

    expect(payload.status).toBe('Waiting')
  })

  it('keeps assigned reservations in their current host list section', () => {
    const pendingPayload = assignReservationTablesPayload(
      { ...BASE_RESERVATION, status: 'Pending' },
      ASSIGNMENT,
    )
    const confirmedPayload = assignReservationTablesPayload(
      { ...BASE_RESERVATION, status: 'Confirmed' },
      ASSIGNMENT,
    )

    expect(getHostListGroupId({ status: pendingPayload.status })).not.toBe('seated')
    expect(getHostListGroupId({ status: confirmedPayload.status })).not.toBe('seated')
  })

  it('still allows explicit markSeated assignment when requested', () => {
    const payload = createSeatingAssignmentPayload(
      { ...BASE_RESERVATION, status: 'Confirmed' },
      ASSIGNMENT,
      { markSeated: true },
    )

    expect(payload.status).toBe('Checked In')
  })

  it('keeps assigned tables in reserved/upcoming floor state until status changes', () => {
    const reservation = {
      ...BASE_RESERVATION,
      status: 'Confirmed',
      time: '21:00',
      seatingAssignment: ASSIGNMENT,
    }
    const { hostIndicator } = resolveSeatingFloorStatus(null, reservation)
    const operational = resolveFloorTableOperationalState([reservation], 1200, '2026-07-09')

    expect(hostIndicator).toBe('confirmed')
    expect(['is-reserved', 'is-arrived']).toContain(resolveHostFloorSemanticClass(operational))
    expect(resolveHostFloorSemanticClass(operational)).not.toBe('is-seated')
  })
})

import { describe, expect, it } from 'vitest'
import { buildSeatingsById } from './reservationSeatings'
import { resolveFloorTableOperationalState } from './floorTableOperationalState'
import {
  applyHostFloorSelectedSeatingContext,
  resolveHostFloorSemanticClass,
} from './hostFloorTableVisualState'

const SEATINGS = buildSeatingsById([
  {
    id: 'dinner-1',
    name: 'Dinner 1',
    startTime: '19:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 0,
    isActive: true,
  },
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    startTime: '21:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 1,
    isActive: true,
  },
])

const LAYOUT = {
  tables: [
    { id: 't11', label: 'T11', zoneId: 'main', seats: 4, maxGuestCapacity: 4 },
    { id: 't12', label: 'T12', zoneId: 'main', seats: 4, maxGuestCapacity: 4 },
    { id: 't13', label: 'T13', zoneId: 'main', seats: 4, maxGuestCapacity: 4 },
  ],
}

function buildTableState(table, reservations, nowMinutes = 1200, todayKey = '2026-07-09') {
  const operational = resolveFloorTableOperationalState(reservations, nowMinutes, todayKey)
  return {
    table,
    reservation: operational.displayReservation,
    status: operational.floorStatus,
    operational,
    meta: {},
  }
}

function buildReservation(overrides = {}) {
  return {
    id: 'res-seated',
    guestName: 'Paparas',
    date: '2026-07-09',
    time: '21:00',
    guests: 4,
    status: 'Checked In',
    seatingId: 'dinner-2',
    seatingAssignment: {
      assignedUnits: [{ id: 't11', label: 'T11', seatedCapacity: 4, maxGuestCapacity: 4 }],
      extraChairs: 0,
      standingGuests: 0,
    },
    ...overrides,
  }
}

describe('hostFloorTableVisualState', () => {
  it('maps a seated reservation to the seated semantic class', () => {
    const operational = resolveFloorTableOperationalState(
      [buildReservation()],
      1260,
      '2026-07-09',
    )

    expect(operational.hostIndicator).toBe('seated')
    expect(resolveHostFloorSemanticClass(operational)).toBe('is-seated')
  })

  it('applies seated styling only for the selected seating window', () => {
    const seatedReservation = buildReservation()
    const tableState = buildTableState(LAYOUT.tables[0], [seatedReservation])

    const dinnerOneStates = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: [seatedReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })
    const dinnerTwoStates = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [seatedReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(resolveHostFloorSemanticClass(dinnerOneStates[0].operational)).toBe('is-available')
    expect(resolveHostFloorSemanticClass(dinnerTwoStates[0].operational)).toBe('is-seated')
  })

  it('keeps upcoming reservations in the reserved semantic class', () => {
    const upcomingReservation = buildReservation({
      id: 'res-upcoming',
      status: 'Confirmed',
      time: '21:00',
    })
    const tableState = buildTableState(LAYOUT.tables[0], [upcomingReservation], 1200)

    const filtered = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [upcomingReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(filtered[0].operational.hostIndicator).toBe('confirmed')
    expect(resolveHostFloorSemanticClass(filtered[0].operational)).toBe('is-reserved')
  })

  it('keeps unassigned tables available in the selected seating', () => {
    const tableState = buildTableState(LAYOUT.tables[2], [])

    const filtered = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [buildReservation()],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(filtered[0].operational.hostIndicator).toBe('empty')
    expect(resolveHostFloorSemanticClass(filtered[0].operational)).toBe('is-available')
  })

  it('lets conflict styling override seated styling', () => {
    const firstReservation = buildReservation({ id: 'res-a', guestName: 'Alpha' })
    const secondReservation = buildReservation({
      id: 'res-b',
      guestName: 'Beta',
      time: '21:15',
      status: 'Checked In',
    })
    const tableState = buildTableState(LAYOUT.tables[0], [firstReservation, secondReservation])

    const filtered = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [firstReservation, secondReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(filtered[0].operational.hasSeatingConflict).toBe(true)
    expect(resolveHostFloorSemanticClass(filtered[0].operational)).toBe('has-conflict')
  })

  it('marks every assigned table seated for a multi-table reservation', () => {
    const multiTableReservation = buildReservation({
      seatingAssignment: {
        assignedUnits: [
          { id: 't11', label: 'T11', seatedCapacity: 4, maxGuestCapacity: 4 },
          { id: 't12', label: 'T12', seatedCapacity: 4, maxGuestCapacity: 4 },
        ],
        extraChairs: 0,
        standingGuests: 0,
      },
    })
    const tableStates = [
      buildTableState(LAYOUT.tables[0], [multiTableReservation]),
      buildTableState(LAYOUT.tables[1], [multiTableReservation]),
    ]

    const filtered = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [multiTableReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(filtered.map((entry) => resolveHostFloorSemanticClass(entry.operational))).toEqual([
      'is-seated',
      'is-seated',
    ])
  })

  it('updates visible table state when the selected seating changes', () => {
    const reservation = buildReservation({ time: '19:30', seatingId: 'dinner-1' })
    const tableState = buildTableState(LAYOUT.tables[0], [reservation], 1170)

    const dinnerOne = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: [reservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })
    const dinnerTwo = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [reservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(resolveHostFloorSemanticClass(dinnerOne[0].operational)).toBe('is-seated')
    expect(resolveHostFloorSemanticClass(dinnerTwo[0].operational)).toBe('is-available')
  })

  it('preserves seated semantic class when the seated table is selected', () => {
    const seatedReservation = buildReservation()
    const tableState = buildTableState(LAYOUT.tables[0], [seatedReservation])

    const filtered = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [seatedReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: seatedReservation,
    })

    expect(filtered[0].operational.hostIndicator).toBe('seated')
    expect(resolveHostFloorSemanticClass(filtered[0].operational)).toBe('is-seated')
  })

  it('maps late booking status to reserved rather than problem', () => {
    const operational = {
      hostIndicator: 'confirmed',
      phase: 'upcoming',
      hasSeatingConflict: false,
    }

    expect(resolveHostFloorSemanticClass(operational)).toBe('is-reserved')
  })

  it('maps explicit problem host indicator to conflict styling', () => {
    const operational = {
      hostIndicator: 'problem',
      phase: 'available',
      hasSeatingConflict: false,
    }

    expect(resolveHostFloorSemanticClass(operational)).toBe('has-conflict')
  })
})

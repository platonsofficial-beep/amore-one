import { describe, expect, it } from 'vitest'
import { buildSeatingsById } from './reservationSeatings'
import { getConflictingUnitIds } from './reservationTableOptions'
import { resolveFloorTableOperationalState } from './floorTableOperationalState'
import { buildHostFloorCompactTableContent } from './hostFloorTableContent'
import {
  applyHostFloorAllServicesScope,
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

  it('All keeps a party seated right now occupied and leaves later bookings neutral', () => {
    const lunch = {
      id: 'lunch',
      name: 'Lunch',
      startTime: '13:00',
      durationMinutes: 150,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
    }
    const seatings = buildSeatingsById([lunch, ...SEATINGS.values()])
    const seated = buildReservation({
      id: 'res-lunch',
      guestName: 'Platon Lolakos',
      time: '15:15',
      guests: 2,
      status: 'Checked In',
      seatingId: 'lunch',
      seatingAssignment: {
        assignedUnits: [{ id: 't10', label: 'T10', seatedCapacity: 4, maxGuestCapacity: 4 }],
        extraChairs: 0,
        standingGuests: 0,
      },
    })
    const later = buildReservation({
      id: 'res-dinner',
      guestName: 'Later Guest',
      time: '21:00',
      guests: 4,
      status: 'Confirmed',
      seatingId: 'dinner-2',
    })
    const t10 = { id: 't10', label: 'T10', zoneId: 'main', seats: 4, maxGuestCapacity: 4 }
    const states = [
      buildTableState(t10, [seated], 960),
      buildTableState(LAYOUT.tables[0], [later], 960),
    ]

    const all = applyHostFloorAllServicesScope(states)

    expect(resolveHostFloorSemanticClass(all[0].operational)).toBe('is-seated')
    expect(all[0].status).toBe('seated')
    expect(all[0].reservation.guestName).toBe('Platon Lolakos')
    const content = buildHostFloorCompactTableContent({
      table: t10,
      operational: all[0].operational,
      displayReservation: all[0].operational.displayReservation,
    })
    expect(content.mode).toBe('occupied')
    expect(content.timeLabel).toBe('15:15')
    expect(content.partyLabel).toBe('👤2')
    expect(resolveHostFloorSemanticClass(all[1].operational)).toBe('is-available')
    expect(all[1].status).toBe('available')
    expect(all[1].reservation).toBeNull()
    const openTable = buildHostFloorCompactTableContent({
      table: LAYOUT.tables[0],
      operational: all[1].operational,
    })
    expect(openTable.mode).toBe('available')
    expect(openTable.partyLabel).toBe('👤4')

    const lunchView = applyHostFloorSelectedSeatingContext([states[0]], {
      selectedSeating: lunch,
      enrichedReservations: [seated],
      todayKey: '2026-07-09',
      seatingsById: seatings,
      layout: { tables: [t10] },
      nowMinutes: 960,
    })
    expect(resolveHostFloorSemanticClass(lunchView[0].operational)).toBe('is-seated')

    const otherSeating = applyHostFloorSelectedSeatingContext([states[0]], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [seated],
      todayKey: '2026-07-09',
      seatingsById: seatings,
      layout: { tables: [t10] },
      nowMinutes: 960,
    })
    expect(resolveHostFloorSemanticClass(otherSeating[0].operational)).toBe('is-seated')
  })

  it('keeps a checked-in party seated when another service is selected', () => {
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

    expect(resolveHostFloorSemanticClass(dinnerOneStates[0].operational)).toBe('is-seated')
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

  it('keeps an in-house party visible after the service tab changes', () => {
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
    expect(resolveHostFloorSemanticClass(dinnerTwo[0].operational)).toBe('is-seated')
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

  it('does not pin a selected reservation to a seating it no longer belongs to', () => {
    const staleSelected = buildReservation({
      id: 'res-move',
      time: '19:00',
      seatingId: 'dinner-1',
      status: 'Confirmed',
    })
    const movedReservation = buildReservation({
      id: 'res-move',
      time: '19:00',
      seatingId: 'dinner-2',
      status: 'Confirmed',
    })
    const tableState = buildTableState(LAYOUT.tables[0], [movedReservation], 1170)

    const dinnerOne = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: [movedReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: staleSelected,
    })
    const dinnerTwo = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [movedReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: staleSelected,
    })

    expect(resolveHostFloorSemanticClass(dinnerOne[0].operational)).toBe('is-available')
    expect(resolveHostFloorSemanticClass(dinnerTwo[0].operational)).toBe('is-reserved')
  })

  it('updates seating counts and floor membership immediately after Dinner 1 → Dinner 2', () => {
    const movedReservation = buildReservation({
      id: 'res-move',
      time: '19:00',
      seatingId: 'dinner-2',
      status: 'Confirmed',
    })
    const tableState = buildTableState(LAYOUT.tables[0], [movedReservation], 1170)
    const reservations = [movedReservation]

    const dinnerOneConflicts = getConflictingUnitIds(reservations, '2026-07-09', '19:00', {
      seatingId: 'dinner-1',
      durationMinutes: 120,
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })
    const dinnerTwoConflicts = getConflictingUnitIds(reservations, '2026-07-09', '21:00', {
      seatingId: 'dinner-2',
      durationMinutes: 120,
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(dinnerOneConflicts.has('t11')).toBe(false)
    expect(dinnerTwoConflicts.has('t11')).toBe(true)

    const dinnerTwoFloor = applyHostFloorSelectedSeatingContext([tableState], {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: reservations,
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: movedReservation,
    })

    expect(resolveHostFloorSemanticClass(dinnerTwoFloor[0].operational)).toBe('is-reserved')
  })

  it('moves every assigned table when a multi-table reservation changes seating', () => {
    const movedReservation = buildReservation({
      id: 'res-multi',
      time: '19:00',
      seatingId: 'dinner-2',
      status: 'Confirmed',
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
      buildTableState(LAYOUT.tables[0], [movedReservation], 1170),
      buildTableState(LAYOUT.tables[1], [movedReservation], 1170),
    ]

    const dinnerOne = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: [movedReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: movedReservation,
    })
    const dinnerTwo = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-2'),
      enrichedReservations: [movedReservation],
      todayKey: '2026-07-09',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: movedReservation,
    })

    expect(dinnerOne.map((entry) => resolveHostFloorSemanticClass(entry.operational))).toEqual([
      'is-available',
      'is-available',
    ])
    expect(dinnerTwo.map((entry) => resolveHostFloorSemanticClass(entry.operational))).toEqual([
      'is-reserved',
      'is-reserved',
    ])
  })

  it('maps late booking status to reserved rather than problem', () => {
    const operational = {
      hostIndicator: 'confirmed',
      phase: 'upcoming',
      hasSeatingConflict: false,
    }

    expect(resolveHostFloorSemanticClass(operational)).toBe('is-reserved')
  })

  it('does not paint a table available when bookings were not read', () => {
    const unknown = resolveFloorTableOperationalState([], 18 * 60, '2026-11-08', {
      bookingCertainty: 'unknown',
    })
    expect(unknown.floorStatus).toBe('unverified')
    expect(resolveHostFloorSemanticClass(unknown)).toBe('is-unverified')

    const stale = resolveFloorTableOperationalState([
      {
        id: 'test-one',
        guestName: 'Test One Check0811 Edited',
        guests: 1,
        time: '19:00',
        date: '2026-11-08',
        status: 'Confirmed',
      },
    ], 18 * 60, '2026-11-08', { bookingCertainty: 'stale' })
    expect(stale.displayReservation?.guestName).toBe('Test One Check0811 Edited')
    expect(stale.bookingStale).toBe(true)
    expect(stale.floorStatus).not.toBe('available')
    expect(stale.floorStatus).not.toBe('unverified')
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

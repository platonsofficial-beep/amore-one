import { describe, expect, it } from 'vitest'
import { buildSeatingsById } from './reservationSeatings'
import {
  applyHostFloorSelectedSeatingContext,
  resolveHostFloorSemanticClass,
} from './hostFloorTableVisualState'
import {
  getHostFloorReservationRevision,
  mergeOptimisticReservationUpdate,
  syncHostWorkspaceReservationSelection,
} from './hostFloorReservationState'

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
    { id: 't15', label: 'T15', zoneId: 'main', seats: 4, maxGuestCapacity: 4 },
    { id: 't16', label: 'T16', zoneId: 'main', seats: 4, maxGuestCapacity: 4 },
  ],
}

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Alex',
    date: '2026-07-10',
    time: '19:00',
    guests: 4,
    status: 'Confirmed',
    seatingId: 'dinner-1',
    seatingAssignment: {
      assignedUnits: [
        { id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 },
        { id: 't16', label: 'T16', seatedCapacity: 4, maxGuestCapacity: 4 },
      ],
      extraChairs: 0,
      standingGuests: 0,
    },
    ...overrides,
  }
}

function buildTableState(tableId) {
  const table = LAYOUT.tables.find((entry) => entry.id === tableId)
  return {
    table,
    reservation: null,
    status: 'available',
    operational: {
      phase: 'available',
      hostIndicator: 'empty',
      floorStatus: 'available',
      displayReservation: null,
      activeReservation: null,
      hasSeatingConflict: false,
    },
    meta: {},
  }
}

function resolveSemanticForTable(states, tableId) {
  const tableState = states.find((entry) => entry.table.id === tableId)
  return resolveHostFloorSemanticClass(tableState.operational, {
    hasSeatingConflict: tableState.operational.hasSeatingConflict,
  })
}

describe('hostFloorReservationState', () => {
  it('tracks reservation revisions when status or assignment changes', () => {
    const confirmed = buildReservation({ status: 'Confirmed' })
    const seated = buildReservation({ status: 'Checked In' })

    expect(getHostFloorReservationRevision([confirmed])).not.toBe(
      getHostFloorReservationRevision([seated]),
    )
  })

  it('syncs stale selected reservation objects from the canonical list', () => {
    const stale = buildReservation({ status: 'Confirmed' })
    const fresh = buildReservation({ status: 'Checked In' })

    expect(syncHostWorkspaceReservationSelection(stale, [fresh])).toEqual(fresh)
    expect(syncHostWorkspaceReservationSelection(fresh, [fresh])).toBe(fresh)
  })

  it('builds optimistic reservation updates for immediate floor refresh', () => {
    const reservation = buildReservation({ status: 'Confirmed' })
    const optimistic = mergeOptimisticReservationUpdate(reservation, { status: 'Checked In' })

    expect(optimistic.status).toBe('Checked In')
    expect(getHostFloorReservationRevision([optimistic])).not.toBe(
      getHostFloorReservationRevision([reservation]),
    )
  })
})

describe('host floor status refresh', () => {
  const tableStates = [
    buildTableState('t15'),
    buildTableState('t16'),
  ]

  it('1. Confirmed → In House immediately changes assigned table to seated state', () => {
    const staleSelected = buildReservation({ status: 'Confirmed' })
    const freshReservations = [buildReservation({ status: 'Checked In' })]

    const next = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: freshReservations,
      todayKey: '2026-07-10',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: staleSelected,
    })

    expect(resolveSemanticForTable(next, 't15')).toBe('is-seated')
    expect(resolveSemanticForTable(next, 't16')).toBe('is-seated')
  })

  it('2. In House → Confirmed immediately changes table back to reserved state', () => {
    const staleSelected = buildReservation({ status: 'Checked In' })
    const freshReservations = [buildReservation({ status: 'Confirmed' })]

    const next = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: freshReservations,
      todayKey: '2026-07-10',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: staleSelected,
    })

    expect(resolveSemanticForTable(next, 't15')).toBe('is-reserved')
    expect(resolveSemanticForTable(next, 't16')).toBe('is-reserved')
  })

  it('3. Pending → Confirmed immediately updates reserved styling', () => {
    const freshReservations = [buildReservation({ status: 'Confirmed', time: '19:00' })]

    const next = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: freshReservations,
      todayKey: '2026-07-10',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: null,
    })

    expect(resolveSemanticForTable(next, 't15')).toBe('is-reserved')
  })

  it('4. In House → Completed immediately releases the table', () => {
    const freshReservations = [buildReservation({ status: 'Checked Out' })]

    const next = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: freshReservations,
      todayKey: '2026-07-10',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: buildReservation({ status: 'Checked In' }),
    })

    expect(resolveSemanticForTable(next, 't15')).toBe('is-available')
    expect(resolveSemanticForTable(next, 't16')).toBe('is-available')
  })

  it('5. multi-table status change updates every assigned table', () => {
    const freshReservations = [buildReservation({ status: 'Checked In' })]

    const next = applyHostFloorSelectedSeatingContext(tableStates, {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: freshReservations,
      todayKey: '2026-07-10',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: null,
    })

    expect(resolveSemanticForTable(next, 't15')).toBe('is-seated')
    expect(resolveSemanticForTable(next, 't16')).toBe('is-seated')
  })

  it('6. status change in Dinner 2 does not alter Dinner 1 floor state', () => {
    const dinnerTwoReservation = buildReservation({
      status: 'Checked In',
      time: '21:00',
      seatingId: 'dinner-2',
      seatingAssignment: {
        assignedUnits: [{ id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 }],
        extraChairs: 0,
        standingGuests: 0,
      },
    })

    const dinnerOne = applyHostFloorSelectedSeatingContext([buildTableState('t15')], {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: [dinnerTwoReservation],
      todayKey: '2026-07-10',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: null,
    })

    expect(resolveSemanticForTable(dinnerOne, 't15')).toBe('is-available')
  })

  it('7. floor update occurs without selecting the reservation again', () => {
    const staleSelected = buildReservation({ status: 'Confirmed' })
    const updatedReservations = [buildReservation({ status: 'Checked In' })]

    const withoutReselect = applyHostFloorSelectedSeatingContext([buildTableState('t15')], {
      selectedSeating: SEATINGS.get('dinner-1'),
      enrichedReservations: updatedReservations,
      todayKey: '2026-07-10',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      selectedReservation: staleSelected,
    })

    expect(resolveSemanticForTable(withoutReselect, 't15')).toBe('is-seated')
  })

  it('8. list, bottom card, summary, and floor share the same updated status object', () => {
    const canonical = [buildReservation({ status: 'Checked In' })]
    const syncedSelection = syncHostWorkspaceReservationSelection(
      buildReservation({ status: 'Confirmed' }),
      canonical,
    )

    expect(syncedSelection.status).toBe('Checked In')
    expect(getHostFloorReservationRevision([syncedSelection])).toBe(
      getHostFloorReservationRevision(canonical),
    )
  })
})

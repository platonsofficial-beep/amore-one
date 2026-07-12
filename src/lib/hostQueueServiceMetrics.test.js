import { describe, expect, it } from 'vitest'
import {
  buildHostQueueServiceMetrics,
  buildHostQueueServiceMetricsFromReservations,
  countPublishedTablesInScope,
  getExpectedAssignedTableIdsForScope,
  getReservedTableIdsForScope,
  getSeatedTableIdsForScope,
  isReservationExpectedForServiceMetrics,
  isReservationReservedForDayMetrics,
  isReservationSeatedForTableMetrics,
} from './hostQueueServiceMetrics'
import { HOST_QUEUE_ALL_AREAS } from './hostQueuePipeline'

const SEATINGS = [
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
]

const LAYOUT = {
  zones: [
    { id: 'main', label: 'Main Dining' },
    { id: 'bar', label: 'Bar' },
  ],
  tables: [
    { id: 't10', label: 'T10', zoneId: 'main', seats: 4 },
    { id: 't15', label: 'T15', zoneId: 'main', seats: 4 },
    { id: 't16', label: 'T16', zoneId: 'bar', seats: 4 },
    { id: 't25', label: 'T25', zoneId: 'bar', seats: 4 },
    { id: 't30', label: 'T30', zoneId: 'main', seats: 2 },
  ],
}

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Alex',
    date: '2026-07-10',
    time: '19:00',
    guests: 2,
    status: 'Confirmed',
    seatingId: 'dinner-1',
    ...overrides,
  }
}

describe('isReservationExpectedForServiceMetrics', () => {
  it('includes Pending and Confirmed upcoming reservations', () => {
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Pending' }))).toBe(true)
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Confirmed' }))).toBe(true)
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Late Booking' }))).toBe(true)
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Waiting' }))).toBe(true)
  })

  it('excludes Seated, Completed, and No-show reservations', () => {
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Checked In' }))).toBe(false)
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Checked Out' }))).toBe(false)
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Not Shown' }))).toBe(false)
    expect(isReservationExpectedForServiceMetrics(buildReservation({ status: 'Cancelled' }))).toBe(false)
  })
})

describe('isReservationReservedForDayMetrics', () => {
  it('includes active day-planning statuses with assigned tables', () => {
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Pending' }))).toBe(true)
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Confirmed' }))).toBe(true)
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Checked In' }))).toBe(true)
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Walk In' }))).toBe(true)
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Late Booking' }))).toBe(true)
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Waiting' }))).toBe(true)
  })

  it('excludes cancelled, no-show, and completed reservations', () => {
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Cancelled' }))).toBe(false)
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Not Shown' }))).toBe(false)
    expect(isReservationReservedForDayMetrics(buildReservation({ status: 'Checked Out' }))).toBe(false)
  })
})

describe('isReservationSeatedForTableMetrics', () => {
  it('includes only in-house seated statuses', () => {
    expect(isReservationSeatedForTableMetrics(buildReservation({ status: 'Checked In' }))).toBe(true)
    expect(isReservationSeatedForTableMetrics(buildReservation({ status: 'Walk In' }))).toBe(true)
    expect(isReservationSeatedForTableMetrics(buildReservation({ status: 'Checked In (Partial)' }))).toBe(true)
    expect(isReservationSeatedForTableMetrics(buildReservation({ status: 'Confirmed' }))).toBe(false)
    expect(isReservationSeatedForTableMetrics(buildReservation({ status: 'Waiting' }))).toBe(false)
  })
})

describe('buildHostQueueServiceMetrics', () => {
  it('counts expected guests from upcoming reservations only', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({ id: 'a', guests: 4, status: 'Pending' }),
      buildReservation({ id: 'b', guests: 3, status: 'Confirmed' }),
      buildReservation({ id: 'c', guests: 5, status: 'Checked In' }),
      buildReservation({ id: 'd', guests: 2, status: 'Not Shown' }),
    ], { layout: LAYOUT })

    expect(metrics.expectedGuests).toBe(7)
  })

  it('counts in-house guests from seated and partial statuses', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({ id: 'a', guests: 4, status: 'Checked In' }),
      buildReservation({ id: 'b', guests: 2, status: 'Checked In (Partial)' }),
      buildReservation({ id: 'c', guests: 3, status: 'Walk In' }),
      buildReservation({ id: 'd', guests: 3, status: 'Confirmed' }),
    ], { layout: LAYOUT })

    expect(metrics.inHouseGuests).toBe(9)
  })

  it('counts reserved tables across upcoming and in-house reservations', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({
        id: 'upcoming',
        status: 'Confirmed',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      buildReservation({
        id: 'seated',
        status: 'Checked In',
        seatingAssignment: {
          assignedUnits: [{ id: 't15', label: 'T15' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      buildReservation({
        id: 'walk-in',
        status: 'Walk In',
        seatingAssignment: {
          assignedUnits: [{ id: 't30', label: 'T30' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      buildReservation({ id: 'cancelled', status: 'Cancelled', tableNumber: 'T25' }),
    ], { layout: LAYOUT })

    expect(metrics.reservedTables).toBe(3)
    expect(metrics.freeTables).toBe(2)
    expect(metrics.totalPublishedTables).toBe(5)
  })

  it('counts seated tables only for occupied in-house statuses', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({
        status: 'Checked In',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      buildReservation({
        status: 'Walk In',
        seatingAssignment: {
          assignedUnits: [{ id: 't15', label: 'T15' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      buildReservation({
        status: 'Confirmed',
        seatingAssignment: {
          assignedUnits: [{ id: 't16', label: 'T16' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT })

    expect(metrics.seatedTables).toBe(2)
    expect(metrics.reservedTables).toBe(3)
  })

  it('counts unique assigned physical tables in the reserved-table numerator', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({
        id: 'multi',
        guests: 4,
        seatingAssignment: {
          assignedUnits: [
            { id: 't15', label: 'T15' },
            { id: 't16', label: 'T16' },
          ],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT })

    expect(metrics.reservedTables).toBe(2)
  })

  it('deduplicates duplicate table assignments', () => {
    const tableIds = getReservedTableIdsForScope(
      buildReservation({
        seatingAssignment: {
          assignedUnits: [
            { id: 't10', label: 'T10' },
            { id: 't10', label: 'T10' },
          ],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      LAYOUT,
    )

    expect([...tableIds]).toEqual(['t10'])
  })

  it('deduplicates merged tables across reservations on the same table', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({
        id: 'upcoming',
        status: 'Confirmed',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      buildReservation({
        id: 'seated',
        status: 'Checked In',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT })

    expect(metrics.reservedTables).toBe(1)
    expect(metrics.seatedTables).toBe(1)
  })

  it('does not increase reserved tables for unassigned reservations', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({ id: 'unassigned', guests: 2 }),
    ], { layout: LAYOUT })

    expect(metrics.expectedGuests).toBe(2)
    expect(metrics.reservedTables).toBe(0)
    expect(metrics.freeTables).toBe(5)
  })

  it('uses all published tables for All areas denominator', () => {
    expect(countPublishedTablesInScope(LAYOUT, HOST_QUEUE_ALL_AREAS)).toBe(5)
    const metrics = buildHostQueueServiceMetrics([], {
      layout: LAYOUT,
      areaFilterId: HOST_QUEUE_ALL_AREAS,
    })
    expect(metrics.totalPublishedTables).toBe(5)
    expect(metrics.freeTables).toBe(5)
  })

  it('uses selected-area published tables for area-scoped denominator', () => {
    expect(countPublishedTablesInScope(LAYOUT, 'main')).toBe(3)
    const metrics = buildHostQueueServiceMetrics([], {
      layout: LAYOUT,
      areaFilterId: 'main',
    })
    expect(metrics.totalPublishedTables).toBe(3)
    expect(metrics.freeTables).toBe(3)
  })

  it('counts only assigned tables in the selected area for multi-area reservations', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({
        seatingAssignment: {
          assignedUnits: [
            { id: 't15', label: 'T15' },
            { id: 't16', label: 'T16' },
          ],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT, areaFilterId: 'main' })

    expect(metrics.reservedTables).toBe(1)
    expect(metrics.freeTables).toBe(2)
  })

  it('keeps upcoming-only table ids for expected assigned helper', () => {
    const tableIds = getExpectedAssignedTableIdsForScope(
      buildReservation({
        status: 'Checked In',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      LAYOUT,
    )

    expect([...tableIds]).toEqual([])
  })

  it('updates seated tables when a walk-in is seated immediately', () => {
    const metrics = buildHostQueueServiceMetrics([
      buildReservation({
        status: 'Walk In',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT })

    expect(metrics.seatedTables).toBe(1)
    expect(metrics.reservedTables).toBe(1)
    expect(getSeatedTableIdsForScope(buildReservation({ status: 'Walk In' }), LAYOUT).size).toBe(0)
  })
})

describe('formatHostQueueSeatingChipMetricsLine', () => {
  it('formats compact per-seating operational metrics', async () => {
    const { formatHostQueueSeatingChipMetricsLine } = await import('./hostQueueServiceMetrics')
    expect(formatHostQueueSeatingChipMetricsLine({
      expectedGuests: 35,
      reservedTables: 17,
      seatedTables: 5,
      inHouseGuests: 9,
    })).toBe('👥35 · 🍽17 · 🪑5 · 👤9')
  })
})

describe('buildHostQueueServiceMetricsFromReservations scope', () => {
  const reservations = [
    buildReservation({
      id: 'd1-main',
      seatingId: 'dinner-1',
      guests: 2,
      seatingAssignment: {
        assignedUnits: [{ id: 't10', label: 'T10' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }),
    buildReservation({
      id: 'd2-bar',
      seatingId: 'dinner-2',
      time: '21:00',
      guests: 4,
      seatingAssignment: {
        assignedUnits: [{ id: 't25', label: 'T25' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }),
    buildReservation({
      id: 'd1-seated',
      seatingId: 'dinner-1',
      guests: 3,
      status: 'Checked In',
      seatingAssignment: {
        assignedUnits: [{ id: 't30', label: 'T30' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }),
  ]

  it('changes all metrics when selected seating changes', () => {
    const dinnerOne = buildHostQueueServiceMetricsFromReservations(reservations, {
      selectedSeating: SEATINGS[0],
      seatings: SEATINGS,
      dateKey: '2026-07-10',
      layout: LAYOUT,
    })
    const dinnerTwo = buildHostQueueServiceMetricsFromReservations(reservations, {
      selectedSeating: SEATINGS[1],
      seatings: SEATINGS,
      dateKey: '2026-07-10',
      layout: LAYOUT,
    })

    expect(dinnerOne.expectedGuests).toBe(2)
    expect(dinnerOne.inHouseGuests).toBe(3)
    expect(dinnerOne.reservedTables).toBe(2)
    expect(dinnerOne.seatedTables).toBe(1)
    expect(dinnerTwo.expectedGuests).toBe(4)
    expect(dinnerTwo.inHouseGuests).toBe(0)
    expect(dinnerTwo.reservedTables).toBe(1)
  })

  it('changes metrics when selected area changes', () => {
    const allAreas = buildHostQueueServiceMetricsFromReservations(reservations, {
      selectedSeating: SEATINGS[0],
      seatings: SEATINGS,
      dateKey: '2026-07-10',
      layout: LAYOUT,
    })
    const mainOnly = buildHostQueueServiceMetricsFromReservations(reservations, {
      selectedSeating: SEATINGS[0],
      seatings: SEATINGS,
      dateKey: '2026-07-10',
      areaFilterId: 'main',
      layout: LAYOUT,
    })

    expect(allAreas.expectedGuests).toBe(2)
    expect(mainOnly.expectedGuests).toBe(2)
    expect(allAreas.reservedTables).toBe(2)
    expect(mainOnly.reservedTables).toBe(2)
    expect(mainOnly.totalPublishedTables).toBe(3)
    expect(mainOnly.freeTables).toBe(1)
  })

  it('updates reserved tables immediately when assignment changes', () => {
    const unassigned = buildHostQueueServiceMetrics([
      buildReservation({ guests: 2 }),
    ], { layout: LAYOUT })
    const assigned = buildHostQueueServiceMetrics([
      buildReservation({
        guests: 2,
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT })

    expect(unassigned.reservedTables).toBe(0)
    expect(assigned.reservedTables).toBe(1)
    expect(assigned.freeTables).toBe(4)
  })

  it('updates metrics immediately when status mutates to in house', () => {
    const upcoming = buildHostQueueServiceMetrics([
      buildReservation({
        guests: 4,
        status: 'Confirmed',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT })
    const seated = buildHostQueueServiceMetrics([
      buildReservation({
        guests: 4,
        status: 'Checked In',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ], { layout: LAYOUT })

    expect(upcoming.expectedGuests).toBe(4)
    expect(upcoming.inHouseGuests).toBe(0)
    expect(upcoming.seatedTables).toBe(0)
    expect(seated.expectedGuests).toBe(0)
    expect(seated.inHouseGuests).toBe(4)
    expect(seated.seatedTables).toBe(1)
    expect(seated.reservedTables).toBe(1)
  })
})

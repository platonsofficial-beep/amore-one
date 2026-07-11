import { describe, expect, it } from 'vitest'
import { computeSeatingAssignmentTotals } from './seatingAssignment'
import { getConflictingUnitIds } from './reservationTableOptions'
import {
  buildFloorTableSeatingRows,
  buildHostSeatingTableAvailability,
  findReservationForTableSeating,
  formatHostSeatingTableAvailabilityAccessible,
  formatHostSeatingTableAvailabilityDisplay,
  formatTableConflictReason,
  reservationBlocksTableAvailability,
} from './tableAvailability'
import { buildSeatingsById } from './reservationSeatings'
import { HOST_QUEUE_ALL_AREAS } from './hostQueuePipeline'

const SEATINGS = buildSeatingsById([
  {
    id: 'dinner-1',
    name: 'Dinner 1',
    startTime: '19:00',
    durationMinutes: 90,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 0,
    isActive: true,
  },
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    startTime: '21:00',
    durationMinutes: 90,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 1,
    isActive: true,
  },
])

const LAYOUT = {
  units: [
    { id: 't3', label: 'T3', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 4 },
    { id: 't4', label: 'T4', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 4 },
  ],
}

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Alex',
    date: '2026-07-09',
    time: '19:00',
    guests: 4,
    status: 'Confirmed',
    seatingId: 'dinner-1',
    seatingAssignment: {
      assignedUnits: [{ id: 't3', label: 'T3', seatedCapacity: 2, maxGuestCapacity: 4 }],
      extraChairs: 0,
      standingGuests: 0,
    },
    ...overrides,
  }
}

describe('tableAvailability', () => {
  it('marks table available for one seating but occupied for another', () => {
    const reservations = [buildReservation()]
    const table = { id: 't3', label: 'T3' }

    const earlyConflicts = getConflictingUnitIds(reservations, '2026-07-09', '19:00', {
      seatingId: 'dinner-1',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })
    const lateConflicts = getConflictingUnitIds(reservations, '2026-07-09', '21:00', {
      seatingId: 'dinner-2',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(earlyConflicts.has('t3')).toBe(true)
    expect(lateConflicts.has('t3')).toBe(false)
  })

  it('does not double-count boundary reservations across seatings', () => {
    const reservations = [
      buildReservation({
        id: 'res-boundary',
        guestName: 'Paparas',
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAssignment: {
          assignedUnits: [{ id: 't3', label: 'T3', seatedCapacity: 2, maxGuestCapacity: 4 }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ]

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

    expect(dinnerOneConflicts.has('t3')).toBe(false)
    expect(dinnerTwoConflicts.has('t3')).toBe(true)
  })

  it('blocks every table in a multi-table reservation', () => {
    const reservations = [
      buildReservation({
        seatingAssignment: {
          assignedUnits: [
            { id: 't3', label: 'T3', seatedCapacity: 2, maxGuestCapacity: 4 },
            { id: 't4', label: 'T4', seatedCapacity: 2, maxGuestCapacity: 4 },
          ],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ]

    const conflicts = getConflictingUnitIds(reservations, '2026-07-09', '19:00', {
      seatingId: 'dinner-1',
      seatingsById: SEATINGS,
      layout: LAYOUT,
    })

    expect(conflicts.has('t3')).toBe(true)
    expect(conflicts.has('t4')).toBe(true)
  })

  it('does not block tables for completed, cancelled, or no-show reservations', () => {
    const statuses = ['Checked Out', 'Cancelled', 'Not Shown']

    statuses.forEach((status) => {
      const conflicts = getConflictingUnitIds(
        [buildReservation({ status })],
        '2026-07-09',
        '19:00',
        {
          seatingId: 'dinner-1',
          seatingsById: SEATINGS,
          layout: LAYOUT,
        },
      )

      expect(conflicts.size).toBe(0)
    })
  })

  it('excludes the reservation being edited from conflict checks', () => {
    const reservations = [buildReservation({ id: 'res-edit' })]
    const conflicts = getConflictingUnitIds(reservations, '2026-07-09', '19:00', {
      seatingId: 'dinner-1',
      seatingsById: SEATINGS,
      layout: LAYOUT,
      excludeReservationId: 'res-edit',
    })

    expect(conflicts.size).toBe(0)
  })

  it('formats conflict reasons for unavailable tables', () => {
    const reason = formatTableConflictReason({
      time: '19:00',
      guests: 4,
      guestName: 'Alex',
    })

    expect(reason).toContain('Reserved at 19:00')
    expect(reason).toContain('4 guests')
    expect(reason).toContain('Alex')
  })

  it('builds per-seating rows for a table', () => {
    const reservations = [buildReservation()]
    const table = { id: 't3', label: 'T3' }
    const rows = buildFloorTableSeatingRows(table, reservations, '2026-07-09', [...SEATINGS.values()], {
      layout: LAYOUT,
      seatingsById: SEATINGS,
    })

    expect(rows).toHaveLength(2)
    expect(rows[0].isAvailable).toBe(false)
    expect(rows[1].isAvailable).toBe(true)
  })

  it('finds occupied reservation for a table seating', () => {
    const reservations = [buildReservation({ guestName: 'Jordan' })]
    const reservation = findReservationForTableSeating(
      reservations,
      { id: 't3' },
      '2026-07-09',
      SEATINGS.get('dinner-1'),
      { seatingsById: SEATINGS, layout: LAYOUT },
    )

    expect(reservation?.guestName).toBe('Jordan')
  })

  it('reports advisory capacity below party size without blocking save semantics', () => {
    const totals = computeSeatingAssignmentTotals({
      assignedUnits: [{ id: 't3', label: 'T3', seatedCapacity: 2, maxGuestCapacity: 4 }],
      extraChairs: 0,
      standingGuests: 0,
    }, 6)

    expect(totals.isUnderCapacity).toBe(true)
    expect(totals.capacityGap).toBe(2)
  })

  it('uses terminal status helper for availability blocking', () => {
    expect(reservationBlocksTableAvailability('Confirmed')).toBe(true)
    expect(reservationBlocksTableAvailability('Checked Out')).toBe(false)
    expect(reservationBlocksTableAvailability('Not Shown')).toBe(false)
  })
})

const MAIN_DINING_LAYOUT = {
  zones: [
    { id: 'main', label: 'Main Dining' },
    { id: 'bar', label: 'Bar' },
  ],
  tables: [
    ...Array.from({ length: 37 }, (_, index) => ({
      id: `t-${index + 1}`,
      label: `T${index + 1}`,
      zoneId: 'main',
      seats: 4,
    })),
    { id: 'bar-1', label: 'Bar 1', zoneId: 'bar', seats: 4 },
  ],
}

function buildMainDiningReservations(tableIds, overrides = {}) {
  return [{
    id: 'res-main',
    guestName: 'Party',
    date: '2026-07-09',
    time: '21:00',
    guests: 4,
    status: 'Confirmed',
    seatingId: 'dinner-2',
    seatingAssignment: {
      assignedUnits: tableIds.map((id) => ({ id, label: id })),
      extraChairs: 0,
      standingGuests: 0,
    },
    ...overrides,
  }]
}

describe('buildHostSeatingTableAvailability', () => {
  const dinnerTwo = SEATINGS.get('dinner-2')

  it('returns 19 available tables when 18 of 37 are unavailable', () => {
    const unavailableIds = Array.from({ length: 18 }, (_, index) => `t-${index + 1}`)
    const availability = buildHostSeatingTableAvailability(
      buildMainDiningReservations(unavailableIds),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )

    expect(availability.totalTables).toBe(37)
    expect(availability.unavailableTables).toBe(18)
    expect(availability.availableTables).toBe(19)
    expect(formatHostSeatingTableAvailabilityDisplay(availability)).toBe('19/37 available')
    expect(formatHostSeatingTableAvailabilityAccessible(availability))
      .toBe('19 of 37 tables available')
  })

  it('returns full availability when no reservations block tables', () => {
    const availability = buildHostSeatingTableAvailability([], {
      seating: dinnerTwo,
      dateKey: '2026-07-09',
      layout: MAIN_DINING_LAYOUT,
      areaFilterId: 'main',
      seatingsById: SEATINGS,
    })

    expect(availability).toMatchObject({
      totalTables: 37,
      unavailableTables: 0,
      availableTables: 37,
    })
    expect(formatHostSeatingTableAvailabilityDisplay(availability)).toBe('37/37 available')
  })

  it('returns zero available tables when every table is blocked', () => {
    const unavailableIds = Array.from({ length: 37 }, (_, index) => `t-${index + 1}`)
    const availability = buildHostSeatingTableAvailability(
      buildMainDiningReservations(unavailableIds),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )

    expect(availability.availableTables).toBe(0)
    expect(formatHostSeatingTableAvailabilityDisplay(availability)).toBe('0/37 available')
  })

  it('reduces availability by two for a reservation assigned to two tables', () => {
    const availability = buildHostSeatingTableAvailability(
      buildMainDiningReservations(['t-1', 't-2']),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )

    expect(availability.unavailableTables).toBe(2)
    expect(availability.availableTables).toBe(35)
  })

  it('counts duplicate table ids only once', () => {
    const availability = buildHostSeatingTableAvailability(
      buildMainDiningReservations(['t-1', 't-1', 't-2']),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )

    expect(availability.unavailableTables).toBe(2)
    expect(availability.availableTables).toBe(35)
  })

  it('does not consume tables for completed, cancelled, or no-show reservations', () => {
    ;['Checked Out', 'Cancelled', 'Not Shown'].forEach((status) => {
      const availability = buildHostSeatingTableAvailability(
        buildMainDiningReservations(['t-1'], { status }),
        {
          seating: dinnerTwo,
          dateKey: '2026-07-09',
          layout: MAIN_DINING_LAYOUT,
          areaFilterId: 'main',
          seatingsById: SEATINGS,
        },
      )

      expect(availability.availableTables).toBe(37)
    })
  })

  it('consumes tables for confirmed and seated reservations', () => {
    const confirmed = buildHostSeatingTableAvailability(
      buildMainDiningReservations(['t-3'], { status: 'Confirmed', seatingId: 'dinner-2', time: '21:00' }),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )
    const seated = buildHostSeatingTableAvailability(
      buildMainDiningReservations(['t-4'], { status: 'Checked In', seatingId: 'dinner-2', time: '21:00' }),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )

    expect(confirmed.availableTables).toBe(36)
    expect(seated.availableTables).toBe(36)
  })

  it('does not reduce Dinner 1 availability for a Dinner 2 reservation', () => {
    const dinnerOne = SEATINGS.get('dinner-1')
    const availability = buildHostSeatingTableAvailability(
      buildMainDiningReservations(['t-3'], { seatingId: 'dinner-2', time: '21:00' }),
      {
        seating: dinnerOne,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )

    expect(availability.availableTables).toBe(37)
  })

  it('counts only tables in the selected area', () => {
    const availabilityMain = buildHostSeatingTableAvailability(
      buildMainDiningReservations(['t-1'], { seatingId: 'dinner-2', time: '21:00' }),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'main',
        seatingsById: SEATINGS,
      },
    )
    const availabilityBar = buildHostSeatingTableAvailability(
      buildMainDiningReservations(['t-1'], { seatingId: 'dinner-2', time: '21:00' }),
      {
        seating: dinnerTwo,
        dateKey: '2026-07-09',
        layout: MAIN_DINING_LAYOUT,
        areaFilterId: 'bar',
        seatingsById: SEATINGS,
      },
    )

    expect(availabilityMain.totalTables).toBe(37)
    expect(availabilityMain.availableTables).toBe(36)
    expect(availabilityBar.totalTables).toBe(1)
    expect(availabilityBar.availableTables).toBe(1)
  })

  it('uses the full published table set for all areas', () => {
    const availability = buildHostSeatingTableAvailability([], {
      seating: dinnerTwo,
      dateKey: '2026-07-09',
      layout: MAIN_DINING_LAYOUT,
      areaFilterId: HOST_QUEUE_ALL_AREAS,
      seatingsById: SEATINGS,
    })

    expect(availability.totalTables).toBe(38)
  })
})

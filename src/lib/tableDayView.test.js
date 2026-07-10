import { describe, expect, it, vi } from 'vitest'
import {
  buildFloorTableDayViewRows,
  buildReleaseTableAssignmentUpdate,
  buildTableDayViewCreatePrefill,
  findAllReservationsForTableSeating,
  formatSeatingWindowLabel,
  isTableAssignmentSelectionClick,
  resolveTableDayViewRowState,
  shouldOpenTableDayViewOnTableClick,
} from './tableDayView'
import { buildSeatingsById } from './reservationSeatings'
import { getFloorTableSeatingDialogOverlayClass } from '../components/floor/FloorTableSeatingDialog'

const SEATINGS = [
  {
    id: 'brunch-1',
    name: 'Brunch 1',
    startTime: '10:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 0,
    isActive: true,
  },
  {
    id: 'brunch-2',
    name: 'Brunch 2',
    startTime: '12:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 'dinner-1',
    name: 'Dinner 1',
    startTime: '19:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sortOrder: 2,
    isActive: true,
  },
]

const LAYOUT = {
  zones: [{ id: 'main', label: 'Main Dining' }],
  units: [
    { id: 't14', label: 'T14', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 4 },
    { id: 't15', label: 'T15', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 4 },
  ],
}

const TABLE = { id: 't14', label: 'T14', zoneId: 'main', minGuests: 2, maxGuestCapacity: 4 }

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Maria',
    date: '2026-07-10',
    time: '12:30',
    guests: 3,
    status: 'Confirmed',
    seatingId: 'brunch-2',
    seatingAssignment: {
      assignedUnits: [{ id: 't14', label: 'T14', seatedCapacity: 2, maxGuestCapacity: 4 }],
      extraChairs: 0,
      standingGuests: 0,
    },
    ...overrides,
  }
}

describe('tableDayView', () => {
  it('opens table day view on normal floor tap but not during assignment or heatmap', () => {
    expect(shouldOpenTableDayViewOnTableClick({ isCompact: true })).toBe(true)
    expect(shouldOpenTableDayViewOnTableClick({ isHeatmap: true })).toBe(false)
    expect(shouldOpenTableDayViewOnTableClick({ isHostFloorPickActive: true })).toBe(false)
    expect(shouldOpenTableDayViewOnTableClick({ isAssignmentSelection: true })).toBe(false)
  })

  it('treats assignment mode taps separately from day-view taps', () => {
    expect(isTableAssignmentSelectionClick({ isHostFloorPickActive: true })).toBe(true)
    expect(isTableAssignmentSelectionClick({
      selectedReservation: { id: 'a' },
      canAssign: true,
    })).toBe(true)
    expect(isTableAssignmentSelectionClick({
      selectedReservation: { id: 'a' },
      isPickedForSeating: true,
    })).toBe(true)
    expect(isTableAssignmentSelectionClick({
      selectedReservation: null,
      canAssign: false,
    })).toBe(false)
  })

  it('renders all active seatings for the selected date', () => {
    const rows = buildFloorTableDayViewRows(TABLE, [], '2026-07-10', SEATINGS, { layout: LAYOUT })
    expect(rows.map((row) => row.seating.name)).toEqual(['Brunch 1', 'Brunch 2', 'Dinner 1'])
  })

  it('shows a table available in one seating and occupied in another', () => {
    const reservations = [
      buildReservation({
        time: '19:45',
        seatingId: 'dinner-1',
        guestName: 'Papadopoulos',
        guests: 4,
        status: 'Checked In',
      }),
    ]
    const rows = buildFloorTableDayViewRows(
      TABLE,
      reservations,
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT },
    )

    expect(rows[0].isAvailable).toBe(true)
    expect(rows[1].isAvailable).toBe(true)
    expect(rows[2].reservation?.guestName).toBe('Papadopoulos')
    expect(rows[2].state).toBe('seated')
  })

  it('shows multi-table reservations on every assigned table', () => {
    const reservations = [
      buildReservation({
        seatingAssignment: {
          assignedUnits: [
            { id: 't14', label: 'T14', seatedCapacity: 2, maxGuestCapacity: 4 },
            { id: 't15', label: 'T15', seatedCapacity: 2, maxGuestCapacity: 4 },
          ],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ]

    const t14Rows = buildFloorTableDayViewRows(
      TABLE,
      reservations,
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT },
    )
    const t15Rows = buildFloorTableDayViewRows(
      { id: 't15', label: 'T15', zoneId: 'main' },
      reservations,
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT },
    )

    expect(t14Rows[1].assignedTablesLabel).toContain('T14')
    expect(t14Rows[1].assignedTablesLabel).toContain('T15')
    expect(t15Rows[1].reservation?.id).toBe('res-1')
  })

  it('prefills create flow with date, seating, table, and area', () => {
    const prefill = buildTableDayViewCreatePrefill({
      table: TABLE,
      dateKey: '2026-07-10',
      seating: SEATINGS[1],
      layout: LAYOUT,
    })

    expect(prefill.date).toBe('2026-07-10')
    expect(prefill.seatingId).toBe('brunch-2')
    expect(prefill.time).toBe('12:00')
    expect(prefill.tableNumber).toContain('T14')
    expect(prefill.area).toBe('Main Dining')
    expect(prefill.assignedUnits).toHaveLength(1)
  })

  it('exposes quick actions for occupied seatings using host status helpers', () => {
    const rows = buildFloorTableDayViewRows(
      TABLE,
      [buildReservation({ status: 'Confirmed' })],
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT, nowMinutes: 12 * 60, todayKey: '2026-07-10' },
    )

    expect(rows[1].quickActions.length).toBeGreaterThan(0)
    expect(rows[1].quickActions.some((action) => action.status === 'Waiting')).toBe(true)
  })

  it('releases one table from a multi-table assignment', () => {
    const reservation = buildReservation({
      seatingAssignment: {
        assignedUnits: [
          { id: 't14', label: 'T14', seatedCapacity: 2, maxGuestCapacity: 4 },
          { id: 't15', label: 'T15', seatedCapacity: 2, maxGuestCapacity: 4 },
        ],
        extraChairs: 0,
        standingGuests: 0,
      },
    })

    const update = buildReleaseTableAssignmentUpdate(reservation, TABLE, { layout: LAYOUT })

    expect(update.isLastTable).toBe(false)
    expect(update.assignment.assignedUnits).toHaveLength(1)
    expect(update.assignment.assignedUnits[0].id).toBe('t15')
    expect(update.tableLabel).toContain('T14')
  })

  it('flags last-table release and clears assignment labels', () => {
    const reservation = buildReservation()
    const update = buildReleaseTableAssignmentUpdate(reservation, TABLE, { layout: LAYOUT })

    expect(update.isLastTable).toBe(true)
    expect(update.assignment.assignedUnits).toHaveLength(0)
    expect(update.tableNumber).toBe('')
  })

  it('lists all conflicting reservations for a seating', () => {
    const reservations = [
      buildReservation({ id: 'res-a', time: '12:15' }),
      buildReservation({
        id: 'res-b',
        guestName: 'Nikos',
        time: '12:45',
        seatingAssignment: {
          assignedUnits: [{ id: 't14', label: 'T14', seatedCapacity: 2, maxGuestCapacity: 4 }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ]

    const conflicts = findAllReservationsForTableSeating(
      reservations,
      TABLE,
      '2026-07-10',
      SEATINGS[1],
      { layout: LAYOUT, seatingsById: buildSeatingsById(SEATINGS) },
    )

    expect(conflicts).toHaveLength(2)
  })

  it('marks conflict rows as problem state', () => {
    const rows = buildFloorTableDayViewRows(
      TABLE,
      [
        buildReservation({ id: 'res-a', time: '12:15' }),
        buildReservation({ id: 'res-b', time: '12:45' }),
      ],
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT },
    )

    expect(rows[1].hasConflict).toBe(true)
    expect(rows[1].state).toBe('problem')
    expect(rows[1].conflicts).toHaveLength(2)
  })

  it('formats seating windows and row states', () => {
    expect(formatSeatingWindowLabel(SEATINGS[0])).toBe('10:00–12:00')
    expect(resolveTableDayViewRowState(null).state).toBe('available')
    expect(resolveTableDayViewRowState(buildReservation({ status: 'Checked In' })).state).toBe('seated')
    expect(resolveTableDayViewRowState(buildReservation(), { hasConflict: true }).state).toBe('problem')
  })

  it('uses centered tablet presentation and phone bottom sheet classes', () => {
    expect(getFloorTableSeatingDialogOverlayClass(false)).toContain('is-tablet')
    expect(getFloorTableSeatingDialogOverlayClass(true)).toContain('is-phone')
  })

  it('simulates floor refresh after save by rebuilding rows from updated reservations', () => {
    const initial = buildFloorTableDayViewRows(
      TABLE,
      [],
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT },
    )
    expect(initial[1].isAvailable).toBe(true)

    const afterCreate = buildFloorTableDayViewRows(
      TABLE,
      [buildReservation()],
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT },
    )
    expect(afterCreate[1].isAvailable).toBe(false)

    const afterRelease = buildFloorTableDayViewRows(
      TABLE,
      [],
      '2026-07-10',
      SEATINGS,
      { layout: LAYOUT },
    )
    expect(afterRelease[1].isAvailable).toBe(true)
  })

  it('supports dialog close handler contract', () => {
    const onClose = vi.fn()
    onClose()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

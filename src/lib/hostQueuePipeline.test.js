/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyHostQueueOperationalFilters,
  buildHostQueueAreaOptions,
  buildHostQueueReservationList,
  buildHostQueueRowPresentation,
  buildHostQueueSearchHaystack,
  deriveReservationAreaZoneIds,
  filterReservationsBySelectedSeating,
  getReservationPrimaryTableSortLabel,
  reservationMatchesHostQueueArea,
  reservationMatchesHostQueueSearch,
  sortHostQueueReservations,
} from './hostQueuePipeline'
import { readHostQueueSortPreference, writeHostQueueSortPreference } from './hostQueuePersistence'

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
    { id: 'outside', label: 'Outside' },
  ],
  tables: [
    { id: 't2', label: 'T2', zoneId: 'main', seats: 2 },
    { id: 't10', label: 'T10', zoneId: 'main', seats: 4 },
    { id: 't25', label: 'T25', zoneId: 'bar', seats: 4 },
    { id: 't101', label: 'T101', zoneId: 'outside', seats: 4 },
    { id: 't15', label: 'T15', zoneId: 'main', seats: 4 },
    { id: 't16', label: 'T16', zoneId: 'bar', seats: 4 },
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
    area: '',
    notes: '',
    ...overrides,
  }
}

describe('hostQueuePipeline seating filter', () => {
  it('shows only Dinner 1 reservations when Dinner 1 is selected', () => {
    const reservations = [
      buildReservation({ id: 'd1', seatingId: 'dinner-1' }),
      buildReservation({ id: 'd2', seatingId: 'dinner-2', time: '21:00' }),
    ]

    const filtered = filterReservationsBySelectedSeating(
      reservations,
      SEATINGS[0],
      SEATINGS,
      '2026-07-10',
    )

    expect(filtered.map((entry) => entry.id)).toEqual(['d1'])
  })

  it('shows only Dinner 2 reservations when Dinner 2 is selected', () => {
    const reservations = [
      buildReservation({ id: 'd1', seatingId: 'dinner-1' }),
      buildReservation({ id: 'd2', seatingId: 'dinner-2', time: '21:00' }),
    ]

    const filtered = filterReservationsBySelectedSeating(
      reservations,
      SEATINGS[1],
      SEATINGS,
      '2026-07-10',
    )

    expect(filtered.map((entry) => entry.id)).toEqual(['d2'])
  })

  it('uses valid seating_id as authoritative', () => {
    const reservation = buildReservation({
      seatingId: 'dinner-2',
      time: '19:00',
    })

    const filtered = filterReservationsBySelectedSeating(
      [reservation],
      SEATINGS[1],
      SEATINGS,
      '2026-07-10',
    )

    expect(filtered).toHaveLength(1)
  })

  it('falls back to time resolver when seating_id is missing', () => {
    const reservation = buildReservation({
      seatingId: null,
      time: '21:15',
    })

    const filtered = filterReservationsBySelectedSeating(
      [reservation],
      SEATINGS[1],
      SEATINGS,
      '2026-07-10',
    )

    expect(filtered).toHaveLength(1)
  })

  it('never duplicates the same reservation across seatings', () => {
    const reservation = buildReservation({ id: 'only-one', seatingId: 'dinner-2', time: '21:00' })
    const dinnerOne = filterReservationsBySelectedSeating([reservation], SEATINGS[0], SEATINGS, '2026-07-10')
    const dinnerTwo = filterReservationsBySelectedSeating([reservation], SEATINGS[1], SEATINGS, '2026-07-10')

    expect(dinnerOne).toHaveLength(0)
    expect(dinnerTwo).toHaveLength(1)
  })
})

describe('hostQueuePipeline area filter', () => {
  it('builds area options from published floor-plan areas', () => {
    expect(buildHostQueueAreaOptions(LAYOUT).map((entry) => entry.label)).toEqual([
      'All areas',
      'Main Dining',
      'Bar',
      'Outside',
      'Unassigned / No area',
    ])
  })

  it('filters Main Dining reservations by assigned table area', () => {
    const reservation = buildReservation({
      seatingAssignment: {
        assignedUnits: [{ id: 't10', label: 'T10' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    })

    expect(reservationMatchesHostQueueArea(reservation, 'main', LAYOUT)).toBe(true)
    expect(reservationMatchesHostQueueArea(reservation, 'bar', LAYOUT)).toBe(false)
  })

  it('filters Bar reservations by assigned table area', () => {
    const reservation = buildReservation({
      seatingAssignment: {
        assignedUnits: [{ id: 't25', label: 'T25' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    })

    expect(reservationMatchesHostQueueArea(reservation, 'bar', LAYOUT)).toBe(true)
  })

  it('uses explicit area preference without table assignment', () => {
    const reservation = buildReservation({ area: 'Bar' })
    expect(deriveReservationAreaZoneIds(reservation, LAYOUT)).toEqual(['bar'])
    expect(reservationMatchesHostQueueArea(reservation, 'bar', LAYOUT)).toBe(true)
  })

  it('includes multi-area reservations when any assigned table matches the area', () => {
    const reservation = buildReservation({
      seatingAssignment: {
        assignedUnits: [
          { id: 't15', label: 'T15' },
          { id: 't16', label: 'T16' },
        ],
        extraChairs: 0,
        standingGuests: 0,
      },
    })

    expect(reservationMatchesHostQueueArea(reservation, 'main', LAYOUT)).toBe(true)
    expect(reservationMatchesHostQueueArea(reservation, 'bar', LAYOUT)).toBe(true)
  })

  it('routes unassigned reservations to the unassigned area filter', () => {
    const reservation = buildReservation()
    expect(reservationMatchesHostQueueArea(reservation, '__unassigned__', LAYOUT)).toBe(true)
    expect(reservationMatchesHostQueueArea(reservation, 'main', LAYOUT)).toBe(false)
  })
})

describe('hostQueuePipeline sorting', () => {
  beforeEach(() => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => { store.set(key, value) },
      removeItem: (key) => { store.delete(key) },
      clear: () => { store.clear() },
    })
  })

  const reservations = [
    buildReservation({ id: 'late', guestName: 'Zed', time: '21:00', guests: 2 }),
    buildReservation({ id: 'early', guestName: 'Amy', time: '19:00', guests: 6 }),
    buildReservation({
      id: 'table',
      guestName: 'Bob',
      time: '20:00',
      guests: 4,
      seatingAssignment: {
        assignedUnits: [{ id: 't101', label: 'T101' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }),
    buildReservation({
      id: 'table2',
      guestName: 'Cal',
      time: '20:15',
      guests: 2,
      seatingAssignment: {
        assignedUnits: [{ id: 't2', label: 'T2' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }),
  ]

  it('sorts by earliest time first', () => {
    expect(sortHostQueueReservations(reservations, 'time-asc').map((entry) => entry.id)).toEqual([
      'early',
      'table',
      'table2',
      'late',
    ])
  })

  it('sorts by latest time first', () => {
    expect(sortHostQueueReservations(reservations, 'time-desc').map((entry) => entry.id)).toEqual([
      'late',
      'table2',
      'table',
      'early',
    ])
  })

  it('sorts tables in natural numeric order', () => {
    expect(getReservationPrimaryTableSortLabel(reservations[2])).toBe('T101')
    expect(getReservationPrimaryTableSortLabel(reservations[3])).toBe('T2')
    expect(sortHostQueueReservations(reservations, 'table').map((entry) => entry.id)).toEqual([
      'table2',
      'table',
      'early',
      'late',
    ])
  })

  it('sorts guest names A-Z', () => {
    expect(sortHostQueueReservations(reservations, 'name-asc').map((entry) => entry.guestName)).toEqual([
      'Amy',
      'Bob',
      'Cal',
      'Zed',
    ])
  })

  it('sorts party size largest and smallest first', () => {
    expect(sortHostQueueReservations(reservations, 'party-desc').map((entry) => entry.guests)).toEqual([
      6,
      4,
      2,
      2,
    ])
    expect(sortHostQueueReservations(reservations, 'party-asc').map((entry) => entry.guests)).toEqual([
      2,
      2,
      4,
      6,
    ])
  })

  it('persists sort preference to localStorage', () => {
    const store = new Map()
    const mockStorage = {
      getItem: (key) => store.get(String(key)) ?? null,
      setItem: (key, value) => { store.set(String(key), String(value)) },
      removeItem: (key) => { store.delete(String(key)) },
      clear: () => { store.clear() },
    }

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: mockStorage,
    })

    writeHostQueueSortPreference('name-asc')
    expect(readHostQueueSortPreference()).toBe('name-asc')
  })
})

describe('hostQueuePipeline row presentation', () => {
  it('renders compact guest and table metadata', () => {
    const presentation = buildHostQueueRowPresentation(
      buildReservation({
        guests: 2,
        seatingAssignment: {
          assignedUnits: [{ id: 't27', label: 'T27' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
      LAYOUT,
    )

    expect(presentation.metaLine).toBe('👤 2  •  🍽 T27')
  })

  it('renders multi-table labels', () => {
    const presentation = buildHostQueueRowPresentation(
      buildReservation({
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
      LAYOUT,
    )

    expect(presentation.metaLine).toBe('👤 4  •  🍽 T15 + T16')
  })

  it('renders explicit unassigned rows', () => {
    const presentation = buildHostQueueRowPresentation(buildReservation({ guests: 2 }), LAYOUT)
    expect(presentation.metaLine).toBe('👤 2  •  🍽 Unassigned')
  })

  it('renders extra chairs and standing guests inline in metadata', () => {
    const presentation = buildHostQueueRowPresentation(
      buildReservation({
        seatingAssignment: {
          assignedUnits: [{ id: 't27', label: 'T27' }],
          extraChairs: 1,
          standingGuests: 2,
        },
      }),
      LAYOUT,
    )

    expect(presentation.metaLine).toContain('  •  🪑 +1')
    expect(presentation.metaLine).toContain('Standing +2')
    expect(presentation.chips.map((chip) => chip.label)).toEqual([])
  })

  it('renders inline extra chair without duplicating note-derived badges', () => {
    const presentation = buildHostQueueRowPresentation(
      buildReservation({
        notes: 'Guest needs extra chair',
        seatingAssignment: {
          assignedUnits: [{ id: 't27', label: 'T27' }],
          extraChairs: 1,
          standingGuests: 0,
        },
      }),
      LAYOUT,
    )

    expect(presentation.metaLine).toContain('  •  🪑 +1')
    expect(presentation.chips.some((chip) => chip.id === 'extra-chair-note')).toBe(false)
  })
})

describe('hostQueuePipeline search and filters', () => {
  it('matches search against area and notes', () => {
    const reservation = buildReservation({
      area: 'Bar',
      notes: 'Guest needs a window seat',
    })

    expect(reservationMatchesHostQueueSearch(reservation, 'bar', LAYOUT)).toBe(true)
    expect(reservationMatchesHostQueueSearch(reservation, 'window', LAYOUT)).toBe(true)
    expect(buildHostQueueSearchHaystack(reservation, LAYOUT)).not.toContain('@@SEATING@@')
  })

  it('combines seating, area, and operational filters', () => {
    const reservations = [
      buildReservation({
        id: 'match',
        seatingId: 'dinner-2',
        time: '21:00',
        guests: 4,
        seatingAssignment: {
          assignedUnits: [{ id: 't25', label: 'T25' }],
          extraChairs: 1,
          standingGuests: 0,
        },
      }),
      buildReservation({
        id: 'skip',
        seatingId: 'dinner-1',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
          extraChairs: 0,
          standingGuests: 0,
        },
      }),
    ]

    const filtered = buildHostQueueReservationList(reservations, {
      selectedSeating: SEATINGS[1],
      seatings: SEATINGS,
      dateKey: '2026-07-10',
      areaFilterId: 'bar',
      activeFilterIds: ['extra-chair'],
      layout: LAYOUT,
    })

    expect(filtered.map((entry) => entry.id)).toEqual(['match'])
  })

  it('supports unassigned table and large-party filters', () => {
    const reservations = [
      buildReservation({ id: 'unassigned', guests: 2 }),
      buildReservation({ id: 'large', guests: 5, seatingAssignment: {
        assignedUnits: [{ id: 't10', label: 'T10' }],
        extraChairs: 0,
        standingGuests: 0,
      } }),
    ]

    expect(applyHostQueueOperationalFilters(reservations, ['unassigned-table']).map((entry) => entry.id)).toEqual(['unassigned'])
    expect(applyHostQueueOperationalFilters(reservations, ['large-party']).map((entry) => entry.id)).toEqual(['large'])
  })
})

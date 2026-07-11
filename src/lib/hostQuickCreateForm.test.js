import { describe, expect, it } from 'vitest'
import { buildSeatingAssignment, formatSeatingAssignmentLabels } from './seatingAssignment'
import { getActiveSeatingsForDate, sortReservationSeatings } from './reservationSeatings'
import {
  applyHostQuickCreateFormPatch,
  buildHostQuickCreateTableOptions,
  createHostQuickCreateFormState,
  formatHostQuickCreateSeatingOptionLabel,
  getHostQuickCreateTableHelperText,
  resolveHostQuickCreateRecommendedSeatingId,
  toggleHostQuickCreateTableSelection,
  syncHostQuickCreateLayoutContext,
  refreshHostQuickCreateAssignedUnits,
  formatHostQuickCreateSelectedTableSummary,
  formatHostQuickCreateTableSelectionStatus,
  formatHostQuickCreateTableCapacitySummary,
  formatHostQuickCreateTableCompactCapacity,
  buildHostQuickCreateAvailabilityKey,
} from './hostQuickCreateForm'

const SERVICE_DATE = '2026-07-10'

const RAW_SEATINGS = [
  {
    id: 'brunch',
    name: 'Brunch',
    start_time: '10:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 0,
    is_active: true,
  },
  {
    id: 'lunch',
    name: 'Lunch',
    start_time: '12:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'dinner-1',
    name: 'Dinner 1',
    start_time: '19:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    start_time: '21:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 3,
    is_active: true,
  },
]

const SEATINGS = sortReservationSeatings(RAW_SEATINGS)

const LAYOUT = {
  zones: [
    { id: 'main', label: 'Main Dining' },
    { id: 'bar', label: 'Bar' },
  ],
  units: [
    { id: 't15', label: 'T15', zoneId: 'main', seatedCapacity: 4, maxGuestCapacity: 4 },
    { id: 't16', label: 'T16', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 2 },
    { id: 't17', label: 'T17', zoneId: 'bar', seatedCapacity: 4, maxGuestCapacity: 4 },
  ],
}

function buildOccupiedReservation(overrides = {}) {
  return {
    id: 'res-occupied',
    guestName: 'Alex',
    date: SERVICE_DATE,
    time: '19:00',
    guests: 2,
    status: 'Confirmed',
    seatingId: 'dinner-1',
    seatingAssignment: {
      assignedUnits: [{ id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 }],
      extraChairs: 0,
      standingGuests: 0,
    },
    ...overrides,
  }
}

const CONTEXT = {
  layout: LAYOUT,
  seatings: SEATINGS,
  reservations: [buildOccupiedReservation()],
}

describe('hostQuickCreateForm', () => {
  it('1. active seatings populate the Seating selector options', () => {
    const active = getActiveSeatingsForDate(SEATINGS, SERVICE_DATE)
    expect(active.map((entry) => entry.id)).toEqual(['brunch', 'lunch', 'dinner-1', 'dinner-2'])
    expect(formatHostQuickCreateSeatingOptionLabel(active[2])).toContain('Dinner 1')
    expect(formatHostQuickCreateSeatingOptionLabel(active[2])).toContain('19:00')
  })

  it('2. 20:45 recommends Dinner 1', () => {
    expect(resolveHostQuickCreateRecommendedSeatingId(SERVICE_DATE, '20:45', SEATINGS)).toBe('dinner-1')
  })

  it('3. 21:00 recommends Dinner 2', () => {
    expect(resolveHostQuickCreateRecommendedSeatingId(SERVICE_DATE, '21:00', SEATINGS)).toBe('dinner-2')
  })

  it('4. no match does not fall back to Brunch or the first seating', () => {
    const state = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '08:00' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    expect(state.seatingId).toBeNull()
    expect(state.recommendedSeatingId).toBeNull()
  })

  it('5. host can manually change Dinner 1 to Dinner 2', () => {
    let form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '20:45' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    expect(form.seatingId).toBe('dinner-1')

    form = applyHostQuickCreateFormPatch(form, { seatingId: 'dinner-2' }, CONTEXT)
    expect(form.seatingId).toBe('dinner-2')
    expect(form.seatingManuallyOverridden).toBe(true)
  })

  it('6. manual seating override is preserved until date or time makes it invalid', () => {
    let form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '21:15', seatingId: 'dinner-2', seatingManuallyOverridden: true },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    expect(form.seatingId).toBe('dinner-2')

    form = applyHostQuickCreateFormPatch(form, { guests: '4' }, CONTEXT)
    expect(form.seatingId).toBe('dinner-2')
    expect(form.seatingManuallyOverridden).toBe(true)

    form = applyHostQuickCreateFormPatch(form, { time: '21:30' }, CONTEXT)
    expect(form.seatingId).toBe('dinner-2')
    expect(form.seatingManuallyOverridden).toBe(true)

    form = applyHostQuickCreateFormPatch(form, { time: '20:45' }, CONTEXT)
    expect(form.seatingId).toBeNull()
    expect(form.seatingManuallyOverridden).toBe(false)
  })

  it('7. published areas populate the Area selector', () => {
    const form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '19:00' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    expect(LAYOUT.zones.map((zone) => zone.label)).toEqual(['Main Dining', 'Bar'])
    expect(form.seatingAreaId).toBe('')
    expect(form.area).toBe('')
  })

  it('8. one area auto-selects', () => {
    const singleAreaLayout = {
      zones: [{ id: 'main', label: 'Main Dining' }],
      units: LAYOUT.units.filter((unit) => unit.zoneId === 'main'),
    }
    const form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '19:00' },
      { todayKey: SERVICE_DATE, layout: singleAreaLayout, seatings: SEATINGS },
    )
    expect(form.seatingAreaId).toBe('main')
    expect(form.area).toBe('Main Dining')
  })

  it('9. table selector is disabled without Seating', () => {
    const form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '19:00', seatingAreaId: 'main', area: 'Main Dining' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const options = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: [],
      dateKey: form.date,
      time: form.time,
      seatingId: null,
      areaId: form.seatingAreaId,
      partySize: form.guests,
      seatings: SEATINGS,
    })
    expect(options.canSelect).toBe(false)
    expect(getHostQuickCreateTableHelperText({ ...form, seatingId: null }, options, SEATINGS, { layout: LAYOUT }))
      .toBe('Choose a seating to view available tables')
  })

  it('9b. no time shows Choose a time first even when area is selected', () => {
    const form = {
      date: SERVICE_DATE,
      time: '',
      seatingId: null,
      seatingAreaId: 'main',
      area: 'Main Dining',
    }
    expect(getHostQuickCreateTableHelperText(form, { canSelect: false, availableCount: 0, options: [] }, SEATINGS, { layout: LAYOUT }))
      .toBe('Choose a time first')
  })

  it('10. table selector is disabled without Area', () => {
    const form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '19:00', seatingId: 'dinner-1' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const options = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: [],
      dateKey: form.date,
      time: form.time,
      seatingId: form.seatingId,
      areaId: '',
      partySize: form.guests,
      seatings: SEATINGS,
    })
    expect(options.canSelect).toBe(false)
    expect(getHostQuickCreateTableHelperText(form, options, SEATINGS, { layout: LAYOUT }))
      .toBe('Choose an area to view available tables')
  })

  it('11. Main Dining shows only Main Dining tables', () => {
    const options = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: [],
      dateKey: SERVICE_DATE,
      time: '19:00',
      seatingId: 'dinner-1',
      areaId: 'main',
      partySize: 2,
      seatings: SEATINGS,
    })
    expect(options.options.map((entry) => entry.unit.id)).toEqual(['t15', 't16'])
  })

  it('12. availability is scoped to the selected seating', () => {
    const dinnerOne = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: CONTEXT.reservations,
      dateKey: SERVICE_DATE,
      time: '19:00',
      seatingId: 'dinner-1',
      areaId: 'main',
      partySize: 2,
      seatings: SEATINGS,
    })
    const dinnerTwo = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: CONTEXT.reservations,
      dateKey: SERVICE_DATE,
      time: '21:00',
      seatingId: 'dinner-2',
      areaId: 'main',
      partySize: 2,
      seatings: SEATINGS,
    })

    expect(dinnerOne.options.find((entry) => entry.unit.id === 't15')?.isSelectable).toBe(false)
    expect(dinnerTwo.options.find((entry) => entry.unit.id === 't15')?.isSelectable).toBe(true)
  })

  it('13. a table occupied in Dinner 1 may remain available in Dinner 2 when valid', () => {
    const options = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: CONTEXT.reservations,
      dateKey: SERVICE_DATE,
      time: '21:00',
      seatingId: 'dinner-2',
      areaId: 'main',
      partySize: 2,
      seatings: SEATINGS,
    })
    expect(options.options.find((entry) => entry.unit.id === 't15')?.isSelectable).toBe(true)
  })

  it('14. conflicting table cannot be selected', () => {
    let form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '19:00', seatingId: 'dinner-1', seatingAreaId: 'main', area: 'Main Dining' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const occupied = LAYOUT.units.find((unit) => unit.id === 't15')
    form = toggleHostQuickCreateTableSelection(form, occupied, CONTEXT)
    expect(form.assignedUnits).toEqual([])
  })

  it('15. capacity-limited table can still be selected for multi-table combine', () => {
    let form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '19:00', seatingId: 'dinner-1', seatingAreaId: 'main', area: 'Main Dining', guests: '4' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const smallTable = LAYOUT.units.find((unit) => unit.id === 't16')
    form = toggleHostQuickCreateTableSelection(form, smallTable, CONTEXT)
    expect(form.assignedUnits).toHaveLength(1)
    expect(form.assignedUnits[0].id).toBe('t16')

    const options = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: [],
      dateKey: form.date,
      time: form.time,
      seatingId: form.seatingId,
      areaId: form.seatingAreaId,
      partySize: form.guests,
      seatings: SEATINGS,
      assignedUnits: form.assignedUnits,
    })
    expect(options.options.find((entry) => entry.unit.id === 't16')?.isSelectable).toBe(true)
    expect(formatHostQuickCreateTableCapacitySummary(form.assignedUnits, form.guests)).toBe('Capacity 2 · Guests 4')
  })

  it('16. changing seating clears an invalid table', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '19:00',
        seatingId: 'dinner-2',
        seatingManuallyOverridden: true,
        seatingAreaId: 'main',
        area: 'Main Dining',
        assignedUnits: [{ id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 }],
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )

    form = applyHostQuickCreateFormPatch(form, { seatingId: 'dinner-1' }, CONTEXT)
    expect(form.assignedUnits).toEqual([])
    expect(form.tableSelectionNotice).toBe('T15 was removed because it is no longer available.')
  })

  it('17. changing area clears the previous table', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        assignedUnits: [{ id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 }],
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )

    form = applyHostQuickCreateFormPatch(form, { seatingAreaId: 'bar' }, CONTEXT)
    expect(form.assignedUnits).toEqual([])
    expect(form.area).toBe('Bar')
    expect(form.tableSelectionNotice).toBe('')
  })

  it('18. changing party size preserves valid selections and seating/time still revalidates conflicts', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '2',
        assignedUnits: [{ id: 't16', label: 'T16', seatedCapacity: 2, maxGuestCapacity: 2 }],
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )

    form = applyHostQuickCreateFormPatch(form, { guests: '4' }, CONTEXT)
    expect(form.assignedUnits).toHaveLength(1)
    expect(form.assignedUnits[0].id).toBe('t16')
    expect(form.tableSelectionNotice).toBe('')

    form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        assignedUnits: [{ id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 }],
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    form = applyHostQuickCreateFormPatch(form, { time: '19:00' }, CONTEXT)
    expect(form.seatingId).toBe('dinner-1')
    expect(form.assignedUnits).toEqual([])
    expect(form.tableSelectionNotice).toBe('T15 was removed because it is no longer available.')
  })

  it('19. no available tables still permits unassigned creation state', () => {
    const options = buildHostQuickCreateTableOptions({
      layout: LAYOUT,
      reservations: CONTEXT.reservations,
      dateKey: SERVICE_DATE,
      time: '19:00',
      seatingId: 'dinner-1',
      areaId: 'main',
      partySize: 2,
      seatings: SEATINGS,
    })
    expect(options.availableCount).toBe(1)
    const form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '19:00',
        seatingId: 'dinner-1',
        seatingAreaId: 'main',
        area: 'Main Dining',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    expect(form.assignedUnits).toEqual([])
    expect(form.seatingId).toBe('dinner-1')
    expect(form.area).toBe('Main Dining')
  })

  it('20. seating and area without table are persisted in form state', () => {
    const form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '19:00',
        seatingId: 'dinner-1',
        seatingAreaId: 'main',
        area: 'Main Dining',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    expect(form.seatingId).toBe('dinner-1')
    expect(form.seatingAreaId).toBe('main')
    expect(form.area).toBe('Main Dining')
    expect(form.assignedUnits).toEqual([])
  })

  it('21. selected table uses existing assignment serialization fields', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '2',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const availableTable = LAYOUT.units.find((unit) => unit.id === 't15')
    form = toggleHostQuickCreateTableSelection(form, availableTable, CONTEXT)
    const assignment = buildSeatingAssignment({ assignedUnits: form.assignedUnits, partySize: 2 })
    expect(formatSeatingAssignmentLabels(assignment)).toBe('T15')
    expect(form.assignedUnits).toHaveLength(1)
    expect(formatHostQuickCreateSelectedTableSummary(form.assignedUnits)).toBe('T15')
    expect(formatHostQuickCreateTableSelectionStatus(form.assignedUnits)).toBe('Selected table · T15')
  })

  it('21b. table selection survives reservation refresh sync', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '2',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const availableTable = LAYOUT.units.find((unit) => unit.id === 't15')
    form = toggleHostQuickCreateTableSelection(form, availableTable, CONTEXT)
    form = refreshHostQuickCreateAssignedUnits(form, {
      ...CONTEXT,
      reservations: [...CONTEXT.reservations],
    })
    expect(form.assignedUnits).toHaveLength(1)
    expect(form.assignedUnits[0].id).toBe('t15')
  })

  it('21c. multi-table selection toggles tables on and off', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '2',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const t15 = LAYOUT.units.find((unit) => unit.id === 't15')
    const t16 = LAYOUT.units.find((unit) => unit.id === 't16')

    form = toggleHostQuickCreateTableSelection(form, t15, CONTEXT)
    form = toggleHostQuickCreateTableSelection(form, t16, CONTEXT)
    expect(formatHostQuickCreateSelectedTableSummary(form.assignedUnits)).toBe('T15 + T16')
    expect(formatHostQuickCreateTableSelectionStatus(form.assignedUnits)).toBe('Selected tables · T15 + T16')

    form = toggleHostQuickCreateTableSelection(form, t15, CONTEXT)
    expect(formatHostQuickCreateSelectedTableSummary(form.assignedUnits)).toBe('T16')
    expect(formatHostQuickCreateTableSelectionStatus(form.assignedUnits)).toBe('Selected table · T16')
  })

  it('21e. selected table survives refresh when canonical availability is unchanged', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '4',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const smallTable = LAYOUT.units.find((unit) => unit.id === 't16')
    form = toggleHostQuickCreateTableSelection(form, smallTable, CONTEXT)
    form = refreshHostQuickCreateAssignedUnits(form, {
      ...CONTEXT,
      reservations: [...CONTEXT.reservations],
    })
    expect(form.assignedUnits).toHaveLength(1)
    expect(form.assignedUnits[0].id).toBe('t16')
    expect(form.tableSelectionNotice).toBe('')
  })

  it('21f. real conflict removes only the affected selected table', () => {
    let form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
        guests: '4',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    form = toggleHostQuickCreateTableSelection(form, LAYOUT.units.find((unit) => unit.id === 't15'), CONTEXT)
    form = toggleHostQuickCreateTableSelection(form, LAYOUT.units.find((unit) => unit.id === 't16'), CONTEXT)

    form = refreshHostQuickCreateAssignedUnits(form, {
      ...CONTEXT,
      reservations: [
        ...CONTEXT.reservations,
        buildOccupiedReservation({
          id: 'res-t16',
          time: '21:00',
          seatingId: 'dinner-2',
          seatingAssignment: {
            assignedUnits: [{ id: 't16', label: 'T16', seatedCapacity: 2, maxGuestCapacity: 2 }],
            extraChairs: 0,
            standingGuests: 0,
          },
        }),
      ],
    })

    expect(form.assignedUnits.map((unit) => unit.id)).toEqual(['t15'])
    expect(form.tableSelectionNotice).toBe('T16 was removed because it is no longer available.')
  })

  it('21g. compact table capacity labels use guest icon format', () => {
    expect(formatHostQuickCreateTableCompactCapacity({ seatedCapacity: 3, maxGuestCapacity: 3 })).toBe('👤3')
    expect(formatHostQuickCreateTableCompactCapacity({ seatedCapacity: 2, maxGuestCapacity: 4 })).toBe('👤2–4')
  })

  it('21d. availability key stays stable when reservation array reference changes', () => {
    const form = createHostQuickCreateFormState(
      {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
      },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    const reservations = [buildOccupiedReservation()]
    const keyA = buildHostQuickCreateAvailabilityKey(form, reservations, LAYOUT)
    const keyB = buildHostQuickCreateAvailabilityKey(form, [...reservations], LAYOUT)
    expect(keyA).toBe(keyB)
  })

  it('22. quick create form does not include seated status semantics', () => {
    const form = createHostQuickCreateFormState(
      { date: SERVICE_DATE, time: '19:00' },
      { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
    )
    expect(form).not.toHaveProperty('status')
  })

  it('23. edit/reopen prefill preserves seating, area, and table', () => {
    const prefill = {
      guestName: 'Jordan',
      date: SERVICE_DATE,
      time: '21:00',
      guests: '2',
      seatingId: 'dinner-2',
      seatingAreaId: 'main',
      area: 'Main Dining',
      assignedUnits: [{ id: 't15', label: 'T15', seatedCapacity: 4, maxGuestCapacity: 4 }],
      seatingManuallyOverridden: true,
    }
    const form = createHostQuickCreateFormState(prefill, {
      todayKey: SERVICE_DATE,
      layout: LAYOUT,
      seatings: SEATINGS,
      reservations: CONTEXT.reservations,
    })
    expect(form.seatingId).toBe('dinner-2')
    expect(form.seatingAreaId).toBe('main')
    expect(form.area).toBe('Main Dining')
    expect(form.assignedUnits).toHaveLength(1)
    expect(form.assignedUnits[0].id).toBe('t15')
  })

  describe('dependent availability flow', () => {
    const singleAreaLayout = {
      zones: [{ id: 'main', label: 'Main Dining' }],
      units: LAYOUT.units.filter((unit) => unit.zoneId === 'main'),
    }

    it('selecting time auto-selects matching seating via resolveReservationSeatingId', () => {
      let form = createHostQuickCreateFormState(
        { date: SERVICE_DATE },
        { todayKey: SERVICE_DATE, layout: singleAreaLayout, seatings: SEATINGS },
      )

      form = applyHostQuickCreateFormPatch(form, { time: '20:45' }, {
        layout: singleAreaLayout,
        seatings: SEATINGS,
        reservations: [],
      })

      expect(form.seatingId).toBe('dinner-1')
      expect(form.recommendedSeatingId).toBe('dinner-1')
      expect(form.seatingManuallyOverridden).toBe(false)

      form = applyHostQuickCreateFormPatch(form, { time: '21:00' }, {
        layout: singleAreaLayout,
        seatings: SEATINGS,
        reservations: [],
      })
      expect(form.seatingId).toBe('dinner-2')
    })

    it('seating and auto-selected area immediately populate tables after time selection', () => {
      let form = createHostQuickCreateFormState(
        { date: SERVICE_DATE },
        { todayKey: SERVICE_DATE, layout: singleAreaLayout, seatings: SEATINGS },
      )

      form = applyHostQuickCreateFormPatch(form, { time: '21:00' }, {
        layout: singleAreaLayout,
        seatings: SEATINGS,
        reservations: [],
      })

      expect(form.seatingAreaId).toBe('main')
      expect(form.seatingId).toBe('dinner-2')

      const options = buildHostQuickCreateTableOptions({
        layout: singleAreaLayout,
        reservations: [],
        dateKey: form.date,
        time: form.time,
        seatingId: form.seatingId,
        areaId: form.seatingAreaId,
        partySize: form.guests,
        seatings: SEATINGS,
      })

      expect(options.canSelect).toBe(true)
      expect(options.options.length).toBeGreaterThan(0)
      expect(getHostQuickCreateTableHelperText(form, options, SEATINGS, { layout: singleAreaLayout })).toBe('')
    })

    it('late-loaded layout syncs single area and table availability without resetting time', () => {
      let form = createHostQuickCreateFormState(
        { date: SERVICE_DATE, time: '21:00' },
        { todayKey: SERVICE_DATE, layout: null, seatings: SEATINGS },
      )

      expect(form.seatingId).toBe('dinner-2')
      expect(form.seatingAreaId).toBe('')

      form = syncHostQuickCreateLayoutContext(form, {
        layout: singleAreaLayout,
        seatings: SEATINGS,
        reservations: [],
      })

      expect(form.time).toBe('21:00')
      expect(form.seatingId).toBe('dinner-2')
      expect(form.seatingAreaId).toBe('main')

      const options = buildHostQuickCreateTableOptions({
        layout: singleAreaLayout,
        reservations: [],
        dateKey: form.date,
        time: form.time,
        seatingId: form.seatingId,
        areaId: form.seatingAreaId,
        partySize: form.guests,
        seatings: SEATINGS,
      })
      expect(options.canSelect).toBe(true)
      expect(options.availableCount).toBeGreaterThan(0)
    })

    it('shows Checking availability when seating and area exist before layout is ready', () => {
      const form = {
        date: SERVICE_DATE,
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
      }

      expect(
        getHostQuickCreateTableHelperText(
          form,
          { canSelect: false, availableCount: 0, options: [] },
          SEATINGS,
          { layout: null },
        ),
      ).toBe('Checking availability...')
    })

    it('changing seating recomputes available tables', () => {
      let form = createHostQuickCreateFormState(
        { date: SERVICE_DATE, time: '19:00', seatingAreaId: 'main', area: 'Main Dining' },
        { todayKey: SERVICE_DATE, layout: LAYOUT, seatings: SEATINGS },
      )

      const dinnerOneOptions = buildHostQuickCreateTableOptions({
        layout: LAYOUT,
        reservations: CONTEXT.reservations,
        dateKey: form.date,
        time: form.time,
        seatingId: form.seatingId,
        areaId: form.seatingAreaId,
        partySize: form.guests,
        seatings: SEATINGS,
      })
      expect(dinnerOneOptions.options.find((entry) => entry.unit.id === 't15')?.isSelectable).toBe(false)

      form = applyHostQuickCreateFormPatch(form, { time: '21:00' }, CONTEXT)
      const dinnerTwoOptions = buildHostQuickCreateTableOptions({
        layout: LAYOUT,
        reservations: CONTEXT.reservations,
        dateKey: form.date,
        time: form.time,
        seatingId: form.seatingId,
        areaId: form.seatingAreaId,
        partySize: form.guests,
        seatings: SEATINGS,
      })
      expect(form.seatingId).toBe('dinner-2')
      expect(dinnerTwoOptions.options.find((entry) => entry.unit.id === 't15')?.isSelectable).toBe(true)
    })

    it('no available tables shows the seating-specific message', () => {
      const reservations = [
        buildOccupiedReservation(),
        buildOccupiedReservation({
          id: 'res-t16',
          seatingAssignment: {
            assignedUnits: [{ id: 't16', label: 'T16', seatedCapacity: 2, maxGuestCapacity: 2 }],
            extraChairs: 0,
            standingGuests: 0,
          },
        }),
      ]
      const options = buildHostQuickCreateTableOptions({
        layout: LAYOUT,
        reservations,
        dateKey: SERVICE_DATE,
        time: '19:00',
        seatingId: 'dinner-1',
        areaId: 'main',
        partySize: 2,
        seatings: SEATINGS,
      })
      const form = {
        date: SERVICE_DATE,
        time: '19:00',
        seatingId: 'dinner-1',
        seatingAreaId: 'main',
      }

      expect(options.availableCount).toBe(0)
      expect(getHostQuickCreateTableHelperText(form, options, SEATINGS, { layout: LAYOUT }))
        .toBe('No available tables in this area for Dinner 1')
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildSeatingsById,
  formatSeatingDaysLabel,
  getActiveSeatingsForDate,
  matchReservationTimeToSeating,
  normalizeDaysOfWeek,
  normalizeReservationSeating,
  normalizeReservationSeatingInput,
  resolveReservationSeatingId,
  serializeReservationSeatingRow,
  sortReservationSeatings,
  validateReservationSeatingForm,
} from './reservationSeatings'

const SAMPLE_SEATINGS = [
  {
    id: 'dinner-1',
    name: 'Dinner 1',
    start_time: '19:00',
    duration_minutes: 120,
    days_of_week: [1, 2, 3, 4, 5, 6],
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    start_time: '21:00',
    duration_minutes: 120,
    days_of_week: [1, 2, 3, 4, 5, 6],
    sort_order: 0,
    is_active: true,
  },
]

describe('reservationSeatings', () => {
  it('normalizes seating configuration fields', () => {
    const seating = normalizeReservationSeating({
      id: 'brunch-1',
      workspace_id: 'ws-1',
      name: 'Brunch 1',
      start_time: '10:00',
      duration_minutes: 90,
      days_of_week: [0, 6],
      sort_order: 2,
      is_active: true,
    })

    expect(seating).toMatchObject({
      id: 'brunch-1',
      workspaceId: 'ws-1',
      name: 'Brunch 1',
      startTime: '10:00',
      durationMinutes: 90,
      daysOfWeek: [0, 6],
      sortOrder: 2,
      isActive: true,
    })
  })

  it('sorts seatings by sort order then start time', () => {
    const sorted = sortReservationSeatings(SAMPLE_SEATINGS)
    expect(sorted.map((entry) => entry.id)).toEqual(['dinner-2', 'dinner-1'])
  })

  it('matches reservation time to seating on active days', () => {
    const seatings = sortReservationSeatings(SAMPLE_SEATINGS)
    const matched = matchReservationTimeToSeating('19:00', '2026-07-09', seatings)
    expect(matched?.id).toBe('dinner-1')
  })

  it('resolves seating id from legacy reservations without seating_id when time matches', () => {
    const seatings = sortReservationSeatings(SAMPLE_SEATINGS)
    const seatingId = resolveReservationSeatingId({
      date: '2026-07-09',
      time: '21:00',
    }, seatings)

    expect(seatingId).toBe('dinner-2')
  })

  it('keeps null seating id for custom times', () => {
    const seatings = sortReservationSeatings(SAMPLE_SEATINGS)
    const seatingId = resolveReservationSeatingId({
      date: '2026-07-09',
      time: '18:30',
    }, seatings)

    expect(seatingId).toBeNull()
  })

  it('filters active seatings for a date', () => {
    const seatings = sortReservationSeatings([
      ...SAMPLE_SEATINGS,
      {
        id: 'sunday-only',
        name: 'Sunday brunch',
        start_time: '11:00',
        duration_minutes: 120,
        days_of_week: [0],
        sort_order: 3,
        is_active: true,
      },
    ])

    const weekdaySeatings = getActiveSeatingsForDate(seatings, '2026-07-09')
    expect(weekdaySeatings.map((entry) => entry.id)).toEqual(['dinner-2', 'dinner-1'])

    const sundaySeatings = getActiveSeatingsForDate(seatings, '2026-07-12')
    expect(sundaySeatings.some((entry) => entry.id === 'sunday-only')).toBe(true)
  })

  it('normalizes days of week and formats labels', () => {
    expect(normalizeDaysOfWeek([6, 0, 0, 1])).toEqual([0, 1, 6])
    expect(formatSeatingDaysLabel([0, 6])).toBe('Sun, Sat')
    expect(formatSeatingDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
  })

  it('builds seatings lookup map', () => {
    const byId = buildSeatingsById(SAMPLE_SEATINGS)
    expect(byId.get('dinner-1')?.startTime).toBe('19:00')
  })

  it('normalizes create/update seating input without an id', () => {
    const input = normalizeReservationSeatingInput({
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
      daysOfWeek: [0, 6],
      sortOrder: 2,
      isActive: true,
    })

    expect(input).toMatchObject({
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
      daysOfWeek: [0, 6],
      sortOrder: 2,
      isActive: true,
    })
    expect(normalizeReservationSeating(input)).toBeNull()
  })

  it('validates populated form and returns seating payload', () => {
    const result = validateReservationSeatingForm({
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
      daysOfWeek: [1, 2, 3, 4, 5],
      isActive: true,
    })

    expect(result.ok).toBe(true)
    expect(result.seating).toMatchObject({
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
      daysOfWeek: [1, 2, 3, 4, 5],
      isActive: true,
    })
  })

  it('requires at least one selected day', () => {
    const result = validateReservationSeatingForm({
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
      daysOfWeek: [],
      isActive: true,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('day')
  })

  it('serializes seating row for database insert', () => {
    const row = serializeReservationSeatingRow({
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
      daysOfWeek: [0, 6],
      sortOrder: 3,
      isActive: true,
    }, 'ws-1')

    expect(row).toEqual({
      workspace_id: 'ws-1',
      name: 'Brunch',
      start_time: '10:00',
      duration_minutes: 120,
      days_of_week: [0, 6],
      sort_order: 3,
      is_active: true,
    })
  })
})

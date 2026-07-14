// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createEmptyAvailabilityWeek, setAvailabilityForDay } from './employeeAvailabilityUtils'
import {
  areAvailabilityWeeksEqual,
  buildAvailabilitySavePayload,
  cloneAvailabilityWeek,
  getFriendlyAvailabilityError,
  getMobileAvailabilityDayTitle,
  isAvailabilityWeekDirty,
  MOBILE_AVAILABILITY_STATUS_OPTIONS,
  orderAvailabilityDays,
} from './mobileAvailabilityPresentation'

describe('mobileAvailabilityPresentation', () => {
  it('exposes mobile status options in canonical order', () => {
    expect(MOBILE_AVAILABILITY_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      'AVAILABLE',
      'PREFERRED',
      'UNAVAILABLE',
    ])
  })

  it('formats day titles for cards', () => {
    expect(getMobileAvailabilityDayTitle('monday')).toBe('Monday')
    expect(getMobileAvailabilityDayTitle('FRIDAY')).toBe('Friday')
  })

  it('loads an empty week as all available days', () => {
    const week = createEmptyAvailabilityWeek()

    expect(week.days).toHaveLength(7)
    expect(week.days.every((entry) => entry.status === 'AVAILABLE')).toBe(true)
  })

  it('clones weeks without sharing nested day references', () => {
    const source = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'tuesday', {
      status: 'UNAVAILABLE',
      note: 'Class night',
    })
    const clone = cloneAvailabilityWeek(source)

    clone.days[1].note = 'Changed'
    expect(source.days[1].note).toBe('Class night')
  })

  it('detects draft edits against the saved week', () => {
    const saved = createEmptyAvailabilityWeek()
    const draft = setAvailabilityForDay(saved, 'wednesday', { status: 'PREFERRED' })

    expect(isAvailabilityWeekDirty(saved, draft)).toBe(true)
    expect(isAvailabilityWeekDirty(saved, saved)).toBe(false)
  })

  it('treats normalized duplicates as equal', () => {
    const left = {
      days: [
        { dayOfWeek: 'monday', status: 'UNAVAILABLE' },
        { dayOfWeek: 'monday', status: 'PREFERRED' },
      ],
    }
    const right = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'monday', {
      status: 'UNAVAILABLE',
    })

    expect(areAvailabilityWeeksEqual(left, right)).toBe(true)
  })

  it('preserves note and time fields in dirty comparisons', () => {
    const saved = createEmptyAvailabilityWeek()
    const draft = setAvailabilityForDay(saved, 'friday', {
      status: 'PREFERRED',
      startTime: '18:00',
      endTime: '22:00',
      note: 'Evenings only',
    })

    expect(isAvailabilityWeekDirty(saved, draft)).toBe(true)
    expect(draft.days.find((entry) => entry.dayOfWeek === 'friday')).toMatchObject({
      startTime: '18:00',
      endTime: '22:00',
      note: 'Evenings only',
    })
  })

  it('orders days Monday through Sunday', () => {
    const ordered = orderAvailabilityDays([
      { dayOfWeek: 'sunday', status: 'UNAVAILABLE' },
      { dayOfWeek: 'monday', status: 'AVAILABLE' },
    ])

    expect(ordered.map((entry) => entry.dayOfWeek)).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ])
  })

  it('builds save payload using normalized draft week', () => {
    const draft = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'tuesday', {
      status: 'UNAVAILABLE',
    })

    expect(buildAvailabilitySavePayload({
      workspaceId: 'ws-1',
      employeeId: 'emp-1',
      weekStartDate: '2026-07-13',
      draftWeek: draft,
    })).toEqual({
      workspaceId: 'ws-1',
      employeeId: 'emp-1',
      weekStartDate: '2026-07-13',
      week: draft,
    })
  })

  it('maps friendly errors for common availability failures', () => {
    expect(getFriendlyAvailabilityError(new Error('Employee is required.')))
      .toBe('Link your employee profile to manage availability.')
    expect(getFriendlyAvailabilityError(new Error('permission denied for table employee_availability')))
      .toBe('You can only edit your own availability.')
    expect(getFriendlyAvailabilityError(new Error('')))
      .toBe('Unable to update availability right now.')
  })
})

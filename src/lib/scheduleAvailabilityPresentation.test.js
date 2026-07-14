// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { setAvailabilityForDay, createEmptyAvailabilityWeek } from './employeeAvailabilityUtils'
import {
  buildScheduleAvailabilityDayIndicators,
  buildScheduleAvailabilityLookupKey,
  getAvailabilityDayOfWeekFromDateKey,
  mapAvailabilityStatusToIndicator,
  resolveScheduleAvailabilityDayIndicator,
  SCHEDULE_AVAILABILITY_INDICATORS,
} from './scheduleAvailabilityPresentation'

const WEEK_DAYS = [
  { key: '2026-07-13', label: 'Mon', shortDate: 'Jul 13' },
  { key: '2026-07-14', label: 'Tue', shortDate: 'Jul 14' },
  { key: '2026-07-15', label: 'Wed', shortDate: 'Jul 15' },
]

describe('scheduleAvailabilityPresentation', () => {
  it('maps availability statuses to schedule indicators', () => {
    expect(mapAvailabilityStatusToIndicator('AVAILABLE')).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.available)
    expect(mapAvailabilityStatusToIndicator('PREFERRED')).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.preferred)
    expect(mapAvailabilityStatusToIndicator('UNAVAILABLE')).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.unavailable)
  })

  it('resolves day indicators for available, preferred, and unavailable days', () => {
    let week = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'tuesday', {
      status: 'PREFERRED',
    })
    week = setAvailabilityForDay(week, 'wednesday', { status: 'UNAVAILABLE' })

    const employeeAvailability = {
      hasSubmitted: true,
      week,
    }

    expect(resolveScheduleAvailabilityDayIndicator({
      dayOfWeek: 'monday',
      employeeAvailability,
    })).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.available)

    expect(resolveScheduleAvailabilityDayIndicator({
      dayOfWeek: 'tuesday',
      employeeAvailability,
    })).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.preferred)

    expect(resolveScheduleAvailabilityDayIndicator({
      dayOfWeek: 'wednesday',
      employeeAvailability,
    })).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.unavailable)
  })

  it('shows empty availability when an employee has never submitted', () => {
    expect(resolveScheduleAvailabilityDayIndicator({
      dayOfWeek: 'monday',
      employeeAvailability: { hasSubmitted: false, week: null },
    })).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.empty)
  })

  it('shows loading and error fallback indicators', () => {
    expect(resolveScheduleAvailabilityDayIndicator({
      dayOfWeek: 'monday',
      isLoading: true,
    })).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.loading)

    expect(resolveScheduleAvailabilityDayIndicator({
      dayOfWeek: 'monday',
      loadFailed: true,
    })).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.empty)
  })

  it('builds per-day indicators from schedule week days', () => {
    const week = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'tuesday', {
      status: 'UNAVAILABLE',
    })

    const indicators = buildScheduleAvailabilityDayIndicators({
      weekDays: WEEK_DAYS,
      employeeAvailability: { hasSubmitted: true, week },
    })

    expect(indicators).toHaveLength(3)
    expect(indicators[0].indicator).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.available)
    expect(indicators[1].indicator).toEqual(SCHEDULE_AVAILABILITY_INDICATORS.unavailable)
    expect(getAvailabilityDayOfWeekFromDateKey(WEEK_DAYS[0].key)).toBe('monday')
  })

  it('builds stable memoization keys for employee/week lookups', () => {
    const first = buildScheduleAvailabilityLookupKey('ws-1', '2026-07-13', ['b', 'a'])
    const second = buildScheduleAvailabilityLookupKey('ws-1', '2026-07-13', ['a', 'b'])

    expect(first).toBe(second)
    expect(first).toBe('ws-1|2026-07-13|a|b')
  })
})

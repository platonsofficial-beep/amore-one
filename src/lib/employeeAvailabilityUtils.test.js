// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  EMPLOYEE_AVAILABILITY_DAYS,
  EMPLOYEE_AVAILABILITY_STATUS,
  createEmptyAvailabilityWeek,
  getAvailabilityForDay,
  normalizeAvailabilityWeek,
  setAvailabilityForDay,
  summarizeAvailabilityWeek,
  validateAvailabilityWeek,
} from './employeeAvailabilityUtils'

describe('employeeAvailabilityUtils', () => {
  describe('EMPLOYEE_AVAILABILITY_STATUS', () => {
    it('freezes canonical availability statuses', () => {
      expect(Object.keys(EMPLOYEE_AVAILABILITY_STATUS)).toEqual([
        'AVAILABLE',
        'UNAVAILABLE',
        'PREFERRED',
      ])
      expect(Object.isFrozen(EMPLOYEE_AVAILABILITY_STATUS)).toBe(true)
      expect(Object.isFrozen(EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE)).toBe(true)
    })

    it('uses unique labels for each status', () => {
      const labels = Object.values(EMPLOYEE_AVAILABILITY_STATUS).map((entry) => entry.label)
      expect(new Set(labels).size).toBe(labels.length)
    })
  })

  describe('createEmptyAvailabilityWeek', () => {
    it('creates exactly seven Monday-first days', () => {
      const week = createEmptyAvailabilityWeek()

      expect(week.days).toHaveLength(7)
      expect(week.days.map((entry) => entry.dayOfWeek)).toEqual([...EMPLOYEE_AVAILABILITY_DAYS])
    })

    it('defaults every day to AVAILABLE with empty optional fields', () => {
      const week = createEmptyAvailabilityWeek()

      week.days.forEach((entry) => {
        expect(entry.status).toBe(EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key)
        expect(entry.startTime).toBeNull()
        expect(entry.endTime).toBeNull()
        expect(entry.note).toBeNull()
      })
    })
  })

  describe('normalizeAvailabilityWeek', () => {
    it('fills missing days automatically', () => {
      const normalized = normalizeAvailabilityWeek({
        days: [{ dayOfWeek: 'tuesday', status: 'UNAVAILABLE' }],
      })

      expect(normalized.days).toHaveLength(7)
      expect(getAvailabilityForDay(normalized, 'tuesday')?.status).toBe('UNAVAILABLE')
      expect(getAvailabilityForDay(normalized, 'monday')?.status).toBe('AVAILABLE')
    })

    it('keeps the first duplicate day and ignores later duplicates', () => {
      const normalized = normalizeAvailabilityWeek({
        days: [
          { dayOfWeek: 'monday', status: 'UNAVAILABLE' },
          { dayOfWeek: 'monday', status: 'PREFERRED' },
        ],
      })

      expect(getAvailabilityForDay(normalized, 'monday')?.status).toBe('UNAVAILABLE')
    })

    it('normalizes unknown status values to AVAILABLE', () => {
      const normalized = normalizeAvailabilityWeek({
        days: [{ dayOfWeek: 'wednesday', status: 'maybe' }],
      })

      expect(getAvailabilityForDay(normalized, 'wednesday')?.status).toBe('AVAILABLE')
    })

    it('ignores invalid times while keeping the day entry', () => {
      const normalized = normalizeAvailabilityWeek({
        days: [{
          dayOfWeek: 'friday',
          status: 'PREFERRED',
          startTime: '99:99',
          endTime: 'not-a-time',
        }],
      })

      const friday = getAvailabilityForDay(normalized, 'friday')
      expect(friday?.status).toBe('PREFERRED')
      expect(friday?.startTime).toBeNull()
      expect(friday?.endTime).toBeNull()
    })

    it('normalizes valid times to HH:MM', () => {
      const normalized = normalizeAvailabilityWeek({
        days: [{
          dayOfWeek: 'friday',
          status: 'PREFERRED',
          startTime: '9:05',
          endTime: '17:30:00',
        }],
      })

      const friday = getAvailabilityForDay(normalized, 'friday')
      expect(friday?.startTime).toBe('09:05')
      expect(friday?.endTime).toBe('17:30')
    })

    it('accepts day aliases and snake_case fields', () => {
      const normalized = normalizeAvailabilityWeek({
        days: [{
          day: 'Thu',
          status: 'unavailable',
          start_time: '18:00',
          end_time: '22:00',
          note: 'Evening class',
        }],
      })

      const thursday = getAvailabilityForDay(normalized, 'thursday')
      expect(thursday?.status).toBe('UNAVAILABLE')
      expect(thursday?.startTime).toBe('18:00')
      expect(thursday?.endTime).toBe('22:00')
      expect(thursday?.note).toBe('Evening class')
    })

    it('accepts numeric day values with Monday-first indexing', () => {
      const normalized = normalizeAvailabilityWeek({
        days: [{ dayOfWeek: 2, status: 'UNAVAILABLE' }],
      })

      expect(getAvailabilityForDay(normalized, 'tuesday')?.status).toBe('UNAVAILABLE')
    })

    it('does not mutate the input week object', () => {
      const input = {
        days: [{ dayOfWeek: 'monday', status: 'UNAVAILABLE' }],
      }
      const snapshot = JSON.stringify(input)

      normalizeAvailabilityWeek(input)

      expect(JSON.stringify(input)).toBe(snapshot)
    })

    it('handles malformed input safely', () => {
      expect(normalizeAvailabilityWeek(null).days).toHaveLength(7)
      expect(normalizeAvailabilityWeek(undefined).days).toHaveLength(7)
      expect(normalizeAvailabilityWeek({ days: 'invalid' }).days).toHaveLength(7)
    })
  })

  describe('getAvailabilityForDay', () => {
    it('returns null for invalid day names', () => {
      const week = createEmptyAvailabilityWeek()
      expect(getAvailabilityForDay(week, 'notaday')).toBeNull()
    })

    it('returns a normalized day entry for valid day names', () => {
      const week = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'saturday', {
        status: 'PREFERRED',
        note: 'Open Saturdays',
      })

      expect(getAvailabilityForDay(week, 'Saturday')?.note).toBe('Open Saturdays')
    })
  })

  describe('setAvailabilityForDay', () => {
    it('returns a new week object without mutating the original', () => {
      const original = createEmptyAvailabilityWeek()
      const updated = setAvailabilityForDay(original, 'monday', { status: 'UNAVAILABLE' })

      expect(updated).not.toBe(original)
      expect(getAvailabilityForDay(original, 'monday')?.status).toBe('AVAILABLE')
      expect(getAvailabilityForDay(updated, 'monday')?.status).toBe('UNAVAILABLE')
    })

    it('merges partial updates onto the existing day entry', () => {
      const week = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'wednesday', {
        status: 'PREFERRED',
        startTime: '18:00',
      })

      const updated = setAvailabilityForDay(week, 'wednesday', {
        endTime: '22:00',
        note: 'Evenings only',
      })

      const wednesday = getAvailabilityForDay(updated, 'wednesday')
      expect(wednesday?.status).toBe('PREFERRED')
      expect(wednesday?.startTime).toBe('18:00')
      expect(wednesday?.endTime).toBe('22:00')
      expect(wednesday?.note).toBe('Evenings only')
    })

    it('leaves other days untouched', () => {
      const updated = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'sunday', {
        status: 'UNAVAILABLE',
      })

      expect(getAvailabilityForDay(updated, 'monday')?.status).toBe('AVAILABLE')
      expect(getAvailabilityForDay(updated, 'sunday')?.status).toBe('UNAVAILABLE')
    })
  })

  describe('validateAvailabilityWeek', () => {
    it('returns a valid result for a normalized week', () => {
      const result = validateAvailabilityWeek(createEmptyAvailabilityWeek())

      expect(result.isValid).toBe(true)
      expect(result.issues).toEqual([])
      expect(result.week.days).toHaveLength(7)
    })

    it('reports unknown statuses without throwing', () => {
      const result = validateAvailabilityWeek({
        days: [{ dayOfWeek: 'monday', status: 'busy' }],
      })

      expect(result.isValid).toBe(false)
      expect(result.issues.some((issue) => issue.code === 'unknown_status')).toBe(true)
      expect(getAvailabilityForDay(result.week, 'monday')?.status).toBe('AVAILABLE')
    })

    it('reports duplicate days without throwing', () => {
      const result = validateAvailabilityWeek({
        days: [
          { dayOfWeek: 'tuesday', status: 'UNAVAILABLE' },
          { dayOfWeek: 'tuesday', status: 'PREFERRED' },
        ],
      })

      expect(result.isValid).toBe(false)
      expect(result.issues.some((issue) => issue.code === 'duplicate_day')).toBe(true)
      expect(getAvailabilityForDay(result.week, 'tuesday')?.status).toBe('UNAVAILABLE')
    })

    it('reports invalid day and time values without throwing', () => {
      const result = validateAvailabilityWeek({
        days: [{
          dayOfWeek: 'notaday',
          startTime: '25:61',
          endTime: 'bad',
        }],
      })

      expect(result.isValid).toBe(false)
      expect(result.issues.some((issue) => issue.code === 'invalid_day')).toBe(true)
    })
  })

  describe('summarizeAvailabilityWeek', () => {
    it('summarizes a default week as available every day', () => {
      expect(summarizeAvailabilityWeek(createEmptyAvailabilityWeek())).toBe('Available every day')
    })

    it('summarizes a single unavailable day with the full day name', () => {
      const week = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'tuesday', {
        status: 'UNAVAILABLE',
      })

      expect(summarizeAvailabilityWeek(week)).toBe('Unavailable Tuesday')
    })

    it('summarizes consecutive unavailable days as a range', () => {
      let week = createEmptyAvailabilityWeek()
      week = setAvailabilityForDay(week, 'monday', { status: 'UNAVAILABLE' })
      week = setAvailabilityForDay(week, 'tuesday', { status: 'UNAVAILABLE' })
      week = setAvailabilityForDay(week, 'wednesday', { status: 'UNAVAILABLE' })

      expect(summarizeAvailabilityWeek(week)).toBe('Unavailable Mon–Wed')
    })

    it('summarizes preferred Friday evening availability', () => {
      const week = setAvailabilityForDay(createEmptyAvailabilityWeek(), 'friday', {
        status: 'PREFERRED',
        startTime: '18:00',
        endTime: '22:00',
      })

      expect(summarizeAvailabilityWeek(week)).toBe('Preferred Friday evening')
    })

    it('summarizes all unavailable days', () => {
      let week = createEmptyAvailabilityWeek()
      EMPLOYEE_AVAILABILITY_DAYS.forEach((dayOfWeek) => {
        week = setAvailabilityForDay(week, dayOfWeek, { status: 'UNAVAILABLE' })
      })

      expect(summarizeAvailabilityWeek(week)).toBe('Unavailable every day')
    })

    it('summarizes all preferred days', () => {
      let week = createEmptyAvailabilityWeek()
      EMPLOYEE_AVAILABILITY_DAYS.forEach((dayOfWeek) => {
        week = setAvailabilityForDay(week, dayOfWeek, { status: 'PREFERRED' })
      })

      expect(summarizeAvailabilityWeek(week)).toBe('Preferred every day')
    })

    it('returns mixed availability when patterns combine', () => {
      let week = createEmptyAvailabilityWeek()
      week = setAvailabilityForDay(week, 'monday', { status: 'UNAVAILABLE' })
      week = setAvailabilityForDay(week, 'friday', {
        status: 'PREFERRED',
        startTime: '18:00',
        endTime: '22:00',
      })

      expect(summarizeAvailabilityWeek(week)).toBe('Mixed availability')
    })

    it('returns mixed availability for non-consecutive unavailable days', () => {
      let week = createEmptyAvailabilityWeek()
      week = setAvailabilityForDay(week, 'monday', { status: 'UNAVAILABLE' })
      week = setAvailabilityForDay(week, 'wednesday', { status: 'UNAVAILABLE' })

      expect(summarizeAvailabilityWeek(week)).toBe('Mixed availability')
    })

    it('handles malformed input safely', () => {
      expect(summarizeAvailabilityWeek(null)).toBe('Available every day')
      expect(summarizeAvailabilityWeek({ days: [{ dayOfWeek: 'bad', status: 'UNAVAILABLE' }] }))
        .toBe('Available every day')
    })
  })

  describe('immutability guarantees', () => {
    it('returns new day objects during normalization', () => {
      const input = createEmptyAvailabilityWeek()
      const normalized = normalizeAvailabilityWeek(input)

      expect(normalized).not.toBe(input)
      expect(normalized.days).not.toBe(input.days)
      expect(normalized.days[0]).not.toBe(input.days[0])
    })

    it('returns new day objects when setting availability', () => {
      const week = createEmptyAvailabilityWeek()
      const updated = setAvailabilityForDay(week, 'monday', { status: 'UNAVAILABLE' })

      expect(updated.days[0]).not.toBe(week.days[0])
    })
  })
})

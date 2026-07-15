// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  isLeaveActiveOnDate,
  normalizeLeaveDateKey,
  readLeaveEndDate,
  readLeaveStartDate,
} from '../leaveDateUtils'
import { LEAVE_STATUS } from '../leaveConstants'

describe('leaveDateUtils', () => {
  describe('normalizeLeaveDateKey', () => {
    it('normalizes YYYY-MM-DD values', () => {
      expect(normalizeLeaveDateKey('2026-07-15')).toBe('2026-07-15')
    })

    it('strips time from ISO strings', () => {
      expect(normalizeLeaveDateKey('2026-07-15T14:30:00.000Z')).toBe('2026-07-15')
    })

    it('rejects invalid dates', () => {
      expect(normalizeLeaveDateKey('2026-13-01')).toBe('')
      expect(normalizeLeaveDateKey('not-a-date')).toBe('')
      expect(normalizeLeaveDateKey('')).toBe('')
    })
  })

  describe('readLeaveStartDate / readLeaveEndDate', () => {
    it('reads camelCase and snake_case fields', () => {
      expect(readLeaveStartDate({ startDate: '2026-07-10' })).toBe('2026-07-10')
      expect(readLeaveEndDate({ end_date: '2026-07-12' })).toBe('2026-07-12')
    })
  })

  describe('isLeaveActiveOnDate', () => {
    const approvedLeave = {
      status: LEAVE_STATUS.APPROVED,
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    }

    it('returns true inside inclusive range', () => {
      expect(isLeaveActiveOnDate(approvedLeave, '2026-07-11')).toBe(true)
    })

    it('returns true on start and end dates', () => {
      expect(isLeaveActiveOnDate(approvedLeave, '2026-07-10')).toBe(true)
      expect(isLeaveActiveOnDate(approvedLeave, '2026-07-12')).toBe(true)
    })

    it('returns false outside range', () => {
      expect(isLeaveActiveOnDate(approvedLeave, '2026-07-09')).toBe(false)
      expect(isLeaveActiveOnDate(approvedLeave, '2026-07-13')).toBe(false)
    })

    it('returns false for non-approved statuses', () => {
      expect(isLeaveActiveOnDate({ ...approvedLeave, status: LEAVE_STATUS.PENDING }, '2026-07-11')).toBe(false)
      expect(isLeaveActiveOnDate({ ...approvedLeave, status: LEAVE_STATUS.REJECTED }, '2026-07-11')).toBe(false)
      expect(isLeaveActiveOnDate({ ...approvedLeave, status: LEAVE_STATUS.CANCELLED }, '2026-07-11')).toBe(false)
    })

    it('returns false for invalid leave or date input', () => {
      expect(isLeaveActiveOnDate(null, '2026-07-11')).toBe(false)
      expect(isLeaveActiveOnDate(approvedLeave, 'invalid')).toBe(false)
      expect(isLeaveActiveOnDate({ status: LEAVE_STATUS.APPROVED }, '2026-07-11')).toBe(false)
    })
  })
})

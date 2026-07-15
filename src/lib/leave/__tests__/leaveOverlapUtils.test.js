// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  doLeaveDateRangesOverlap,
  hasLeaveOverlap,
} from '../leaveOverlapUtils'
import { LEAVE_STATUS } from '../leaveConstants'

describe('leaveOverlapUtils', () => {
  describe('doLeaveDateRangesOverlap', () => {
    it('detects identical ranges', () => {
      expect(doLeaveDateRangesOverlap('2026-07-10', '2026-07-12', '2026-07-10', '2026-07-12')).toBe(true)
    })

    it('detects nested ranges', () => {
      expect(doLeaveDateRangesOverlap('2026-07-01', '2026-07-31', '2026-07-10', '2026-07-12')).toBe(true)
    })

    it('detects touching inclusive boundaries as overlap', () => {
      expect(doLeaveDateRangesOverlap('2026-07-01', '2026-07-10', '2026-07-10', '2026-07-20')).toBe(true)
    })

    it('returns false for non-overlapping ranges', () => {
      expect(doLeaveDateRangesOverlap('2026-07-01', '2026-07-05', '2026-07-06', '2026-07-10')).toBe(false)
    })

    it('returns false for invalid date input', () => {
      expect(doLeaveDateRangesOverlap('', '2026-07-10', '2026-07-10', '2026-07-20')).toBe(false)
    })
  })

  describe('hasLeaveOverlap', () => {
    const existing = [
      { id: 'leave-1', status: LEAVE_STATUS.APPROVED, startDate: '2026-07-10', endDate: '2026-07-12' },
      { id: 'leave-2', status: LEAVE_STATUS.PENDING, startDate: '2026-07-20', endDate: '2026-07-22' },
      { id: 'leave-3', status: LEAVE_STATUS.REJECTED, startDate: '2026-08-01', endDate: '2026-08-05' },
      { id: 'leave-4', status: LEAVE_STATUS.CANCELLED, startDate: '2026-09-01', endDate: '2026-09-05' },
    ]

    it('detects overlap with approved leave', () => {
      expect(hasLeaveOverlap(existing, {
        startDate: '2026-07-11',
        endDate: '2026-07-13',
      })).toBe(true)
    })

    it('detects overlap with pending leave', () => {
      expect(hasLeaveOverlap(existing, {
        startDate: '2026-07-21',
        endDate: '2026-07-21',
      })).toBe(true)
    })

    it('ignores rejected and cancelled leave', () => {
      expect(hasLeaveOverlap(existing, {
        startDate: '2026-08-02',
        endDate: '2026-08-04',
      })).toBe(false)
      expect(hasLeaveOverlap(existing, {
        startDate: '2026-09-02',
        endDate: '2026-09-04',
      })).toBe(false)
    })

    it('returns false for non-overlapping candidate', () => {
      expect(hasLeaveOverlap(existing, {
        startDate: '2026-07-13',
        endDate: '2026-07-19',
      })).toBe(false)
    })

    it('excludes the same leave id when editing', () => {
      expect(hasLeaveOverlap(existing, {
        id: 'leave-1',
        startDate: '2026-07-10',
        endDate: '2026-07-12',
      }, { excludeLeaveId: 'leave-1' })).toBe(false)
    })

    it('supports snake_case date fields', () => {
      expect(hasLeaveOverlap([
        { status: 'approved', start_date: '2026-10-01', end_date: '2026-10-05' },
      ], {
        start_date: '2026-10-03',
        end_date: '2026-10-04',
      })).toBe(true)
    })
  })
})

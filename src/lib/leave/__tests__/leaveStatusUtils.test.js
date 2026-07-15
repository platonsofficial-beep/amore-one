// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  canTransitionLeaveStatus,
  getAllowedLeaveTransitions,
} from '../leaveStatusUtils'
import { LEAVE_STATUS } from '../leaveConstants'

describe('leaveStatusUtils', () => {
  describe('canTransitionLeaveStatus', () => {
    it('allows pending to approved, rejected, and cancelled', () => {
      expect(canTransitionLeaveStatus('pending', 'approved')).toBe(true)
      expect(canTransitionLeaveStatus('pending', 'rejected')).toBe(true)
      expect(canTransitionLeaveStatus('pending', 'cancelled')).toBe(true)
    })

    it('allows approved to cancelled only', () => {
      expect(canTransitionLeaveStatus('approved', 'cancelled')).toBe(true)
    })

    it('rejects illegal transitions', () => {
      expect(canTransitionLeaveStatus('approved', 'pending')).toBe(false)
      expect(canTransitionLeaveStatus('approved', 'rejected')).toBe(false)
      expect(canTransitionLeaveStatus('rejected', 'approved')).toBe(false)
      expect(canTransitionLeaveStatus('rejected', 'pending')).toBe(false)
      expect(canTransitionLeaveStatus('cancelled', 'pending')).toBe(false)
      expect(canTransitionLeaveStatus('cancelled', 'approved')).toBe(false)
      expect(canTransitionLeaveStatus('pending', 'pending')).toBe(false)
    })

    it('rejects invalid status values without throwing', () => {
      expect(canTransitionLeaveStatus('draft', 'approved')).toBe(false)
      expect(canTransitionLeaveStatus('pending', 'draft')).toBe(false)
      expect(canTransitionLeaveStatus(null, 'approved')).toBe(false)
      expect(canTransitionLeaveStatus('pending', null)).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(canTransitionLeaveStatus('PENDING', 'APPROVED')).toBe(true)
    })
  })

  describe('getAllowedLeaveTransitions', () => {
    it('returns allowed targets for pending and approved', () => {
      expect(getAllowedLeaveTransitions(LEAVE_STATUS.PENDING)).toEqual([
        'approved',
        'rejected',
        'cancelled',
      ])
      expect(getAllowedLeaveTransitions(LEAVE_STATUS.APPROVED)).toEqual(['cancelled'])
    })

    it('returns empty array for terminal states', () => {
      expect(getAllowedLeaveTransitions(LEAVE_STATUS.REJECTED)).toEqual([])
      expect(getAllowedLeaveTransitions(LEAVE_STATUS.CANCELLED)).toEqual([])
      expect(getAllowedLeaveTransitions('invalid')).toEqual([])
    })
  })
})

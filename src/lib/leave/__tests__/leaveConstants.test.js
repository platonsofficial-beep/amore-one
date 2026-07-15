// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  LEAVE_STATUSES,
  LEAVE_STATUS,
  LEAVE_TYPES,
  LEAVE_TYPE,
  isValidLeaveStatus,
  isValidLeaveType,
} from '../leaveConstants'

describe('leaveConstants', () => {
  it('exports production V1 statuses without draft, submitted, or expired', () => {
    expect(LEAVE_STATUSES).toEqual([
      'pending',
      'approved',
      'rejected',
      'cancelled',
    ])
    expect(LEAVE_STATUS).toEqual({
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
    })
  })

  it('exports production V1 leave types in order', () => {
    expect(LEAVE_TYPES).toEqual([
      'vacation',
      'sick',
      'personal',
      'unpaid',
      'training',
      'emergency',
      'bereavement',
      'other',
    ])
    expect(LEAVE_TYPE.VACATION).toBe('vacation')
    expect(LEAVE_TYPE.OTHER).toBe('other')
  })

  describe('isValidLeaveStatus', () => {
    it.each(LEAVE_STATUSES)('accepts %s', (status) => {
      expect(isValidLeaveStatus(status)).toBe(true)
      expect(isValidLeaveStatus(status.toUpperCase())).toBe(true)
    })

    it('rejects invalid statuses', () => {
      expect(isValidLeaveStatus('draft')).toBe(false)
      expect(isValidLeaveStatus('submitted')).toBe(false)
      expect(isValidLeaveStatus('expired')).toBe(false)
      expect(isValidLeaveStatus('')).toBe(false)
      expect(isValidLeaveStatus(null)).toBe(false)
    })
  })

  describe('isValidLeaveType', () => {
    it.each(LEAVE_TYPES)('accepts %s', (type) => {
      expect(isValidLeaveType(type)).toBe(true)
      expect(isValidLeaveType(type.toUpperCase())).toBe(true)
    })

    it('rejects invalid types', () => {
      expect(isValidLeaveType('pto')).toBe(false)
      expect(isValidLeaveType('custom')).toBe(false)
      expect(isValidLeaveType('')).toBe(false)
    })
  })
})

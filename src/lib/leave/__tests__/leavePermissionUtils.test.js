// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  canApproveLeave,
  canCancelLeave,
  canCreateLeave,
  canCreateLeaveOnBehalf,
  canRejectLeave,
  canViewLeaveQueue,
} from '../leavePermissionUtils'

describe('leavePermissionUtils', () => {
  describe('canCreateLeave', () => {
    it.each(['owner', 'general_manager', 'manager', 'host', 'staff'])(
      'allows %s to create own leave',
      (role) => {
        expect(canCreateLeave(role)).toBe(true)
      },
    )

    it('rejects unknown roles', () => {
      expect(canCreateLeave('')).toBe(false)
      expect(canCreateLeave('guest')).toBe(false)
    })
  })

  describe('canCreateLeaveOnBehalf', () => {
    it.each(['owner', 'general_manager', 'manager'])('allows %s', (role) => {
      expect(canCreateLeaveOnBehalf(role)).toBe(true)
    })

    it.each(['host', 'staff'])('denies %s', (role) => {
      expect(canCreateLeaveOnBehalf(role)).toBe(false)
    })
  })

  describe('canViewLeaveQueue', () => {
    it.each(['owner', 'general_manager', 'manager'])('allows %s', (role) => {
      expect(canViewLeaveQueue(role)).toBe(true)
    })

    it.each(['host', 'staff'])('denies %s', (role) => {
      expect(canViewLeaveQueue(role)).toBe(false)
    })
  })

  describe('canApproveLeave', () => {
    it.each(['owner', 'general_manager', 'manager'])('allows %s', (role) => {
      expect(canApproveLeave(role)).toBe(true)
    })

    it.each(['host', 'staff'])('denies %s', (role) => {
      expect(canApproveLeave(role)).toBe(false)
    })
  })

  describe('canRejectLeave', () => {
    it.each(['owner', 'general_manager', 'manager'])('allows %s', (role) => {
      expect(canRejectLeave(role)).toBe(true)
    })

    it.each(['host', 'staff'])('denies %s', (role) => {
      expect(canRejectLeave(role)).toBe(false)
    })
  })

  describe('canCancelLeave', () => {
    it.each(['owner', 'general_manager', 'manager'])(
      'allows %s to cancel any request',
      (role) => {
        expect(canCancelLeave(role, { isOwnRequest: false })).toBe(true)
        expect(canCancelLeave(role, { isOwnRequest: true })).toBe(true)
      },
    )

    it.each(['host', 'staff'])('allows %s to cancel own request only', (role) => {
      expect(canCancelLeave(role, { isOwnRequest: true })).toBe(true)
      expect(canCancelLeave(role, { isOwnRequest: false })).toBe(false)
    })

    it('denies unknown roles', () => {
      expect(canCancelLeave('', { isOwnRequest: true })).toBe(false)
    })
  })
})

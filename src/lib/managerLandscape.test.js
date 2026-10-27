import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isLandscapeRequiredRole,
  isWorkspaceRoleReady,
  readCoarsePointer,
  readPortraitOrientation,
  shouldLockManagerLandscape,
  shouldRequireManagerLandscape,
  tryLockLandscapeOrientation,
  tryReleaseLandscapeOrientation,
} from './managerLandscape'

const READY_OWNER = {
  role: 'owner',
  roleKnown: true,
  coarsePointer: true,
  isPortrait: true,
}

describe('manager landscape decision', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('roles', () => {
    it.each([
      'owner',
      'general_manager',
      'manager',
      'Owner',
      ' Manager ',
    ])('recognizes management role %j', (role) => {
      expect(isLandscapeRequiredRole(role)).toBe(true)
    })

    it.each(['host', 'staff', '', 'custom', 'admin'])(
      'keeps %j on the existing portrait experience',
      (role) => {
        expect(isLandscapeRequiredRole(role)).toBe(false)
      },
    )
  })

  describe('shouldRequireManagerLandscape', () => {
    it('never covers a manager, owner, host, or staff', () => {
      expect(shouldRequireManagerLandscape(READY_OWNER)).toBe(false)
      expect(shouldRequireManagerLandscape({ ...READY_OWNER, role: 'general_manager' })).toBe(false)
      expect(shouldRequireManagerLandscape({ ...READY_OWNER, role: 'manager' })).toBe(false)
      expect(shouldRequireManagerLandscape({ ...READY_OWNER, role: 'host' })).toBe(false)
      expect(shouldRequireManagerLandscape({ ...READY_OWNER, role: 'staff' })).toBe(false)
      expect(shouldRequireManagerLandscape({ ...READY_OWNER, coarsePointer: false })).toBe(false)
      expect(shouldRequireManagerLandscape({ ...READY_OWNER, isPortrait: false })).toBe(false)
      expect(shouldRequireManagerLandscape({ ...READY_OWNER, roleKnown: false })).toBe(false)
    })
  })

  describe('shouldLockManagerLandscape', () => {
    it('does not lock orientation for anyone', () => {
      expect(shouldLockManagerLandscape(READY_OWNER)).toBe(false)
      expect(shouldLockManagerLandscape({ ...READY_OWNER, isPortrait: false })).toBe(false)
      expect(shouldLockManagerLandscape({ ...READY_OWNER, role: 'staff' })).toBe(false)
      expect(shouldLockManagerLandscape({ ...READY_OWNER, role: 'host' })).toBe(false)
      expect(shouldLockManagerLandscape({ ...READY_OWNER, coarsePointer: false })).toBe(false)
      expect(shouldLockManagerLandscape({ ...READY_OWNER, roleKnown: false })).toBe(false)
    })
  })

  describe('isWorkspaceRoleReady', () => {
    const ready = {
      isAuthDisabled: false,
      isLoading: false,
      isBootstrapping: false,
      hasSession: true,
      hasMembership: true,
      role: 'manager',
    }

    it('is ready for a signed-in membership with a role', () => {
      expect(isWorkspaceRoleReady(ready)).toBe(true)
    })

    it('stays unknown while auth or membership is still loading', () => {
      expect(isWorkspaceRoleReady({ ...ready, isLoading: true })).toBe(false)
      expect(isWorkspaceRoleReady({ ...ready, isBootstrapping: true })).toBe(false)
    })

    it('stays unknown when signed out or before membership exists', () => {
      expect(isWorkspaceRoleReady({ ...ready, hasSession: false })).toBe(false)
      expect(isWorkspaceRoleReady({ ...ready, hasMembership: false })).toBe(false)
      expect(isWorkspaceRoleReady({ ...ready, role: '  ' })).toBe(false)
    })

    it('trusts the dev owner role when auth is disabled', () => {
      expect(isWorkspaceRoleReady({
        isAuthDisabled: true,
        isLoading: false,
        isBootstrapping: false,
        hasSession: false,
        hasMembership: false,
        role: 'owner',
      })).toBe(true)
    })
  })

  describe('viewport readers', () => {
    it('reads a coarse pointer without treating a narrow fine pointer as touch', () => {
      vi.stubGlobal('window', {
        matchMedia: (query) => ({ matches: query === '(pointer: coarse)' }),
      })
      expect(readCoarsePointer()).toBe(true)

      vi.stubGlobal('window', {
        matchMedia: () => ({ matches: false }),
        innerWidth: 390,
        innerHeight: 844,
      })
      expect(readCoarsePointer()).toBe(false)
    })

    it('prefers the orientation media query, then falls back to dimensions', () => {
      vi.stubGlobal('window', {
        matchMedia: (query) => ({
          matches: query === '(orientation: portrait)',
        }),
        innerWidth: 844,
        innerHeight: 390,
      })
      expect(readPortraitOrientation()).toBe(true)

      vi.stubGlobal('window', {
        matchMedia: () => {
          throw new Error('matchMedia unavailable')
        },
        innerWidth: 844,
        innerHeight: 390,
      })
      expect(readPortraitOrientation()).toBe(false)

      vi.stubGlobal('window', {
        innerWidth: 390,
        innerHeight: 844,
      })
      expect(readPortraitOrientation()).toBe(true)
    })

    it('does not treat a missing viewport as portrait', () => {
      expect(readPortraitOrientation(undefined)).toBe(false)
      expect(readCoarsePointer(undefined)).toBe(false)
      expect(readPortraitOrientation({ innerWidth: 0, innerHeight: 0 })).toBe(false)
    })
  })

  describe('orientation lock', () => {
    it('locks landscape and reports success', async () => {
      const orientation = { lock: vi.fn().mockResolvedValue(undefined) }
      await expect(tryLockLandscapeOrientation(orientation)).resolves.toBe(true)
      expect(orientation.lock).toHaveBeenCalledWith('landscape')
    })

    it('fails silently when the platform rejects the lock', async () => {
      const orientation = {
        lock: vi.fn().mockRejectedValue(new Error('NotSupportedError')),
      }
      await expect(tryLockLandscapeOrientation(orientation)).resolves.toBe(false)
    })

    it('fails silently when the lock API is missing', async () => {
      await expect(tryLockLandscapeOrientation(undefined)).resolves.toBe(false)
      await expect(tryLockLandscapeOrientation({})).resolves.toBe(false)
    })

    it('swallows unlock failures', () => {
      const orientation = {
        unlock: vi.fn(() => {
          throw new Error('NotSupportedError')
        }),
      }
      expect(() => tryReleaseLandscapeOrientation(orientation)).not.toThrow()
      expect(() => tryReleaseLandscapeOrientation(undefined)).not.toThrow()
      expect(() => tryReleaseLandscapeOrientation({})).not.toThrow()
    })
  })
})

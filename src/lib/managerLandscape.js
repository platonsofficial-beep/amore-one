import { isManagerRole } from './permissions'

/**
 * Management roles (owner, general manager, manager).
 * Portrait phones use the manager phone shell. Nothing is blocked.
 * Host and staff keep their own shells.
 */
export function isLandscapeRequiredRole(role) {
  return isManagerRole(role)
}

/**
 * True once the active workspace role can be trusted.
 * Loading, signed-out, and pre-membership screens stay unblocked.
 */
export function isWorkspaceRoleReady({
  isAuthDisabled = false,
  isLoading = false,
  isBootstrapping = false,
  hasSession = false,
  hasMembership = false,
  role = '',
} = {}) {
  if (isLoading || isBootstrapping) return false
  if (!`${role ?? ''}`.trim()) return false
  if (isAuthDisabled) return true
  return Boolean(hasSession && hasMembership)
}

/**
 * The full-screen rotate gate is retired.
 * Managers use the phone shell in portrait and the full workspace when the
 * phone is sideways. Tablets and desktops stay on the workspace shell.
 */
export function shouldRequireManagerLandscape() {
  return false
}

/**
 * Do not lock orientation. A manager must be able to rotate into the full
 * workspace and back without a reload.
 */
export function shouldLockManagerLandscape() {
  return false
}

export function readCoarsePointer(win = globalThis.window) {
  if (!win) return false
  try {
    return Boolean(win.matchMedia?.('(pointer: coarse)')?.matches)
  } catch {
    return false
  }
}

export function readPortraitOrientation(win = globalThis.window) {
  if (!win) return false
  const width = Number(win.innerWidth) || 0
  const height = Number(win.innerHeight) || 0
  const visual = win.visualViewport
  const visualWidth = Number(visual?.width) || 0
  const visualHeight = Number(visual?.height) || 0
  const dimensionLandscape = (width > height && width > 0) || (visualWidth > visualHeight && visualWidth > 0)
  if (dimensionLandscape) return false

  try {
    const portraitQuery = win.matchMedia?.('(orientation: portrait)')
    if (portraitQuery && typeof portraitQuery.matches === 'boolean') {
      return portraitQuery.matches
    }
  } catch {
    // Fall through to the viewport dimensions.
  }

  if (width <= 0 || height <= 0) return false
  return height >= width
}

export async function tryLockLandscapeOrientation(orientation = globalThis.screen?.orientation) {
  const lock = orientation?.lock
  if (typeof lock !== 'function') return false
  try {
    await lock.call(orientation, 'landscape')
    return true
  } catch {
    return false
  }
}

export function tryReleaseLandscapeOrientation(orientation = globalThis.screen?.orientation) {
  const unlock = orientation?.unlock
  if (typeof unlock !== 'function') return
  try {
    unlock.call(orientation)
  } catch {
    // Unlock is unsupported, or this document never held the lock.
  }
}

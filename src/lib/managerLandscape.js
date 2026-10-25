import { isManagerRole } from './permissions'

/**
 * Landscape on phones and tablets is required for the workspace management
 * roles: owner, general manager, and manager.
 *
 * That is the same set as `isManagerRole` / `isManagementMobileRole`.
 * Host and staff keep the existing portrait experience.
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
 * Show the full-screen rotate prompt.
 * Fine-pointer desktops, including narrow windows, are never blocked.
 */
export function shouldRequireManagerLandscape({
  role = '',
  roleKnown = false,
  coarsePointer = false,
  isPortrait = false,
} = {}) {
  if (!roleKnown) return false
  if (!coarsePointer) return false
  if (!isPortrait) return false
  return isLandscapeRequiredRole(role)
}

/**
 * Try `screen.orientation.lock('landscape')` for the same audience.
 * Independent of the current orientation so a supported device stays landscape.
 * Callers must ignore failure — iOS cannot lock orientation.
 */
export function shouldLockManagerLandscape({
  role = '',
  roleKnown = false,
  coarsePointer = false,
} = {}) {
  if (!roleKnown) return false
  if (!coarsePointer) return false
  return isLandscapeRequiredRole(role)
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
  try {
    const portraitQuery = win.matchMedia?.('(orientation: portrait)')
    if (portraitQuery && typeof portraitQuery.matches === 'boolean') {
      return portraitQuery.matches
    }
  } catch {
    // Fall through to the viewport dimensions.
  }

  const width = Number(win.innerWidth) || 0
  const height = Number(win.innerHeight) || 0
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

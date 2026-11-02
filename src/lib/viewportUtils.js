let lockedMobileShell = false

const MOBILE_SHELL_MAX_WIDTH = 760

function readPersistedMobileShellLock() {
  if (lockedMobileShell) {
    return true
  }

  try {
    if (
      sessionStorage.getItem('ONE_FORCE_MOBILE_SHELL') === '1'
      || localStorage.getItem('ONE_FORCE_MOBILE_SHELL') === '1'
    ) {
      lockedMobileShell = true
      return true
    }
  } catch {
    // Ignore storage access errors (private mode, etc.)
  }

  return false
}

function persistMobileShellLock() {
  lockedMobileShell = true

  try {
    sessionStorage.setItem('ONE_FORCE_MOBILE_SHELL', '1')
    localStorage.setItem('ONE_FORCE_MOBILE_SHELL', '1')
  } catch {
    // Ignore storage access errors
  }
}

function isDirectIPhoneUA(userAgent = '') {
  return /iPhone|iPod/i.test(userAgent)
}

function isDesktopClassViewport(width = 0) {
  return width > MOBILE_SHELL_MAX_WIDTH
}

export function isIPhoneLikeDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent || ''
  if (isDirectIPhoneUA(ua)) {
    if (!readPersistedMobileShellLock()) {
      persistMobileShellLock()
    }
    return true
  }

  const width = window.innerWidth || 0
  if (isDesktopClassViewport(width)) {
    return false
  }

  if (readPersistedMobileShellLock()) {
    return true
  }

  const platform = navigator.platform || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0
  const minSide = Math.min(width, window.innerHeight || 0)
  const maxSide = Math.max(width, window.innerHeight || 0)

  return (
    platform === 'MacIntel'
    && maxTouchPoints > 1
    && minSide <= 480
    && maxSide <= 950
  )
}

export function shouldUseMobileShell() {
  if (typeof window === 'undefined') {
    return false
  }

  const ua = navigator.userAgent || ''
  if (isDirectIPhoneUA(ua)) {
    return true
  }

  const width = window.innerWidth || 0
  const height = window.innerHeight || 0
  let mediaNarrow = false
  try {
    mediaNarrow = Boolean(
      window.matchMedia?.(`(max-width: ${MOBILE_SHELL_MAX_WIDTH}px)`)?.matches,
    )
  } catch {
    mediaNarrow = false
  }

  // Trust the layout media query when the reported window width is still the
  // previous desktop size (responsive mode can update matchMedia first).
  if (!mediaNarrow && isDesktopClassViewport(width)) {
    return false
  }

  if (readPersistedMobileShellLock()) {
    return true
  }

  if (isIPhoneLikeDevice()) {
    return true
  }

  const isCoarsePointer =
    window.matchMedia?.('(pointer: coarse)')?.matches ?? false

  return (
    mediaNarrow
    || width <= MOBILE_SHELL_MAX_WIDTH
    || (
      isCoarsePointer
      && Math.min(width, height) <= 480
      && Math.max(width, height) <= 950
    )
  )
}

export function isViewportDebugEnabled() {
  try {
    return localStorage.getItem('ONE_DEBUG_VIEWPORT') === '1'
  } catch {
    return false
  }
}

export function getViewportDimensions() {
  return readLiveViewportBox()
}

/**
 * Live viewport size for rotation.
 * iOS standalone can leave innerWidth at the pre-rotation size while
 * visualViewport or the orientation media query has already updated.
 * Landscape uses the larger width so a stale portrait measurement cannot stick.
 */
/**
 * iOS keyboard: the layout viewport keeps its size while visualViewport
 * loses only height (same width). That is not a rotation, so it must not
 * flip an upright phone into the landscape layout and close an open sheet.
 */
export function isSoftKeyboardShrink(win = globalThis.window) {
  if (!win) return false
  const innerWidth = Number(win.innerWidth) || 0
  const innerHeight = Number(win.innerHeight) || 0
  const visual = win.visualViewport
  const visualWidth = Number(visual?.width) || 0
  const visualHeight = Number(visual?.height) || 0
  if (!innerWidth || !innerHeight || !visualWidth || !visualHeight) return false
  // Same width, less height, a field focused: the keyboard, in either
  // orientation (a landscape owner view fell back to portrait when the
  // keyboard left ~175px). A rotation always changes the width.
  if (Math.abs(visualWidth - innerWidth) > 2) return false
  if (visualHeight >= innerHeight) return false
  const active = win.document?.activeElement
  if (!active) return false
  const tag = String(active.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(active.isContentEditable)
}

export function readLiveViewportBox(win = globalThis.window) {
  if (!win) {
    return { width: 0, height: 0 }
  }

  const innerWidth = Number(win.innerWidth) || 0
  const innerHeight = Number(win.innerHeight) || 0
  if (isSoftKeyboardShrink(win)) {
    return { width: innerWidth, height: innerHeight }
  }
  const visual = win.visualViewport
  const visualWidth = Number(visual?.width) || 0
  const visualHeight = Number(visual?.height) || 0
  // Dimensions win when they already show a wide canvas. The orientation
  // media query can lag a resize (or disagree in device emulation) and must
  // not keep a landscape phone in the portrait measurement. A landscape
  // query still wins when innerWidth is the stale pre-rotation size.
  let landscape = innerWidth > innerHeight || visualWidth > visualHeight
  try {
    const query = win.matchMedia?.('(orientation: landscape)')
    if (query?.matches) landscape = true
  } catch {
    landscape = innerWidth > innerHeight || visualWidth > visualHeight
  }

  const width = landscape
    ? Math.max(innerWidth, visualWidth)
    : (visualWidth || innerWidth)
  const height = landscape
    ? (visualHeight && innerHeight ? Math.min(visualHeight, innerHeight) : (visualHeight || innerHeight))
    : Math.max(innerHeight, visualHeight)

  return { width, height }
}

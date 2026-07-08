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

  if (isDesktopClassViewport(width)) {
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
    width <= MOBILE_SHELL_MAX_WIDTH
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
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 }
  }

  return {
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  }
}

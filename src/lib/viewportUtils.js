let lockedMobileShell = false

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

export function isIPhoneLikeDevice() {
  if (readPersistedMobileShellLock()) {
    return true
  }

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0
  const minSide = Math.min(window.innerWidth || 0, window.innerHeight || 0)
  const maxSide = Math.max(window.innerWidth || 0, window.innerHeight || 0)

  const isDirectIPhone = /iPhone|iPod/i.test(ua)
  const isPhoneLikeTouchMac = (
    platform === 'MacIntel'
    && maxTouchPoints > 1
    && minSide <= 480
    && maxSide <= 950
  )

  if (isDirectIPhone || isPhoneLikeTouchMac) {
    persistMobileShellLock()
    return true
  }

  return false
}

export function shouldUseMobileShell() {
  if (typeof window === 'undefined') {
    return false
  }

  if (readPersistedMobileShellLock()) {
    return true
  }

  if (isIPhoneLikeDevice()) {
    return true
  }

  const width = window.innerWidth || 0
  const height = window.innerHeight || 0
  const isCoarsePointer =
    window.matchMedia?.('(pointer: coarse)')?.matches ?? false

  return (
    width <= 760
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

export const MOBILE_SHELL_MAX_WIDTH = 760
export const MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT = 480
export const MOBILE_SHORT_LANDSCAPE_MAX_WIDTH = 950

/** @deprecated Use MOBILE_SHELL_MAX_WIDTH */
export const MOBILE_VIEWPORT_MAX_WIDTH = MOBILE_SHELL_MAX_WIDTH

let cachedIsApplePhoneDevice = null

export function isApplePhoneDevice() {
  if (cachedIsApplePhoneDevice === true) {
    return true
  }

  if (typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0

  if (/iPhone|iPod/i.test(ua)) {
    cachedIsApplePhoneDevice = true
    return true
  }

  const minSide = Math.min(window.innerWidth || 0, window.innerHeight || 0)
  const maxSide = Math.max(window.innerWidth || 0, window.innerHeight || 0)

  const isPhoneLikeTouchMac = (
    platform === 'MacIntel'
    && maxTouchPoints > 1
    && minSide <= MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT
    && maxSide <= MOBILE_SHORT_LANDSCAPE_MAX_WIDTH
  )

  if (isPhoneLikeTouchMac) {
    cachedIsApplePhoneDevice = true
  }

  return isPhoneLikeTouchMac
}

export function shouldUseMobileViewport() {
  if (isApplePhoneDevice()) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  const width = window.innerWidth || 0
  const height = window.innerHeight || 0
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false

  return (
    width <= MOBILE_SHELL_MAX_WIDTH
    || (
      coarse
      && Math.min(width, height) <= MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT
      && Math.max(width, height) <= MOBILE_SHORT_LANDSCAPE_MAX_WIDTH
    )
  )
}

/** @deprecated Use shouldUseMobileViewport */
export function shouldUseMobileShellViewport(options = {}) {
  if (options.userAgent && /iPhone|iPod/i.test(options.userAgent)) {
    return true
  }

  return shouldUseMobileViewport()
}

/** @deprecated Use shouldUseMobileViewport */
export function shouldUseMobileShell(options = {}) {
  return shouldUseMobileShellViewport(options)
}

export function logMobileViewportChange(isMobile) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return
  }

  console.info('[ONE viewport]', {
    isMobile,
    width: window.innerWidth,
    height: window.innerHeight,
    ua: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    isApplePhoneDevice: isApplePhoneDevice(),
  })
}

import {
  isIPhoneLikeDevice,
  shouldUseMobileShell,
} from './viewportUtils'

export const MOBILE_SHELL_MAX_WIDTH = 760
export const MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT = 480
export const MOBILE_SHORT_LANDSCAPE_MAX_WIDTH = 950

/** @deprecated Use MOBILE_SHELL_MAX_WIDTH */
export const MOBILE_VIEWPORT_MAX_WIDTH = MOBILE_SHELL_MAX_WIDTH

/** @deprecated Use isIPhoneLikeDevice from viewportUtils */
export function isApplePhoneDevice() {
  return isIPhoneLikeDevice()
}

/** @deprecated Use shouldUseMobileShell from viewportUtils */
export function shouldUseMobileViewport() {
  return shouldUseMobileShell()
}

/** @deprecated Use shouldUseMobileShell */
export function shouldUseMobileShellViewport(options = {}) {
  if (options.userAgent && /iPhone|iPod/i.test(options.userAgent)) {
    return true
  }

  return shouldUseMobileShell()
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
    isIPhoneLikeDevice: isIPhoneLikeDevice(),
    shouldUseMobileShell: shouldUseMobileShell(),
  })
}

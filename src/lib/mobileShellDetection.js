export const MOBILE_SHELL_MAX_WIDTH = 760
export const MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT = 480
export const MOBILE_SHORT_LANDSCAPE_MAX_WIDTH = 950

/** @deprecated Use MOBILE_SHELL_MAX_WIDTH */
export const MOBILE_VIEWPORT_MAX_WIDTH = MOBILE_SHELL_MAX_WIDTH

function readViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 }
  }

  const visualViewport = window.visualViewport
  return {
    width: Math.round(visualViewport?.width ?? window.innerWidth),
    height: Math.round(visualViewport?.height ?? window.innerHeight),
  }
}

export function shouldUseMobileShellViewport(options = {}) {
  if (typeof window === 'undefined') {
    return false
  }

  const { width, height } = options.width != null && options.height != null
    ? { width: options.width, height: options.height }
    : readViewportSize()

  const ua = `${options.userAgent ?? navigator.userAgent ?? ''}`
  const platform = `${options.platform ?? navigator.platform ?? ''}`
  const maxTouchPoints = options.maxTouchPoints ?? navigator.maxTouchPoints ?? 0

  const isIPhone = /iPhone|iPod/.test(ua)
    || (platform === 'MacIntel' && maxTouchPoints > 1 && Math.min(width, height) <= MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT)

  const isCoarsePointer = options.isCoarsePointer ?? (
    window.matchMedia?.('(pointer: coarse)').matches ?? false
  )

  const isPortraitPhone = width <= MOBILE_SHELL_MAX_WIDTH

  const isLandscapePhone = isCoarsePointer
    && Math.min(width, height) <= MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT
    && Math.max(width, height) <= MOBILE_SHORT_LANDSCAPE_MAX_WIDTH

  const shouldUseMobileShell = isIPhone || isPortraitPhone || isLandscapePhone

  return shouldUseMobileShell
}

/** @deprecated Use shouldUseMobileShellViewport */
export function shouldUseMobileShell(options = {}) {
  return shouldUseMobileShellViewport(options)
}

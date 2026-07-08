export const MOBILE_SHELL_MAX_WIDTH = 760
export const MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT = 480
export const MOBILE_SHORT_LANDSCAPE_MAX_WIDTH = 950

/** @deprecated Use MOBILE_SHELL_MAX_WIDTH */
export const MOBILE_VIEWPORT_MAX_WIDTH = MOBILE_SHELL_MAX_WIDTH

export function shouldUseMobileShell({
  width = typeof window !== 'undefined' ? window.innerWidth : 0,
  height = typeof window !== 'undefined' ? window.innerHeight : 0,
  isCoarsePointer = typeof window !== 'undefined'
    ? window.matchMedia('(pointer: coarse)').matches
    : false,
} = {}) {
  const isNarrowViewport = width <= MOBILE_SHELL_MAX_WIDTH
  const isShortLandscapePhone = isCoarsePointer
    && height <= MOBILE_SHORT_LANDSCAPE_MAX_HEIGHT
    && width <= MOBILE_SHORT_LANDSCAPE_MAX_WIDTH

  return isNarrowViewport || isShortLandscapePhone
}

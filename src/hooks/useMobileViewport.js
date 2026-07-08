import { useEffect, useState } from 'react'
import { shouldUseMobileShell } from '../lib/viewportUtils'

/** @deprecated Use MOBILE_SHELL_MAX_WIDTH from viewportUtils consumers directly */
export const MOBILE_SHELL_MAX_WIDTH = 760

/** @deprecated Use MOBILE_SHELL_MAX_WIDTH */
export const MOBILE_VIEWPORT_MAX_WIDTH = MOBILE_SHELL_MAX_WIDTH

export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileShell())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let frameId = 0
    let orientationTimerId = 0

    const update = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        setIsMobile(shouldUseMobileShell())
      })
    }

    const handleOrientationChange = () => {
      window.clearTimeout(orientationTimerId)
      update()
      orientationTimerId = window.setTimeout(update, 320)
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.visualViewport?.addEventListener('resize', update)

    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    coarsePointerQuery.addEventListener('change', update)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(orientationTimerId)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.visualViewport?.removeEventListener('resize', update)
      coarsePointerQuery.removeEventListener('change', update)
    }
  }, [])

  return isMobile
}

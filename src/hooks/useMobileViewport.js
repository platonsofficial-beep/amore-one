import { useEffect, useState } from 'react'
import {
  MOBILE_SHELL_MAX_WIDTH,
  MOBILE_VIEWPORT_MAX_WIDTH,
  logMobileViewportChange,
  shouldUseMobileViewport,
} from '../lib/mobileShellDetection'

export { MOBILE_SHELL_MAX_WIDTH, MOBILE_VIEWPORT_MAX_WIDTH }

export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileViewport())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let frameId = 0
    let orientationTimerId = 0

    const update = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        setIsMobile((previous) => {
          const next = shouldUseMobileViewport()
          if (previous !== next) {
            logMobileViewportChange(next)
          }
          return next
        })
      })
    }

    const handleOrientationChange = () => {
      window.clearTimeout(orientationTimerId)
      update()
      orientationTimerId = window.setTimeout(update, 320)
    }

    update()
    logMobileViewportChange(shouldUseMobileViewport())

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

import { useEffect, useState } from 'react'
import {
  MOBILE_SHELL_MAX_WIDTH,
  MOBILE_VIEWPORT_MAX_WIDTH,
  shouldUseMobileShellViewport,
} from '../lib/mobileShellDetection'

export { MOBILE_SHELL_MAX_WIDTH, MOBILE_VIEWPORT_MAX_WIDTH }

export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileShellViewport())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let frameId = 0
    let orientationTimerId = 0

    const update = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        setIsMobile((previous) => {
          const next = shouldUseMobileShellViewport()
          if (import.meta.env.DEV && previous !== next) {
            console.debug('[mobile-shell] viewport changed', {
              isMobile: next,
              width: window.innerWidth,
              height: window.innerHeight,
            })
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

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', handleOrientationChange)

    const visualViewport = window.visualViewport
    visualViewport?.addEventListener('resize', update)
    visualViewport?.addEventListener('scroll', update)

    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    coarsePointerQuery.addEventListener('change', update)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(orientationTimerId)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', handleOrientationChange)
      visualViewport?.removeEventListener('resize', update)
      visualViewport?.removeEventListener('scroll', update)
      coarsePointerQuery.removeEventListener('change', update)
    }
  }, [])

  return isMobile
}

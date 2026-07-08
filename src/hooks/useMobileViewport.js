import { useEffect, useState } from 'react'
import {
  MOBILE_SHELL_MAX_WIDTH,
  MOBILE_VIEWPORT_MAX_WIDTH,
  shouldUseMobileShell,
} from '../lib/mobileShellDetection'

export { MOBILE_SHELL_MAX_WIDTH, MOBILE_VIEWPORT_MAX_WIDTH }

export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileShell())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const update = () => {
      setIsMobile(shouldUseMobileShell())
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    coarsePointerQuery.addEventListener('change', update)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      coarsePointerQuery.removeEventListener('change', update)
    }
  }, [])

  return isMobile
}

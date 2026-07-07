import { useEffect, useState } from 'react'

export const MOBILE_VIEWPORT_MAX_WIDTH = 760

export function useMobileViewport(maxWidth = MOBILE_VIEWPORT_MAX_WIDTH) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const handleChange = (event) => setIsMobile(event.matches)

    setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [maxWidth])

  return isMobile
}

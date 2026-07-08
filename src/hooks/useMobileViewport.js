import { useEffect, useMemo, useState } from 'react'

export const MOBILE_VIEWPORT_MAX_WIDTH = 760

export function useMobileViewport(maxWidth = MOBILE_VIEWPORT_MAX_WIDTH) {
  const mediaQueryText = useMemo(
    () => `(max-width: ${maxWidth}px), (max-height: ${maxWidth}px) and (orientation: landscape)`,
    [maxWidth],
  )

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(mediaQueryText).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(mediaQueryText)
    const handleChange = (event) => setIsMobile(event.matches)

    setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [mediaQueryText])

  return isMobile
}

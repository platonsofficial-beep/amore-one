import { useEffect, useState } from 'react'
import { shouldUseHostTableInspectorDrawer } from './hostTableInspectorUtils'

export function useHostTableInspectorDrawer() {
  const [useDrawer, setUseDrawer] = useState(() => shouldUseHostTableInspectorDrawer())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const update = () => {
      setUseDrawer(shouldUseHostTableInspectorDrawer())
    }

    const mediaQueries = [
      '(max-width: 720px)',
      '(orientation: portrait)',
      '(orientation: landscape)',
      '(min-width: 700px)',
      '(min-width: 1024px)',
    ].map((query) => window.matchMedia(query))

    mediaQueries.forEach((mediaQuery) => {
      mediaQuery.addEventListener('change', update)
    })
    window.addEventListener('resize', update)

    return () => {
      mediaQueries.forEach((mediaQuery) => {
        mediaQuery.removeEventListener('change', update)
      })
      window.removeEventListener('resize', update)
    }
  }, [])

  return useDrawer
}

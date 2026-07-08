import { useEffect, useState } from 'react'
import { getViewportDimensions, isViewportDebugEnabled } from '../../lib/viewportUtils'

export function ViewportDebugOverlay({ isMobileViewport }) {
  const [debugInfo, setDebugInfo] = useState(null)

  useEffect(() => {
    if (!isViewportDebugEnabled()) {
      setDebugInfo(null)
      return undefined
    }

    const update = () => {
      const { width, height } = getViewportDimensions()
      setDebugInfo({
        mode: isMobileViewport ? 'mobile' : 'desktop',
        width,
        height,
      })
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [isMobileViewport])

  if (!debugInfo) {
    return null
  }

  return (
    <div
      className="viewport-debug-overlay"
      aria-hidden="true"
    >
      {`viewport: ${debugInfo.mode} · ${debugInfo.width} x ${debugInfo.height}`}
    </div>
  )
}

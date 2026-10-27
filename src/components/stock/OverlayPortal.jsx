import { useEffect } from 'react'
import { createPortal } from 'react-dom'

let openOverlayCount = 0

function syncOverlayClass() {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('has-one-overlay', openOverlayCount > 0)
}

/**
 * Renders a drawer or dialog on document.body so iOS does not clip it inside
 * the mobile scroller, and marks the page so the floating nav can hide.
 */
export function OverlayPortal({ children }) {
  useEffect(() => {
    openOverlayCount += 1
    syncOverlayClass()
    return () => {
      openOverlayCount = Math.max(0, openOverlayCount - 1)
      syncOverlayClass()
    }
  }, [])

  if (typeof document === 'undefined') return children
  return createPortal(children, document.body)
}

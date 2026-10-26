import { useEffect, useRef } from 'react'

const listeners = []
let installed = false

function ensureEscapeListener() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || listeners.length === 0) return
    event.preventDefault()
    event.stopImmediatePropagation()
    listeners[listeners.length - 1]()
  }, true)
}

/**
 * Close the topmost open sheet. Later mounts sit above earlier ones, so
 * Escape closes the nested sheet before the panel under it.
 */
export function useEscapeToClose(onClose, { enabled = true } = {}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!enabled) return undefined
    ensureEscapeListener()
    const call = () => {
      onCloseRef.current?.()
    }
    listeners.push(call)
    return () => {
      const index = listeners.indexOf(call)
      if (index >= 0) listeners.splice(index, 1)
    }
  }, [enabled])
}

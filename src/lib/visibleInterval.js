/**
 * setInterval that pauses while the page is hidden and runs once as soon as
 * it becomes visible again. Returns a cleanup function.
 */
export function startVisibleInterval(callback, intervalMs, { doc = typeof document === 'undefined' ? null : document, win = typeof window === 'undefined' ? null : window } = {}) {
  let intervalId = null
  const isHidden = () => Boolean(doc && doc.visibilityState === 'hidden')
  const start = () => {
    if (intervalId === null && win) intervalId = win.setInterval(callback, intervalMs)
  }
  const stop = () => {
    if (intervalId !== null && win) win.clearInterval(intervalId)
    intervalId = null
  }
  const onVisibility = () => {
    if (isHidden()) {
      stop()
      return
    }
    if (intervalId === null) {
      callback()
      start()
    }
  }
  if (!isHidden()) start()
  doc?.addEventListener('visibilitychange', onVisibility)
  return () => {
    stop()
    doc?.removeEventListener('visibilitychange', onVisibility)
  }
}

/**
 * Wraps a refresh for focus + visibilitychange listeners: skips while hidden
 * and collapses events that arrive within `windowMs` into one call.
 */
export function createVisibleRefresh(refresh, { windowMs = 2000, doc = typeof document === 'undefined' ? null : document, now = () => Date.now() } = {}) {
  let lastRun = -Infinity
  return () => {
    if (doc && doc.visibilityState === 'hidden') return
    const current = now()
    if (current - lastRun < windowMs) return
    lastRun = current
    refresh()
  }
}

/**
 * setInterval that pauses while the page is hidden. Coming back runs the
 * callback only if it has been at least 30s since the last run.
 */
export const VISIBLE_REFRESH_MIN_GAP_MS = 30_000

export function startVisibleInterval(callback, intervalMs, { doc = typeof document === 'undefined' ? null : document, win = typeof window === 'undefined' ? null : window, minGapMs = VISIBLE_REFRESH_MIN_GAP_MS, now = () => Date.now() } = {}) {
  let intervalId = null
  let lastRun = -Infinity
  const isHidden = () => Boolean(doc && doc.visibilityState === 'hidden')
  const run = () => {
    lastRun = now()
    callback()
  }
  const start = () => {
    if (intervalId === null && win) intervalId = win.setInterval(run, intervalMs)
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
      if (now() - lastRun >= minGapMs) run()
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
export function createVisibleRefresh(refresh, { windowMs = VISIBLE_REFRESH_MIN_GAP_MS, doc = typeof document === 'undefined' ? null : document, now = () => Date.now() } = {}) {
  let lastRun = -Infinity
  return () => {
    if (doc && doc.visibilityState === 'hidden') return
    const current = now()
    if (current - lastRun < windowMs) return
    lastRun = current
    refresh()
  }
}

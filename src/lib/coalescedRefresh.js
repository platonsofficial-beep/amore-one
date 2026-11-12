/**
 * Collapses a burst of change events into at most one refresh per `waitMs`
 * (trailing). While the page is hidden nothing is fetched; one refresh runs
 * when it becomes visible again if anything changed meanwhile.
 */
export function createCoalescedRefresh(refresh, {
  waitMs = 3000,
  doc = typeof document === 'undefined' ? null : document,
  win = typeof window === 'undefined' ? null : window,
} = {}) {
  // Realtime bursts collapse into one trailing refresh. A change that arrived
  // while the tab was hidden still refreshes once when it is visible again.
  let timer = null
  let pendingWhileHidden = false
  const isHidden = () => Boolean(doc && doc.visibilityState === 'hidden')
  const run = () => {
    timer = null
    if (isHidden()) {
      pendingWhileHidden = true
      return
    }
    refresh()
  }
  const onVisibility = () => {
    if (isHidden() || !pendingWhileHidden) return
    pendingWhileHidden = false
    if (timer === null) refresh()
  }
  doc?.addEventListener('visibilitychange', onVisibility)
  return {
    trigger() {
      if (isHidden()) {
        pendingWhileHidden = true
        return
      }
      if (timer === null && win) timer = win.setTimeout(run, waitMs)
    },
    cancel() {
      if (timer !== null && win) win.clearTimeout(timer)
      timer = null
      doc?.removeEventListener('visibilitychange', onVisibility)
    },
  }
}

/**
 * Which side the iPhone Dynamic Island is on in landscape (Platon t398u/t404u).
 * iOS reports the same safe-area inset on both sides in landscape, so the
 * far side got a big empty gap. window.orientation 90 (screen angle 90) means
 * the top of the phone, and the island, is on the left; -90 (angle 270) is on
 * the right. Exposed as <html data-island="left|right">, which safeOverlay.css
 * turns into --one-inset-left/right. Unknown keeps the symmetric fallback.
 */
export function islandSide(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return 'none'
  const width = Number(win.innerWidth) || 0
  const height = Number(win.innerHeight) || 0
  if (!(width > height)) return 'none'
  let angle = null
  if (typeof win.orientation === 'number') angle = win.orientation
  else if (typeof win.screen?.orientation?.angle === 'number') angle = win.screen.orientation.angle
  if (angle == null) return 'none'
  const normalized = ((Math.round(angle) % 360) + 360) % 360
  if (normalized === 90) return 'left'
  if (normalized === 270) return 'right'
  return 'none'
}

export function publishIslandSide(win = typeof window === 'undefined' ? undefined : window) {
  const root = win?.document?.documentElement
  if (!root) return 'none'
  const side = islandSide(win)
  if (side === 'none') root.removeAttribute('data-island')
  else root.setAttribute('data-island', side)
  return side
}

let bound = false
export function bindIslandSide(win = typeof window === 'undefined' ? undefined : window) {
  if (!win || bound) return
  bound = true
  const update = () => {
    publishIslandSide(win)
    // iOS updates the angle a moment after the resize event.
    win.setTimeout(() => publishIslandSide(win), 250)
  }
  win.addEventListener('resize', update)
  win.addEventListener('orientationchange', update)
  win.screen?.orientation?.addEventListener?.('change', update)
  publishIslandSide(win)
}

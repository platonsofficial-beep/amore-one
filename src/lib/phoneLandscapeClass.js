// Sets html.one-phone-landscape on touch phones held sideways.
// Uses the physical screen size (screen.width/height never exceed ~500 on a
// phone) plus window.inner* for orientation, instead of CSS media queries, so
// it doesn't depend on how iOS standalone reports the viewport height.
export const PHONE_LANDSCAPE_CLASS = 'one-phone-landscape'

export function isPhoneLandscape(win) {
  if (!win) return false
  const nav = win.navigator || {}
  const touch = (nav.maxTouchPoints || 0) > 0 || Boolean(win.matchMedia?.('(pointer: coarse)')?.matches)
  if (!touch) return false
  const s = win.screen || {}
  const shortSide = Math.min(s.width || Infinity, s.height || Infinity, Math.max(win.innerWidth || 0, win.innerHeight || 0) || Infinity)
  if (!(shortSide <= 500)) return false
  return (win.innerWidth || 0) > (win.innerHeight || 0)
}

export function applyPhoneLandscapeClass(win, doc = win?.document) {
  const root = doc?.documentElement
  if (!root) return false
  const on = isPhoneLandscape(win)
  root.classList.toggle(PHONE_LANDSCAPE_CLASS, on)
  return on
}

export function bindPhoneLandscapeClass(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return () => {}
  const update = () => applyPhoneLandscapeClass(win)
  update()
  win.addEventListener('resize', update)
  win.addEventListener('orientationchange', update)
  win.visualViewport?.addEventListener?.('resize', update)
  return () => {
    win.removeEventListener('resize', update)
    win.removeEventListener('orientationchange', update)
    win.visualViewport?.removeEventListener?.('resize', update)
  }
}

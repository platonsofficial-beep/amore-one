/**
 * iOS home-screen apps (manifest + black-translucent status bar) lay the page
 * out in a viewport about one status-bar height (~62pt) shorter than the
 * glass, so the fixed tab bar floated high and a band showed underneath.
 *
 * screen.* still reports the real panel, so we measure the missing strip and
 * expose it as --one-standalone-gap (0 everywhere else). Only the tab bar and
 * a decorative backdrop read it. Deliberately no visualViewport listener and
 * no html/body/#root/shell height changes: those belong to the locked Active
 * Inventory Count baseline (P8.19.8, .cursor/rules/active-count-locked-baseline.mdc).
 */
const MAX_GAP = 80

export function measureStandaloneGap(win = typeof window === 'undefined' ? undefined : window) {
  if (!win || win.navigator?.standalone !== true || !win.screen) return 0
  const { width, height } = win.screen
  const landscape = win.innerWidth > win.innerHeight
  const panel = landscape ? Math.min(width, height) : Math.max(width, height)
  const gap = Math.round(panel - win.innerHeight)
  return gap > 0 && gap <= MAX_GAP ? gap : 0
}

export function installStandaloneViewport(win = typeof window === 'undefined' ? undefined : window) {
  if (!win?.document) return () => {}
  const root = win.document.documentElement
  let timer = 0
  const apply = () => {
    const gap = measureStandaloneGap(win)
    root.style.setProperty('--one-standalone-gap', `${gap}px`)
  }
  const later = () => {
    apply()
    win.clearTimeout(timer)
    timer = win.setTimeout(apply, 350)
  }
  apply()
  win.addEventListener('resize', apply)
  win.addEventListener('orientationchange', later)
  win.addEventListener('pageshow', apply)
  return () => {
    win.clearTimeout(timer)
    win.removeEventListener('resize', apply)
    win.removeEventListener('orientationchange', later)
    win.removeEventListener('pageshow', apply)
  }
}

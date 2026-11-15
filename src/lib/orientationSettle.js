import { restorePageScroll } from './keyboardInset'
import { isSoftKeyboardShrink } from './viewportUtils'

const FIELD = /^(input|textarea|select)$/i

function isTyping(win) {
  const active = win.document?.activeElement
  if (!active) return false
  if (FIELD.test(active.tagName || '')) return true
  return Boolean(active.isContentEditable)
}

/**
 * iOS standalone scrolls the window while rotating, then portrait locks
 * overflow. The leftover offset cuts off the top and shifts the fixed
 * bottom nav away from its tap targets until the next scroll.
 * A focused field, or the keyboard shrink, is left alone.
 */
export function settleShellAfterOrientation(win = typeof window === 'undefined' ? undefined : window) {
  if (!win?.document) return false
  if (isSoftKeyboardShrink(win) || isTyping(win)) return false
  const restored = restorePageScroll(win)
  const visual = win.visualViewport
  const offsetTop = Number(visual?.offsetTop) || 0
  const offsetLeft = Number(visual?.offsetLeft) || 0
  if (offsetTop > 1 || offsetLeft > 1) win.scrollTo?.(0, 0)
  const shell = win.document.querySelector?.('.app-shell')
  if (shell?.getBoundingClientRect) void shell.getBoundingClientRect()
  return restored || offsetTop > 1 || offsetLeft > 1
}

export function bindOrientationSettle(win = typeof window === 'undefined' ? undefined : window) {
  if (!win?.addEventListener) return () => {}
  let timer = 0
  let settling = false
  let orientAt = 0
  let lastWidth = Number(win.innerWidth) || 0

  const run = () => {
    if (settling) return
    settling = true
    try {
      settleShellAfterOrientation(win)
    } finally {
      settling = false
    }
  }

  const schedule = () => {
    orientAt = Date.now()
    run()
    win.clearTimeout?.(timer)
    timer = win.setTimeout?.(() => {
      run()
      win.setTimeout?.(run, 280)
    }, 60) ?? 0
  }

  const onResize = () => {
    const width = Number(win.innerWidth) || 0
    if (Math.abs(width - lastWidth) > 40) {
      lastWidth = width
      schedule()
    }
  }

  const onVisualScroll = () => {
    if (Date.now() - orientAt > 1200) return
    const y = Number(win.scrollY ?? win.pageYOffset) || 0
    const top = Number(win.visualViewport?.offsetTop) || 0
    const left = Number(win.visualViewport?.offsetLeft) || 0
    if (y > 1 || top > 1 || left > 1) run()
  }

  win.addEventListener('orientationchange', schedule)
  win.addEventListener('resize', onResize)
  win.screen?.orientation?.addEventListener?.('change', schedule)
  win.visualViewport?.addEventListener?.('scroll', onVisualScroll)

  return () => {
    win.clearTimeout?.(timer)
    win.removeEventListener('orientationchange', schedule)
    win.removeEventListener('resize', onResize)
    win.screen?.orientation?.removeEventListener?.('change', schedule)
    win.visualViewport?.removeEventListener?.('scroll', onVisualScroll)
  }
}

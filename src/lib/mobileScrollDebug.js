const MOBILE_RESERVATIONS_SCROLL_SELECTORS = [
  '.mobile-expanded-scroll',
  '.mobile-workspace-module',
  '.mobile-workspace-module.is-mobile-expanded',
  '.reservations-workspace-host',
  '.host-operations-canvas-shell',
  '.host-operations-canvas',
  '.host-operations-list',
  '.host-operations-list-scroll',
  '.host-operations-floor',
  '.floor-plan-workspace.is-host-floor',
  '.floor-plan-viewport.is-host-viewport',
]

export function isMobileScrollDebugEnabled() {
  try {
    return localStorage.getItem('ONE_DEBUG_SCROLL') === '1'
  } catch {
    return false
  }
}

export function setMobileScrollDebugAttribute(enabled = isMobileScrollDebugEnabled()) {
  if (typeof document === 'undefined') {
    return
  }

  if (enabled) {
    document.documentElement.setAttribute('data-one-debug-scroll', '1')
  } else {
    document.documentElement.removeAttribute('data-one-debug-scroll')
  }
}

export function logMobileReservationsScrollContainers(context = 'mobile-reservations') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  if (!isMobileScrollDebugEnabled()) {
    return
  }

  const rows = MOBILE_RESERVATIONS_SCROLL_SELECTORS.map((selector) => {
    const element = document.querySelector(selector)

    if (!element) {
      return { context, selector, found: false }
    }

    const styles = window.getComputedStyle(element)

    return {
      context,
      selector,
      found: true,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      canScroll: element.scrollHeight > element.clientHeight,
      overflowY: styles.overflowY,
      overflow: styles.overflow,
      height: styles.height,
      maxHeight: styles.maxHeight,
      minHeight: styles.minHeight,
      flex: styles.flex,
      position: styles.position,
      touchAction: styles.touchAction,
    }
  })

  console.info(`[ONE scroll debug] ${context}`)
  console.table(rows)
}

export function scheduleMobileReservationsScrollDebug(context = 'mobile-reservations') {
  if (typeof window === 'undefined' || !isMobileScrollDebugEnabled()) {
    return undefined
  }

  const run = () => logMobileReservationsScrollContainers(context)

  run()
  window.requestAnimationFrame(run)
  window.setTimeout(run, 320)

  return undefined
}

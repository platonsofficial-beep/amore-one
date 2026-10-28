import { useEffect, useState } from 'react'

const COUNT_SELECTOR = '.inventory-count-session, .is-inventory-count-session-lock'
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]'
const SHEET_FIELD_SELECTOR = '.chat-composer, .chat-sheet, .mobile-sheet, .employee-modal, .stock-item-more-menu-panel, .notification-drawer, .supply-draft-preview'

/**
 * Keyboard overlap from the visual viewport.
 * iOS Safari and installed PWAs do not shrink the layout viewport, so
 * innerHeight - visualViewport.height - offsetTop is the covered band.
 */
export function keyboardOverlap(viewport, innerHeight) {
  const layoutHeight = Number(innerHeight) || 0
  if (!viewport) return { kb: 0, vvh: layoutHeight, top: 0 }
  const height = Number(viewport.height) || 0
  const top = Number(viewport.offsetTop) || 0
  const kb = Math.max(0, Math.round(layoutHeight - height - top))
  return {
    kb,
    vvh: Math.round(height || layoutHeight),
    top: Math.round(top),
  }
}

let subscribers = 0
let cleanups = []

export function publishKeyboardInset() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { kb: 0, vvh: 0, top: 0 }
  }
  const metrics = keyboardOverlap(window.visualViewport, window.innerHeight)
  const active = document.activeElement
  const inCount = Boolean(active?.closest?.(COUNT_SELECTOR))
  const root = document.documentElement
  root.style.setProperty('--kb', inCount ? '0px' : `${metrics.kb}px`)
  root.style.setProperty('--vvh', `${metrics.vvh || window.innerHeight}px`)
  root.style.setProperty('--vv-top', `${metrics.top}px`)
  const field = Boolean(active?.matches?.(FIELD_SELECTOR))
  const sheetField = Boolean(field && active.closest?.(SHEET_FIELD_SELECTOR))
  document.body.classList.toggle('is-keyboard-open', !inCount && metrics.kb >= 60)
  document.body.classList.toggle('is-composer-focused', !inCount && sheetField)
  return inCount ? { kb: 0, vvh: metrics.vvh, top: metrics.top } : metrics
}

let chatPinGeneration = 0

/** Keep a pinned chat on the newest message after the iOS keyboard moves the viewport. */
export function keepChatPinned(win = typeof window === 'undefined' ? undefined : window) {
  if (!win?.document) return undefined
  win.scrollTo?.(0, 0)
  const node = win.document.querySelector('.app-shell.is-chat-thread .chat-messages')
  if (!node || node.dataset.chatStick !== '1') return undefined
  const generation = ++chatPinGeneration
  node.dataset.chatHold = '1'
  const pin = () => {
    if (generation !== chatPinGeneration) return
    win.scrollTo?.(0, 0)
    node.scrollTop = node.scrollHeight
  }
  pin()
  const frame = win.requestAnimationFrame?.(pin)
  const timer = win.setTimeout(() => {
    if (generation !== chatPinGeneration) return
    pin()
    delete node.dataset.chatHold
  }, 300)
  return () => {
    if (frame != null) win.cancelAnimationFrame?.(frame)
    win.clearTimeout?.(timer)
    if (generation === chatPinGeneration) delete node.dataset.chatHold
  }
}

function bindKeyboardViewport() {
  const viewport = window.visualViewport
  const onViewport = () => {
    publishKeyboardInset()
    keepChatPinned()
  }
  const onFocus = () => {
    publishKeyboardInset()
    keepChatPinned()
  }
  const onBlur = () => window.setTimeout(publishKeyboardInset, 60)
  viewport?.addEventListener('resize', onViewport)
  viewport?.addEventListener('scroll', onViewport)
  window.addEventListener('focusin', onFocus)
  window.addEventListener('focusout', onBlur)
  publishKeyboardInset()
  cleanups = [
    () => viewport?.removeEventListener('resize', onViewport),
    () => viewport?.removeEventListener('scroll', onViewport),
    () => window.removeEventListener('focusin', onFocus),
    () => window.removeEventListener('focusout', onBlur),
  ]
}

function unbindKeyboardViewport() {
  cleanups.forEach((fn) => fn())
  cleanups = []
  const root = document.documentElement
  root.style.removeProperty('--kb')
  root.style.removeProperty('--vvh')
  root.style.removeProperty('--vv-top')
  document.body.classList.remove('is-keyboard-open', 'is-composer-focused')
}

export function retainKeyboardInset() {
  subscribers += 1
  if (subscribers === 1) bindKeyboardViewport()
  return () => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0) unbindKeyboardViewport()
  }
}

export function useKeyboardInset(enabled = true) {
  const [metrics, setMetrics] = useState(() => ({ kb: 0, vvh: 0, top: 0 }))

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const release = retainKeyboardInset()
    const sync = () => setMetrics(publishKeyboardInset())
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)
    window.addEventListener('focusin', sync)
    sync()
    return () => {
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
      window.removeEventListener('focusin', sync)
      release()
    }
  }, [enabled])

  return metrics
}

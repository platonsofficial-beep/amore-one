import { useEffect, useRef } from 'react'

const OVERLAYS = [
  '.subscription-banner',
  '.venue-wizard-bar',
  '.mobile-bottom-nav',
  '.setup-guide-dock',
]

function cssEscape(value) {
  const text = `${value ?? ''}`
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text)
  return text.replace(/"/g, '\\"')
}

export function scrollDeltaForReveal({ elementBox, portBox, insets }) {
  const viewTop = portBox.top + insets.top
  const viewBottom = portBox.bottom - insets.bottom
  const viewHeight = Math.max(0, viewBottom - viewTop)
  if (elementBox.height <= viewHeight + 1) {
    if (elementBox.top < viewTop - 1) return elementBox.top - viewTop
    if (elementBox.bottom > viewBottom + 1) return elementBox.bottom - viewBottom
    return 0
  }
  return elementBox.top - viewTop
}

export function insetsForOverlays(port, overlays = [], { portraitBand = 0 } = {}) {
  let top = 0
  let bottom = 0
  const mid = (port.top + port.bottom) / 2
  overlays.forEach((box) => {
    if (!box || box.height <= 0 || box.width <= 0) return
    if (box.bottom <= port.top || box.top >= port.bottom) return
    const center = (box.top + box.bottom) / 2
    if (center < mid) top = Math.max(top, box.bottom - port.top)
    else bottom = Math.max(bottom, port.bottom - box.top)
  })
  top = Math.max(top, portraitBand)
  return {
    top: top + 12,
    bottom: bottom + 12,
  }
}

function portraitBandHeight() {
  const content = document.querySelector('.mobile-app-content')
  if (!content || typeof getComputedStyle !== 'function') return 0
  const before = getComputedStyle(content, '::before')
  if (!before || before.display === 'none' || before.content === 'none' || before.content === 'normal') return 0
  const height = Number.parseFloat(before.height)
  return Number.isFinite(height) ? height : 0
}

function portBox(scroller) {
  if (
    scroller === document.scrollingElement
    || scroller === document.documentElement
    || scroller === document.body
  ) {
    const viewport = window.visualViewport
    const top = viewport?.offsetTop ?? 0
    const height = viewport?.height ?? window.innerHeight
    return { top, bottom: top + height, left: 0, right: window.innerWidth, height }
  }
  return scroller.getBoundingClientRect()
}

function canScroll(node) {
  if (!node || typeof getComputedStyle !== 'function') return false
  const style = getComputedStyle(node)
  if (!/auto|scroll|overlay/.test(`${style.overflowY} ${style.overflow}`)) return false
  return node.scrollHeight > node.clientHeight + 1
}

export function findScrollParent(element) {
  let node = element?.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    if (canScroll(node)) return node
    node = node.parentElement
  }
  return document.scrollingElement || document.documentElement
}

export function focusField(input) {
  if (!input || typeof input.focus !== 'function') return
  try {
    input.focus({ preventScroll: true })
  } catch {
    input.focus()
  }
  if (typeof input.select === 'function') input.select()
}

export function revealInView(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return
  const scroller = findScrollParent(element)
  if (!scroller) return
  const overlays = OVERLAYS
    .map((selector) => document.querySelector(selector))
    .filter(Boolean)
    .map((node) => node.getBoundingClientRect())
  const port = portBox(scroller)
  const insets = insetsForOverlays(port, overlays, { portraitBand: portraitBandHeight() })
  const delta = scrollDeltaForReveal({
    elementBox: element.getBoundingClientRect(),
    portBox: port,
    insets,
  })
  if (Math.abs(delta) < 2) return
  const next = Math.max(0, (scroller.scrollTop || 0) + delta)
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({ top: next, behavior: 'smooth' })
    return
  }
  scroller.scrollTop = next
}

export function useSettingsEditorScroll({ editingId, sectionRef, fieldRef }) {
  const previousRef = useRef(editingId)

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = editingId
    if (previous && !editingId) {
      const row = sectionRef.current?.querySelector(`[data-settings-row="${cssEscape(previous)}"]`)
      if (row) revealInView(row)
      return
    }
    if (editingId && previous !== editingId) {
      const input = fieldRef.current
      if (input && document.activeElement === input && typeof input.select === 'function') input.select()
    }
  }, [editingId, sectionRef, fieldRef])

  return function beginEdit(editor, start) {
    if (typeof start === 'function') start()
    focusField(fieldRef.current)
    if (editor) revealInView(editor)
  }
}

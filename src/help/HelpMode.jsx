import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { resolveHelpCopy } from './helpTexts'
import './helpMode.css'

const STORAGE_KEY = 'one.help.mode'

function readEnabled() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let enabled = readEnabled()
const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return enabled
}

function setEnabled(next) {
  enabled = Boolean(next)
  try {
    sessionStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Private mode can block storage. The in-memory flag still works.
  }
  listeners.forEach((listener) => listener())
}

export function useHelpModeEnabled() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

function visibleLabel(element) {
  const aria = `${element.getAttribute('aria-label') ?? ''}`.trim()
  if (aria) return aria
  const title = `${element.getAttribute('title') ?? ''}`.trim()
  if (title) return title
  const text = `${element.innerText || element.textContent || ''}`.replace(/\s+/g, ' ').trim()
  return text.slice(0, 80)
}

function findHelpTarget(node) {
  if (!(node instanceof Element)) return null
  return node.closest('[data-help], button, a, [role="button"], [role="menuitem"], summary, input, select, textarea, label')
}

function placePopover(rect, width) {
  const margin = 8
  const estimatedHeight = 132
  let left = rect.left
  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - margin - width
  }
  if (left < margin) left = margin
  let top = rect.bottom + margin
  if (top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estimatedHeight - margin)
  }
  return { left, top, width }
}

export function HelpModeToggle({ className = '' }) {
  const on = useHelpModeEnabled()
  return (
    <button
      type="button"
      className={`help-mode-toggle${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      data-help-chrome=""
      data-help="header.help"
      data-testid="help-mode-toggle"
      aria-pressed={on}
      aria-label={on ? 'Turn help mode off' : 'Help mode'}
      onClick={() => setEnabled(!on)}
    >
      ?
    </button>
  )
}

export function HelpModeChrome() {
  const on = useHelpModeEnabled()
  const [popover, setPopover] = useState(null)
  const popoverRef = useRef(null)
  const outlinedRef = useRef(null)
  const panelRef = useRef(null)

  const clearOutline = () => {
    outlinedRef.current?.classList.remove('help-mode-target')
    outlinedRef.current = null
  }

  const closePopover = () => {
    popoverRef.current = null
    setPopover(null)
    clearOutline()
  }

  useEffect(() => {
    if (!on) closePopover()
  }, [on])

  useEffect(() => {
    if (!on) return undefined

    const consider = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return 'ignore'
      if (target.closest('[data-help-chrome]')) return 'ignore'
      const element = findHelpTarget(target)
      if (!element || element.closest('[data-help-chrome]')) {
        return 'block-empty'
      }
      const helpId = element.getAttribute('data-help') || ''
      const isNav = element.hasAttribute('data-help-nav')
      const current = popoverRef.current
      if (isNav && current?.element === element) {
        closePopover()
        return 'allow-nav'
      }
      const rect = element.getBoundingClientRect()
      const copy = resolveHelpCopy(helpId, { label: visibleLabel(element) })
      clearOutline()
      element.classList.add('help-mode-target')
      outlinedRef.current = element
      const next = {
        helpId: helpId || visibleLabel(element),
        element,
        title: copy.title,
        body: copy.body,
        top: 0,
        left: 0,
        width: Math.min(280, window.innerWidth - 16),
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      }
      const placed = placePopover(next.rect, next.width)
      next.top = placed.top
      next.left = placed.left
      next.width = placed.width
      popoverRef.current = next
      setPopover(next)
      return 'block'
    }

    let suppressClick = false
    const onPointerDown = (event) => {
      const result = consider(event)
      if (result === 'allow-nav' || result === 'ignore') return
      suppressClick = true
      event.preventDefault()
      event.stopPropagation()
    }
    const onClick = (event) => {
      if (suppressClick) {
        suppressClick = false
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const result = consider(event)
      if (result === 'allow-nav' || result === 'ignore') return
      event.preventDefault()
      event.stopPropagation()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setEnabled(false)
        return
      }
      if (event.target instanceof Element && event.target.closest('[data-help-chrome]')) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      const result = consider(event)
      if (result === 'allow-nav' || result === 'ignore') return
      event.preventDefault()
      event.stopPropagation()
    }
    const onSubmit = (event) => {
      if (event.target instanceof Element && event.target.closest('[data-help-chrome]')) return
      consider(event)
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [on])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel || !popover) return
    const box = panel.getBoundingClientRect()
    const margin = 8
    let top = popover.top
    let left = popover.left
    if (box.bottom > window.innerHeight - margin) {
      top = Math.max(margin, popover.rect.top - box.height - margin)
    }
    if (box.right > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - box.width)
    }
    if (top !== popover.top || left !== popover.left) {
      const next = { ...popover, top, left }
      popoverRef.current = next
      setPopover(next)
    }
    panel.focus()
  }, [popover])

  const popoverNode = popover && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      className="help-mode-popover"
      role="dialog"
      tabIndex={-1}
      data-help-chrome=""
      aria-live="polite"
      aria-label={popover.title}
      style={{ top: popover.top, left: popover.left, width: popover.width }}
    >
      <p className="help-mode-popover-title">{popover.title}</p>
      <p className="help-mode-popover-body">{popover.body}</p>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <div className="help-mode-fallback" data-help-chrome="">
        <HelpModeToggle />
      </div>
      {on ? (
        <div className="help-mode-banner" data-help-chrome="" role="status">
          <p>Help mode — tap anything to see what it does</p>
          <button type="button" className="help-mode-done" onClick={() => setEnabled(false)}>
            Done
          </button>
        </div>
      ) : null}
      {popoverNode}
    </>
  )
}

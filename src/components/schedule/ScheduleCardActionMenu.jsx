import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isScrollInsideMenu, placeScheduleActionMenu } from '../../lib/scheduleActionMenuPosition'
import { shouldUseMobileShell } from '../../lib/viewportUtils'

const MENU_Z_INDEX = 1300

export function ScheduleCardActionMenu({
  isOpen,
  onClose,
  anchorEl = null,
  className = 'template-card-menu',
  children,
}) {
  const panelRef = useRef(null)
  const useMobileSheet = isOpen && shouldUseMobileShell()
  const [fixedStyle, setFixedStyle] = useState(null)
  const [placement, setPlacement] = useState('below')

  useLayoutEffect(() => {
    if (!isOpen || useMobileSheet) {
      setFixedStyle(null)
      return undefined
    }

    const place = () => {
      const anchorRect = anchorEl?.getBoundingClientRect?.()
      const panel = panelRef.current
      if (!anchorRect || !panel) return
      const bounds = panel.getBoundingClientRect()
      const placed = placeScheduleActionMenu({
        anchorRect,
        menuWidth: Math.max(bounds.width, panel.scrollWidth),
        menuHeight: Math.max(bounds.height, panel.scrollHeight),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      })
      setPlacement(placed.placement)
      setFixedStyle({
        position: 'fixed',
        top: `${placed.top}px`,
        left: `${placed.left}px`,
        right: 'auto',
        zIndex: MENU_Z_INDEX,
        maxHeight: `${placed.maxHeight}px`,
        visibility: 'visible',
      })
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorEl, children, isOpen, useMobileSheet])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      if (anchorEl?.contains?.(event.target)) return
      onClose()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    const handleScroll = (event) => {
      if (useMobileSheet) return
      if (isScrollInsideMenu(event, panelRef.current)) return
      onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    if (useMobileSheet) {
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      return () => {
        document.removeEventListener('pointerdown', handlePointerDown)
        document.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('scroll', handleScroll, true)
        document.body.style.overflow = previousOverflow
      }
    }

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [anchorEl, isOpen, onClose, useMobileSheet])

  if (!isOpen) return null

  if (useMobileSheet) {
    if (typeof document === 'undefined') return null

    return createPortal(
      <>
        <button
          type="button"
          className="schedule-card-action-menu-backdrop is-sheet"
          aria-label="Close menu"
          onClick={onClose}
          style={{ zIndex: MENU_Z_INDEX - 1 }}
        />
        <div
          ref={panelRef}
          className="schedule-card-action-menu-sheet"
          onClick={(event) => event.stopPropagation()}
          role="menu"
          style={{ zIndex: MENU_Z_INDEX }}
        >
          <div className="schedule-card-action-menu-sheet-list">
            {children}
          </div>
        </div>
      </>,
      document.body,
    )
  }

  if (!anchorEl || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      className={`${className} schedule-card-action-menu-portal`}
      data-placement={fixedStyle ? placement : undefined}
      onClick={(event) => event.stopPropagation()}
      role="menu"
      style={fixedStyle ?? {
        position: 'fixed',
        top: 0,
        left: 0,
        visibility: 'hidden',
        zIndex: MENU_Z_INDEX,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

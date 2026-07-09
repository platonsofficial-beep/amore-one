import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { shouldUseMobileShell } from '../../lib/viewportUtils'

const MENU_Z_INDEX = 1300
const MENU_MARGIN = 8
const MOBILE_BOTTOM_RESERVE_PX = 56

function getViewportBounds() {
  const viewport = window.visualViewport
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  const offsetTop = viewport?.offsetTop ?? 0
  const offsetLeft = viewport?.offsetLeft ?? 0

  return {
    width,
    height,
    offsetTop,
    offsetLeft,
    bottomReserve: shouldUseMobileShell()
      ? MOBILE_BOTTOM_RESERVE_PX
      : MENU_MARGIN,
  }
}

function hasValidAnchorRect(anchorEl) {
  if (!anchorEl?.getBoundingClientRect) return false
  const rect = anchorEl.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function computeMenuPosition(anchorRect, menuWidth, menuHeight) {
  const {
    width: viewportWidth,
    height: viewportHeight,
    offsetTop,
    offsetLeft,
    bottomReserve,
  } = getViewportBounds()

  let left = anchorRect.right - menuWidth
  let top = anchorRect.bottom + MENU_MARGIN
  let placement = 'below'

  const minLeft = offsetLeft + MENU_MARGIN
  const maxLeft = offsetLeft + viewportWidth - menuWidth - MENU_MARGIN
  left = Math.max(minLeft, Math.min(left, maxLeft))

  const maxBottom = offsetTop + viewportHeight - bottomReserve
  if (top + menuHeight > maxBottom) {
    top = anchorRect.top - menuHeight - MENU_MARGIN
    placement = 'above'
  }

  const minTop = offsetTop + MENU_MARGIN
  top = Math.max(minTop, top)

  return { top, left, placement }
}

export function ScheduleCardActionMenu({
  isOpen,
  onClose,
  anchorEl = null,
  className = 'template-card-menu',
  children,
}) {
  const panelRef = useRef(null)
  const usePortal = isOpen && shouldUseMobileShell()
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const [isPositioned, setIsPositioned] = useState(false)

  useLayoutEffect(() => {
    if (!isOpen || !usePortal || !hasValidAnchorRect(anchorEl) || !panelRef.current) {
      setIsPositioned(false)
      return undefined
    }

    const anchorRect = anchorEl.getBoundingClientRect()
    const { width, height } = panelRef.current.getBoundingClientRect()
    setPosition(computeMenuPosition(anchorRect, width, height))
    setIsPositioned(true)
    return undefined
  }, [anchorEl, children, isOpen, usePortal])

  useEffect(() => {
    if (!isOpen) return undefined

    const updatePosition = () => {
      if (!usePortal || !hasValidAnchorRect(anchorEl) || !panelRef.current) return
      const anchorRect = anchorEl.getBoundingClientRect()
      const { width, height } = panelRef.current.getBoundingClientRect()
      setPosition(computeMenuPosition(anchorRect, width, height))
      setIsPositioned(true)
    }

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

    const handleScroll = () => onClose()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('scroll', updatePosition)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.visualViewport?.removeEventListener('resize', updatePosition)
      window.visualViewport?.removeEventListener('scroll', updatePosition)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [anchorEl, isOpen, onClose, usePortal])

  if (!isOpen) return null
  if (usePortal && !hasValidAnchorRect(anchorEl)) return null

  const menuPanel = (
    <div
      ref={panelRef}
      className={`${className}${usePortal ? ' schedule-card-action-menu-portal' : ''}`}
      onClick={(event) => event.stopPropagation()}
      role="menu"
      style={usePortal ? {
        position: 'fixed',
        top: isPositioned ? `${position.top}px` : '-10000px',
        left: isPositioned ? `${position.left}px` : '-10000px',
        visibility: isPositioned ? 'visible' : 'hidden',
        zIndex: MENU_Z_INDEX,
      } : undefined}
    >
      {children}
    </div>
  )

  if (!usePortal) {
    return menuPanel
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {isPositioned ? (
        <button
          type="button"
          className="schedule-card-action-menu-backdrop"
          aria-label="Close menu"
          onClick={onClose}
          style={{ zIndex: MENU_Z_INDEX - 1 }}
        />
      ) : null}
      {menuPanel}
    </>,
    document.body,
  )
}

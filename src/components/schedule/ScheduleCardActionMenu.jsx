import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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

    const handleScroll = () => {
      if (!useMobileSheet) onClose()
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

  return (
    <div
      ref={panelRef}
      className={className}
      onClick={(event) => event.stopPropagation()}
      role="menu"
    >
      {children}
    </div>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getHostStationStatusMenuOptions,
  normalizeReservationStatus,
} from '../../../lib/reservationHostStatus'

const MENU_MARGIN = 8
const MENU_Z_INDEX = 12000

function computeMenuPosition(anchorRect, menuWidth, menuHeight) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = anchorRect.left
  let top = anchorRect.bottom + MENU_MARGIN
  let placement = 'below'

  if (left + menuWidth > viewportWidth - MENU_MARGIN) {
    left = Math.max(MENU_MARGIN, anchorRect.right - menuWidth)
  }
  left = Math.max(MENU_MARGIN, left)

  if (top + menuHeight > viewportHeight - MENU_MARGIN) {
    top = anchorRect.top - menuHeight - MENU_MARGIN
    placement = 'above'
  }
  top = Math.max(MENU_MARGIN, top)

  return { top, left, placement }
}

export function MobileHostReservationStatusMenu({
  reservation,
  currentStatusId,
  anchorRect,
  isOpen,
  onClose,
  onSelectStatus,
  isSaving = false,
}) {
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const [isPositioned, setIsPositioned] = useState(false)
  const options = getHostStationStatusMenuOptions()
  const normalizedCurrent = normalizeReservationStatus(currentStatusId ?? reservation?.status)

  useLayoutEffect(() => {
    if (!isOpen || !anchorRect || !panelRef.current) {
      setIsPositioned(false)
      return
    }

    const { width, height } = panelRef.current.getBoundingClientRect()
    setPosition(computeMenuPosition(anchorRect, width, height))
    setIsPositioned(true)
  }, [anchorRect, isOpen, currentStatusId])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      onClose()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    const handleScroll = (event) => {
      if (panelRef.current?.contains(event.target)) return
      onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen, onClose])

  if (!isOpen || !reservation || !anchorRect || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="mobile-host-status-menu-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className={`mobile-host-status-menu is-${position.placement}${isPositioned ? ' is-positioned' : ''}${isSaving ? ' is-saving' : ''}`}
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: MENU_Z_INDEX,
        }}
        role="dialog"
        aria-label={`Change status for ${reservation.guestName ?? 'guest'}`}
        aria-busy={isSaving}
        onClick={(event) => event.stopPropagation()}
      >
        <ul className="mobile-host-status-menu-list" role="listbox" aria-label="Reservation status">
          {options.map((option) => {
            const isActive = normalizeReservationStatus(option.status) === normalizedCurrent
            return (
              <li key={option.status} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`mobile-host-status-menu-option tone-${option.tone}${isActive ? ' is-active' : ''}`}
                  disabled={isSaving}
                  onClick={() => {
                    if (isActive) {
                      onClose()
                      return
                    }
                    onSelectStatus(reservation, option.status)
                  }}
                >
                  <span className={`mobile-host-status-menu-dot tone-${option.tone}`} aria-hidden="true" />
                  <span className="mobile-host-status-menu-label">{option.menuLabel}</span>
                  {isActive ? <span className="mobile-host-status-menu-check" aria-hidden="true">✓</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </>,
    document.body,
  )
}

export function MobileHostReservationRowMenu({
  reservation,
  anchorRect,
  isOpen,
  onClose,
  onEdit,
  isSaving = false,
}) {
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const [isPositioned, setIsPositioned] = useState(false)

  useLayoutEffect(() => {
    if (!isOpen || !anchorRect || !panelRef.current) {
      setIsPositioned(false)
      return
    }

    const { width, height } = panelRef.current.getBoundingClientRect()
    setPosition(computeMenuPosition(anchorRect, width, height))
    setIsPositioned(true)
  }, [anchorRect, isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      onClose()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !reservation || !anchorRect || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="mobile-host-status-menu-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className={`mobile-host-row-menu is-${position.placement}${isPositioned ? ' is-positioned' : ''}`}
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: MENU_Z_INDEX,
        }}
        role="menu"
        aria-label="Reservation actions"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          className="mobile-host-row-menu-option"
          disabled={isSaving}
          onClick={() => {
            onEdit?.(reservation)
            onClose()
          }}
        >
          Edit reservation
        </button>
      </div>
    </>,
    document.body,
  )
}

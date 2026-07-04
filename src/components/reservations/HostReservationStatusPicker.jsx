import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HOST_RESERVATION_STATUSES, getHostStatusMeta } from '../../lib/reservationHostStatus'

const PICKER_MARGIN = 10
const PICKER_Z_INDEX = 12000

function computePickerPosition(anchorRect, pickerWidth, pickerHeight) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = anchorRect.left
  let top = anchorRect.bottom + PICKER_MARGIN

  if (left + pickerWidth > viewportWidth - PICKER_MARGIN) {
    left = viewportWidth - pickerWidth - PICKER_MARGIN
  }
  left = Math.max(PICKER_MARGIN, left)

  if (top + pickerHeight > viewportHeight - PICKER_MARGIN) {
    top = anchorRect.top - pickerHeight - PICKER_MARGIN
  }
  top = Math.max(PICKER_MARGIN, top)

  return { top, left }
}

export function HostReservationStatusPicker({
  reservation,
  currentStatusId,
  anchorRect,
  isOpen,
  onClose,
  onSelectStatus,
  isSaving = false,
}) {
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const currentStatus = getHostStatusMeta(currentStatusId ?? reservation?.status)

  useLayoutEffect(() => {
    if (!isOpen || !anchorRect || !panelRef.current) return

    const { width, height } = panelRef.current.getBoundingClientRect()
    setPosition(computePickerPosition(anchorRect, width, height))
  }, [anchorRect, isOpen, currentStatusId])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      onClose()
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    const handleReposition = () => {
      if (!anchorRect || !panelRef.current) return
      const { width, height } = panelRef.current.getBoundingClientRect()
      setPosition(computePickerPosition(anchorRect, width, height))
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [anchorRect, isOpen, onClose])

  if (!isOpen || !reservation || !anchorRect || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        className="host-status-picker-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="host-status-picker is-portal"
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: PICKER_Z_INDEX,
        }}
        role="dialog"
        aria-label={`Change status for ${reservation.guestName ?? 'guest'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="host-status-picker-header">
          <span className="host-status-picker-title">Change status</span>
          <button
            type="button"
            className="host-status-picker-close"
            aria-label="Close status picker"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div
          className="host-status-picker-list"
          role="listbox"
          aria-activedescendant={`host-status-${currentStatus.id}`}
        >
          {HOST_RESERVATION_STATUSES.map((status) => {
            const isActive = status.id === currentStatus.id

            return (
              <button
                key={status.id}
                id={`host-status-${status.id}`}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`host-status-picker-option tone-${status.tone}${isActive ? ' is-active' : ''}`}
                disabled={isSaving}
                onClick={() => {
                  if (isActive) {
                    onClose()
                    return
                  }
                  onSelectStatus(reservation, status.id)
                }}
              >
                <span className={`host-status-picker-icon tone-${status.tone}`} aria-hidden="true">
                  {status.icon}
                </span>
                <span className="host-status-picker-label">{status.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>,
    document.body,
  )
}

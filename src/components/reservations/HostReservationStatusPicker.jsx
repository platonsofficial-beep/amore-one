import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  HOST_LIST_GROUP_DEFS,
  HOST_RESERVATION_STATUSES,
  getHostStatusMeta,
} from '../../lib/reservationHostStatus'

const PICKER_MARGIN = 10
const PICKER_Z_INDEX = 12000

export function computePickerPosition(anchorRect, pickerWidth, pickerHeight) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const clampTop = (value) => Math.max(
    PICKER_MARGIN,
    Math.min(value, viewportHeight - pickerHeight - PICKER_MARGIN),
  )

  const fitsBelow = anchorRect.bottom + PICKER_MARGIN + pickerHeight <= viewportHeight - PICKER_MARGIN
  const fitsAbove = anchorRect.top - PICKER_MARGIN - pickerHeight >= PICKER_MARGIN

  // Short screens (phone landscape): open beside the card instead of on top
  // of it when there is room to the right (Platon t447u).
  if (!fitsBelow && !fitsAbove && anchorRect.right + PICKER_MARGIN + pickerWidth <= viewportWidth - PICKER_MARGIN) {
    return {
      top: clampTop(anchorRect.top + anchorRect.height / 2 - pickerHeight / 2),
      left: anchorRect.right + PICKER_MARGIN,
      placement: 'beside',
    }
  }

  let left = anchorRect.left
  let top = anchorRect.bottom + PICKER_MARGIN
  let placement = 'below'

  if (left + pickerWidth > viewportWidth - PICKER_MARGIN) {
    left = Math.max(PICKER_MARGIN, anchorRect.right - pickerWidth)
  }
  left = Math.max(PICKER_MARGIN, left)

  if (!fitsBelow) {
    top = anchorRect.top - pickerHeight - PICKER_MARGIN
    placement = 'above'
  }
  top = clampTop(top)

  return { top, left, placement }
}

function buildStatusGroups() {
  return HOST_LIST_GROUP_DEFS.map((group) => ({
    ...group,
    statuses: HOST_RESERVATION_STATUSES.filter((status) => status.groupId === group.id),
  }))
}

export function HostReservationStatusPicker({
  reservation,
  currentStatusId,
  anchorRect,
  anchorLabel = '',
  isOpen,
  onClose,
  onSelectStatus,
  isSaving = false,
  variant = 'popover',
}) {
  const isSheet = variant === 'sheet'
  const panelRef = useRef(null)
  const activeOptionRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const [isPositioned, setIsPositioned] = useState(false)
  const statusGroups = useMemo(() => buildStatusGroups(), [])
  const currentStatus = getHostStatusMeta(currentStatusId ?? reservation?.status)

  useLayoutEffect(() => {
    if (!isOpen || !anchorRect || !panelRef.current) {
      setIsPositioned(false)
      return
    }

    if (!isSheet) {
      const { width, height } = panelRef.current.getBoundingClientRect()
      setPosition(computePickerPosition(anchorRect, width, height))
    }
    setIsPositioned(true)

    activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
    activeOptionRef.current?.focus({ preventScroll: true })
  }, [anchorRect, isOpen, currentStatusId, isSheet])

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
        return
      }

      if (!panelRef.current) return

      const options = Array.from(
        panelRef.current.querySelectorAll('.host-status-picker-option:not(:disabled)'),
      )
      if (!options.length) return

      const activeIndex = options.findIndex((option) => option === document.activeElement)
      const moveFocus = (nextIndex) => {
        const clampedIndex = ((nextIndex % options.length) + options.length) % options.length
        options[clampedIndex]?.focus()
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(activeIndex === -1 ? 0 : activeIndex + 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(activeIndex === -1 ? options.length - 1 : activeIndex - 1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        options[0]?.focus()
      } else if (event.key === 'End') {
        event.preventDefault()
        options[options.length - 1]?.focus()
      }
    }

    const handleReposition = () => {
      if (isSheet || !anchorRect || !panelRef.current) return
      const { width, height } = panelRef.current.getBoundingClientRect()
      setPosition(computePickerPosition(anchorRect, width, height))
    }

    const handleScroll = (event) => {
      if (panelRef.current?.contains(event.target)) return
      onClose()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [anchorRect, isOpen, onClose, isSheet])

  if (!isOpen || !reservation || !anchorRect || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        className={`host-status-picker-backdrop${isSheet ? ' is-sheet' : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />
      {anchorLabel && !isSheet ? (
        <span
          className={`host-reservation-card-status-pill host-status-picker-anchor tone-${currentStatus.tone} is-compact`}
          style={{
            position: 'fixed',
            top: `${anchorRect.top}px`,
            left: `${anchorRect.left}px`,
            width: `${anchorRect.width}px`,
            height: `${anchorRect.height}px`,
            // Under the picker (t409u: "LATE 42M" sat on top of the options
            // in landscape), above the backdrop so it still shows beside it.
            zIndex: PICKER_Z_INDEX - 1,
            pointerEvents: 'none',
          }}
        >
          {anchorLabel}
        </span>
      ) : null}
      <div
        ref={panelRef}
        className={`host-status-picker is-portal is-${isSheet ? 'sheet' : position.placement}${isPositioned ? ' is-positioned' : ''}${isSaving ? ' is-saving' : ''}`}
        style={isSheet ? { position: 'fixed', zIndex: PICKER_Z_INDEX } : {
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: PICKER_Z_INDEX,
        }}
        role="dialog"
        aria-label={`Change status for ${reservation.guestName ?? 'guest'}`}
        aria-busy={isSaving}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="host-status-picker-header">
          <span className="host-status-picker-title">Change status</span>
          <button
            type="button"
            className="host-status-picker-close"
            aria-label="Close status picker"
            disabled={isSaving}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div
          className="host-status-picker-list"
          role="listbox"
          aria-label="Reservation statuses"
          aria-activedescendant={`host-status-${currentStatus.id}`}
        >
          {statusGroups.map((group) => (
            <section key={group.id} className="host-status-picker-group" aria-label={group.label}>
              <p className="host-status-picker-group-label">{group.label}</p>
              <div className="host-status-picker-group-items">
                {group.statuses.map((status) => {
                  const isActive = status.id === currentStatus.id

                  return (
                    <button
                      key={status.id}
                      ref={isActive ? activeOptionRef : null}
                      id={`host-status-${status.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`host-status-picker-option host-reservation-card-status-pill tone-${status.tone}${isActive ? ' is-active' : ''}`}
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
                      {isActive ? (
                        <span className="host-status-picker-check" aria-hidden="true">✓</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}

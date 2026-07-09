import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizeReservationDateKey } from '../../lib/timeFormatUtils'
import { HostWorkspaceDatePicker } from './HostWorkspaceDatePicker'
import { ReservationCalendarIcon } from './ReservationCalendarIcon'

const PICKER_Z_INDEX = 1250
const PICKER_WIDTH = 300

function computePickerPosition(anchorRect) {
  const viewportPadding = 16
  const pickerWidth = Math.min(PICKER_WIDTH, window.innerWidth - viewportPadding * 2)
  const maxLeft = window.innerWidth - pickerWidth - viewportPadding
  const preferredLeft = anchorRect.right - pickerWidth
  const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft))
  const top = anchorRect.bottom + 6
  const maxTop = window.innerHeight - viewportPadding
  const clampedTop = Math.min(top, maxTop)

  return {
    top: clampedTop,
    left,
    width: pickerWidth,
  }
}

export function ReservationDateField({
  value,
  onChange,
  todayKey = '',
  required = false,
  className = 'reservation-date-field',
  id,
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const normalizedValue = normalizeReservationDateKey(value)
  const workspaceTodayKey = normalizeReservationDateKey(todayKey) || normalizedValue
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickerPosition, setPickerPosition] = useState(null)
  const rootRef = useRef(null)
  const anchorRef = useRef(null)

  const updatePickerPosition = () => {
    if (!anchorRef.current) return
    setPickerPosition(computePickerPosition(anchorRef.current.getBoundingClientRect()))
  }

  useEffect(() => {
    if (!isPickerOpen) return undefined

    updatePickerPosition()

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('.reservation-date-field-picker-portal')) return
      setIsPickerOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsPickerOpen(false)
    }

    const handleReposition = () => updatePickerPosition()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [isPickerOpen])

  const openPicker = () => {
    setIsPickerOpen(true)
  }

  const closePicker = () => setIsPickerOpen(false)

  const handleSelectDate = (dateKey) => {
    onChange(normalizeReservationDateKey(dateKey))
    closePicker()
  }

  const pickerPortal = isPickerOpen && pickerPosition && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="reservation-date-field-picker-portal"
        style={{
          position: 'fixed',
          top: `${pickerPosition.top}px`,
          left: `${pickerPosition.left}px`,
          width: `${pickerPosition.width}px`,
          zIndex: PICKER_Z_INDEX,
        }}
      >
        <HostWorkspaceDatePicker
          selectedDateKey={normalizedValue || workspaceTodayKey}
          workspaceTodayKey={workspaceTodayKey}
          onSelectDate={handleSelectDate}
          onClose={closePicker}
        />
      </div>,
      document.body,
    )
    : null

  return (
    <div className={className} ref={rootRef}>
      <input
        id={fieldId}
        type="date"
        className={`${className}-input`}
        value={normalizedValue}
        readOnly
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPicker()
          }
        }}
        required={required}
        aria-haspopup="dialog"
        aria-expanded={isPickerOpen}
        aria-label="Reservation date"
      />

      <div className={`${className}-picker-anchor`} ref={anchorRef}>
        <button
          type="button"
          className={`${className}-calendar-btn`}
          onClick={openPicker}
          aria-haspopup="dialog"
          aria-expanded={isPickerOpen}
          aria-controls={isPickerOpen ? `${fieldId}-calendar` : undefined}
          aria-label="Open calendar to choose reservation date"
        >
          <ReservationCalendarIcon className={`${className}-calendar-icon`} />
        </button>
      </div>

      {pickerPortal}
    </div>
  )
}

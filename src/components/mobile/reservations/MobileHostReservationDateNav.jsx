import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { HostWorkspaceDatePicker } from '../../reservations/HostWorkspaceDatePicker'
import { ReservationCalendarIcon } from '../../reservations/ReservationCalendarIcon'
import { formatHostWorkspaceDateNavLabel } from '../../reservations/hostReservationListUtils'
import { normalizeReservationDateKey } from '../../../lib/timeFormatUtils'

export function MobileHostReservationDateNav({
  selectedDateKey = '',
  workspaceTodayKey = '',
  onSelectDate,
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const normalizedSelectedDateKey = normalizeReservationDateKey(selectedDateKey)
  const normalizedWorkspaceTodayKey = normalizeReservationDateKey(workspaceTodayKey) || normalizedSelectedDateKey
  const label = formatHostWorkspaceDateNavLabel(normalizedSelectedDateKey, normalizedWorkspaceTodayKey)

  useEffect(() => {
    if (!isPickerOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsPickerOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPickerOpen])

  const openPicker = () => {
    if (!onSelectDate) return
    setIsPickerOpen(true)
  }

  const closePicker = () => setIsPickerOpen(false)

  const handleSelectDate = (dateKey) => {
    onSelectDate?.(normalizeReservationDateKey(dateKey))
    closePicker()
  }

  const picker = isPickerOpen ? createPortal(
    <div
      className="mobile-host-date-picker-backdrop"
      onClick={closePicker}
      data-testid="mobile-host-date-picker"
    >
      <div
        className="mobile-host-date-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Choose reservation date"
        onClick={(event) => event.stopPropagation()}
      >
        <HostWorkspaceDatePicker
          selectedDateKey={normalizedSelectedDateKey || normalizedWorkspaceTodayKey}
          workspaceTodayKey={normalizedWorkspaceTodayKey}
          onSelectDate={handleSelectDate}
          onClose={closePicker}
        />
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <div className="mobile-host-sticky-date-nav">
        <button
          type="button"
          className="mobile-host-sticky-date-btn"
          onClick={openPicker}
          aria-haspopup="dialog"
          aria-expanded={isPickerOpen}
          aria-label={`${label}. Open calendar`}
          data-testid="mobile-host-date-label"
          disabled={!onSelectDate}
        >
          <time dateTime={normalizedSelectedDateKey}>{label}</time>
        </button>
        <button
          type="button"
          className="mobile-host-sticky-date-calendar-btn"
          onClick={openPicker}
          aria-haspopup="dialog"
          aria-expanded={isPickerOpen}
          aria-label="Open calendar"
          data-testid="mobile-host-date-calendar"
          disabled={!onSelectDate}
        >
          <ReservationCalendarIcon className="mobile-host-sticky-date-calendar-icon" />
        </button>
      </div>
      {picker}
    </>
  )
}

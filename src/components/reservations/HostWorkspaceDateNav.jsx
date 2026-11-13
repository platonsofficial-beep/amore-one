import { useEffect, useRef, useState } from 'react'
import { HostWorkspaceDatePicker } from './HostWorkspaceDatePicker'
import { ReservationCalendarIcon } from './ReservationCalendarIcon'
import { t } from '../../i18n/i18n'

export function HostWorkspaceDateNav({
  dateTime,
  label,
  workspaceTodayKey,
  isViewingToday,
  onPreviousDay,
  onNextDay,
  onGoToToday,
  onSelectDate,
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const pickerAnchorRef = useRef(null)

  useEffect(() => {
    if (!isPickerOpen) return undefined

    const handlePointerDown = (event) => {
      if (pickerAnchorRef.current?.contains(event.target)) return
      setIsPickerOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsPickerOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPickerOpen])

  const openPicker = () => setIsPickerOpen(true)
  const closePicker = () => setIsPickerOpen(false)

  return (
    <div className="host-workspace-date-nav" role="group" aria-label={t("Reservation date")}>
      <div className="host-workspace-date-nav-main">
        <button
          type="button"
          className="host-workspace-date-nav-btn"
          onClick={onPreviousDay}
          aria-label={t("Previous day")}
        >
          ‹
        </button>

        <div className="host-workspace-date-nav-picker-anchor" ref={pickerAnchorRef}>
          <button
            type="button"
            className="host-workspace-date-nav-label-btn"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-expanded={isPickerOpen}
            aria-label={`Selected date ${label}. Open calendar`}
          >
            <time className="host-workspace-date-nav-label" dateTime={dateTime}>
              {label}
            </time>
            <ReservationCalendarIcon className="host-workspace-date-nav-calendar-icon" />
          </button>

          {isPickerOpen ? (
            <HostWorkspaceDatePicker
              selectedDateKey={dateTime}
              workspaceTodayKey={workspaceTodayKey}
              onSelectDate={onSelectDate}
              onClose={closePicker}
            />
          ) : null}
        </div>

        <button
          type="button"
          className="host-workspace-date-nav-btn"
          onClick={onNextDay}
          aria-label={t("Next day")}
        >
          ›
        </button>
      </div>

      <button
        type="button"
        className="host-workspace-date-nav-today"
        onClick={onGoToToday}
        disabled={isViewingToday}
        aria-current={isViewingToday ? 'date' : undefined}
      >
        {t("Today")}
      </button>
    </div>
  )
}

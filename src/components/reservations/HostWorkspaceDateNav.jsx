import { useEffect, useRef, useState } from 'react'
import { HostWorkspaceDatePicker } from './HostWorkspaceDatePicker'

function CalendarIcon() {
  return (
    <svg
      className="host-workspace-date-nav-calendar-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 2v2M11 2v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

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
    <div className="host-workspace-date-nav" role="group" aria-label="Reservation date">
      <div className="host-workspace-date-nav-main">
        <button
          type="button"
          className="host-workspace-date-nav-btn"
          onClick={onPreviousDay}
          aria-label="Previous day"
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
            <CalendarIcon />
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
          aria-label="Next day"
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
        Today
      </button>
    </div>
  )
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  normalizeReservationTimeValue,
  snapTimeToQuarter,
} from '../../../lib/timeFormatUtils'

const TIME_TABS = [
  { id: 'morning', label: 'Morning', start: '07:00', end: '13:45', spansMidnight: false },
  { id: 'afternoon', label: 'Afternoon', start: '15:00', end: '19:45', spansMidnight: false },
  { id: 'night', label: 'Night', start: '20:00', end: '00:45', spansMidnight: true },
  { id: 'all-day', label: 'All Day', start: '07:00', end: '00:45', spansMidnight: true },
]

function parseTimeToMinutes(value) {
  const normalized = normalizeReservationTimeValue(value)
  if (!normalized) return null
  const [hours, minutes] = normalized.split(':').map(Number)
  return hours * 60 + minutes
}

function formatMinutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildTimeSlots(start, end, spansMidnight = false) {
  const startMinutes = parseTimeToMinutes(start)
  const endMinutes = parseTimeToMinutes(end)
  if (startMinutes === null || endMinutes === null) return []

  const slots = []

  if (!spansMidnight && endMinutes >= startMinutes) {
    for (let minute = startMinutes; minute <= endMinutes; minute += 15) {
      slots.push(formatMinutesToTime(minute))
    }
    return slots
  }

  for (let minute = startMinutes; minute < 24 * 60; minute += 15) {
    slots.push(formatMinutesToTime(minute))
  }
  for (let minute = 0; minute <= endMinutes; minute += 15) {
    slots.push(formatMinutesToTime(minute))
  }

  return slots
}

function isTimeInTabRange(time, tab) {
  const minutes = parseTimeToMinutes(time)
  if (minutes === null) return false

  const startMinutes = parseTimeToMinutes(tab.start)
  const endMinutes = parseTimeToMinutes(tab.end)
  if (startMinutes === null || endMinutes === null) return false

  if (!tab.spansMidnight) {
    return minutes >= startMinutes && minutes <= endMinutes
  }

  return minutes >= startMinutes || minutes <= endMinutes
}

function resolveInitialTab(time) {
  const normalized = snapTimeToQuarter(normalizeReservationTimeValue(time))
  if (!normalized) return 'all-day'

  const matchingTab = TIME_TABS.find(
    (tab) => tab.id !== 'all-day' && isTimeInTabRange(normalized, tab),
  )
  return matchingTab?.id ?? 'all-day'
}

const TAB_SLOTS = Object.fromEntries(
  TIME_TABS.map((tab) => [tab.id, buildTimeSlots(tab.start, tab.end, tab.spansMidnight)]),
)

export function HostQuickCreateTimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  disabled = false,
}) {
  const fieldId = useId()
  const panelRef = useRef(null)
  const normalizedValue = snapTimeToQuarter(normalizeReservationTimeValue(value))
  const [isOpen, setIsOpen] = useState(false)
  const [activeTabId, setActiveTabId] = useState('all-day')

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const activeSlots = useMemo(
    () => TAB_SLOTS[activeTabId] ?? TAB_SLOTS['all-day'],
    [activeTabId],
  )

  const openPicker = () => {
    if (disabled) return
    setActiveTabId(resolveInitialTab(normalizedValue))
    setIsOpen(true)
  }

  const closePicker = () => {
    setIsOpen(false)
  }

  const handleSelect = (time) => {
    onChange?.(normalizeReservationTimeValue(time))
    closePicker()
  }

  const picker = isOpen ? createPortal(
    <div
      className="host-quick-create-time-picker-backdrop"
      onClick={closePicker}
      data-testid="host-quick-create-time-picker"
    >
      <div
        ref={panelRef}
        className="host-quick-create-time-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-picker-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="host-quick-create-time-picker-header">
          <h3 id={`${fieldId}-picker-title`} className="host-quick-create-time-picker-title">
            Select time
          </h3>
        </header>

        <div className="host-quick-create-time-picker-tabs" role="tablist" aria-label="Time of day">
          {TIME_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTabId === tab.id}
              className={`host-quick-create-time-picker-tab${activeTabId === tab.id ? ' is-active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className="host-quick-create-time-picker-slots"
          role="listbox"
          aria-label={`${TIME_TABS.find((tab) => tab.id === activeTabId)?.label ?? 'All Day'} times`}
        >
          <div className="host-quick-create-time-picker-grid">
            {activeSlots.map((time) => (
              <button
                key={time}
                type="button"
                role="option"
                aria-selected={time === normalizedValue}
                className={`host-quick-create-time-picker-slot${time === normalizedValue ? ' is-selected' : ''}`}
                data-testid="host-quick-create-time-slot"
                onClick={() => handleSelect(time)}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        <footer className="host-quick-create-time-picker-footer">
          <button
            type="button"
            className="host-quick-create-time-picker-cancel"
            data-testid="host-quick-create-time-cancel"
            onClick={closePicker}
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        id={fieldId}
        type="button"
        className="host-quick-create-time-picker-trigger"
        data-testid="host-quick-create-time-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={openPicker}
      >
        <span className={normalizedValue ? '' : 'host-quick-create-time-picker-placeholder'}>
          {normalizedValue || placeholder}
        </span>
        <span className="host-quick-create-time-picker-chevron" aria-hidden="true">▾</span>
      </button>
      {picker}
    </>
  )
}

export function buildHostQuickCreateTimeTabSlots(tabId) {
  return TAB_SLOTS[tabId] ?? []
}

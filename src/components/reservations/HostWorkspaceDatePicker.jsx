import { useEffect, useMemo, useState } from 'react'
import {
  HOST_WORKSPACE_CALENDAR_WEEKDAY_LABELS,
  buildHostWorkspaceCalendarWeeks,
  formatHostWorkspaceMonthLabel,
  getHostWorkspaceMonthKey,
  shiftHostWorkspaceMonthKey,
} from './hostReservationListUtils'

export function HostWorkspaceDatePicker({
  selectedDateKey,
  workspaceTodayKey,
  onSelectDate,
  onClose,
}) {
  const [viewMonthKey, setViewMonthKey] = useState(() => getHostWorkspaceMonthKey(selectedDateKey))

  useEffect(() => {
    setViewMonthKey(getHostWorkspaceMonthKey(selectedDateKey))
  }, [selectedDateKey])

  const weeks = useMemo(
    () => buildHostWorkspaceCalendarWeeks(viewMonthKey, selectedDateKey, workspaceTodayKey),
    [viewMonthKey, selectedDateKey, workspaceTodayKey],
  )

  const handleSelectDay = (dateKey) => {
    onSelectDate(dateKey)
    onClose()
  }

  return (
    <div className="host-workspace-date-picker" role="dialog" aria-label="Choose reservation date">
      <div className="host-workspace-date-picker-header">
        <button
          type="button"
          className="host-workspace-date-picker-month-btn"
          onClick={() => setViewMonthKey((current) => shiftHostWorkspaceMonthKey(current, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="host-workspace-date-picker-month-label">
          {formatHostWorkspaceMonthLabel(viewMonthKey)}
        </span>
        <button
          type="button"
          className="host-workspace-date-picker-month-btn"
          onClick={() => setViewMonthKey((current) => shiftHostWorkspaceMonthKey(current, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="host-workspace-date-picker-weekdays" aria-hidden="true">
        {HOST_WORKSPACE_CALENDAR_WEEKDAY_LABELS.map((label) => (
          <span key={label} className="host-workspace-date-picker-weekday">{label}</span>
        ))}
      </div>

      <div className="host-workspace-date-picker-grid">
        {weeks.map((week) => (
          <div key={week[0]?.dateKey ?? week.map((cell) => cell.dateKey).join('-')} className="host-workspace-date-picker-row">
            {week.map((cell) => (
              <button
                key={cell.dateKey}
                type="button"
                className={[
                  'host-workspace-date-picker-day',
                  cell.inMonth ? '' : 'is-outside',
                  cell.isSelected ? 'is-selected' : '',
                  cell.isToday ? 'is-today' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleSelectDay(cell.dateKey)}
                aria-label={cell.dateKey}
                aria-current={cell.isSelected ? 'date' : undefined}
              >
                {cell.day}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

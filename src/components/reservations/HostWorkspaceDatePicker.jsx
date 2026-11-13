import { useEffect, useMemo, useState } from 'react'
import { normalizeReservationDateKey } from '../../lib/timeFormatUtils'
import {
  HOST_WORKSPACE_CALENDAR_WEEKDAY_LABELS,
  buildHostWorkspaceCalendarWeeks,
  formatHostWorkspaceMonthLabel,
  getHostWorkspaceMonthKey,
  shiftHostWorkspaceMonthKey,
} from './hostReservationListUtils'
import { t } from '../../i18n/i18n'

export function HostWorkspaceDatePicker({
  selectedDateKey,
  workspaceTodayKey,
  minDateKey = '',
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

  const normalizedTodayKey = normalizeReservationDateKey(workspaceTodayKey)

  // Days before minDateKey (e.g. past days for a new booking) can't be picked.
  const normalizedMinDateKey = normalizeReservationDateKey(minDateKey)
  const isBeforeMin = (dateKey) => Boolean(normalizedMinDateKey) && dateKey < normalizedMinDateKey

  const handleSelectDay = (dateKey) => {
    if (isBeforeMin(dateKey)) return
    onSelectDate(dateKey)
    onClose?.()
  }

  const handleSelectToday = () => {
    if (!normalizedTodayKey) return
    handleSelectDay(normalizedTodayKey)
  }

  return (
    <div className="host-workspace-date-picker" role="dialog" aria-label={t("Choose reservation date")}>
      <div className="host-workspace-date-picker-header">
        <button
          type="button"
          className="host-workspace-date-picker-month-btn"
          onClick={() => setViewMonthKey((current) => shiftHostWorkspaceMonthKey(current, -1))}
          aria-label={t("Previous month")}
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
          aria-label={t("Next month")}
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
                  isBeforeMin(cell.dateKey) ? 'is-disabled' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleSelectDay(cell.dateKey)}
                disabled={isBeforeMin(cell.dateKey)}
                aria-label={cell.dateKey}
                aria-current={cell.isSelected ? 'date' : undefined}
              >
                {cell.day}
              </button>
            ))}
          </div>
        ))}
      </div>

      <footer className="host-workspace-date-picker-footer">
        <button
          type="button"
          className="host-workspace-date-picker-footer-btn"
          onClick={onClose}
          data-testid="host-workspace-date-picker-cancel"
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="host-workspace-date-picker-footer-btn"
          onClick={handleSelectToday}
          disabled={!normalizedTodayKey}
          data-testid="host-workspace-date-picker-today"
        >
          {t("Today")}
        </button>
      </footer>
    </div>
  )
}

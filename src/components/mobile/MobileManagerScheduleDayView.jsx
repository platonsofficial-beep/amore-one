import { useMemo, useState } from 'react'
import { HourMinuteField } from '../HourMinuteField'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { portraitShiftSubtitle } from '../../lib/managerPortrait'
import { addCalendarDays, formatScheduleDayHeader } from '../../lib/weekUtils'
import { ManagerPortraitBanner } from './ManagerPortraitBanner'

function shiftDateKey(shift) {
  return `${shift?.date ?? ''}`.slice(0, 10)
}

function shiftMinutes(value) {
  const match = `${value ?? ''}`.trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return (Number(match[1]) * 60) + Number(match[2])
}

export function MobileManagerScheduleDayView({
  shifts = [],
  employees = [],
  dateKey = '',
  todayKey = '',
  isLoading = false,
  isSaving = false,
  canEdit = false,
  noticeMessage = '',
  onDateChange,
  onUpdateShiftTimes,
}) {
  const [editingId, setEditingId] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const dayLabel = formatScheduleDayHeader(dateKey)
  const isToday = Boolean(todayKey) && dateKey === todayKey

  const employeeNames = useMemo(() => {
    const names = new Map()
    ;(employees ?? []).forEach((employee) => {
      const id = `${employee?.id ?? ''}`.trim()
      if (!id) return
      names.set(id, `${employee.name ?? employee.fullName ?? employee.full_name ?? ''}`.trim())
    })
    return names
  }, [employees])

  const dayShifts = useMemo(() => (
    (shifts ?? [])
      .filter((shift) => shiftDateKey(shift) === dateKey)
      .slice()
      .sort((left, right) => {
        const timeDiff = shiftMinutes(left.startTime) - shiftMinutes(right.startTime)
        if (timeDiff !== 0) return timeDiff
        return `${left.employeeName ?? ''}`.localeCompare(`${right.employeeName ?? ''}`)
      })
  ), [shifts, dateKey])

  const shiftDate = (days) => {
    setEditingId('')
    setErrorMessage('')
    onDateChange?.(addCalendarDays(dateKey, days))
  }

  const openEditor = (shift) => {
    if (!canEdit) return
    setEditingId(`${shift.id}`)
    setStartTime(`${shift.startTime ?? ''}`.slice(0, 5))
    setEndTime(`${shift.endTime ?? ''}`.slice(0, 5))
    setErrorMessage('')
  }

  const saveShift = async (shift) => {
    setErrorMessage('')
    try {
      await onUpdateShiftTimes?.(shift.id, { startTime, endTime })
      setEditingId('')
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to update this shift.')
    }
  }

  return (
    <div className="mobile-screen manager-portrait-schedule">
      <ManagerPortraitBanner area="schedule" />
      <header className="manager-portrait-screen-header">
        <div>
          <p className="mobile-screen-eyebrow">Schedule</p>
          <h1>{dayLabel.weekdayLabel}</h1>
          <p className="manager-portrait-date-label">{dayLabel.calendarLabel}</p>
        </div>
      </header>
      <div className="manager-portrait-date-nav" aria-label="Schedule day">
        <button type="button" onClick={() => shiftDate(-1)} aria-label="Previous day">‹</button>
        <button
          type="button"
          onClick={() => {
            setEditingId('')
            onDateChange?.(todayKey)
          }}
          disabled={!todayKey || isToday}
        >
          Today
        </button>
        <button type="button" onClick={() => shiftDate(1)} aria-label="Next day">›</button>
      </div>
      {noticeMessage ? <p className="manager-portrait-notice" role="status">{noticeMessage}</p> : null}
      {errorMessage ? <p className="manager-portrait-notice is-error" role="alert">{errorMessage}</p> : null}
      {isLoading ? <p className="manager-portrait-empty">Loading shifts…</p> : null}
      {!isLoading && dayShifts.length === 0 ? (
        <p className="manager-portrait-empty">No shifts on this day.</p>
      ) : null}
      <ul className="manager-portrait-shift-list">
        {dayShifts.map((shift) => {
          const name = `${shift.employeeName ?? ''}`.trim()
            || employeeNames.get(`${shift.employeeId ?? ''}`)
            || 'Unassigned'
          const isEditing = editingId === `${shift.id}`
          return (
            <li key={shift.id} className="manager-portrait-shift">
              <button
                type="button"
                className="manager-portrait-shift-summary"
                onClick={() => openEditor(shift)}
                disabled={!canEdit}
                aria-expanded={canEdit ? isEditing : undefined}
              >
                <span className="manager-portrait-reservation-time">
                  {formatTime24(shift.startTime, '—')}–{formatTime24(shift.endTime, '—')}
                </span>
                <span className="manager-portrait-reservation-copy">
                  <strong>{name}</strong>
                  <span>{portraitShiftSubtitle(shift)}</span>
                </span>
              </button>
              {isEditing ? (
                <div className="manager-portrait-shift-editor">
                  <HourMinuteField
                    value={startTime}
                    onChange={setStartTime}
                    ariaLabel="Start time"
                    allowEmpty={false}
                  />
                  <HourMinuteField
                    value={endTime}
                    onChange={setEndTime}
                    ariaLabel="End time"
                    allowEmpty={false}
                  />
                  <div className="manager-portrait-shift-actions">
                    <button type="button" className="mobile-secondary-btn" onClick={() => setEditingId('')} disabled={isSaving}>
                      Cancel
                    </button>
                    <button type="button" className="mobile-primary-btn" onClick={() => saveShift(shift)} disabled={isSaving}>
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

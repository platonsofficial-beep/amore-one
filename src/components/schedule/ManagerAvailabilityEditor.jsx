import { EMPLOYEE_AVAILABILITY_DAYS, EMPLOYEE_AVAILABILITY_STATUS } from '../../lib/employeeAvailabilityUtils'
import { useEscapeToClose } from '../../lib/useEscapeToClose'

const DAY_LABELS = Object.freeze({
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
})

const STATUS_OPTIONS = Object.freeze([
  EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE,
  EMPLOYEE_AVAILABILITY_STATUS.PREFERRED,
  EMPLOYEE_AVAILABILITY_STATUS.UNAVAILABLE,
])

function timeInputValue(value) {
  const raw = `${value ?? ''}`.trim()
  return raw ? raw.slice(0, 5) : ''
}

export function ManagerAvailabilityEditor({
  employeeName = '',
  weekLabel = '',
  week = null,
  isLoading = false,
  isSaving = false,
  error = '',
  onChangeDay,
  onSave,
  onClose,
}) {
  useEscapeToClose(() => onClose?.(), { enabled: !isSaving })
  const days = Array.isArray(week?.days) ? week.days : []

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal manager-availability-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-availability-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Staff availability</p>
            <h3 id="manager-availability-title">{employeeName || 'Employee'}</h3>
            {weekLabel ? <p className="staff-subtitle">{weekLabel}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close availability editor">✕</button>
        </div>

        {isLoading ? <p className="staff-subtitle">Loading availability…</p> : null}
        {error ? <div className="staff-status-banner" role="alert">{error}</div> : null}

        {!isLoading && days.length > 0 ? (
          <div className="manager-availability-days">
            {EMPLOYEE_AVAILABILITY_DAYS.map((dayOfWeek) => {
              const entry = days.find((day) => day.dayOfWeek === dayOfWeek)
              if (!entry) return null

              return (
                <section key={dayOfWeek} className="manager-availability-day">
                  <h4>{DAY_LABELS[dayOfWeek]}</h4>
                  <div className="manager-availability-status-row" role="group" aria-label={`${DAY_LABELS[dayOfWeek]} status`}>
                    {STATUS_OPTIONS.map((status) => (
                      <button
                        key={status.key}
                        type="button"
                        className={`manager-availability-status${entry.status === status.key ? ' is-selected' : ''}`}
                        aria-pressed={entry.status === status.key}
                        onClick={() => onChangeDay?.(dayOfWeek, { status: status.key })}
                        disabled={isSaving}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                  <div className="manager-availability-times">
                    <label>
                      <span>From</span>
                      <input
                        type="time"
                        value={timeInputValue(entry.startTime)}
                        onChange={(event) => onChangeDay?.(dayOfWeek, { startTime: event.target.value })}
                        disabled={isSaving}
                      />
                    </label>
                    <label>
                      <span>To</span>
                      <input
                        type="time"
                        value={timeInputValue(entry.endTime)}
                        onChange={(event) => onChangeDay?.(dayOfWeek, { endTime: event.target.value })}
                        disabled={isSaving}
                      />
                    </label>
                  </div>
                  <label className="manager-availability-note">
                    <span>Note</span>
                    <input
                      type="text"
                      value={entry.note ?? ''}
                      onChange={(event) => onChangeDay?.(dayOfWeek, { note: event.target.value })}
                      disabled={isSaving}
                    />
                  </label>
                </section>
              )
            })}
          </div>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type="button" className="primary-btn" onClick={onSave} disabled={isLoading || isSaving || !week}>
            {isSaving ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </div>
    </div>
  )
}

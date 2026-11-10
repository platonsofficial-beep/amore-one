import {
  buildSeatingFormDefaults,
  DAY_OF_WEEK_OPTIONS,
  formatSeatingDaysLabel,
  normalizeReservationSeating,
} from '../../lib/reservationSeatings'
import { normalizeReservationAutoCloseTime } from '../../lib/reservationAutoClose'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  readHostDiningTimerDurationPolicy,
  writeHostDiningTimerDurationPolicy,
} from '../../lib/hostDiningTimer'
import { ReservationTimeSelect } from '../reservations/ReservationTimeSelect'
import { useEscapeToClose } from '../../lib/useEscapeToClose'

function HostDiningTimerSettings() {
  const [policy, setPolicy] = useState(() => readHostDiningTimerDurationPolicy())

  const update = (key, value) => {
    setPolicy(writeHostDiningTimerDurationPolicy({ ...policy, [key]: value }))
  }

  return (
    <div className="panel staff-panel workspace-panel" data-testid="host-dining-timer-settings">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Service pace</p>
          <h3>Table timers</h3>
        </div>
      </div>
      <p className="workspace-section-subtitle">
        Minutes before a seated dinner or drinks party is expected to free the table. Saved on this device. A venue-wide save needs a database change and owner approval.
      </p>
      <div className="employee-form">
        <label className="form-field">
          <span>Dinner minutes</span>
          <input
            type="number"
            min="15"
            max="1440"
            value={policy.dinner}
            data-testid="host-timer-dinner-minutes"
            onChange={(event) => update('dinner', event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Drinks minutes</span>
          <input
            type="number"
            min="15"
            max="1440"
            value={policy.drinks}
            data-testid="host-timer-drinks-minutes"
            onChange={(event) => update('drinks', event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

function SeatingDaysToggle({ daysOfWeek, onChange }) {
  return (
    <div className="workspace-seating-days" role="group" aria-label="Days of week">
      {DAY_OF_WEEK_OPTIONS.map((day) => {
        const isActive = daysOfWeek.includes(day.value)
        return (
          <button
            key={day.value}
            type="button"
            className={`workspace-seating-day-chip${isActive ? ' is-active' : ''}`}
            aria-pressed={isActive}
            onClick={() => {
              const next = isActive
                ? daysOfWeek.filter((entry) => entry !== day.value)
                : [...daysOfWeek, day.value].sort((left, right) => left - right)
              onChange(next.length > 0 ? next : [day.value])
            }}
          >
            {day.label}
          </button>
        )
      })}
    </div>
  )
}

function readableSeatingNotice(message) {
  const text = `${message ?? ''}`.trim()
  if (!text) return ''
  if (/cannot read propert|of null|of undefined|reading ['"]/i.test(text)) {
    return "Couldn't load seating hours."
  }
  return text
}

export function WorkspaceReservationSeatingsSection({
  seatings = [],
  isLoading = false,
  noticeMessage = '',
  form,
  isSaving = false,
  editingSeatingId = null,
  onFormChange,
  onSubmit,
  onStartEdit,
  onCancelEdit,
  onRequestDelete,
  onMoveSeating,
  onToggleActive,
  autoCloseTime = '',
  onAutoCloseTimeChange,
  onSaveAutoClose,
  isSavingAutoClose = false,
  autoCloseNotice = '',
  hoursOnly = false,
  canEdit = true,
}) {
  const showAutoClose = !hoursOnly && typeof onAutoCloseTimeChange === 'function'
  const showEditActions = canEdit && typeof onStartEdit === 'function'
  const autoCloseNoticeIsError = Boolean(
    autoCloseNotice && !/saved|updated|success|applied/i.test(autoCloseNotice),
  )
  const visibleNotice = hoursOnly ? readableSeatingNotice(noticeMessage) : `${noticeMessage ?? ''}`.trim()
  useEscapeToClose(() => onCancelEdit?.(), {
    enabled: Boolean(hoursOnly && editingSeatingId),
  })

  const editForm = showEditActions && (!hoursOnly || editingSeatingId) ? (
    <div className="panel staff-panel workspace-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Manage seatings</p>
          <h3 id={hoursOnly ? 'seating-hours-editor-title' : undefined}>{editingSeatingId ? 'Edit seating' : 'Add seating'}</h3>
        </div>
      </div>

      <form className="employee-form" onSubmit={onSubmit}>
        <div className="seating-hours-editor-fields">
        <div className="form-grid">
          <label className="form-field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(event) => onFormChange({ ...form, name: event.target.value })}
              placeholder="e.g. Dinner 1"
              required
            />
          </label>
          <label className="form-field">
            <span>Start time</span>
            <ReservationTimeSelect
              value={form.startTime}
              onChange={(startTime) => onFormChange({ ...form, startTime })}
              required
            />
          </label>
          <label className="form-field">
            <span>Duration (minutes)</span>
            <input
              type="number"
              min="15"
              max="480"
              step="15"
              value={form.durationMinutes}
              onChange={(event) => onFormChange({
                ...form,
                durationMinutes: Math.max(15, Number(event.target.value) || 120),
              })}
              required
            />
          </label>
          <label className="form-field">
            <span>Status</span>
            <select
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) => onFormChange({
                ...form,
                isActive: event.target.value === 'active',
              })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="form-field full-width">
          <span>Days of week</span>
          <SeatingDaysToggle
            daysOfWeek={form.daysOfWeek}
            onChange={(daysOfWeek) => onFormChange({ ...form, daysOfWeek })}
          />
        </div>
        </div>

        <div className="modal-actions">
          {editingSeatingId ? (
            <button type="button" className="ghost-btn workspace-action-btn" onClick={onCancelEdit}>
              Cancel edit
            </button>
          ) : null}
          <button type="submit" className="primary-btn workspace-action-btn" disabled={isSaving}>
            {isSaving ? 'Saving…' : editingSeatingId ? 'Update seating' : 'Add seating'}
          </button>
        </div>
      </form>
    </div>
  ) : null

  const hoursList = (
    <div className="panel staff-panel workspace-panel" data-testid="seating-hours-list">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{hoursOnly ? 'Seating hours' : 'Seating list'}</p>
          <h3>{seatings.length} seating{seatings.length === 1 ? '' : 's'}</h3>
        </div>
      </div>

      {seatings.length === 0 && !isLoading ? (
        <div className="schedule-empty-state">
          <h4>No seatings configured.</h4>
          <p>Add your first service seating to power table availability.</p>
        </div>
      ) : (
        <div className="positions-list workspace-seatings-list">
          {seatings.map((seating, index) => {
            const normalized = normalizeReservationSeating(seating)
            if (!normalized) return null

            return (
              <article
                key={normalized.id}
                className={`position-row workspace-seating-row${normalized.isActive ? '' : ' is-inactive'}`}
              >
                <div>
                  <strong>{normalized.name}</strong>
                  <p>
                    {normalized.startTime}
                    {' · '}
                    {normalized.durationMinutes} min
                    {' · '}
                    {formatSeatingDaysLabel(normalized.daysOfWeek)}
                  </p>
                  {!normalized.isActive ? <small>Inactive</small> : null}
                </div>
                {showEditActions ? (
                  <div className="action-group">
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onMoveSeating(normalized, 'up')}
                      disabled={index === 0}
                      aria-label={`Move ${normalized.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onMoveSeating(normalized, 'down')}
                      disabled={index === seatings.length - 1}
                      aria-label={`Move ${normalized.name} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onStartEdit(normalized)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onToggleActive(normalized)}
                    >
                      {normalized.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn small workspace-action-btn"
                      onClick={() => onRequestDelete(normalized)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <>
      {hoursOnly ? hoursList : null}
      {hoursOnly ? null : (
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Venue</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🍽️</span>
            Reservation Seatings
          </h3>
          <p className="workspace-section-subtitle">
            Configure service slots used for reservations, table availability, and host station.
          </p>
        </div>
      </div>
      )}

      {showAutoClose ? (
        <div className="panel staff-panel workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">End of day</p>
              <h3>Auto-close seated tables</h3>
            </div>
          </div>
          <form
            className="employee-form"
            onSubmit={(event) => {
              event.preventDefault()
              onSaveAutoClose?.()
            }}
          >
            <p className="workspace-section-subtitle">
              At this Europe/Nicosia time, reservations still seated from a previous business day are checked out and marked auto-closed. Default 05:00.
            </p>
            {autoCloseNotice ? (
              <div
                className={`staff-status-banner${autoCloseNoticeIsError ? ' auth-banner-error' : ' auth-banner-success'}`}
                role="status"
              >
                {autoCloseNotice}
              </div>
            ) : null}
            <label className="form-field">
              <span>Cutoff time</span>
              <input
                type="time"
                className="reservation-auto-close-time"
                value={normalizeReservationAutoCloseTime(autoCloseTime)}
                onChange={(event) => onAutoCloseTimeChange(
                  normalizeReservationAutoCloseTime(event.target.value),
                )}
                disabled={isSavingAutoClose}
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="submit"
                className="primary-btn workspace-action-btn reservation-auto-close-save"
                disabled={isSavingAutoClose}
              >
                {isSavingAutoClose ? 'Saving…' : 'Save cutoff'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {hoursOnly ? null : <HostDiningTimerSettings />}

      {visibleNotice ? <div className="staff-status-banner">{visibleNotice}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading seatings…</div> : null}

      {hoursOnly && editingSeatingId && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="employee-modal-backdrop seating-hours-followup"
            onClick={onCancelEdit}
          >
            <div
              className="employee-modal seating-hours-editor"
              role="dialog"
              aria-modal="true"
              aria-labelledby="seating-hours-editor-title"
              onClick={(event) => event.stopPropagation()}
            >
              {editForm}
            </div>
          </div>,
          document.body,
        )
        : null}
      {hoursOnly ? null : (
      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Manage seatings</p>
            <h3>{editingSeatingId ? 'Edit seating' : 'Add seating'}</h3>
          </div>
        </div>

        <form className="employee-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => onFormChange({ ...form, name: event.target.value })}
                placeholder="e.g. Dinner 1"
                required
              />
            </label>
            <label className="form-field">
              <span>Start time</span>
              <ReservationTimeSelect
                value={form.startTime}
                onChange={(startTime) => onFormChange({ ...form, startTime })}
                required
              />
            </label>
            <label className="form-field">
              <span>Duration (minutes)</span>
              <input
                type="number"
                min="15"
                max="480"
                step="15"
                value={form.durationMinutes}
                onChange={(event) => onFormChange({
                  ...form,
                  durationMinutes: Math.max(15, Number(event.target.value) || 120),
                })}
                required
              />
            </label>
            <label className="form-field">
              <span>Status</span>
              <select
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(event) => onFormChange({
                  ...form,
                  isActive: event.target.value === 'active',
                })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="form-field full-width">
            <span>Days of week</span>
            <SeatingDaysToggle
              daysOfWeek={form.daysOfWeek}
              onChange={(daysOfWeek) => onFormChange({ ...form, daysOfWeek })}
            />
          </div>

          <div className="modal-actions">
            {editingSeatingId ? (
              <button type="button" className="ghost-btn workspace-action-btn" onClick={onCancelEdit}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="primary-btn workspace-action-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : editingSeatingId ? 'Update seating' : 'Add seating'}
            </button>
          </div>
        </form>
      </div>
      )}

      {hoursOnly ? null : hoursList}
    </>
  )
}

export function createDefaultSeatingForm(seating = null) {
  return buildSeatingFormDefaults(seating)
}

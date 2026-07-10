import {
  buildSeatingFormDefaults,
  DAY_OF_WEEK_OPTIONS,
  formatSeatingDaysLabel,
  normalizeReservationSeating,
} from '../../lib/reservationSeatings'
import { ReservationTimeSelect } from '../reservations/ReservationTimeSelect'

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
}) {
  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🍽️</span>
            Reservation Seatings
          </h3>
          <p className="workspace-section-subtitle">
            Configure service slots used for reservations, table availability, and host station.
          </p>
        </div>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading seatings…</div> : null}

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

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Seating list</p>
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
                </article>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

export function createDefaultSeatingForm() {
  return buildSeatingFormDefaults()
}

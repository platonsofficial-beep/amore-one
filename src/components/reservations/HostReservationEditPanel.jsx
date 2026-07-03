import {
  assignmentAllowsStanding,
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  formatSeatingAssignmentLabels,
  formatSeatingAssignmentSummary,
} from '../../lib/seatingAssignment'
import { CUSTOMER_TYPES } from '../../lib/reservationCustomerType'
import { TIME_INPUT_PROPS, normalizeTimeValue } from '../../lib/timeFormatUtils'

const RESERVATION_STATUSES = [
  'Booked',
  'Confirmed',
  'Seated',
  'Dining',
  'Completed',
  'Cancelled',
  'No Show',
]

export function createHostReservationEditForm(reservation) {
  const assignment = reservation?.seatingAssignment ?? {
    assignedUnits: [],
    extraChairs: 0,
    standingGuests: 0,
  }

  return {
    guestName: reservation?.guestName ?? '',
    phone: reservation?.phone ?? '',
    time: normalizeTimeValue(reservation?.time ?? ''),
    guests: `${reservation?.guests ?? 2}`,
    customerType: reservation?.customerType ?? 'Regular',
    status: reservation?.status ?? 'Booked',
    notes: reservation?.notes ?? '',
    assignedUnits: assignment.assignedUnits ?? [],
    extraChairs: assignment.extraChairs ?? 0,
    standingGuests: assignment.standingGuests ?? 0,
  }
}

export function HostReservationEditPanel({
  reservation,
  form,
  onChange,
  onSave,
  onDelete,
  onCancel,
  onStartFloorPick,
  isFloorPickActive = false,
  isSaving = false,
}) {
  if (!reservation || !form) return null

  const draftAssignment = buildSeatingAssignment({
    assignedUnits: form.assignedUnits,
    extraChairs: form.extraChairs,
    standingGuests: form.standingGuests,
    partySize: form.guests,
  })
  const totals = computeSeatingAssignmentTotals(draftAssignment, form.guests)
  const canUseStanding = assignmentAllowsStanding(draftAssignment)
  const unitLabels = formatSeatingAssignmentLabels(draftAssignment)

  const updateField = (patch) => onChange({ ...form, ...patch })

  const handleClearSeating = () => {
    updateField({
      assignedUnits: [],
      extraChairs: 0,
      standingGuests: 0,
    })
  }

  const handleDelete = () => {
    const confirmed = window.confirm(`Delete reservation for ${reservation.guestName}?`)
    if (!confirmed) return
    onDelete(reservation.id)
  }

  return (
    <aside className="host-reservation-edit-panel" aria-label="Edit reservation">
      <div className="host-reservation-edit-header">
        <div>
          <p className="host-reservation-edit-eyebrow">Edit reservation</p>
          <h4>{reservation.guestName}</h4>
        </div>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close edit panel">
          ✕
        </button>
      </div>

      <form
        className="host-reservation-edit-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <label className="host-reservation-edit-field">
          <span>Guest name</span>
          <input
            value={form.guestName}
            onChange={(event) => updateField({ guestName: event.target.value })}
            required
          />
        </label>

        <label className="host-reservation-edit-field">
          <span>Phone</span>
          <input
            value={form.phone}
            onChange={(event) => updateField({ phone: event.target.value })}
          />
        </label>

        <div className="host-reservation-edit-grid">
          <label className="host-reservation-edit-field">
            <span>Guests</span>
            <input
              type="number"
              min="1"
              value={form.guests}
              onChange={(event) => updateField({ guests: event.target.value })}
              required
            />
          </label>

          <label className="host-reservation-edit-field">
            <span>Time</span>
            <input
              {...TIME_INPUT_PROPS}
              value={form.time}
              onChange={(event) => updateField({ time: normalizeTimeValue(event.target.value) })}
              required
            />
          </label>
        </div>

        <label className="host-reservation-edit-field">
          <span>Customer type</span>
          <select
            value={form.customerType}
            onChange={(event) => updateField({ customerType: event.target.value })}
          >
            {CUSTOMER_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label className="host-reservation-edit-field">
          <span>Status</span>
          <select
            value={form.status}
            onChange={(event) => updateField({ status: event.target.value })}
          >
            {RESERVATION_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>

        <div className="host-reservation-edit-seating">
          <div className="host-reservation-edit-seating-header">
            <span>Assigned seating</span>
            <button type="button" className="host-reservation-edit-link" onClick={handleClearSeating}>
              Clear
            </button>
          </div>

          <p className="host-reservation-edit-seating-value">
            {unitLabels || 'No tables or sections assigned'}
          </p>

          <dl className="host-reservation-edit-summary">
            <div>
              <dt>Guests</dt>
              <dd>{totals.guests}</dd>
            </div>
            <div>
              <dt>Seats</dt>
              <dd>{totals.totalSeatedCapacity}</dd>
            </div>
            <div>
              <dt>Capacity</dt>
              <dd>{totals.totalGuestCapacity}</dd>
            </div>
          </dl>

          {totals.isOverCapacity ? (
            <p className="host-reservation-edit-warning">
              Capacity is short by {totals.capacityGap} guest{totals.capacityGap === 1 ? '' : 's'}.
            </p>
          ) : null}

          <div className="host-reservation-edit-grid">
            <label className="host-reservation-edit-field">
              <span>Extra chairs</span>
              <input
                type="number"
                min="0"
                max="12"
                value={form.extraChairs}
                onChange={(event) => updateField({ extraChairs: Math.max(0, Number(event.target.value) || 0) })}
              />
            </label>

            {canUseStanding || form.assignedUnits.length === 0 ? (
              <label className="host-reservation-edit-field">
                <span>Standing guests</span>
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={form.standingGuests}
                  onChange={(event) => updateField({ standingGuests: Math.max(0, Number(event.target.value) || 0) })}
                  disabled={form.assignedUnits.length > 0 && !canUseStanding}
                />
              </label>
            ) : null}
          </div>

          <button
            type="button"
            className={`host-reservation-edit-pick-btn${isFloorPickActive ? ' is-active' : ''}`}
            onClick={onStartFloorPick}
          >
            {isFloorPickActive ? 'Picking from floor… tap units' : 'Assign from floor plan'}
          </button>
        </div>

        <label className="host-reservation-edit-field">
          <span>Notes</span>
          <textarea
            rows="3"
            value={form.notes}
            onChange={(event) => updateField({ notes: event.target.value })}
          />
        </label>

        {form.assignedUnits.length > 0 ? (
          <p className="host-reservation-edit-assignment-preview">
            {formatSeatingAssignmentSummary(draftAssignment, form.guests)}
          </p>
        ) : null}

        <div className="host-reservation-edit-actions">
          <button type="submit" className="host-reservation-edit-save" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="host-reservation-edit-cancel" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="host-reservation-edit-delete" onClick={handleDelete} disabled={isSaving}>
            Delete
          </button>
        </div>
      </form>
    </aside>
  )
}

import { useEffect, useState } from 'react'
import {
  buildSeatingAssignment,
  formatSeatingAssignmentSummary,
  getReservationSeatingAssignment,
} from '../../lib/seatingAssignment'
import { CUSTOMER_TYPES } from '../../lib/reservationCustomerType'
import { resolveAreaIdForReservation } from '../../lib/reservationTableOptions'
import { normalizeReservationTimeValue } from '../../lib/timeFormatUtils'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { ReservationTableSelector } from './ReservationTableSelector'
import { ReservationTimeSelect } from './ReservationTimeSelect'

import { HOST_RESERVATION_STATUSES } from '../../lib/reservationHostStatus'

const RESERVATION_STATUSES = HOST_RESERVATION_STATUSES.map((entry) => entry.id)

export function createHostReservationEditForm(reservation, layout) {
  if (!reservation) return null

  const safeReservation = {
    ...reservation,
    guestName: reservation.guestName ?? reservation.name ?? '',
    notes: reservation.notes ?? '',
    tables: reservation.tables ?? [],
    status: reservation.status ?? 'Pending',
    guests: reservation.guests ?? 2,
    time: reservation.time ?? '',
    phone: reservation.phone ?? '',
    customerType: reservation.customerType ?? 'Regular',
    area: reservation.area ?? '',
  }
  const assignment = getReservationSeatingAssignment(safeReservation)

  return {
    guestName: safeReservation.guestName,
    phone: safeReservation.phone,
    time: normalizeReservationTimeValue(safeReservation.time),
    guests: `${safeReservation.guests ?? 2}`,
    customerType: safeReservation.customerType,
    status: safeReservation.status,
    notes: safeReservation.notes,
    area: safeReservation.area,
    assignedUnits: assignment.assignedUnits ?? [],
    extraChairs: assignment.extraChairs ?? 0,
    standingGuests: assignment.standingGuests ?? 0,
    seatingAreaId: resolveAreaIdForReservation(layout, safeReservation, assignment.assignedUnits),
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
  variant = 'inline',
  reservations = [],
  todayKey,
  layout,
}) {
  const [notesExpanded, setNotesExpanded] = useState(false)
  const isDrawer = variant === 'drawer'
  const { layout: contextLayout } = usePublishedFloorPlan()
  const activeLayout = layout ?? contextLayout
  const zones = activeLayout?.zones ?? []

  useEffect(() => {
    setNotesExpanded(Boolean(`${reservation?.notes ?? ''}`.trim()))
  }, [reservation?.id, reservation?.notes])

  if (!reservation) {
    return (
      <aside className={`host-reservation-edit-panel${isDrawer ? ' is-drawer' : ''}`} aria-label="Edit reservation">
        <div className="host-reservation-edit-header">
          <div>
            <p className="host-reservation-edit-eyebrow">Edit reservation</p>
            <h4>Reservation data unavailable</h4>
          </div>
          <div className="host-reservation-edit-header-actions">
            <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close edit panel">
              ✕
            </button>
          </div>
        </div>
      </aside>
    )
  }

  if (!form) {
    return (
      <aside className={`host-reservation-edit-panel${isDrawer ? ' is-drawer' : ''}`} aria-label="Edit reservation">
        <div className="host-reservation-edit-header">
          <div>
            <p className="host-reservation-edit-eyebrow">Edit reservation</p>
            <h4>Reservation data unavailable</h4>
          </div>
          <div className="host-reservation-edit-header-actions">
            <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close edit panel">
              ✕
            </button>
          </div>
        </div>
        <div className="host-reservation-edit-scroll">
          <p className="host-reservation-edit-unavailable">Reservation data unavailable</p>
        </div>
      </aside>
    )
  }

  const guestLabel = reservation.guestName ?? reservation.name ?? 'Guest'

  const draftAssignment = buildSeatingAssignment({
    assignedUnits: form.assignedUnits,
    extraChairs: form.extraChairs,
    standingGuests: form.standingGuests,
    partySize: form.guests,
  })
  const hasNotes = Boolean(`${form.notes ?? ''}`.trim())

  const updateField = (patch) => onChange({ ...form, ...patch })

  const handleClearSeating = () => {
    updateField({
      assignedUnits: [],
      extraChairs: 0,
      standingGuests: 0,
    })
  }

  const handleDelete = () => {
    const confirmed = window.confirm(
      `Delete reservation for ${guestLabel}? This will remove the booking and clear any table assignments.`,
    )
    if (!confirmed) return
    onDelete(reservation.id)
  }

  const formId = `host-reservation-edit-form-${reservation.id}`

  const handleSubmit = (event) => {
    event.preventDefault()
    onSave()
  }

  return (
    <aside className={`host-reservation-edit-panel${isDrawer ? ' is-drawer' : ''}`} aria-label="Edit reservation">
      <div className="host-reservation-edit-header">
        <div>
          <p className="host-reservation-edit-eyebrow">Edit reservation</p>
          <h4>{guestLabel}</h4>
        </div>
        <div className="host-reservation-edit-header-actions">
          <button
            type="submit"
            form={formId}
            className={`host-reservation-edit-save-icon${isSaving ? ' is-saving' : ''}`}
            aria-label={isSaving ? 'Saving reservation' : 'Save changes'}
            title={isSaving ? 'Saving…' : 'Save changes'}
            disabled={isSaving}
          >
            {isSaving ? '…' : '✓'}
          </button>
          {isDrawer ? (
            <button
              type="button"
              className="host-reservation-edit-delete-inline"
              onClick={handleDelete}
              disabled={isSaving}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close edit panel" disabled={isSaving}>
            ✕
          </button>
        </div>
      </div>

      <div className="host-reservation-edit-scroll">
        <form
          id={formId}
          className="host-reservation-edit-form"
          onSubmit={handleSubmit}
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
              <ReservationTimeSelect
                value={form.time}
                onChange={(time) => updateField({ time })}
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
              <span className="host-reservation-edit-seating-title">Tables / sections</span>
              <div className="host-reservation-edit-seating-actions">
                <button
                  type="button"
                  className={`host-reservation-edit-floor-pick${isFloorPickActive ? ' is-active' : ''}`}
                  onClick={onStartFloorPick}
                  aria-pressed={isFloorPickActive}
                >
                  <span className="host-reservation-edit-floor-pick-icon" aria-hidden="true">▦</span>
                  {isFloorPickActive ? 'Picking…' : 'Pick from floor'}
                </button>
                <button type="button" className="host-reservation-edit-link" onClick={handleClearSeating}>
                  Clear
                </button>
              </div>
            </div>

            <ReservationTableSelector
              layout={activeLayout}
              reservations={reservations}
              todayKey={todayKey}
              reservationId={reservation.id}
              selectedAreaId={form.seatingAreaId}
              assignedUnits={form.assignedUnits}
              guests={form.guests}
              extraChairs={form.extraChairs}
              standingGuests={form.standingGuests}
              onAreaChange={(seatingAreaId) => {
                const zone = zones.find((entry) => entry.id === seatingAreaId)
                updateField({
                  seatingAreaId,
                  area: zone?.label ?? form.area,
                })
              }}
              onAssignedUnitsChange={(assignedUnits) => updateField({ assignedUnits })}
              onExtraChairsChange={(extraChairs) => updateField({ extraChairs })}
              onStandingGuestsChange={(standingGuests) => updateField({ standingGuests })}
            />
          </div>

          <div className={`host-reservation-edit-notes${notesExpanded ? ' is-expanded' : ''}`}>
            {notesExpanded ? (
              <>
                <button
                  type="button"
                  className="host-reservation-edit-notes-toggle"
                  onClick={() => setNotesExpanded(false)}
                  aria-expanded={notesExpanded}
                >
                  Hide notes
                </button>
                <label className="host-reservation-edit-field host-reservation-edit-notes-field">
                  <span>Notes</span>
                  <textarea
                    rows="2"
                    value={form.notes}
                    onChange={(event) => updateField({ notes: event.target.value })}
                  />
                </label>
              </>
            ) : (
              <button
                type="button"
                className="host-reservation-edit-notes-toggle"
                onClick={() => setNotesExpanded(true)}
                aria-expanded={notesExpanded}
              >
                {hasNotes ? 'Show notes' : '+ Add notes'}
              </button>
            )}
          </div>

          {form.assignedUnits.length > 0 ? (
            <p className="host-reservation-edit-assignment-preview">
              {formatSeatingAssignmentSummary(draftAssignment, form.guests)}
            </p>
          ) : null}
        </form>
      </div>

      {!isDrawer ? (
        <div className="host-reservation-edit-danger-zone">
          <button
            type="button"
            className="host-reservation-edit-delete"
            onClick={handleDelete}
            disabled={isSaving}
          >
            Delete reservation
          </button>
        </div>
      ) : null}
    </aside>
  )
}

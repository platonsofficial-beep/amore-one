import { useEffect, useMemo, useState } from 'react'
import {
  buildSeatingAssignment,
  formatSeatingAssignmentSummary,
  getReservationAssignedUnitsForMatching,
  getReservationSeatingAssignment,
} from '../../lib/seatingAssignment'
import { GUEST_TYPE_OPTIONS } from '../../lib/reservationCustomerType'
import { resolveAreaIdForReservation } from '../../lib/reservationTableOptions'
import { resolveReservationSeatingId } from '../../lib/reservationSeatings'
import { normalizeReservationTimeValue, normalizeReservationDateKey } from '../../lib/timeFormatUtils'
import { validateReservationFormFields } from '../../lib/reservationFormValidation'
import {
  handleReservationFormEnterKey,
  preventReservationFormSubmit,
} from '../../lib/reservationFormNavigation'
import { ReservationPhoneField } from './ReservationPhoneField'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { ReservationTableSelector } from './ReservationTableSelector'
import { ReservationDateField } from './ReservationDateField'
import { ReservationTimeSelect } from './ReservationTimeSelect'
import { ReservationSeatingSelect } from './ReservationSeatingSelect'
import { buildSeatingsById } from '../../lib/reservationSeatings'

import { HOST_RESERVATION_STATUSES } from '../../lib/reservationHostStatus'

const RESERVATION_STATUSES = HOST_RESERVATION_STATUSES.map((entry) => entry.id)

export function createHostReservationEditForm(reservation, layout, seatings = []) {
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
  const assignedUnits = getReservationAssignedUnitsForMatching(safeReservation)

  return {
    guestName: safeReservation.guestName,
    phone: safeReservation.phone,
    date: normalizeReservationDateKey(safeReservation),
    time: normalizeReservationTimeValue(safeReservation.time),
    guests: `${safeReservation.guests ?? 2}`,
    customerType: safeReservation.customerType,
    status: safeReservation.status,
    notes: safeReservation.notes,
    area: safeReservation.area,
    assignedUnits,
    extraChairs: assignment.extraChairs ?? 0,
    standingGuests: assignment.standingGuests ?? 0,
    seatingAreaId: resolveAreaIdForReservation(layout, safeReservation, assignedUnits),
    seatingId: resolveReservationSeatingId(safeReservation, seatings),
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
  onValidationError,
  variant = 'inline',
  reservations = [],
  todayKey,
  layout,
  seatings = [],
}) {
  const [notesExpanded, setNotesExpanded] = useState(false)
  const isDrawer = variant === 'drawer'
  const { layout: contextLayout } = usePublishedFloorPlan()
  const activeLayout = layout ?? contextLayout
  const zones = activeLayout?.zones ?? []
  const seatingsById = useMemo(() => buildSeatingsById(seatings), [seatings])
  const selectedSeating = form?.seatingId ? seatingsById.get(form.seatingId) ?? null : null

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

  const updateField = (patch) => {
    onChange((current) => ({ ...current, ...patch }))
  }

  const handleClearSeating = () => {
    updateField({
      assignedUnits: [],
      extraChairs: 0,
      standingGuests: 0,
    })
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete reservation for ${guestLabel}? This will remove the booking and clear any table assignments.`,
    )
    if (!confirmed || isSaving) return
    await onDelete(reservation.id)
  }

  const formId = `host-reservation-edit-form-${reservation.id}`

  const handleSave = async () => {
    const validation = validateReservationFormFields(form, { dateFallback: todayKey })
    if (!validation.ok) {
      onValidationError?.(validation.error)
      return
    }

    try {
      await onSave?.()
    } catch (error) {
      onValidationError?.(error?.message || 'Unable to save reservation right now.')
    }
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
            type="button"
            className={`host-reservation-edit-save-icon${isSaving ? ' is-saving' : ''}`}
            aria-label={isSaving ? 'Saving reservation' : 'Save changes'}
            title={isSaving ? 'Saving…' : 'Save changes'}
            disabled={isSaving}
            onClick={handleSave}
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
          onSubmit={preventReservationFormSubmit}
          onKeyDownCapture={handleReservationFormEnterKey}
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
            <ReservationPhoneField
              value={form.phone}
              onChange={(phone) => updateField({ phone })}
            />
          </label>

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

          <div className="host-reservation-edit-grid">
            <label className="host-reservation-edit-field">
              <span>Date</span>
              <ReservationDateField
                value={form.date}
                onChange={(date) => updateField({ date })}
                todayKey={todayKey}
                required
              />
            </label>

            <ReservationSeatingSelect
              className="host-reservation-edit-field reservation-seating-select"
              seatings={seatings}
              dateKey={form.date || todayKey}
              seatingId={form.seatingId}
              timeValue={form.time}
              onSeatingChange={(nextSeatingId) => updateField({ seatingId: nextSeatingId })}
            />

            <label className="host-reservation-edit-field">
              <span>Time</span>
              <ReservationTimeSelect
                value={form.time}
                onChange={(time) => updateField({ time })}
                seating={selectedSeating}
                required
              />
            </label>
          </div>

          <label className="host-reservation-edit-field">
            <span>Guest Type</span>
            <select
              value={form.customerType}
              onChange={(event) => updateField({ customerType: event.target.value })}
            >
              {GUEST_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
              todayKey={form.date || todayKey}
              reservationTime={form.time}
              reservationId={reservation.id}
              seatingId={form.seatingId}
              seatings={seatings}
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

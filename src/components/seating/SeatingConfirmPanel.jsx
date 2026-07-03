import {
  assignmentAllowsStanding,
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  formatSeatingAssignmentLabels,
} from '../../lib/seatingAssignment'
import { getHostUnitById } from '../../lib/hostFloorPlanLayout'

export function SeatingConfirmPanel({
  reservation,
  selectedUnitIds,
  extraChairs,
  standingGuests,
  onExtraChairsChange,
  onStandingGuestsChange,
  onConfirm,
  onCancel,
  isSaving = false,
}) {
  if (!reservation || selectedUnitIds.length === 0) return null

  const assignedUnits = selectedUnitIds
    .map((unitId) => toSeatingUnitFromLayoutUnit(getHostUnitById(unitId)))
    .filter(Boolean)

  const draftAssignment = buildSeatingAssignment({
    assignedUnits,
    extraChairs,
    standingGuests,
    partySize: reservation.guests,
  })

  const totals = computeSeatingAssignmentTotals(draftAssignment, reservation.guests)
  const canUseStanding = assignmentAllowsStanding(draftAssignment)
  const unitLabels = formatSeatingAssignmentLabels(draftAssignment)

  return (
    <div className="seating-confirm-panel" role="region" aria-label="Confirm seating">
      <div className="seating-confirm-header">
        <p className="seating-confirm-eyebrow">Seat guest</p>
        <h4 className="seating-confirm-title">{reservation.guestName}</h4>
      </div>

      <div className="seating-confirm-units">
        <span className="seating-confirm-label">Selected</span>
        <p className="seating-confirm-unit-list">{unitLabels}</p>
      </div>

      <dl className="seating-confirm-summary">
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
        <p className="seating-confirm-warning" role="status">
          Not enough capacity for {totals.guests} guests. Add units, extra chairs, or standing guests.
        </p>
      ) : null}

      <div className="seating-confirm-adjustments">
        <label className="seating-confirm-field">
          <span>Extra chairs</span>
          <input
            type="number"
            min="0"
            max="12"
            value={extraChairs}
            onChange={(event) => onExtraChairsChange(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>

        {canUseStanding ? (
          <label className="seating-confirm-field">
            <span>Standing guests</span>
            <input
              type="number"
              min="0"
              max="12"
              value={standingGuests}
              onChange={(event) => onStandingGuestsChange(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
        ) : null}
      </div>

      <div className="seating-confirm-actions">
        <button
          type="button"
          className="seating-confirm-btn seating-confirm-btn-primary"
          onClick={() => onConfirm(draftAssignment)}
          disabled={isSaving || assignedUnits.length === 0}
        >
          Confirm seating
        </button>
        <button
          type="button"
          className="seating-confirm-btn"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function toSeatingUnitFromLayoutUnit(unit) {
  if (!unit) return null

  return {
    id: unit.id,
    label: unit.displayLabel ?? unit.label,
    area: unit.area ?? '',
    seatedCapacity: unit.seatedCapacity ?? unit.seats ?? 0,
    maxGuestCapacity: unit.maxGuestCapacity ?? unit.seats ?? 0,
    type: unit.unitType ?? 'table',
  }
}

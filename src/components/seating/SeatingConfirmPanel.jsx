import {
  assignmentAllowsStanding,
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  formatSeatingAssignmentDrawerLabels,
  formatSeatingAssignmentLabels,
} from '../../lib/seatingAssignment'
import { getHostUnitById } from '../../lib/hostFloorPlanLayout'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'

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
  variant = 'default',
}) {
  const { layout } = usePublishedFloorPlan()
  if (!reservation) return null
  if (variant !== 'host-drawer' && selectedUnitIds.length === 0) return null

  const assignedUnits = selectedUnitIds
    .map((unitId) => toSeatingUnitFromLayoutUnit(getHostUnitById(unitId, layout)))
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
  const drawerLabels = formatSeatingAssignmentDrawerLabels(draftAssignment)
  const isHostDrawer = variant === 'host-drawer'
  const hasSelection = assignedUnits.length > 0
  const chairsNeeded = Math.max(0, totals.capacityGap)

  if (isHostDrawer) {
    return (
      <div className="seating-confirm-panel is-host-drawer" role="region" aria-label="Assign seating">
        <div className="host-seating-drawer-header">
          <p className="host-seating-drawer-eyebrow">Assign seating</p>
          <h4 className="host-seating-drawer-title">{reservation.guestName}</h4>
          <p className="host-seating-drawer-subtitle">{totals.guests} guests</p>
        </div>

        <div className="host-seating-drawer-section">
          <span className="host-seating-drawer-label">Selected tables</span>
          <p className="host-seating-drawer-tables">{hasSelection ? drawerLabels : 'Click tables on the floor plan'}</p>
        </div>

        <dl className="host-seating-drawer-capacity">
          <div>
            <dt>Guests</dt>
            <dd>{totals.guests}</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>{totals.totalGuestCapacity}</dd>
          </div>
        </dl>

        {hasSelection && !totals.isOverCapacity ? (
          <p className="host-seating-drawer-success" role="status">
            Capacity fits this party.
          </p>
        ) : null}

        {hasSelection && totals.isOverCapacity ? (
          <p className="host-seating-drawer-warning" role="status">
            Need {chairsNeeded} extra chair{chairsNeeded === 1 ? '' : 's'} or more seating.
          </p>
        ) : null}

        <label className="host-seating-drawer-field">
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
          <label className="host-seating-drawer-field">
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

        <div className="host-seating-drawer-actions">
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

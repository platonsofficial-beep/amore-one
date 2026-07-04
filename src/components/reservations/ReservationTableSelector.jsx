import { useMemo } from 'react'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import {
  assignmentAllowsStanding,
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  formatHostListUnitLabel,
} from '../../lib/seatingAssignment'
import {
  getLayoutUnitsForArea,
  getOccupiedUnitIds,
  isUnitSelectable,
  toggleAssignedUnit,
  unitIdsMatch,
} from '../../lib/reservationTableOptions'

export function ReservationTableSelector({
  layout: layoutProp,
  reservations = [],
  todayKey,
  reservationId = null,
  selectedAreaId,
  assignedUnits = [],
  guests = 2,
  extraChairs = 0,
  standingGuests = 0,
  onAreaChange,
  onAssignedUnitsChange,
  onExtraChairsChange,
  onStandingGuestsChange,
}) {
  const { layout: contextLayout } = usePublishedFloorPlan()
  const layout = layoutProp ?? contextLayout
  const zones = layout?.zones ?? []

  const occupiedUnitIds = useMemo(
    () => getOccupiedUnitIds(reservations, todayKey, reservationId),
    [reservationId, reservations, todayKey],
  )

  const areaUnits = useMemo(
    () => getLayoutUnitsForArea(layout, selectedAreaId),
    [layout, selectedAreaId],
  )

  const selectedUnitIds = useMemo(
    () => assignedUnits.map((unit) => unit.id),
    [assignedUnits],
  )

  const draftAssignment = useMemo(() => buildSeatingAssignment({
    assignedUnits,
    extraChairs,
    standingGuests,
    partySize: guests,
  }), [assignedUnits, extraChairs, guests, standingGuests])

  const totals = useMemo(
    () => computeSeatingAssignmentTotals(draftAssignment, guests),
    [draftAssignment, guests],
  )

  const canUseStanding = assignmentAllowsStanding(draftAssignment)

  const handleToggleUnit = (unit) => {
    if (!isUnitSelectable(unit.id, occupiedUnitIds, selectedUnitIds)) return
    onAssignedUnitsChange(toggleAssignedUnit(assignedUnits, unit))
  }

  return (
    <div className="reservation-table-selector">
      <label className="host-reservation-edit-field">
        <span>Area</span>
        <select
          value={selectedAreaId}
          onChange={(event) => onAreaChange(event.target.value)}
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>{zone.label}</option>
          ))}
        </select>
      </label>

      {assignedUnits.length > 0 ? (
        <div className="reservation-table-selector-chips" aria-label="Selected tables">
          {assignedUnits.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className="reservation-table-selector-chip"
              onClick={() => onAssignedUnitsChange(assignedUnits.filter((entry) => !unitIdsMatch(entry.id, unit.id)))}
            >
              {formatHostListUnitLabel(unit.label)}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="reservation-table-selector-grid-wrap">
        <div className="reservation-table-selector-grid" role="group" aria-label="Available tables and sections">
          {areaUnits.map((unit) => {
            const isSelected = selectedUnitIds.some((id) => unitIdsMatch(id, unit.id))
            const occupied = occupiedUnitIds.get(unit.id)
            const isUnavailable = !isUnitSelectable(unit.id, occupiedUnitIds, selectedUnitIds)

            return (
              <button
                key={unit.id}
                type="button"
                className={`reservation-table-selector-unit${isSelected ? ' is-selected' : ''}${isUnavailable ? ' is-unavailable' : ''}`}
                onClick={() => handleToggleUnit(unit)}
                disabled={isUnavailable}
                title={isUnavailable ? `Booked${occupied?.guestName ? ` · ${occupied.guestName}` : ''}` : undefined}
              >
                <span className="reservation-table-selector-unit-label">{formatHostListUnitLabel(unit.label)}</span>
                <span className="reservation-table-selector-unit-capacity">{unit.maxGuestCapacity} seats</span>
                {isUnavailable ? <span className="reservation-table-selector-unit-status">Booked</span> : null}
              </button>
            )
          })}
        </div>
      </div>

      <dl className="host-reservation-edit-summary reservation-table-selector-summary">
        <div>
          <dt>Capacity</dt>
          <dd>{totals.totalGuestCapacity}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>{totals.guests}</dd>
        </div>
        <div>
          <dt>Selected</dt>
          <dd>{assignedUnits.length}</dd>
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
            value={extraChairs}
            onChange={(event) => onExtraChairsChange(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>

        {canUseStanding || assignedUnits.length === 0 ? (
          <label className="host-reservation-edit-field">
            <span>Standing guests</span>
            <input
              type="number"
              min="0"
              max="12"
              value={standingGuests}
              onChange={(event) => onStandingGuestsChange(Math.max(0, Number(event.target.value) || 0))}
              disabled={assignedUnits.length > 0 && !canUseStanding}
            />
          </label>
        ) : null}
      </div>
    </div>
  )
}

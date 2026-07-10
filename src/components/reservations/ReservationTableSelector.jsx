import { useMemo, useState } from 'react'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import {
  assignmentAllowsStanding,
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  formatHostListUnitLabel,
} from '../../lib/seatingAssignment'
import {
  buildSeatingsById,
  resolveSeatingDuration,
} from '../../lib/reservationSeatings'
import { formatTableConflictReason } from '../../lib/tableAvailability'
import {
  getConflictingUnitIds,
  getLayoutUnitsForArea,
  isUnitSelectable,
  toggleAssignedUnit,
  unitIdsMatch,
} from '../../lib/reservationTableOptions'

export function ReservationTableSelector({
  layout: layoutProp,
  reservations = [],
  todayKey,
  reservationTime = '',
  reservationId = null,
  seatingId = null,
  seatings = [],
  selectedAreaId,
  assignedUnits = [],
  guests = 2,
  extraChairs = 0,
  standingGuests = 0,
  onAreaChange,
  onAssignedUnitsChange,
  onExtraChairsChange,
  onStandingGuestsChange,
  requireDateAndTime = true,
}) {
  const { layout: contextLayout } = usePublishedFloorPlan()
  const layout = layoutProp ?? contextLayout
  const zones = layout?.zones ?? []
  const [showUnavailable, setShowUnavailable] = useState(false)

  const seatingsById = useMemo(() => buildSeatingsById(seatings), [seatings])
  const selectedSeating = seatingId ? seatingsById.get(seatingId) : null
  const hasSchedulingContext = Boolean(todayKey && (reservationTime || selectedSeating))
  const isPickerReady = !requireDateAndTime || hasSchedulingContext

  const conflictingUnitIds = useMemo(
    () => {
      if (!isPickerReady) return new Map()

      return getConflictingUnitIds(reservations, todayKey, reservationTime, {
        excludeReservationId: reservationId,
        layout,
        seatingId,
        seatingsById,
        durationMinutes: selectedSeating
          ? resolveSeatingDuration(selectedSeating)
          : undefined,
      })
    },
    [
      isPickerReady,
      layout,
      reservationId,
      reservationTime,
      reservations,
      seatingId,
      seatingsById,
      selectedSeating,
      todayKey,
    ],
  )

  const areaUnits = useMemo(
    () => getLayoutUnitsForArea(layout, selectedAreaId),
    [layout, selectedAreaId],
  )

  const visibleUnits = useMemo(() => {
    if (showUnavailable) return areaUnits
    return areaUnits.filter((unit) => (
      isUnitSelectable(unit.id, conflictingUnitIds, assignedUnits.map((entry) => entry.id))
    ))
  }, [areaUnits, assignedUnits, conflictingUnitIds, showUnavailable])

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
    if (!isUnitSelectable(unit.id, conflictingUnitIds, selectedUnitIds)) return
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

      <div className="reservation-table-selector-toolbar">
        <p className="reservation-table-selector-toolbar-label">Available tables</p>
        <label className="reservation-table-selector-toggle">
          <input
            type="checkbox"
            checked={showUnavailable}
            onChange={(event) => setShowUnavailable(event.target.checked)}
          />
          <span>Show unavailable</span>
        </label>
      </div>

      {!isPickerReady ? (
        <p className="reservation-table-selector-hint">Select date and seating/time to see available tables.</p>
      ) : null}

      <div className="reservation-table-selector-grid-wrap">
        <div className="reservation-table-selector-grid" role="group" aria-label="Available tables and sections">
          {visibleUnits.map((unit) => {
            const isSelected = selectedUnitIds.some((id) => unitIdsMatch(id, unit.id))
            const conflict = conflictingUnitIds.get(unit.id)
            const isUnavailable = !isUnitSelectable(unit.id, conflictingUnitIds, selectedUnitIds)
            const zoneLabel = zones.find((zone) => zone.id === unit.area || zone.id === selectedAreaId)?.label
              ?? zones.find((zone) => zone.id === selectedAreaId)?.label
              ?? ''

            return (
              <button
                key={unit.id}
                type="button"
                className={`reservation-table-selector-unit${isSelected ? ' is-selected' : ''}${isUnavailable ? ' is-unavailable' : ''}`}
                onClick={() => handleToggleUnit(unit)}
                disabled={isUnavailable}
                title={isUnavailable ? formatTableConflictReason(conflict) : undefined}
              >
                <span className="reservation-table-selector-unit-label">{formatHostListUnitLabel(unit.label)}</span>
                <span className="reservation-table-selector-unit-meta">
                  {zoneLabel ? <span className="reservation-table-selector-unit-area">{zoneLabel}</span> : null}
                  <span className="reservation-table-selector-unit-capacity">
                    {unit.minGuestCapacity ?? unit.seatedCapacity ?? 0}–{unit.maxGuestCapacity} guests
                  </span>
                </span>
                {isUnavailable ? (
                  <span className="reservation-table-selector-unit-status">
                    {formatTableConflictReason(conflict)}
                  </span>
                ) : (
                  <span className="reservation-table-selector-unit-status is-available">Available</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <dl className="host-reservation-edit-summary reservation-table-selector-summary">
        <div>
          <dt>Selected tables</dt>
          <dd>{assignedUnits.map((unit) => formatHostListUnitLabel(unit.label)).join(' + ') || '—'}</dd>
        </div>
        <div>
          <dt>Combined capacity</dt>
          <dd>{totals.totalGuestCapacity}</dd>
        </div>
        <div>
          <dt>Party size</dt>
          <dd>{totals.guests}</dd>
        </div>
      </dl>

      {totals.isUnderCapacity ? (
        <p className="host-reservation-edit-warning">
          Selected capacity is below party size by {totals.capacityGap} guest{totals.capacityGap === 1 ? '' : 's'}. You can still save.
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

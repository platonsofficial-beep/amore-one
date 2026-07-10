import {
  assignmentAllowsStanding,
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  formatSeatingAssignmentDrawerLabels,
  formatSeatingAssignmentLabels,
} from '../../lib/seatingAssignment'
import { getHostUnitById } from '../../lib/hostFloorPlanLayout'
import { normalizeReservationSeating, normalizeReservationSeatingInput } from '../../lib/reservationSeatings'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { getHostSeatingAssignmentAdvisory } from '../../lib/hostAssignmentPanelUtils'
import { useHostAssignmentScrollPolicy } from '../../lib/useHostAssignmentScrollPolicy'

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
  seating = null,
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
  const timeLabel = formatTime24(reservation.time)
  const normalizedSeating = seating
    ? (normalizeReservationSeating(seating) ?? normalizeReservationSeatingInput(seating))
    : null
  const seatingName = normalizedSeating?.name ?? ''
  const advisory = getHostSeatingAssignmentAdvisory({ hasSelection, totals })
  const reservationMeta = [timeLabel, seatingName].filter(Boolean).join(' · ')
  const partyLabel = `${totals.guests} ${totals.guests === 1 ? 'guest' : 'guests'}`
  const headerMeta = [reservationMeta, partyLabel].filter(Boolean).join(' · ')
  const { scrollRef, needsScroll } = useHostAssignmentScrollPolicy([
    hasSelection,
    totals.guests,
    totals.extraChairs,
    totals.totalGuestCapacity,
    canUseStanding,
    standingGuests,
    totals.isOverCapacity,
    drawerLabels,
  ])

  if (isHostDrawer) {
    return (
      <div
        className="seating-confirm-panel is-host-drawer is-tablet-density"
        role="region"
        aria-label="Assign seating"
        data-testid="host-assignment-panel"
        data-assignment-mode="true"
        data-layout-density="tablet"
      >
        <header className="host-seating-drawer-header">
          <div className="host-seating-drawer-heading">
            <p className="host-seating-drawer-eyebrow">Assign seating</p>
            <h4 className="host-seating-drawer-title">{reservation.guestName}</h4>
            {headerMeta ? (
              <p className="host-seating-drawer-subtitle">{headerMeta}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn host-seating-drawer-close"
            onClick={onCancel}
            aria-label="Close assign seating panel"
            data-testid="host-assignment-close"
          >
            ✕
          </button>
        </header>

        <div
          ref={scrollRef}
          className={`host-seating-drawer-scroll${needsScroll ? ' is-scrollable' : ' is-content-fit'}`}
          data-testid="host-assignment-scroll"
          data-scroll-policy={needsScroll ? 'overflow' : 'content-fit'}
        >
          <div className="host-seating-drawer-section">
            <span className="host-seating-drawer-label">Selected tables</span>
            <p className="host-seating-drawer-tables" data-testid="host-assignment-selected-tables">
              {hasSelection ? drawerLabels : 'Click tables on the floor plan'}
            </p>
          </div>

          <dl className="host-seating-drawer-capacity" data-testid="host-assignment-metrics">
            <div>
              <dt>Guests</dt>
              <dd>{totals.guests}</dd>
            </div>
            <div>
              <dt>Capacity</dt>
              <dd>{totals.totalGuestCapacity}</dd>
            </div>
            <div className="host-seating-drawer-capacity-adjust">
              <dt>Extra chairs</dt>
              <dd>
                <input
                  type="number"
                  className="host-seating-drawer-metric-input"
                  min="0"
                  max="12"
                  value={extraChairs}
                  aria-label="Extra chairs"
                  data-testid="host-assignment-extra-chairs"
                  onChange={(event) => onExtraChairsChange(Math.max(0, Number(event.target.value) || 0))}
                />
              </dd>
            </div>
          </dl>

          <p
            className={`host-seating-drawer-advisory is-${advisory.tone}`}
            role="status"
            data-testid="host-assignment-advisory"
          >
            {advisory.message}
          </p>

          {hasSelection && totals.isOverCapacity ? (
            <p className="host-seating-drawer-warning" role="status">
              Need {chairsNeeded} extra chair{chairsNeeded === 1 ? '' : 's'} or more seating.
            </p>
          ) : null}

          {canUseStanding ? (
            <label className="host-seating-drawer-field host-seating-drawer-field-compact">
              <span>Standing guests</span>
              <input
                type="number"
                min="0"
                max="12"
                value={standingGuests}
                data-testid="host-assignment-standing-guests"
                onChange={(event) => onStandingGuestsChange(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
          ) : null}
        </div>

        <div className="host-seating-drawer-actions" data-testid="host-assignment-actions">
          <button
            type="button"
            className="seating-confirm-btn"
            onClick={onCancel}
            disabled={isSaving}
            data-testid="host-assignment-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="seating-confirm-btn seating-confirm-btn-primary"
            onClick={() => onConfirm(draftAssignment)}
            disabled={isSaving || assignedUnits.length === 0}
            data-testid="host-assignment-confirm"
          >
            Confirm seating
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

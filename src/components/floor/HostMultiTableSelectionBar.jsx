import { getHostUnitById, toSeatingUnitFromLayoutUnit } from '../../lib/hostFloorPlanLayout'
import {
  buildSeatingAssignment,
  computeSeatingAssignmentTotals,
  formatSeatingAssignmentDrawerLabels,
} from '../../lib/seatingAssignment'
import { buildHostMultiTableSelectionSummary } from '../../lib/hostAssignmentPanelUtils'

export function HostMultiTableSelectionBar({
  selectedUnitIds = [],
  reservation = null,
  layout = null,
  onCancel,
  onContinue,
}) {
  const summary = buildHostMultiTableSelectionSummary({
    selectedUnitIds,
    layout,
    partySize: Number(reservation?.guests) || 0,
  })
  const tableCount = selectedUnitIds.length
  const selectionLabel = tableCount === 1
    ? '1 table selected'
    : `${tableCount} tables selected`

  return (
    <div
      className="host-multi-table-selection-bar"
      role="region"
      aria-label="Multi-table selection"
      data-testid="host-multi-table-selection-bar"
    >
      <div className="host-multi-table-selection-bar-main">
        <span className="host-multi-table-selection-mode">Multi-table</span>
        <div className="host-multi-table-selection-copy">
          <strong className="host-multi-table-selection-count">
            {selectionLabel}
            {summary.tableSummary ? ` · ${summary.tableSummary}` : ''}
          </strong>
          <span className="host-multi-table-selection-meta">
            {summary.capacityLabel}
            {' · '}
            {summary.guestsLabel}
          </span>
        </div>
      </div>
      <div className="host-multi-table-selection-actions">
        <button
          type="button"
          className="host-multi-table-selection-btn is-secondary"
          onClick={onCancel}
          data-testid="host-multi-table-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className="host-multi-table-selection-btn is-primary"
          onClick={onContinue}
          disabled={tableCount === 0}
          data-testid="host-multi-table-continue"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

export function buildHostMultiTableDraftAssignment(selectedUnitIds = [], layout = null, partySize = 0) {
  const assignedUnits = selectedUnitIds
    .map((unitId) => toSeatingUnitFromLayoutUnit(getHostUnitById(unitId, layout)))
    .filter(Boolean)

  return buildSeatingAssignment({
    assignedUnits,
    partySize,
  })
}

export function getHostMultiTableConfirmLabels(selectedUnitIds = [], layout = null) {
  const assignment = buildHostMultiTableDraftAssignment(selectedUnitIds, layout)
  return formatSeatingAssignmentDrawerLabels(assignment)
}

export function getHostMultiTableCapacityTotals(selectedUnitIds = [], layout = null, partySize = 0) {
  const assignment = buildHostMultiTableDraftAssignment(selectedUnitIds, layout, partySize)
  return computeSeatingAssignmentTotals(assignment, partySize)
}

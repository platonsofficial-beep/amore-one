import { useMemo } from 'react'
import {
  buildHostQuickCreateTableOptions,
  formatHostQuickCreateTableSelectionStatus,
  getHostQuickCreateTableHelperText,
} from '../../../lib/hostQuickCreateForm'
import { formatHostListUnitLabel } from '../../../lib/seatingAssignment'
import { unitIdsMatch } from '../../../lib/reservationTableOptions'

export function HostQuickCreateTableField({
  form,
  layout = null,
  reservations = [],
  seatings = [],
  onSelectTable,
  onClearTable,
}) {
  const tableOptions = useMemo(
    () => buildHostQuickCreateTableOptions({
      layout,
      reservations,
      dateKey: form.date,
      time: form.time,
      seatingId: form.seatingId,
      areaId: form.seatingAreaId,
      partySize: form.guests,
      seatings,
      assignedUnits: form.assignedUnits,
    }),
    [
      layout,
      reservations,
      form.date,
      form.time,
      form.seatingId,
      form.seatingAreaId,
      form.guests,
      form.assignedUnits,
      seatings,
    ],
  )

  const helperText = useMemo(
    () => getHostQuickCreateTableHelperText(form, tableOptions, seatings, { layout }),
    [form, tableOptions, seatings, layout],
  )

  const selectionStatus = useMemo(
    () => formatHostQuickCreateTableSelectionStatus(form.assignedUnits),
    [form.assignedUnits],
  )

  const showTableGrid = !helperText
  const hasSelection = form.assignedUnits.length > 0

  const handleSelect = (event, unit, isSelectable) => {
    event.preventDefault()
    event.stopPropagation()
    if (!isSelectable) return
    onSelectTable?.(unit)
  }

  return (
    <div className="mobile-host-form-field mobile-host-quick-create-table-field">
      <div className="mobile-host-quick-create-table-header">
        <span>Table (optional)</span>
        {hasSelection ? (
          <button
            type="button"
            className="mobile-host-quick-create-clear-table"
            onClick={(event) => {
              event.stopPropagation()
              onClearTable?.()
            }}
          >
            Clear table
          </button>
        ) : null}
      </div>

      <p
        className={`mobile-host-quick-create-table-status${hasSelection ? ' has-selection' : ''}`}
        role="status"
        aria-live="polite"
        data-testid="host-quick-create-table-status"
      >
        {selectionStatus}
      </p>

      {form.tableSelectionNotice ? (
        <p className="mobile-host-form-notice" role="status">{form.tableSelectionNotice}</p>
      ) : null}

      {helperText ? (
        <p className="mobile-host-form-hint" role="status">{helperText}</p>
      ) : null}

      {showTableGrid ? (
        <div
          className="mobile-host-quick-create-table-grid"
          role="group"
          aria-label="Available tables"
          data-testid="host-quick-create-table-grid"
        >
          {tableOptions.options.map(({ unit, isSelectable, disabledReason, label }) => {
            const isSelected = form.assignedUnits.some((entry) => unitIdsMatch(entry.id, unit.id))
            const isDisabled = !isSelectable

            return (
              <button
                key={unit.id}
                type="button"
                aria-pressed={isSelected}
                aria-disabled={isDisabled}
                disabled={isDisabled}
                className={`mobile-host-quick-create-table-option${isSelected ? ' is-selected' : ''}${isDisabled ? ' is-unavailable' : ''}`}
                data-testid={`host-quick-create-table-option-${unit.id}`}
                onClick={(event) => handleSelect(event, unit, isSelectable)}
              >
                {isSelectable ? label : `${formatHostListUnitLabel(unit.label)} · ${disabledReason}`}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

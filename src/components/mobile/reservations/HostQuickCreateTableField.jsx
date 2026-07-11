import { useMemo } from 'react'
import {
  buildHostQuickCreateTableOptions,
  getHostQuickCreateTableHelperText,
  toggleHostQuickCreateTableSelection,
} from '../../../lib/hostQuickCreateForm'
import { formatHostListUnitLabel } from '../../../lib/seatingAssignment'
import { unitIdsMatch } from '../../../lib/reservationTableOptions'

export function HostQuickCreateTableField({
  form,
  layout = null,
  reservations = [],
  seatings = [],
  onFormChange,
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

  const showTableGrid = !helperText
  const selectedUnit = form.assignedUnits[0] ?? null

  const handleToggle = (unit) => {
    onFormChange(toggleHostQuickCreateTableSelection(form, unit, {
      layout,
      reservations,
      seatings,
    }))
  }

  const handleClear = () => {
    onFormChange({
      ...form,
      assignedUnits: [],
      tableSelectionNotice: '',
    })
  }

  return (
    <div className="mobile-host-form-field mobile-host-quick-create-table-field">
      <div className="mobile-host-quick-create-table-header">
        <span>Table (optional)</span>
        {selectedUnit ? (
          <button
            type="button"
            className="mobile-host-quick-create-clear-table"
            onClick={handleClear}
          >
            Clear table
          </button>
        ) : null}
      </div>

      {form.tableSelectionNotice ? (
        <p className="mobile-host-form-notice" role="status">{form.tableSelectionNotice}</p>
      ) : null}

      {helperText ? (
        <p className="mobile-host-form-hint" role="status">{helperText}</p>
      ) : null}

      {showTableGrid ? (
        <div
          className="mobile-host-quick-create-table-grid"
          role="listbox"
          aria-label="Available tables"
        >
          {tableOptions.options.map(({ unit, isSelectable, disabledReason, label }) => {
            const isSelected = form.assignedUnits.some((entry) => unitIdsMatch(entry.id, unit.id))

            return (
              <button
                key={unit.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`mobile-host-quick-create-table-option${isSelected ? ' is-selected' : ''}${!isSelectable ? ' is-unavailable' : ''}`}
                disabled={!isSelectable}
                onClick={() => handleToggle(unit)}
              >
                <span className="mobile-host-quick-create-table-option-label">
                  {isSelectable ? label : `${formatHostListUnitLabel(unit.label)} · ${disabledReason}`}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

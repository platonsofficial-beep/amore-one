/**
 * P8.29.14 — Multi-location quantity allocation editor for Import Review.
 */

import {
  formatLocationAllocationEvidenceLabel,
  isLocationAllocationQuantityPresent,
} from '../../lib/inventoryImportLocationAllocation'
import { INVENTORY_LOCATION_QUANTITY_BLOCKER } from '../../lib/inventoryLocationColumnBindings'
import { WorkspaceStorageSelector } from './WorkspaceStorageSelector'

/**
 * @param {string} code
 * @returns {string}
 */
export function formatLocationAllocationWarningLabel(code) {
  switch (code) {
    case INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION:
      return 'Duplicate destination'
    case INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED:
      return 'Destination storage missing'
    case INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_AMBIGUOUS:
      return 'Ambiguous destination'
    case INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_QUANTITY_MALFORMED:
      return 'Invalid quantity'
    case INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_QUANTITY_NEGATIVE:
      return 'Negative quantity'
    case 'expression_summed':
      return 'Expression summed'
    default:
      return code
  }
}

/**
 * @param {{
 *   allocations?: object[],
 *   totalOpeningStock?: number|null,
 *   workspaceId?: string,
 *   disabled?: boolean,
 *   onChangeAllocation?: (sourceField: string, patch: object) => void,
 * }} props
 */
export function InventoryImportLocationAllocationEditor({
  allocations = [],
  totalOpeningStock = null,
  workspaceId = '',
  disabled = false,
  onChangeAllocation = undefined,
} = {}) {
  const totalLabel = totalOpeningStock == null
    ? '—'
    : `${totalOpeningStock}`

  return (
    <div
      className="inventory-import-location-allocations"
      data-testid="inventory-import-location-allocations"
    >
      <div className="inventory-import-location-allocations-head">
        <h5 className="inventory-import-location-allocations-title">
          Location Quantities
        </h5>
      </div>

      <ul className="inventory-import-location-allocation-list">
        {allocations.map((allocation) => {
          const isBlocker = allocation.validationState === 'blocker'
          const isWarning = allocation.validationState === 'warning'
            || (Array.isArray(allocation.warnings) && allocation.warnings.includes('expression_summed'))
          const evidence = formatLocationAllocationEvidenceLabel(allocation)
          const showMissing = isLocationAllocationQuantityPresent(allocation.quantityInput)
            && (
              !allocation.destinationLocationKey
              || allocation.warnings?.includes(
                INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED,
              )
            )
          const displayWarnings = (Array.isArray(allocation.warnings) ? allocation.warnings : [])
            .filter((code) => code !== 'expression_summed')

          return (
            <li
              key={allocation.sourceField}
              className={`inventory-import-location-allocation-row${isBlocker ? ' is-blocker' : ''}${isWarning && !isBlocker ? ' is-warning' : ''}`}
              data-source-field={allocation.sourceField}
              data-validation={allocation.validationState}
            >
              <div className="inventory-import-location-allocation-row-main">
                <span
                  className="inventory-import-location-allocation-status"
                  aria-hidden="true"
                >
                  {isBlocker ? '⚠' : '✓'}
                </span>

                <label className="inventory-import-location-allocation-location">
                  <span className="inventory-import-location-allocation-source">
                    {allocation.locationKey || allocation.sourceHeader || allocation.sourceField}
                  </span>
                  <span
                    className="inventory-import-location-allocation-operator"
                    data-testid={`inventory-import-operator-${allocation.sourceField}`}
                  >
                    Operator:
                    {' '}
                    {allocation.operatorLabel ? allocation.operatorLabel : '—'}
                  </span>
                  <WorkspaceStorageSelector
                    workspaceId={workspaceId}
                    value={allocation.destinationLocationKey ?? ''}
                    variant="select"
                    disabled={disabled}
                    emptyLabel="Select location"
                    aria-label={`${allocation.locationKey || allocation.sourceHeader || allocation.sourceField} destination`}
                    aria-invalid={isBlocker ? 'true' : undefined}
                    onChange={(locationKey) => {
                      onChangeAllocation?.(allocation.sourceField, {
                        destinationLocationKey: locationKey === '' ? null : locationKey,
                        destinationStorageId: null,
                        bindingStatus: locationKey ? 'mapped' : 'unmapped',
                      })
                    }}
                  />
                </label>

                <label className="inventory-import-location-allocation-qty">
                  <span className="sr-only">Quantity</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={allocation.quantityInput == null ? '' : `${allocation.quantityInput}`}
                    disabled={disabled}
                    aria-label={`${allocation.locationKey || allocation.sourceHeader || allocation.sourceField} quantity`}
                    aria-invalid={isBlocker ? 'true' : undefined}
                    onChange={(event) => {
                      onChangeAllocation?.(allocation.sourceField, {
                        quantityInput: event.target.value,
                      })
                    }}
                  />
                  {evidence ? (
                    <span className="inventory-import-location-allocation-evidence">
                      (
                      {evidence}
                      )
                    </span>
                  ) : null}
                </label>
              </div>

              {showMissing || displayWarnings.length > 0 ? (
                <div className="inventory-import-location-allocation-messages" role="status">
                  {showMissing ? (
                    <span className="inventory-import-location-allocation-warning">
                      ⚠ Destination storage missing — use Create storage in the location menu
                    </span>
                  ) : null}
                  {displayWarnings.map((code) => (
                    <span
                      key={code}
                      className="inventory-import-location-allocation-warning"
                    >
                      ⚠
                      {' '}
                      {formatLocationAllocationWarningLabel(code)}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="inventory-import-location-allocations-total" role="status">
        <span>Total Opening Stock</span>
        <strong data-testid="inventory-import-opening-stock-total">{totalLabel}</strong>
      </div>
    </div>
  )
}

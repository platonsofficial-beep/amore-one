/**
 * P8.16.13 — Interactive possible-match resolution workspace.
 *
 * Local wizard decisions only. No database writes, product creation, or Apply.
 */

import {
  INVENTORY_OPERATIONAL_MATCH_STATUS,
} from '../../lib/inventoryOperationalProductMatcher'
import {
  INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION,
  getOperationalMatchResolutionRowKey,
} from '../../lib/inventoryOperationalMatchResolutions'
import { formatOperationalImportPreviewValue } from './InventoryOperationalImportPreview'

/**
 * @param {object|null|undefined} preview
 * @returns {Array<{ key: string, index: number, row: object }>}
 */
export function listOperationalPossibleMatchRows(preview) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : []
  /** @type {Array<{ key: string, index: number, row: object }>} */
  const listed = []

  rows.forEach((row, index) => {
    if (row?.match?.status !== INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH) return
    listed.push({
      key: getOperationalMatchResolutionRowKey(row, index),
      index,
      row,
    })
  })

  return listed
}

/**
 * @param {{
 *   decision?: string|null,
 *   selectedStockItemId?: string|null,
 *   manuallyResolved?: boolean,
 * }|null|undefined} resolution
 * @returns {boolean}
 */
export function isOperationalMatchResolutionComplete(resolution) {
  if (!resolution) return false
  if (resolution.decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING) {
    return Boolean(resolution.selectedStockItemId) && resolution.manuallyResolved !== false
  }
  if (
    resolution.decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW
    || resolution.decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP
  ) {
    return true
  }
  return false
}

/**
 * @param {{
 *   basePreview?: object|null,
 *   resolutions?: Record<string, { decision: string, selectedStockItemId: string|null }>,
 *   onChangeResolution?: (rowKey: string, next: { decision: string, selectedStockItemId: string|null }) => void,
 * }} props
 */
export function InventoryOperationalMatchResolution({
  basePreview = null,
  resolutions = {},
  onChangeResolution = undefined,
} = {}) {
  const possibleRows = listOperationalPossibleMatchRows(basePreview)
  const resolvedCount = possibleRows.filter(({ key }) => (
    isOperationalMatchResolutionComplete(resolutions[key])
  )).length
  const remainingCount = possibleRows.length - resolvedCount

  return (
    <section
      className="inventory-operational-match-resolution"
      aria-label="Resolve possible matches"
      data-possible-count={possibleRows.length}
      data-resolved-count={resolvedCount}
      data-remaining-count={remainingCount}
    >
      <header className="inventory-operational-match-resolution-header">
        <div>
          <h3 className="inventory-operational-review-title">
            Resolve Possible Matches
          </h3>
          <p className="inventory-operational-match-resolution-subtext">
            Review uncertain matches and choose whether to link an existing ONE product, create a new product, or skip the source row.
          </p>
        </div>
      </header>

      <p className="inventory-operational-match-resolution-summary" role="status">
        <span>
          Total possible matches:
          {' '}
          {possibleRows.length}
        </span>
        <span>
          Resolved:
          {' '}
          {resolvedCount}
        </span>
        <span>
          Remaining:
          {' '}
          {remainingCount}
        </span>
      </p>

      {possibleRows.length === 0 ? (
        <div className="inventory-operational-review-empty" role="status">
          <p className="inventory-operational-review-empty-title">
            No matches need resolution
          </p>
          <p className="inventory-operational-review-empty-copy">
            ONE did not find any uncertain product matches in this worksheet.
          </p>
        </div>
      ) : (
        <ul className="inventory-operational-match-resolution-list">
          {possibleRows.map(({ key, row }) => {
            const resolution = resolutions[key] ?? null
            const decision = resolution?.decision ?? ''
            const selectedId = resolution?.selectedStockItemId ?? null
            const complete = isOperationalMatchResolutionComplete(resolution)
            const candidates = Array.isArray(row.match?.candidates) ? row.match.candidates : []

            return (
              <li
                key={key}
                className="inventory-operational-match-resolution-row"
                data-row-key={key}
                data-resolution-status={complete ? 'resolved' : 'needs_decision'}
              >
                <div className="inventory-operational-match-resolution-row-head">
                  <div>
                    <h4 className="inventory-operational-match-resolution-product">
                      {formatOperationalImportPreviewValue(row.source?.productName)}
                    </h4>
                    <p className="inventory-operational-match-resolution-category">
                      {formatOperationalImportPreviewValue(row.source?.category)}
                    </p>
                  </div>
                  <span className={`inventory-operational-match-resolution-status ${complete ? 'is-resolved' : 'is-pending'}`}>
                    {complete ? 'Resolved' : 'Needs decision'}
                  </span>
                </div>

                <dl className="inventory-operational-match-resolution-facts">
                  <div>
                    <dt>Storage</dt>
                    <dd>{formatOperationalImportPreviewValue(row.source?.storage)}</dd>
                  </div>
                  <div>
                    <dt>BAR</dt>
                    <dd>{formatOperationalImportPreviewValue(row.source?.bar)}</dd>
                  </div>
                </dl>

                <fieldset className="inventory-operational-match-resolution-candidates">
                  <legend>Existing ONE candidates</legend>
                  {candidates.length === 0 ? (
                    <p className="inventory-operational-match-resolution-empty-candidates">
                      No candidates available.
                    </p>
                  ) : (
                    candidates.map((candidate, candidateIndex) => {
                      const item = candidate.stockItem
                      const itemId = item?.id == null ? '' : String(item.id)
                      const radioId = `match-resolution-${key}-candidate-${candidateIndex}`
                      const activeLabel = item?.active === false ? 'Inactive' : 'Active'
                      return (
                        <label
                          key={`${key}-candidate-${itemId || candidateIndex}`}
                          className="inventory-operational-match-resolution-candidate"
                          htmlFor={radioId}
                        >
                          <input
                            id={radioId}
                            type="radio"
                            name={`match-resolution-candidate-${key}`}
                            value={itemId}
                            checked={decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING
                              && selectedId != null
                              && String(selectedId) === itemId}
                            onChange={() => {
                              onChangeResolution?.(key, {
                                decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
                                selectedStockItemId: itemId,
                              })
                            }}
                          />
                          <span>
                            <strong>{formatOperationalImportPreviewValue(item?.name)}</strong>
                            {' · '}
                            {formatOperationalImportPreviewValue(item?.category)}
                            {' · '}
                            Unit:
                            {' '}
                            {formatOperationalImportPreviewValue(item?.unit)}
                            {' · '}
                            {activeLabel}
                          </span>
                        </label>
                      )
                    })
                  )}
                </fieldset>

                <fieldset className="inventory-operational-match-resolution-decisions">
                  <legend>Decision</legend>
                  <label>
                    <input
                      type="radio"
                      name={`match-resolution-decision-${key}`}
                      value={INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING}
                      checked={decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING}
                      onChange={() => {
                        onChangeResolution?.(key, {
                          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
                          selectedStockItemId: selectedId,
                        })
                      }}
                    />
                    <span>Link existing product</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`match-resolution-decision-${key}`}
                      value={INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW}
                      checked={decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW}
                      onChange={() => {
                        onChangeResolution?.(key, {
                          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW,
                          selectedStockItemId: null,
                        })
                      }}
                    />
                    <span>Create new product</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`match-resolution-decision-${key}`}
                      value={INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP}
                      checked={decision === INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP}
                      onChange={() => {
                        onChangeResolution?.(key, {
                          decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP,
                          selectedStockItemId: null,
                        })
                      }}
                    />
                    <span>Skip this row</span>
                  </label>
                </fieldset>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

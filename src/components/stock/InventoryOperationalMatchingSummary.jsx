/**
 * P8.16.9 — Read-only Operational Matching Result summary.
 *
 * Presentation only. Does not run the matcher, mutate inputs, or apply changes.
 */

import {
  INVENTORY_OPERATIONAL_MATCH_STATUS,
} from '../../lib/inventoryOperationalProductMatcher'

export const INVENTORY_OPERATIONAL_MATCHING_PREVIEW_LIMIT = 20

/**
 * @param {string|undefined} status
 * @returns {{ symbol: string, label: string, className: string }}
 */
export function getOperationalMatchStatusPresentation(status) {
  switch (status) {
    case INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH:
      return { symbol: '✓', label: 'Exact Match', className: 'is-exact' }
    case INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH:
      return { symbol: '⚠', label: 'Possible Match', className: 'is-possible' }
    case INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT:
      return { symbol: '➕', label: 'New Product', className: 'is-new' }
    case INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE:
      return { symbol: '✕', label: 'Invalid', className: 'is-invalid' }
    default:
      return { symbol: '•', label: 'Unknown', className: 'is-unknown' }
  }
}

/**
 * @param {{
 *   result?: {
 *     matches?: Array<{
 *       status: string,
 *       source?: { product?: { name?: unknown }, category?: unknown },
 *     }>,
 *     summary?: {
 *       exactMatch?: number,
 *       possibleMatch?: number,
 *       newProduct?: number,
 *       invalidSource?: number,
 *       total?: number,
 *     },
 *   }|null,
 * }} props
 */
export function InventoryOperationalMatchingSummary({ result = null } = {}) {
  const matches = Array.isArray(result?.matches) ? result.matches : []
  const summary = result?.summary ?? {}
  const exactMatch = Number.isFinite(summary.exactMatch) ? summary.exactMatch : 0
  const possibleMatch = Number.isFinite(summary.possibleMatch) ? summary.possibleMatch : 0
  const newProduct = Number.isFinite(summary.newProduct) ? summary.newProduct : 0
  const invalidSource = Number.isFinite(summary.invalidSource) ? summary.invalidSource : 0
  const previewRows = matches.slice(0, INVENTORY_OPERATIONAL_MATCHING_PREVIEW_LIMIT)

  return (
    <div
      className="inventory-operational-matching"
      aria-label="Operational matching result"
      data-match-total={matches.length}
      data-match-preview-count={previewRows.length}
    >
      <section className="inventory-operational-review-summary inventory-operational-matching-summary">
        <h3 className="inventory-operational-review-title">
          Operational Matching
        </h3>
        <p className="inventory-operational-review-meta inventory-operational-matching-counts">
          <span>
            ✓ Exact Matches:
            {' '}
            {exactMatch}
          </span>
          <span>
            ⚠ Possible Matches:
            {' '}
            {possibleMatch}
          </span>
          <span>
            ➕ New Products:
            {' '}
            {newProduct}
          </span>
          <span>
            ✕ Invalid Rows:
            {' '}
            {invalidSource}
          </span>
          <span>Read-only</span>
        </p>
      </section>

      {matches.length === 0 ? (
        <div className="inventory-operational-review-empty" role="status">
          <p className="inventory-operational-review-empty-title">
            No matching rows
          </p>
          <p className="inventory-operational-review-empty-copy">
            The operational sheet did not yield any product rows to match.
          </p>
        </div>
      ) : (
        <ul className="inventory-operational-matching-rows">
          {previewRows.map((match, index) => {
            const presentation = getOperationalMatchStatusPresentation(match.status)
            const productName = typeof match.source?.product?.name === 'string'
              && match.source.product.name.trim()
              ? match.source.product.name
              : '—'

            return (
              <li
                key={`match-row-${index}`}
                className="inventory-operational-matching-row"
                data-match-status={match.status}
              >
                <span className="inventory-operational-matching-product">
                  {productName}
                </span>
                <span
                  className={`inventory-operational-matching-badge ${presentation.className}`}
                >
                  {presentation.symbol}
                  {' '}
                  {presentation.label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

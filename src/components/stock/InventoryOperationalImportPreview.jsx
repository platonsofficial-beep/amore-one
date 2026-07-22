/**
 * P8.16.12 — Read-only Operational Import Preview Workspace UI.
 *
 * Presentation only. Does not build Apply plans, resolve matches, or mutate data.
 */

import { useMemo } from 'react'
import {
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS,
} from '../../lib/inventoryOperationalImportPreview'

export const INVENTORY_OPERATIONAL_IMPORT_PREVIEW_UI_LIMIT = 50

const WEEKDAY_ORDER = Object.freeze([
  ['monday', 'Mon'],
  ['tuesday', 'Tue'],
  ['wednesday', 'Wed'],
  ['thursday', 'Thu'],
  ['friday', 'Fri'],
  ['saturday', 'Sat'],
  ['sunday', 'Sun'],
])

const WARNING_LABELS = Object.freeze({
  matched_item_inactive: 'Existing ONE product is inactive',
  category_defaulted_to_other: 'Category will default to Other',
  source_quantity_requires_policy: 'Source quantities need an import policy',
  source_location_requires_policy: 'Source location needs an import policy',
  source_order_unmapped: 'Order value is not mapped',
  source_stock_control_unmapped: 'Stock Control value is not mapped',
  source_weekdays_unmapped: 'Weekday values are not mapped',
})

const BLOCKER_LABELS = Object.freeze({
  possible_match_unresolved: 'Match must be resolved',
  unit_missing: 'Unit is missing',
  invalid_source_name: 'Product name is invalid',
  quantity_policy_unset: 'Quantity policy is not set',
  location_policy_unset: 'Location policy is not set',
})

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatOperationalImportPreviewValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? '—' : trimmed
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '—'
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return '—'
}

/**
 * @param {string|undefined} code
 * @returns {string}
 */
export function getOperationalImportPreviewWarningLabel(code) {
  if (typeof code !== 'string' || !code) return String(code ?? '')
  return WARNING_LABELS[code] ?? code
}

/**
 * @param {string|undefined} code
 * @returns {string}
 */
export function getOperationalImportPreviewBlockerLabel(code) {
  if (typeof code !== 'string' || !code) return String(code ?? '')
  return BLOCKER_LABELS[code] ?? code
}

/**
 * @param {string|undefined} action
 * @returns {{ label: string, className: string }}
 */
export function getOperationalImportPreviewActionPresentation(action) {
  switch (action) {
    case INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING:
      return { label: 'Existing link', className: 'is-link' }
    case INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW:
      return { label: 'New product', className: 'is-create' }
    case INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION:
      return { label: 'Needs resolution', className: 'is-resolve' }
    case INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED:
      return { label: 'Blocked', className: 'is-blocked' }
    case INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID:
      return { label: 'Invalid', className: 'is-invalid' }
    default:
      return { label: action ? String(action) : 'Unknown', className: 'is-unknown' }
  }
}

/**
 * @param {string|undefined} status
 * @returns {string}
 */
export function getOperationalImportPreviewPolicyLabel(status) {
  if (status === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY) {
    return 'Policy required'
  }
  if (status === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE) {
    return 'Not applicable'
  }
  return status ? String(status) : 'Not applicable'
}

/**
 * @param {unknown} weekdays
 * @returns {string|null}
 */
export function formatOperationalImportPreviewWeekdaySummary(weekdays) {
  if (!weekdays || typeof weekdays !== 'object' || Array.isArray(weekdays)) return null

  const parts = []
  for (const [key, label] of WEEKDAY_ORDER) {
    const formatted = formatOperationalImportPreviewValue(weekdays[key])
    if (formatted === '—') continue
    parts.push(`${label}: ${formatted}`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * @param {{
 *   preview?: {
 *     rows?: object[],
 *     summary?: Record<string, number>,
 *   }|null,
 *   errorMessage?: string,
 * }} props
 */
export function InventoryOperationalImportPreview({
  preview = null,
  errorMessage = '',
} = {}) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : []
  const summary = preview?.summary ?? {}
  const visibleRows = useMemo(
    () => rows.slice(0, INVENTORY_OPERATIONAL_IMPORT_PREVIEW_UI_LIMIT),
    [rows],
  )
  const hasError = typeof errorMessage === 'string' && errorMessage.trim() !== ''

  if (hasError) {
    return (
      <div
        className="inventory-operational-import-preview"
        aria-label="Operational import preview"
        data-preview-state="error"
      >
        <div
          className="inventory-operational-review-empty inventory-operational-import-preview-error"
          role="alert"
        >
          <p className="inventory-operational-review-empty-title">
            Unable to build import preview
          </p>
          <p className="inventory-operational-review-empty-copy">
            {errorMessage}
          </p>
        </div>
      </div>
    )
  }

  const total = Number.isFinite(summary.total) ? summary.total : rows.length
  const linkExisting = Number.isFinite(summary.linkExisting) ? summary.linkExisting : 0
  const createNew = Number.isFinite(summary.createNew) ? summary.createNew : 0
  const requiresResolution = Number.isFinite(summary.requiresResolution)
    ? summary.requiresResolution
    : 0
  const blocked = Number.isFinite(summary.blocked) ? summary.blocked : 0
  const missingUnits = Number.isFinite(summary.missingUnits) ? summary.missingUnits : 0

  return (
    <div
      className="inventory-operational-import-preview"
      aria-label="Operational import preview"
      data-preview-state="ready"
      data-preview-total={total}
      data-preview-visible={visibleRows.length}
    >
      <header className="inventory-operational-import-preview-header">
        <div className="inventory-operational-import-preview-header-text">
          <h3 className="inventory-operational-review-title">
            Operational Import Preview
          </h3>
          <p className="inventory-operational-import-preview-subtext">
            Review source data, existing ONE matches, proposed actions, warnings, and blockers before any import.
          </p>
        </div>
        <span className="inventory-operational-import-preview-readonly-badge">
          Read-only
        </span>
      </header>

      <section
        className="inventory-operational-import-preview-summary"
        aria-label="Import preview summary"
      >
        <div className="inventory-operational-import-preview-summary-card">
          <span className="inventory-operational-import-preview-summary-label">Total rows</span>
          <span className="inventory-operational-import-preview-summary-value">{total}</span>
        </div>
        <div className="inventory-operational-import-preview-summary-card">
          <span className="inventory-operational-import-preview-summary-label">Existing links</span>
          <span className="inventory-operational-import-preview-summary-value">{linkExisting}</span>
        </div>
        <div className="inventory-operational-import-preview-summary-card">
          <span className="inventory-operational-import-preview-summary-label">New products</span>
          <span className="inventory-operational-import-preview-summary-value">{createNew}</span>
        </div>
        <div className="inventory-operational-import-preview-summary-card">
          <span className="inventory-operational-import-preview-summary-label">Needs resolution</span>
          <span className="inventory-operational-import-preview-summary-value">{requiresResolution}</span>
        </div>
        <div className="inventory-operational-import-preview-summary-card">
          <span className="inventory-operational-import-preview-summary-label">Blocked</span>
          <span className="inventory-operational-import-preview-summary-value">{blocked}</span>
        </div>
        <div className="inventory-operational-import-preview-summary-card">
          <span className="inventory-operational-import-preview-summary-label">Missing units</span>
          <span className="inventory-operational-import-preview-summary-value">{missingUnits}</span>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="inventory-operational-review-empty" role="status">
          <p className="inventory-operational-review-empty-title">
            No import preview rows
          </p>
          <p className="inventory-operational-review-empty-copy">
            This worksheet did not produce any operational products to review.
          </p>
        </div>
      ) : (
        <>
          {total > INVENTORY_OPERATIONAL_IMPORT_PREVIEW_UI_LIMIT ? (
            <p className="inventory-operational-import-preview-limit-note" role="status">
              Showing first
              {' '}
              {INVENTORY_OPERATIONAL_IMPORT_PREVIEW_UI_LIMIT}
              {' '}
              of
              {' '}
              {total}
              {' '}
              rows
            </p>
          ) : null}

          <ul className="inventory-operational-import-preview-rows">
            {visibleRows.map((row, index) => {
              const action = getOperationalImportPreviewActionPresentation(row.proposedAction)
              const weekdaySummary = formatOperationalImportPreviewWeekdaySummary(row.source?.weekdays)
              const productName = formatOperationalImportPreviewValue(row.source?.productName)
              const category = formatOperationalImportPreviewValue(row.source?.category)

              return (
                <li
                  key={`import-preview-row-${index}`}
                  className="inventory-operational-import-preview-row"
                  data-proposed-action={row.proposedAction}
                >
                  <div className="inventory-operational-import-preview-row-identity">
                    <div className="inventory-operational-import-preview-row-identity-text">
                      <h4 className="inventory-operational-import-preview-product">
                        {productName}
                      </h4>
                      <p className="inventory-operational-import-preview-category">
                        {category}
                      </p>
                    </div>
                    <span className={`inventory-operational-import-preview-action ${action.className}`}>
                      {action.label}
                    </span>
                  </div>

                  <dl className="inventory-operational-import-preview-facts">
                    <div>
                      <dt>Storage</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.storage)}</dd>
                    </div>
                    <div>
                      <dt>BAR</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.bar)}</dd>
                    </div>
                    <div>
                      <dt>Order</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.order)}</dd>
                    </div>
                    <div>
                      <dt>Stock Control</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.stockControl)}</dd>
                    </div>
                  </dl>

                  {weekdaySummary ? (
                    <p className="inventory-operational-import-preview-weekdays">
                      Weekdays:
                      {' '}
                      {weekdaySummary}
                    </p>
                  ) : null}

                  <div className="inventory-operational-import-preview-match">
                    {renderMatchPanel(row)}
                  </div>

                  <dl className="inventory-operational-import-preview-policy">
                    <div>
                      <dt>Quantity</dt>
                      <dd>{getOperationalImportPreviewPolicyLabel(row.quantityProposal?.status)}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{getOperationalImportPreviewPolicyLabel(row.locationProposal?.status)}</dd>
                    </div>
                  </dl>

                  {(row.warnings?.length > 0 || row.blockers?.length > 0) ? (
                    <div className="inventory-operational-import-preview-chips">
                      {(row.warnings ?? []).map((code) => (
                        <span
                          key={`warning-${code}`}
                          className="inventory-operational-import-preview-chip is-warning"
                        >
                          {getOperationalImportPreviewWarningLabel(code)}
                        </span>
                      ))}
                      {(row.blockers ?? []).map((code) => (
                        <span
                          key={`blocker-${code}`}
                          className="inventory-operational-import-preview-chip is-blocker"
                        >
                          {getOperationalImportPreviewBlockerLabel(code)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

/**
 * @param {object} row
 */
function renderMatchPanel(row) {
  const action = row.proposedAction

  if (action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING) {
    const item = row.existingOne
    const activeLabel = item?.active === false ? 'Inactive' : 'Active'
    return (
      <div className="inventory-operational-import-preview-match-panel">
        <p className="inventory-operational-import-preview-match-title">
          Existing ONE product
        </p>
        <p className="inventory-operational-import-preview-match-body">
          {formatOperationalImportPreviewValue(item?.name)}
          {' · '}
          {formatOperationalImportPreviewValue(item?.category)}
          {' · '}
          Unit:
          {' '}
          {formatOperationalImportPreviewValue(item?.unit)}
          {' · '}
          {activeLabel}
        </p>
      </div>
    )
  }

  if (action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION) {
    const candidates = Array.isArray(row.match?.candidates) ? row.match.candidates : []
    const firstName = candidates[0]?.stockItem?.name
    return (
      <div className="inventory-operational-import-preview-match-panel">
        <p className="inventory-operational-import-preview-match-title">
          Requires resolution
        </p>
        <p className="inventory-operational-import-preview-match-body">
          {candidates.length}
          {' '}
          candidate
          {candidates.length === 1 ? '' : 's'}
          {firstName ? ` · First: ${formatOperationalImportPreviewValue(firstName)}` : ''}
        </p>
      </div>
    )
  }

  if (action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW) {
    return (
      <div className="inventory-operational-import-preview-match-panel">
        <p className="inventory-operational-import-preview-match-title">
          Will create new product
        </p>
        <p className="inventory-operational-import-preview-match-body">
          Category:
          {' '}
          {formatOperationalImportPreviewValue(row.metadataProposal?.proposedCategory)}
          {' · '}
          Unit: Missing
        </p>
      </div>
    )
  }

  if (action === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID) {
    return (
      <div className="inventory-operational-import-preview-match-panel">
        <p className="inventory-operational-import-preview-match-title">
          Invalid source row
        </p>
      </div>
    )
  }

  return (
    <div className="inventory-operational-import-preview-match-panel">
      <p className="inventory-operational-import-preview-match-title">
        Blocked
      </p>
    </div>
  )
}

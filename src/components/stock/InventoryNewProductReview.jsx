/**
 * P8.16.14 / P8.26.6 — New product review & unit/storage assignment workspace.
 *
 * Wizard-local drafts only. No database writes, product creation, or Apply.
 */

import {
  INVENTORY_NEW_PRODUCT_UNITS,
  getNewProductDraftDefaults,
  listCreateNewPreviewRows,
  mergeNewProductDraft,
  validateNewProductDraft,
} from '../../lib/inventoryNewProductDrafts'
import { INVENTORY_UNIT_INFERENCE_STATUS } from '../../lib/inventoryUnitInference'
import { formatOperationalImportPreviewValue } from './InventoryOperationalImportPreview'
import { WorkspaceStorageSelector } from './WorkspaceStorageSelector'

/**
 * @param {{
 *   preview?: object|null,
 *   drafts?: Record<string, {
 *     productName?: string,
 *     category?: string,
 *     unit?: string|null,
 *     storage?: string|null,
 *   }>,
 *   categoryOptions?: string[],
 *   workspaceId?: string,
 *   onChangeDraft?: (rowKey: string, next: {
 *     productName: string,
 *     category: string,
 *     unit: string|null,
 *     storage: string|null,
 *   }) => void,
 * }} props
 */
export function InventoryNewProductReview({
  preview = null,
  drafts = {},
  categoryOptions = [],
  workspaceId = '',
  onChangeDraft = undefined,
} = {}) {
  const createRows = listCreateNewPreviewRows(preview)
  let unitsSuggested = 0
  let needUnitSelection = 0

  const cards = createRows.map(({ key, row }) => {
    const defaults = getNewProductDraftDefaults(row)
    const merged = mergeNewProductDraft(row, drafts[key] ?? defaults)
    const validation = validateNewProductDraft(merged)
    const inferredUnit = defaults.unitInference?.status === INVENTORY_UNIT_INFERENCE_STATUS.INFERRED
      ? defaults.unitInference.proposedUnit
      : null
    const showingSuggested = Boolean(
      inferredUnit
      && merged.unit === inferredUnit,
    )
    if (showingSuggested) unitsSuggested += 1
    if (!merged.unit) needUnitSelection += 1

    return {
      key,
      row,
      merged,
      validation,
      showingSuggested,
    }
  })

  function emitDraft(key, merged, patch) {
    onChangeDraft?.(key, {
      productName: patch.productName ?? merged.productName,
      category: patch.category ?? merged.category,
      unit: patch.unit !== undefined ? patch.unit : merged.unit,
      storage: patch.storage !== undefined ? patch.storage : merged.storage,
    })
  }

  return (
    <section
      className="inventory-new-product-review"
      aria-label="New products"
      data-new-product-count={createRows.length}
      data-units-suggested={unitsSuggested}
      data-need-unit-selection={needUnitSelection}
    >
      <header className="inventory-new-product-review-header">
        <div>
          <h3 className="inventory-operational-review-title">
            New Products
          </h3>
          <p className="inventory-new-product-review-subtext">
            Review every new product before import.
          </p>
          <p className="inventory-new-product-review-guidance">
            ONE has suggested units where possible. Confirm Product Name, Category, Unit, and Storage.
          </p>
        </div>
      </header>

      {createRows.length === 0 ? (
        <div className="inventory-operational-review-empty" role="status">
          <p className="inventory-operational-review-empty-title">
            No new products
          </p>
          <p className="inventory-operational-review-empty-copy">
            All rows will link to existing ONE products or be skipped.
          </p>
        </div>
      ) : (
        <>
          <p className="inventory-new-product-review-summary" role="status">
            <span>
              Units suggested:
              {' '}
              {unitsSuggested}
            </span>
            <span>
              Need unit selection:
              {' '}
              {needUnitSelection}
            </span>
          </p>
          <ul className="inventory-new-product-review-list">
            {cards.map(({ key, row, merged, validation, showingSuggested }) => {
              const categories = Array.from(new Set([
                ...categoryOptions,
                ...(merged.category ? [merged.category] : []),
              ])).sort((a, b) => a.localeCompare(b))

              return (
                <li
                  key={key}
                  className="inventory-new-product-review-card"
                  data-row-key={key}
                  data-draft-valid={validation.valid ? 'true' : 'false'}
                  data-unit-suggested={showingSuggested ? 'true' : 'false'}
                  data-storage={merged.storage ?? ''}
                >
                  <div className="inventory-new-product-review-card-head">
                    <div>
                      <h4 className="inventory-new-product-review-source-name">
                        {formatOperationalImportPreviewValue(row.source?.productName)}
                      </h4>
                      <p className="inventory-new-product-review-source-category">
                        {formatOperationalImportPreviewValue(row.source?.category)}
                      </p>
                    </div>
                    <span className="inventory-new-product-review-badge">
                      New Product
                    </span>
                  </div>

                  <dl className="inventory-new-product-review-facts">
                    <div>
                      <dt>Source storage</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.storage)}</dd>
                    </div>
                    <div>
                      <dt>BAR</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.bar)}</dd>
                    </div>
                  </dl>

                  <div className="inventory-new-product-review-fields">
                    <label className="inventory-new-product-review-field">
                      <span>Product Name</span>
                      <input
                        type="text"
                        value={merged.productName}
                        aria-invalid={validation.errors.productName ? 'true' : undefined}
                        onChange={(event) => {
                          emitDraft(key, merged, { productName: event.target.value })
                        }}
                      />
                      {validation.errors.productName ? (
                        <span className="inventory-new-product-review-error" role="alert">
                          {validation.errors.productName}
                        </span>
                      ) : null}
                    </label>

                    <label className="inventory-new-product-review-field">
                      <span>Category</span>
                      <select
                        value={merged.category}
                        aria-invalid={validation.errors.category ? 'true' : undefined}
                        onChange={(event) => {
                          emitDraft(key, merged, { category: event.target.value })
                        }}
                      >
                        {categories.length === 0 ? (
                          <option value="">Select category</option>
                        ) : null}
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      {validation.errors.category ? (
                        <span className="inventory-new-product-review-error" role="alert">
                          {validation.errors.category}
                        </span>
                      ) : null}
                    </label>

                    <label className="inventory-new-product-review-field">
                      <span>Unit</span>
                      <select
                        value={merged.unit ?? ''}
                        aria-invalid={validation.errors.unit ? 'true' : undefined}
                        onChange={(event) => {
                          emitDraft(key, merged, {
                            unit: event.target.value === '' ? null : event.target.value,
                          })
                        }}
                      >
                        <option value="">Select unit</option>
                        {INVENTORY_NEW_PRODUCT_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      {showingSuggested ? (
                        <span className="inventory-new-product-review-hint">
                          Suggested from product name
                        </span>
                      ) : null}
                      {validation.errors.unit ? (
                        <span className="inventory-new-product-review-error" role="alert">
                          {validation.errors.unit}
                        </span>
                      ) : null}
                    </label>

                    <label className="inventory-new-product-review-field">
                      <span>Storage</span>
                      <WorkspaceStorageSelector
                        workspaceId={workspaceId}
                        value={merged.storage ?? ''}
                        variant="select"
                        emptyLabel="Select storage"
                        aria-label="Storage"
                        onChange={(locationKey) => {
                          emitDraft(key, merged, {
                            storage: locationKey === '' ? null : locationKey,
                          })
                        }}
                      />
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

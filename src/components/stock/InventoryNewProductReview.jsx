/**
 * P8.16.14 — New product review & unit assignment workspace.
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
import { formatOperationalImportPreviewValue } from './InventoryOperationalImportPreview'

/**
 * @param {{
 *   preview?: object|null,
 *   drafts?: Record<string, { productName?: string, category?: string, unit?: string|null }>,
 *   categoryOptions?: string[],
 *   onChangeDraft?: (rowKey: string, next: { productName: string, category: string, unit: string|null }) => void,
 * }} props
 */
export function InventoryNewProductReview({
  preview = null,
  drafts = {},
  categoryOptions = [],
  onChangeDraft = undefined,
} = {}) {
  const createRows = listCreateNewPreviewRows(preview)

  return (
    <section
      className="inventory-new-product-review"
      aria-label="New products"
      data-new-product-count={createRows.length}
    >
      <header className="inventory-new-product-review-header">
        <div>
          <h3 className="inventory-operational-review-title">
            New Products
          </h3>
          <p className="inventory-new-product-review-subtext">
            Review every new product before importing it into ONE.
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
        <ul className="inventory-new-product-review-list">
          {createRows.map(({ key, row }) => {
            const merged = mergeNewProductDraft(row, drafts[key] ?? getNewProductDraftDefaults(row))
            const validation = validateNewProductDraft(merged)
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
                    <dt>Storage</dt>
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
                        onChangeDraft?.(key, {
                          ...merged,
                          productName: event.target.value,
                        })
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
                        onChangeDraft?.(key, {
                          ...merged,
                          category: event.target.value,
                        })
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
                        onChangeDraft?.(key, {
                          ...merged,
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
                    {validation.errors.unit ? (
                      <span className="inventory-new-product-review-error" role="alert">
                        {validation.errors.unit}
                      </span>
                    ) : null}
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

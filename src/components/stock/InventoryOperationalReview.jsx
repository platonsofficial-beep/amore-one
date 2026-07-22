/**
 * P8.16.6 — Read-only Operational Review Workspace.
 */

import { InventoryOperationalCategory } from './InventoryOperationalCategory'

/**
 * @param {string|undefined} parserVersion
 * @returns {string}
 */
export function formatOperationalParserVersionLabel(parserVersion) {
  if (typeof parserVersion !== 'string' || !parserVersion) return 'v1'
  const match = /v(\d+)$/i.exec(parserVersion)
  if (match) return `v${match[1]}`
  return parserVersion
}

/**
 * @param {{
 *   model: {
 *     parserVersion?: string,
 *     categories?: Array<{
 *       name: string|null,
 *       products: Array<object>,
 *     }>,
 *     summary?: {
 *       categoryCount?: number,
 *       productCount?: number,
 *     },
 *   }|null|undefined,
 * }} props
 */
export function InventoryOperationalReview({ model = null } = {}) {
  const categories = Array.isArray(model?.categories) ? model.categories : []
  const categoryCount = Number.isFinite(model?.summary?.categoryCount)
    ? model.summary.categoryCount
    : categories.length
  const productCount = Number.isFinite(model?.summary?.productCount)
    ? model.summary.productCount
    : categories.reduce((total, category) => total + (category.products?.length ?? 0), 0)
  const parserLabel = formatOperationalParserVersionLabel(model?.parserVersion)

  return (
    <div className="inventory-operational-review" aria-label="Operational weekly stock review">
      <section className="inventory-operational-review-summary">
        <h3 className="inventory-operational-review-title">
          Operational Weekly Stock Sheet
        </h3>
        <p className="inventory-operational-review-meta">
          <span>Categories: {categoryCount}</span>
          <span>Products: {productCount}</span>
          <span>Parser: {parserLabel}</span>
          <span>Read-only</span>
        </p>
      </section>

      {categoryCount === 0 ? (
        <div className="inventory-operational-review-empty" role="status">
          <p className="inventory-operational-review-empty-title">
            No categories detected
          </p>
          <p className="inventory-operational-review-empty-copy">
            This operational worksheet did not yield any category groups to preview.
          </p>
        </div>
      ) : (
        <div className="inventory-operational-review-categories">
          {categories.map((category, index) => (
            <InventoryOperationalCategory
              key={`${category.name ?? 'uncategorized'}-${index}`}
              category={category}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  )
}

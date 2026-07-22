/**
 * P8.16.6 — Read-only expandable operational category block.
 */

import { useState } from 'react'
import { InventoryOperationalProductRow } from './InventoryOperationalProductRow'

/**
 * @param {{
 *   category: {
 *     name: string|null,
 *     products: Array<{
 *       name: string,
 *       storage: unknown,
 *       bar: unknown,
 *       order: unknown,
 *       stockControl: unknown,
 *     }>,
 *   },
 *   index: number,
 * }} props
 */
export function InventoryOperationalCategory({ category, index }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const label = category.name?.trim() ? category.name : 'Uncategorized'
  const productCount = category.products?.length ?? 0
  const panelId = `inventory-operational-category-panel-${index}`

  return (
    <section className="inventory-operational-category">
      <button
        type="button"
        className="inventory-operational-category-toggle"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="inventory-operational-category-chevron" aria-hidden="true">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="inventory-operational-category-label">
          {label}
          {' '}
          <span className="inventory-operational-category-count">
            ({productCount})
          </span>
        </span>
      </button>

      {isExpanded ? (
        <div id={panelId} className="inventory-operational-category-panel">
          {productCount === 0 ? (
            <p className="inventory-operational-category-empty">
              No products in this category.
            </p>
          ) : (
            category.products.map((product, productIndex) => (
              <InventoryOperationalProductRow
                key={`${label}-${product.name}-${productIndex}`}
                product={product}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}

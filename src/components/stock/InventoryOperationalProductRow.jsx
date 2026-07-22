/**
 * P8.16.6 — Read-only operational weekly stock product row.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatOperationalReviewValue(value) {
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
 * @param {{
 *   product: {
 *     name: string,
 *     storage: unknown,
 *     bar: unknown,
 *     order: unknown,
 *     stockControl: unknown,
 *   },
 * }} props
 */
export function InventoryOperationalProductRow({ product }) {
  return (
    <div className="inventory-operational-product-row">
      <p className="inventory-operational-product-name">{product.name}</p>
      <dl className="inventory-operational-product-metrics">
        <div>
          <dt>Storage</dt>
          <dd>{formatOperationalReviewValue(product.storage)}</dd>
        </div>
        <div>
          <dt>BAR</dt>
          <dd>{formatOperationalReviewValue(product.bar)}</dd>
        </div>
        <div>
          <dt>Order</dt>
          <dd>{formatOperationalReviewValue(product.order)}</dd>
        </div>
        <div>
          <dt>Stock Control</dt>
          <dd>{formatOperationalReviewValue(product.stockControl)}</dd>
        </div>
      </dl>
    </div>
  )
}

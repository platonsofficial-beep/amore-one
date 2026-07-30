/**
 * P8.30.5 / P8.30.6 — Choose a product already in this storage.
 * Scoped to products with balances in the current storage.
 */

import { buildProductDisplayNameFromItem } from '../../lib/stockProductIdentity'

/**
 * @param {{
 *   storage: object,
 *   products?: object[],
 *   title?: string,
 *   subtitlePrefix?: string,
 *   emptyMessage?: string,
 *   testId?: string,
 *   onClose: () => void,
 *   onSelectProduct: (row: object) => void,
 * }} props
 */
export function StockStorageReceiveProductPicker({
  storage,
  products = [],
  title = 'Receive stock',
  subtitlePrefix = 'Destination',
  emptyMessage = 'No products with a balance in this storage yet.',
  testId = 'stock-storage-receive-product-picker',
  onClose,
  onSelectProduct,
} = {}) {
  const storageTitle = storage?.name || storage?.locationKey || 'Storage'
  const list = Array.isArray(products) ? products : []

  return (
    <div
      className="employee-modal-backdrop task-modal-backdrop"
      onClick={onClose}
      data-testid={testId}
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3>{title}</h3>
            <p className="stock-modal-subtitle">
              {subtitlePrefix}: {storageTitle}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="stock-storage-receive-picker-body">
          <p className="stock-storage-receive-picker-copy">
            Choose a product for this storage.
          </p>
          {list.length === 0 ? (
            <div className="staff-status-banner" role="status">
              {emptyMessage}
            </div>
          ) : (
            <div className="stock-storage-receive-picker-list" role="list">
              {list.map((row) => {
                const displayTitle = buildProductDisplayNameFromItem(row)
                return (
                  <button
                    key={row.stockItemId}
                    type="button"
                    role="listitem"
                    className="stock-storage-receive-picker-item"
                    data-stock-item-id={row.stockItemId}
                    onClick={() => onSelectProduct(row)}
                  >
                    <span className="stock-storage-receive-picker-name">{displayTitle}</span>
                    <span className="stock-storage-receive-picker-meta">
                      {row.category || 'Other'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

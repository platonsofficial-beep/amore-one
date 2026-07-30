/**
 * P8.30.5 — Choose a product already in this storage before Receive.
 * Existing Inventory Count location RPC requires a balance row; picker is scoped
 * to products with balances in the destination storage.
 */

/**
 * @param {{
 *   storage: object,
 *   products?: object[],
 *   onClose: () => void,
 *   onSelectProduct: (row: object) => void,
 * }} props
 */
export function StockStorageReceiveProductPicker({
  storage,
  products = [],
  onClose,
  onSelectProduct,
} = {}) {
  const storageTitle = storage?.name || storage?.locationKey || 'Storage'
  const list = Array.isArray(products) ? products : []

  return (
    <div
      className="employee-modal-backdrop task-modal-backdrop"
      onClick={onClose}
      data-testid="stock-storage-receive-product-picker"
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3>Receive stock</h3>
            <p className="stock-modal-subtitle">
              Destination: {storageTitle}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="stock-storage-receive-picker-body">
          <p className="stock-storage-receive-picker-copy">
            Choose a product to receive into this storage.
          </p>
          {list.length === 0 ? (
            <div className="staff-status-banner" role="status">
              No products with a balance in this storage yet.
            </div>
          ) : (
            <div className="stock-storage-receive-picker-list" role="list">
              {list.map((row) => (
                <button
                  key={row.stockItemId}
                  type="button"
                  role="listitem"
                  className="stock-storage-receive-picker-item"
                  data-stock-item-id={row.stockItemId}
                  onClick={() => onSelectProduct(row)}
                >
                  <span className="stock-storage-receive-picker-name">{row.name}</span>
                  <span className="stock-storage-receive-picker-meta">
                    {row.category || 'Other'}
                  </span>
                </button>
              ))}
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

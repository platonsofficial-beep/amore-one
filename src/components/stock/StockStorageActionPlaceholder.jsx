/**
 * P8.30.3 — Storage action placeholder shell (entry points only).
 *
 * No mutations. No workflow implementation.
 */

export const STOCK_STORAGE_ACTION_PLACEHOLDERS = Object.freeze({
  fast_count: Object.freeze({
    id: 'fast_count',
    title: 'Fast Count',
    message: 'Fast Count for this storage will be available in the next sprint.',
  }),
  receive: Object.freeze({
    id: 'receive',
    title: 'Receive',
    message: 'Receiving for this storage will be available in a later sprint.',
  }),
  transfer: Object.freeze({
    id: 'transfer',
    title: 'Transfer',
    message: 'Transfers for this storage will be available in a later sprint.',
  }),
  adjustment: Object.freeze({
    id: 'adjustment',
    title: 'Adjustment',
    message: 'Adjustments launch from Storage Detail into the shared stock movement workflow.',
  }),
})

/**
 * @param {{
 *   actionId?: keyof typeof STOCK_STORAGE_ACTION_PLACEHOLDERS | null,
 *   storageName?: string,
 *   productName?: string,
 *   onClose?: () => void,
 * }} props
 */
export function StockStorageActionPlaceholder({
  actionId = null,
  storageName = '',
  productName = '',
  onClose,
} = {}) {
  const spec = actionId ? STOCK_STORAGE_ACTION_PLACEHOLDERS[actionId] : null
  if (!spec) return null

  const contextLabel = productName
    ? `${spec.title} · ${productName}`
    : storageName
      ? `${spec.title} · ${storageName}`
      : spec.title

  return (
    <div
      className="stock-storage-action-placeholder-backdrop"
      data-testid="stock-storage-action-placeholder"
      data-action={spec.id}
      onClick={onClose}
    >
      <aside
        className="stock-storage-action-placeholder-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-storage-action-placeholder-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="stock-storage-action-placeholder-header">
          <div>
            <p className="stock-storage-action-placeholder-eyebrow">Coming soon</p>
            <h2 id="stock-storage-action-placeholder-title" className="stock-storage-action-placeholder-title">
              {contextLabel}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn stock-storage-action-placeholder-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <p className="stock-storage-action-placeholder-message">{spec.message}</p>
        <footer className="stock-storage-action-placeholder-footer">
          <button type="button" className="primary-btn" onClick={onClose}>
            Got it
          </button>
        </footer>
      </aside>
    </div>
  )
}

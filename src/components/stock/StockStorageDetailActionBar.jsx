/**
 * P8.30.3 — Storage detail operational action bar (entry points only).
 */

/**
 * @param {{
 *   storage: object,
 *   canManage?: boolean,
 *   onStartFastCount?: (storage: object) => void,
 *   onReceive?: (storage: object) => void,
 *   onTransfer?: (storage: object) => void,
 *   onAdjustment?: (storage: object) => void,
 * }} props
 */
export function StockStorageDetailActionBar({
  storage,
  canManage = false,
  onStartFastCount,
  onReceive,
  onTransfer,
  onAdjustment,
} = {}) {
  if (!canManage) return null

  const isArchived = storage?.active === false
  const unavailableReason = isArchived
    ? 'Unavailable for archived storage'
    : undefined

  return (
    <div
      className="stock-storage-detail-action-bar"
      role="toolbar"
      aria-label="Storage actions"
      data-testid="stock-storage-detail-action-bar"
    >
      <button
        type="button"
        className="primary-btn stock-storage-detail-action-btn"
        data-storage-action="fast_count"
        disabled={isArchived}
        title={unavailableReason}
        onClick={() => onStartFastCount?.(storage)}
      >
        Fast Count
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="receive"
        disabled={isArchived}
        title={unavailableReason}
        onClick={() => onReceive?.(storage)}
      >
        Receive
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="transfer"
        disabled={isArchived}
        title={unavailableReason}
        onClick={() => onTransfer?.(storage)}
      >
        Transfer
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="adjustment"
        disabled={isArchived}
        title={unavailableReason}
        onClick={() => onAdjustment?.(storage)}
      >
        Adjustment
      </button>
    </div>
  )
}

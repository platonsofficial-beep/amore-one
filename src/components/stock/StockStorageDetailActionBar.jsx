/**
 * P8.30.3 / P8.30.4 — Storage detail operational action bar.
 */

/**
 * @param {{
 *   storage: object,
 *   canManage?: boolean,
 *   isLaunchingFastCount?: boolean,
 *   countDisabled?: boolean,
 *   onCountShelf?: (storage: object) => void,
 *   onStartFastCount?: (storage: object) => void,
 *   onReceive?: (storage: object) => void,
 *   onTransfer?: (storage: object) => void,
 *   onAdjustment?: (storage: object) => void,
 *   onWaste?: (storage: object) => void,
 *   onRename?: (storage: object) => void,
 * }} props
 */
export function StockStorageDetailActionBar({
  storage,
  canManage = false,
  isLaunchingFastCount = false,
  countDisabled = false,
  onCountShelf,
  onStartFastCount,
  onReceive,
  onTransfer,
  onAdjustment,
  onWaste,
  onRename,
} = {}) {
  if (!canManage) {
    if (storage?.isSupply === true) return null
    const isArchived = storage?.active === false
    const shelfCountDisabled = isArchived || countDisabled
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
          data-storage-action="staff_count"
          disabled={shelfCountDisabled}
          title={isArchived ? 'Unavailable for archived storage' : undefined}
          onClick={() => onCountShelf?.(storage)}
        >
          Count shelf
        </button>
      </div>
    )
  }

  const isArchived = storage?.active === false
  const fastCountDisabled = isArchived || isLaunchingFastCount
  const unavailableReason = isArchived
    ? 'Unavailable for archived storage'
    : isLaunchingFastCount
      ? 'Starting Fast Count…'
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
        disabled={fastCountDisabled}
        aria-busy={isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => onStartFastCount?.(storage)}
      >
        {isLaunchingFastCount ? 'Starting…' : 'Fast Count'}
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="receive"
        disabled={isArchived || isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => onReceive?.(storage)}
      >
        Receive
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="transfer"
        disabled={isArchived || isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => onTransfer?.(storage)}
      >
        Transfer
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="adjustment"
        disabled={isArchived || isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => onAdjustment?.(storage)}
      >
        Adjustment
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="waste"
        disabled={isArchived || isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => onWaste?.(storage)}
      >
        Waste
      </button>
      {onRename ? (
        <button
          type="button"
          className="ghost-btn stock-storage-detail-action-btn"
          data-storage-action="rename"
          onClick={() => onRename(storage)}
        >
          Rename
        </button>
      ) : null}
    </div>
  )
}

/**
 * P8.30.3 / P8.30.4 — Storage detail operational action bar.
 * 0012: in phone landscape, Transfer / Adjustment / Waste / Rename fold into a
 * "More" sheet (CSS only shows the toggle there). The buttons stay in the DOM
 * everywhere, so every action keeps working.
 */
import { useEffect, useState } from 'react'

/**
 * @param {{
 *   storage: object,
 *   canManage?: boolean,
 *   allowShelfCount?: boolean,
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
  allowShelfCount = false,
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
    if (storage?.isSupply === true || !allowShelfCount) return null
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

  return (
    <ManagerActionBar
      storage={storage}
      isLaunchingFastCount={isLaunchingFastCount}
      onStartFastCount={onStartFastCount}
      onReceive={onReceive}
      onTransfer={onTransfer}
      onAdjustment={onAdjustment}
      onWaste={onWaste}
      onRename={onRename}
    />
  )
}

function ManagerActionBar({
  storage,
  isLaunchingFastCount,
  onStartFastCount,
  onReceive,
  onTransfer,
  onAdjustment,
  onWaste,
  onRename,
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => {
    if (!moreOpen) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])
  const runMore = (handler) => {
    setMoreOpen(false)
    handler?.(storage)
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
        className="ghost-btn stock-storage-detail-action-btn stock-storage-detail-more-toggle"
        data-storage-action="more"
        aria-haspopup="true"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
      >
        More ⋯
      </button>
      {moreOpen ? (
        <button
          type="button"
          className="stock-storage-detail-more-backdrop"
          aria-label="Close more actions"
          tabIndex={-1}
          onClick={() => setMoreOpen(false)}
        />
      ) : null}
      <div
        className={`stock-storage-detail-more${moreOpen ? ' is-open' : ''}`}
        data-testid="stock-storage-detail-more"
        aria-label="More storage actions"
      >
      <p className="stock-storage-detail-more-title" aria-hidden="true">More actions</p>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="transfer"
        disabled={isArchived || isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => runMore(onTransfer)}
      >
        Transfer
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="adjustment"
        disabled={isArchived || isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => runMore(onAdjustment)}
      >
        Adjustment
      </button>
      <button
        type="button"
        className="ghost-btn stock-storage-detail-action-btn"
        data-storage-action="waste"
        disabled={isArchived || isLaunchingFastCount}
        title={unavailableReason}
        onClick={() => runMore(onWaste)}
      >
        Waste
      </button>
      {onRename ? (
        <button
          type="button"
          className="stock-storage-detail-action-btn is-tertiary"
          data-storage-action="rename"
          onClick={() => runMore(onRename)}
        >
          Rename
        </button>
      ) : null}
      </div>
    </div>
  )
}

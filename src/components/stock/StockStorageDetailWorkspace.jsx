/**
 * P8.30.2 — Storage detail products workspace (read-only).
 *
 * Shows products with quantity in THIS storage only.
 * Reuses StockProductHistoryDrawer for product detail — no forked drawer.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatStockInventoryValue, formatStockQuantity } from '../../lib/stockUtils'
import {
  STOCK_STORAGE_PRODUCT_SORT_OPTIONS,
  filterStorageProductRows,
  getWorkspaceStorageProducts,
  sortStorageProductRows,
} from '../../services/stockStorageCenterService'
import { StockProductHistoryDrawer } from './StockProductHistoryDrawer'

/**
 * @param {{
 *   row: object,
 *   onOpen?: (row: object) => void,
 * }} props
 */
function StorageProductRow({ row, onOpen }) {
  return (
    <button
      type="button"
      className={`stock-storage-product-row${row.active ? '' : ' is-inactive'}`}
      data-stock-item-id={row.stockItemId}
      onClick={() => onOpen?.(row)}
    >
      <div className="stock-storage-product-row-main">
        <strong className="stock-storage-product-name">{row.name}</strong>
        <span className="stock-storage-product-category">{row.category || 'Other'}</span>
      </div>
      <div className="stock-storage-product-row-meta">
        <span className="stock-storage-product-qty">
          {formatStockQuantity(row.quantity, row.unit)}
        </span>
        <span className={`stock-storage-product-badge tone-${row.active ? 'active' : 'inactive'}`}>
          {row.active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </button>
  )
}

/**
 * @param {{
 *   workspaceId?: string,
 *   storage: object,
 *   searchTerm?: string,
 *   onBack?: () => void,
 *   loadProducts?: typeof getWorkspaceStorageProducts,
 * }} props
 */
export function StockStorageDetailWorkspace({
  workspaceId = '',
  storage,
  searchTerm = '',
  onBack,
  loadProducts = getWorkspaceStorageProducts,
} = {}) {
  const [status, setStatus] = useState(/** @type {'loading'|'ready'|'empty'|'error'} */ ('loading'))
  const [errorMessage, setErrorMessage] = useState('')
  const [payload, setPayload] = useState(/** @type {Awaited<ReturnType<typeof getWorkspaceStorageProducts>>|null} */ (null))
  const [sortKey, setSortKey] = useState('name-asc')
  const [historyItem, setHistoryItem] = useState(/** @type {object|null} */ (null))
  const [reloadToken, setReloadToken] = useState(0)

  const storageId = `${storage?.id ?? ''}`.trim()
  const storageTitle = storage?.name || storage?.locationKey || 'Storage'

  useEffect(() => {
    let cancelled = false
    const workspaceKey = `${workspaceId ?? ''}`.trim()

    if (!workspaceKey || !storageId) {
      setStatus('empty')
      setPayload(null)
      setErrorMessage('')
      return undefined
    }

    setStatus('loading')
    setErrorMessage('')

    ;(async () => {
      try {
        const next = await loadProducts(workspaceKey, storageId)
        if (cancelled) return
        setPayload(next)
        setStatus(next.products.length === 0 ? 'empty' : 'ready')
      } catch (error) {
        if (cancelled) return
        setPayload(null)
        setStatus('error')
        setErrorMessage(error?.message || 'Unable to load storage products right now.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId, storageId, loadProducts, reloadToken])

  const visibleProducts = useMemo(() => {
    const rows = payload?.products ?? []
    return sortStorageProductRows(filterStorageProductRows(rows, searchTerm), sortKey)
  }, [payload, searchTerm, sortKey])

  const summary = payload?.summary
  const headerProductCount = summary?.productCount ?? storage?.productCount ?? 0
  const headerQuantity = summary?.totalQuantity ?? storage?.totalQuantity ?? 0
  const headerValue = summary?.inventoryValue ?? storage?.inventoryValue ?? 0

  return (
    <section
      className="stock-storage-detail-workspace"
      aria-label={`${storageTitle} products`}
      data-testid="stock-storage-detail-workspace"
    >
      <header className="stock-storage-detail-workspace-header">
        <div className="stock-storage-detail-workspace-header-top">
          <button
            type="button"
            className="stock-storage-detail-back"
            onClick={() => onBack?.()}
            aria-label="Back to storages"
          >
            ← Storages
          </button>
          <span className={`stock-storage-center-status tone-${storage?.active !== false ? 'active' : 'archived'}`}>
            {storage?.active !== false ? 'Active' : 'Archived'}
          </span>
        </div>
        <div className="stock-storage-detail-workspace-header-copy">
          <h2 className="stock-storage-detail-workspace-title">{storageTitle}</h2>
          {storage?.locationKey && storage.locationKey !== storageTitle ? (
            <p className="stock-storage-detail-workspace-key">{storage.locationKey}</p>
          ) : null}
        </div>
        <dl className="stock-storage-detail-workspace-stats">
          <div>
            <dt>Products</dt>
            <dd>{headerProductCount}</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>{formatStockQuantity(headerQuantity)}</dd>
          </div>
          <div>
            <dt>Inventory value</dt>
            <dd>{formatStockInventoryValue(headerValue)}</dd>
          </div>
        </dl>
      </header>

      <div className="stock-storage-detail-workspace-toolbar">
        <label className="stock-storage-detail-sort">
          <span>Sort</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
            aria-label="Sort storage products"
          >
            {STOCK_STORAGE_PRODUCT_SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <p className="stock-storage-detail-result-count" role="status">
          {status === 'ready' || status === 'empty'
            ? `${visibleProducts.length} product${visibleProducts.length === 1 ? '' : 's'}`
            : null}
        </p>
      </div>

      {status === 'loading' ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-detail-loading">
          Loading products…
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="stock-storage-center-state is-error" role="alert" data-testid="stock-storage-detail-error">
          <p>{errorMessage}</p>
          <button
            type="button"
            className="stock-storage-center-retry"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === 'empty' ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-detail-empty">
          <p className="stock-storage-center-empty-title">No products in this storage.</p>
          <p className="stock-storage-center-empty-copy">
            Products appear here when they have a balance in this location.
          </p>
        </div>
      ) : null}

      {status === 'ready' && visibleProducts.length === 0 ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-detail-no-matches">
          No products match this search.
        </div>
      ) : null}

      {status === 'ready' && visibleProducts.length > 0 ? (
        <div className="stock-storage-product-list" role="list" data-testid="stock-storage-product-list">
          {visibleProducts.map((row) => (
            <div key={row.stockItemId} role="listitem">
              <StorageProductRow row={row} onOpen={(next) => setHistoryItem(next.item)} />
            </div>
          ))}
        </div>
      ) : null}

      {historyItem ? (
        <StockProductHistoryDrawer
          item={historyItem}
          workspaceId={workspaceId}
          canManage={false}
          onClose={() => setHistoryItem(null)}
        />
      ) : null}
    </section>
  )
}

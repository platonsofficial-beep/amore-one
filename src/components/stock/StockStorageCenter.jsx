/**
 * P8.30.1 — Storage Center read-only foundation.
 *
 * Lists workspace storages with balance summaries. No mutations.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatStockInventoryValue, formatStockQuantity } from '../../lib/stockUtils'
import { getWorkspaceStorageSummaries } from '../../services/stockStorageCenterService'

/**
 * @param {{
 *   storage: object,
 *   selected?: boolean,
 *   onSelect?: (storage: object) => void,
 * }} props
 */
function StorageSummaryCard({ storage, selected = false, onSelect }) {
  return (
    <button
      type="button"
      className={`stock-storage-center-card${selected ? ' is-selected' : ''}${storage.active ? '' : ' is-archived'}`}
      data-storage-id={storage.id}
      data-storage-status={storage.status}
      aria-pressed={selected}
      onClick={() => onSelect?.(storage)}
    >
      <div className="stock-storage-center-card-top">
        <div>
          <strong className="stock-storage-center-card-name">
            {storage.name || storage.locationKey || 'Unnamed storage'}
          </strong>
          {storage.locationKey && storage.locationKey !== storage.name ? (
            <span className="stock-storage-center-card-key">{storage.locationKey}</span>
          ) : null}
        </div>
        <span className={`stock-storage-center-status tone-${storage.active ? 'active' : 'archived'}`}>
          {storage.active ? 'Active' : 'Archived'}
        </span>
      </div>
      <dl className="stock-storage-center-card-stats">
        <div>
          <dt>Products</dt>
          <dd>{storage.productCount}</dd>
        </div>
        <div>
          <dt>Total qty</dt>
          <dd>{formatStockQuantity(storage.totalQuantity)}</dd>
        </div>
        <div>
          <dt>Non-zero</dt>
          <dd>{storage.nonZeroBalanceCount}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{formatStockInventoryValue(storage.inventoryValue)}</dd>
        </div>
      </dl>
    </button>
  )
}

/**
 * @param {{
 *   workspaceId?: string,
 *   loadSummaries?: typeof getWorkspaceStorageSummaries,
 * }} props
 */
export function StockStorageCenter({
  workspaceId = '',
  loadSummaries = getWorkspaceStorageSummaries,
} = {}) {
  const [status, setStatus] = useState(/** @type {'loading'|'ready'|'empty'|'error'} */ ('loading'))
  const [errorMessage, setErrorMessage] = useState('')
  const [payload, setPayload] = useState(/** @type {Awaited<ReturnType<typeof getWorkspaceStorageSummaries>>|null} */ (null))
  const [selectedId, setSelectedId] = useState(/** @type {string|null} */ (null))
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    const workspaceKey = `${workspaceId ?? ''}`.trim()

    if (!workspaceKey) {
      setStatus('empty')
      setPayload(null)
      setErrorMessage('')
      return undefined
    }

    setStatus('loading')
    setErrorMessage('')

    ;(async () => {
      try {
        const next = await loadSummaries(workspaceKey)
        if (cancelled) return
        setPayload(next)
        setStatus(next.storages.length === 0 ? 'empty' : 'ready')
        setSelectedId((current) => {
          if (current && next.storages.some((storage) => storage.id === current)) return current
          return null
        })
      } catch (error) {
        if (cancelled) return
        setPayload(null)
        setSelectedId(null)
        setStatus('error')
        setErrorMessage(error?.message || 'Unable to load storages right now.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId, loadSummaries, reloadToken])

  const selectedStorage = useMemo(() => {
    if (!selectedId || !payload) return null
    return payload.storages.find((storage) => storage.id === selectedId) ?? null
  }, [payload, selectedId])

  const summary = payload?.summary

  return (
    <section className="stock-storage-center-page" aria-label="Storages">
      <header className="stock-storage-center-header">
        <div className="stock-storage-center-header-copy">
          <h2 className="stock-storage-center-title">Storages</h2>
          <p className="stock-storage-center-subtitle">
            Understand and manage stock by physical location.
          </p>
        </div>
      </header>

      {status === 'ready' && summary ? (
        <div className="stock-storage-center-overview" role="status">
          <div className="stock-storage-center-overview-stat">
            <span>Active storages</span>
            <strong>{summary.activeStorageCount}</strong>
          </div>
          <div className="stock-storage-center-overview-stat">
            <span>Products with balances</span>
            <strong>{summary.totalProductsWithBalances}</strong>
          </div>
          <div className="stock-storage-center-overview-stat">
            <span>Total quantity</span>
            <strong>{formatStockQuantity(summary.totalQuantity)}</strong>
          </div>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-center-loading">
          Loading storages…
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="stock-storage-center-state is-error" role="alert" data-testid="stock-storage-center-error">
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
        <div className="stock-storage-center-state" role="status" data-testid="stock-storage-center-empty">
          <p className="stock-storage-center-empty-title">No storages yet.</p>
          <p className="stock-storage-center-empty-copy">
            Workspace storages will appear here once they are available.
          </p>
        </div>
      ) : null}

      {status === 'ready' && payload ? (
        <div className="stock-storage-center-layout">
          <div className="stock-storage-center-list">
            <h3 className="stock-storage-center-section-title">Active</h3>
            {payload.activeStorages.length === 0 ? (
              <p className="stock-storage-center-section-empty">No active storages.</p>
            ) : (
              <div className="stock-storage-center-grid">
                {payload.activeStorages.map((storage) => (
                  <StorageSummaryCard
                    key={storage.id}
                    storage={storage}
                    selected={selectedId === storage.id}
                    onSelect={(next) => setSelectedId(next.id)}
                  />
                ))}
              </div>
            )}

            {payload.archivedStorages.length > 0 ? (
              <div className="stock-storage-center-archived">
                <h3 className="stock-storage-center-section-title">Archived</h3>
                <div className="stock-storage-center-grid is-archived">
                  {payload.archivedStorages.map((storage) => (
                    <StorageSummaryCard
                      key={storage.id}
                      storage={storage}
                      selected={selectedId === storage.id}
                      onSelect={(next) => setSelectedId(next.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside
            className="stock-storage-center-detail"
            aria-label="Selected storage"
            data-testid="stock-storage-center-detail"
          >
            {selectedStorage ? (
              <>
                <p className="stock-storage-center-detail-eyebrow">Selected storage</p>
                <h3 className="stock-storage-center-detail-title">
                  {selectedStorage.name || selectedStorage.locationKey}
                </h3>
                <p className="stock-storage-center-detail-status">
                  {selectedStorage.active ? 'Active' : 'Archived'}
                </p>
                <dl className="stock-storage-center-detail-stats">
                  <div>
                    <dt>Products</dt>
                    <dd>{selectedStorage.productCount}</dd>
                  </div>
                  <div>
                    <dt>Total quantity</dt>
                    <dd>{formatStockQuantity(selectedStorage.totalQuantity)}</dd>
                  </div>
                  <div>
                    <dt>Non-zero balances</dt>
                    <dd>{selectedStorage.nonZeroBalanceCount}</dd>
                  </div>
                  <div>
                    <dt>Inventory value</dt>
                    <dd>{formatStockInventoryValue(selectedStorage.inventoryValue)}</dd>
                  </div>
                </dl>
                <p className="stock-storage-center-detail-note">
                  Product detail, Fast Count, receiving, and transfers arrive in later sprints.
                </p>
              </>
            ) : (
              <p className="stock-storage-center-detail-placeholder">
                Select a storage to inspect its summary.
              </p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  )
}

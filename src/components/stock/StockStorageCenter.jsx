/**
 * P8.30.1 / P8.30.2 — Storage Center read-only foundation + detail products.
 *
 * Lists workspace storages with balance summaries. Selecting a storage opens
 * the read-only products workspace. No mutations.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatStockInventoryValue, formatStockQuantity } from '../../lib/stockUtils'
import { getWorkspaceStorageSummaries } from '../../services/stockStorageCenterService'
import { StockStorageDetailWorkspace } from './StockStorageDetailWorkspace'

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
 *   searchTerm?: string,
 *   canManage?: boolean,
 *   onOpenActiveCountSession?: (sessionId: string) => void,
 *   onStartFastCount?: (storage: object) => void|Promise<void>,
 *   onReceive?: (storage: object) => void,
 *   onRecordReceive?: (payload: object) => void|Promise<void>,
 *   onTransfer?: (storage: object) => void,
 *   onRecordTransfer?: (payload: object) => void|Promise<void>,
 *   onAdjustment?: (storage: object) => void,
 *   onRecordAdjustment?: (payload: object) => void|Promise<void>,
 *   isSavingReceive?: boolean,
 *   isSavingTransfer?: boolean,
 *   isSavingAdjustment?: boolean,
 *   loadSummaries?: typeof getWorkspaceStorageSummaries,
 * }} props
 */
export function StockStorageCenter({
  workspaceId = '',
  searchTerm = '',
  canManage = false,
  onOpenActiveCountSession,
  onStartFastCount,
  onReceive,
  onRecordReceive,
  onTransfer,
  onRecordTransfer,
  onAdjustment,
  onRecordAdjustment,
  isSavingReceive = false,
  isSavingTransfer = false,
  isSavingAdjustment = false,
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

  const filteredActiveStorages = useMemo(() => {
    const needle = `${searchTerm ?? ''}`.trim().toLowerCase()
    const list = payload?.activeStorages ?? []
    if (!needle || selectedStorage) return list
    return list.filter((storage) => {
      const haystack = `${storage.name ?? ''} ${storage.locationKey ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [payload, searchTerm, selectedStorage])

  const filteredArchivedStorages = useMemo(() => {
    const needle = `${searchTerm ?? ''}`.trim().toLowerCase()
    const list = payload?.archivedStorages ?? []
    if (!needle || selectedStorage) return list
    return list.filter((storage) => {
      const haystack = `${storage.name ?? ''} ${storage.locationKey ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [payload, searchTerm, selectedStorage])

  const summary = payload?.summary

  if (selectedStorage) {
    return (
      <StockStorageDetailWorkspace
        workspaceId={workspaceId}
        storage={selectedStorage}
        searchTerm={searchTerm}
        canManage={canManage}
        onBack={() => setSelectedId(null)}
        onOpenActiveCountSession={onOpenActiveCountSession}
        onStartFastCount={onStartFastCount}
        onReceive={onReceive}
        onRecordReceive={onRecordReceive}
        onTransfer={onTransfer}
        onRecordTransfer={onRecordTransfer}
        onAdjustment={onAdjustment}
        onRecordAdjustment={onRecordAdjustment}
        isSavingReceive={isSavingReceive}
        isSavingTransfer={isSavingTransfer}
        isSavingAdjustment={isSavingAdjustment}
      />
    )
  }

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
        <div className="stock-storage-center-list">
          <h3 className="stock-storage-center-section-title">Active</h3>
          {filteredActiveStorages.length === 0 ? (
            <p className="stock-storage-center-section-empty">
              {`${searchTerm ?? ''}`.trim() ? 'No active storages match this search.' : 'No active storages.'}
            </p>
          ) : (
            <div className="stock-storage-center-grid">
              {filteredActiveStorages.map((storage) => (
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
              {filteredArchivedStorages.length === 0 ? (
                <p className="stock-storage-center-section-empty">No archived storages match this search.</p>
              ) : (
                <div className="stock-storage-center-grid is-archived">
                  {filteredArchivedStorages.map((storage) => (
                    <StorageSummaryCard
                      key={storage.id}
                      storage={storage}
                      selected={selectedId === storage.id}
                      onSelect={(next) => setSelectedId(next.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

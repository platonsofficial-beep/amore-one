/**
 * Take stock from supply storages into a department shelf.
 * Each line uses transfer_stock_between_locations. No cost is shown.
 * The Suggested tab is a par gap from the last recorded shelf quantity.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { formatStockQuantity } from '../../lib/stockUtils'
import {
  AD_HOC_TRANSFER_NOTE,
  NEEDS_SUPPLIER_ORDER_LABEL,
  NO_SUPPLY_STORAGE_HINT,
  REFILL_AT_PAR_LABEL,
  REFILL_TRANSFER_NOTE,
  SUGGESTED_BASIS_LABEL,
  SUGGESTED_TAB_LABEL,
  SUPPLY_FLAG_UNAVAILABLE_MESSAGE,
  TAKE_FROM_SUPPLY_LABEL,
  TAKE_LIST_LABEL,
  TAKE_SELECTED_LABEL,
  TAKE_SUBMIT_LABEL,
  applyRefillResults,
  applyTakeResults,
  buildRefillLines,
  buildTakeRows,
  createSingleFlight,
  formatRemainingLabel,
  formatSourceStockLabel,
  keepFailedRefillLines,
  keepFailedTakeRows,
  searchTakeRows,
  setTakeQuantity,
  stepTakeQuantity,
  takeRowsToTransfer,
  withRefillQuantity,
  withRefillSource,
  withTakeSource,
} from '../../lib/stockSupplyRefill'
import { getWorkspaceStorageProducts } from '../../services/stockStorageCenterService'
import { loadSupplyRefillCatalog, takeRefillLines } from '../../services/stockSupplyRefillService'
import { transferStockBetweenLocations } from '../../services/stockMutationService'

function qtyLabel(value, unit) {
  return formatStockQuantity(value, unit)
}

/**
 * @param {{
 *   workspaceId?: string,
 *   destinationStorage: object,
 *   products?: object[],
 *   onClose?: () => void,
 *   onCompleted?: () => void|Promise<void>,
 *   loadCatalog?: typeof loadSupplyRefillCatalog,
 *   loadProducts?: typeof getWorkspaceStorageProducts,
 *   transfer?: typeof transferStockBetweenLocations,
 * }} props
 */
export function StockSupplyRefillSheet({
  workspaceId = '',
  destinationStorage,
  products = [],
  onClose,
  onCompleted,
  loadCatalog = loadSupplyRefillCatalog,
  loadProducts = getWorkspaceStorageProducts,
  transfer = transferStockBetweenLocations,
} = {}) {
  const destinationId = `${destinationStorage?.id ?? ''}`.trim()
  const destinationName = destinationStorage?.name || destinationStorage?.locationKey || 'This storage'
  const [status, setStatus] = useState(/** @type {'loading'|'ready'|'error'} */ ('loading'))
  const [loadError, setLoadError] = useState('')
  const [catalog, setCatalog] = useState(null)
  const [shelfProducts, setShelfProducts] = useState(/** @type {object[]} */ (products))
  const [takeRows, setTakeRows] = useState(/** @type {object[]} */ ([]))
  const [lines, setLines] = useState(/** @type {object[]} */ ([]))
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(/** @type {'take'|'suggested'} */ ('take'))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const productsRef = useRef(products)
  const flightRef = useRef(createSingleFlight())
  productsRef.current = products

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setLoadError('')
    ;(async () => {
      try {
        const [loadedProducts, next] = await Promise.all([
          loadProducts(workspaceId, destinationId),
          loadCatalog(workspaceId),
        ])
        if (cancelled) return
        const productRows = Array.isArray(loadedProducts?.products)
          ? loadedProducts.products
          : productsRef.current
        setCatalog(next)
        setShelfProducts(productRows)
        setTakeRows(buildTakeRows({
          shelfProducts: productRows,
          supplyStorages: next.storages,
          supplyBalances: next.balances,
          itemsById: next.itemsById,
          destinationStorageId: destinationId,
        }))
        setLines(buildRefillLines({
          products: productRows,
          supplyStorages: next.storages,
          supplyBalances: next.balances,
          destinationStorageId: destinationId,
        }))
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setLoadError(error?.message || 'Unable to load supply stock right now.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId, destinationId, loadCatalog, loadProducts])

  const supplyCount = useMemo(() => (
    (catalog?.storages ?? []).filter((storage) => (
      `${storage?.id ?? ''}` !== destinationId
      && (storage?.isSupply === true || storage?.is_supply === true)
      && storage?.active !== false
    )).length
  ), [catalog, destinationId])

  const visibleRows = useMemo(
    () => searchTakeRows(takeRows, query),
    [takeRows, query],
  )
  const queued = takeRows.filter((row) => Number(row.quantity) > 0 && row.sourceStorageId)
  const selectedCount = lines.filter((line) => line.selected && line.transferable && line.quantity > 0).length
  const noSupply = catalog?.supplyReady === true && supplyCount === 0
  const supplyUnavailable = catalog?.supplyReady === false

  const refreshAfterMove = async (takeSnapshot, refillSnapshot, results) => {
    const moved = results.filter((result) => result.ok).length
    const failed = results.length - moved
    try {
      const [freshProducts, freshCatalog] = await Promise.all([
        loadProducts(workspaceId, destinationId),
        loadCatalog(workspaceId),
      ])
      const productRows = Array.isArray(freshProducts?.products) ? freshProducts.products : []
      const freshTake = buildTakeRows({
        shelfProducts: productRows,
        supplyStorages: freshCatalog.storages,
        supplyBalances: freshCatalog.balances,
        itemsById: freshCatalog.itemsById,
        destinationStorageId: destinationId,
      })
      const freshLines = buildRefillLines({
        products: productRows,
        supplyStorages: freshCatalog.storages,
        supplyBalances: freshCatalog.balances,
        destinationStorageId: destinationId,
      })
      setCatalog(freshCatalog)
      setShelfProducts(productRows)
      setTakeRows(keepFailedTakeRows(freshTake, takeSnapshot, results))
      setLines(keepFailedRefillLines(freshLines, refillSnapshot, results))
    } catch (refreshError) {
      setTakeRows(applyTakeResults(takeSnapshot, results))
      setLines(applyRefillResults(refillSnapshot, results))
      setNotice(`${moved} moved. ${failed} still here. ${refreshError?.message || 'Refresh failed.'}`)
      if (moved > 0) await onCompleted?.()
      return
    }
    if (failed > 0) {
      setNotice(`${moved} moved. ${failed} still need attention.`)
    } else if (moved > 0) {
      setNotice(moved === 1 ? '1 item moved from supply.' : `${moved} items moved from supply.`)
    }
    if (moved > 0) await onCompleted?.()
  }

  const runTake = (queuedLines, note, takeSnapshot, refillSnapshot) => {
    if (busy || queuedLines.length === 0) return
    setNotice('')
    setBusy(true)
    flightRef.current(async () => {
      try {
        const results = await takeRefillLines({
          workspaceId,
          destinationStorageId: destinationId,
          lines: queuedLines,
          note,
          transfer,
        })
        await refreshAfterMove(takeSnapshot, refillSnapshot, results)
      } finally {
        setBusy(false)
      }
    }).catch((error) => {
      setNotice(error?.message || 'Unable to take from supply right now.')
      setBusy(false)
    })
  }

  const handleTakeList = () => {
    const snapshot = takeRows
    runTake(
      takeRowsToTransfer(snapshot, shelfProducts),
      AD_HOC_TRANSFER_NOTE,
      snapshot,
      lines,
    )
  }

  const handleTakeSelected = () => {
    runTake(
      lines.filter((line) => line.selected && line.transferable && line.quantity > 0),
      REFILL_TRANSFER_NOTE,
      takeRows,
      lines,
    )
  }

  useEscapeToClose(() => {
    if (!busy) onClose?.()
  })

  const patchTakeRow = (stockItemId, updater) => {
    setTakeRows((current) => current.map((entry) => (
      entry.stockItemId === stockItemId ? updater(entry) : entry
    )))
  }

  return (
    <div
      className="employee-modal-backdrop task-modal-backdrop"
      onClick={() => {
        if (!busy) onClose?.()
      }}
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet stock-supply-refill-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supply-refill-title"
        aria-busy={busy}
        data-testid="supply-refill-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3 id="supply-refill-title">{TAKE_FROM_SUPPLY_LABEL}</h3>
            <p className="stock-modal-subtitle">
              Into {destinationName}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onClose?.()}
            disabled={busy}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {status === 'loading' ? (
          <p className="stock-supply-refill-status" role="status">Loading supply stock…</p>
        ) : null}
        {status === 'error' ? (
          <p className="stock-supply-refill-status is-error" role="alert">{loadError}</p>
        ) : null}

        {status === 'ready' && supplyUnavailable ? (
          <p className="stock-supply-refill-hint" role="status">{SUPPLY_FLAG_UNAVAILABLE_MESSAGE}</p>
        ) : null}
        {status === 'ready' && noSupply ? (
          <p className="stock-supply-refill-hint" role="status" data-testid="supply-refill-empty-hint">
            {NO_SUPPLY_STORAGE_HINT}
          </p>
        ) : null}

        {status === 'ready' && !supplyUnavailable && !noSupply ? (
          <>
            <div className="stock-supply-refill-tabs" role="tablist" aria-label="Take from supply">
              <button
                type="button"
                role="tab"
                id="supply-take-tab"
                aria-selected={tab === 'take'}
                aria-controls="supply-take-panel"
                data-testid="supply-take-tab"
                onClick={() => setTab('take')}
              >
                {TAKE_SUBMIT_LABEL}
              </button>
              <button
                type="button"
                role="tab"
                id="supply-suggested-tab"
                aria-selected={tab === 'suggested'}
                aria-controls="supply-suggested-panel"
                data-testid="supply-suggested-tab"
                onClick={() => setTab('suggested')}
              >
                {SUGGESTED_TAB_LABEL}
              </button>
            </div>

            {tab === 'take' ? (
              <div role="tabpanel" id="supply-take-panel" aria-labelledby="supply-take-tab">
                <input
                  type="search"
                  className="stock-take-search"
                  data-testid="supply-take-search"
                  placeholder="Search products"
                  aria-label="Search products"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {visibleRows.length === 0 ? (
                  <p className="stock-supply-refill-hint" role="status">
                    {takeRows.length === 0 ? 'Nothing to take from supply yet.' : 'No matching products.'}
                  </p>
                ) : (
                  <ul className="stock-take-list">
                    {visibleRows.map((row) => (
                      <li
                        key={row.stockItemId}
                        className="stock-take-row"
                        data-testid="supply-take-row"
                        data-stock-item-id={row.stockItemId}
                        data-on-shelf={row.onShelf ? 'true' : 'false'}
                      >
                        <div className="stock-take-identity">
                          <strong>{row.name}</strong>
                          {row.unit ? <span>{row.unit}</span> : null}
                        </div>
                        {row.sources.length === 0 ? (
                          <p className="stock-supply-refill-order" data-testid="supply-take-needs-order">
                            {NEEDS_SUPPLIER_ORDER_LABEL}
                          </p>
                        ) : (
                          <div className="stock-take-sources">
                            {row.sources.map((source) => (
                              <button
                                key={source.storageId}
                                type="button"
                                className="stock-take-source"
                                data-testid="supply-take-source"
                                data-storage-id={source.storageId}
                                aria-pressed={row.sourceStorageId === source.storageId}
                                aria-label={`${row.name} from ${source.storageName}`}
                                disabled={busy}
                                onClick={() => {
                                  patchTakeRow(row.stockItemId, (entry) => withTakeSource(entry, source.storageId))
                                }}
                              >
                                {formatSourceStockLabel(source)}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="stock-take-stepper">
                          <button
                            type="button"
                            data-testid="supply-take-minus"
                            aria-label={`Decrease ${row.name}`}
                            disabled={busy || row.sources.length === 0}
                            onClick={() => {
                              patchTakeRow(row.stockItemId, (entry) => stepTakeQuantity(entry, -1))
                            }}
                          >
                            −
                          </button>
                          <input
                            inputMode="decimal"
                            data-testid="supply-take-qty"
                            aria-label={`Quantity for ${row.name}`}
                            value={row.quantityInput ?? ''}
                            disabled={busy || row.sources.length === 0}
                            onChange={(event) => {
                              const nextValue = event.target.value
                              patchTakeRow(row.stockItemId, (entry) => setTakeQuantity(entry, nextValue))
                            }}
                          />
                          <button
                            type="button"
                            data-testid="supply-take-plus"
                            aria-label={`Increase ${row.name}`}
                            disabled={busy || row.sources.length === 0}
                            onClick={() => {
                              patchTakeRow(row.stockItemId, (entry) => stepTakeQuantity(entry, 1))
                            }}
                          >
                            +
                          </button>
                        </div>
                        {Number(row.quantity) > 0 ? (
                          <p className="stock-take-remaining" data-testid="supply-take-remaining">
                            {formatRemainingLabel(row.sourceAvailable, row.quantity)}
                          </p>
                        ) : null}
                        {row.warning ? (
                          <p className="stock-take-warning" role="status" data-testid="supply-take-warning">
                            {row.warning}
                          </p>
                        ) : null}
                        {row.error ? (
                          <p className="stock-supply-refill-line-error" role="alert" data-testid="supply-take-error">
                            {row.error}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                <section className="stock-take-summary" aria-label={TAKE_LIST_LABEL} data-testid="supply-take-list">
                  <h4>{TAKE_LIST_LABEL}</h4>
                  {queued.length === 0 ? (
                    <p>Add a quantity on one or more products, then take them together.</p>
                  ) : (
                    <ul>
                      {queued.map((row) => (
                        <li key={row.stockItemId} data-testid="supply-take-list-item">
                          {row.name}
                          {' · '}
                          {row.quantity}
                          {row.unit ? ` ${row.unit}` : ''}
                          {' · '}
                          {row.sourceStorageName}
                          {' · '}
                          {formatRemainingLabel(row.sourceAvailable, row.quantity)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="primary-btn stock-take-submit"
                    data-testid="supply-take-submit"
                    disabled={busy || queued.length === 0}
                    onClick={handleTakeList}
                  >
                    {busy ? 'Moving…' : `${TAKE_SUBMIT_LABEL}${queued.length > 0 ? ` (${queued.length})` : ''}`}
                  </button>
                </section>
              </div>
            ) : (
              <div role="tabpanel" id="supply-suggested-panel" aria-labelledby="supply-suggested-tab">
                <p className="stock-supply-refill-hint" data-testid="supply-suggested-basis">
                  {SUGGESTED_BASIS_LABEL}
                </p>
                {lines.length === 0 ? (
                  <p className="stock-supply-refill-hint" role="status">{REFILL_AT_PAR_LABEL}</p>
                ) : (
                  <ul className="stock-supply-refill-list">
                    {lines.map((line) => (
                      <li
                        key={line.stockItemId}
                        className={`stock-supply-refill-line${line.needsSupplierOrder ? ' needs-order' : ''}`}
                        data-testid="supply-refill-line"
                        data-stock-item-id={line.stockItemId}
                      >
                        <label className="stock-supply-refill-check">
                          <input
                            type="checkbox"
                            checked={line.selected === true}
                            disabled={busy || !line.transferable}
                            aria-label={`Select ${line.name}`}
                            onChange={(event) => {
                              const selected = event.target.checked && line.quantity > 0
                              setLines((current) => current.map((entry) => (
                                entry.stockItemId === line.stockItemId ? { ...entry, selected } : entry
                              )))
                            }}
                          />
                        </label>
                        <div className="stock-supply-refill-identity">
                          <strong>{line.name}</strong>
                          <span>
                            Last recorded {qtyLabel(line.onHand, line.unit)}
                            {' · '}
                            Par {qtyLabel(line.parQuantity, line.unit)}
                            {' · '}
                            Suggested {qtyLabel(line.suggestedQuantity, line.unit)}
                          </span>
                        </div>
                        {line.needsSupplierOrder ? (
                          <p className="stock-supply-refill-order" data-testid="supply-refill-needs-order">
                            {NEEDS_SUPPLIER_ORDER_LABEL}
                          </p>
                        ) : (
                          <div className="stock-supply-refill-source">
                            {line.sources.length > 1 ? (
                              <label>
                                <span>Source</span>
                                <select
                                  value={line.sourceStorageId}
                                  disabled={busy}
                                  aria-label={`Source for ${line.name}`}
                                  onChange={(event) => {
                                    const sourceId = event.target.value
                                    setLines((current) => current.map((entry) => (
                                      entry.stockItemId === line.stockItemId
                                        ? withRefillSource(entry, sourceId)
                                        : entry
                                    )))
                                  }}
                                >
                                  {line.sources.map((source) => (
                                    <option key={source.storageId} value={source.storageId}>
                                      {formatSourceStockLabel(source)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <p>
                                <span>Source</span>
                                <strong>{formatSourceStockLabel({
                                  storageName: line.sourceStorageName,
                                  quantity: line.sourceAvailable,
                                })}</strong>
                              </p>
                            )}
                            <p data-testid="supply-refill-available">
                              Available {qtyLabel(line.sourceAvailable, line.unit)}
                            </p>
                            <label>
                              <span>Qty {line.unit ? `(${line.unit})` : ''}</span>
                              <input
                                inputMode="decimal"
                                aria-label={`Quantity for ${line.name}`}
                                value={line.quantityInput ?? ''}
                                disabled={busy}
                                onChange={(event) => {
                                  const next = withRefillQuantity(line, event.target.value)
                                  setLines((current) => current.map((entry) => (
                                    entry.stockItemId === line.stockItemId
                                      ? { ...next.line, error: next.error || next.line.error }
                                      : entry
                                  )))
                                }}
                              />
                            </label>
                          </div>
                        )}
                        {line.error ? (
                          <p className="stock-supply-refill-line-error" role="alert" data-testid="supply-refill-line-error">
                            {line.error}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="stock-supply-refill-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    data-testid="supply-refill-take"
                    disabled={busy || selectedCount === 0}
                    onClick={handleTakeSelected}
                  >
                    {busy ? 'Moving…' : `${TAKE_SELECTED_LABEL}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}

        {notice ? (
          <p className="stock-supply-refill-notice" role="status" data-testid="supply-refill-notice">{notice}</p>
        ) : null}
      </div>
    </div>
  )
}

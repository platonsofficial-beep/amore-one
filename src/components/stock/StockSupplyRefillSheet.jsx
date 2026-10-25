/**
 * Refill a department shelf from supply storages.
 * Each take uses transfer_stock_between_locations. No cost is shown.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatStockQuantity } from '../../lib/stockUtils'
import {
  AD_HOC_TRANSFER_NOTE,
  NEEDS_SUPPLIER_ORDER_LABEL,
  NO_SUPPLY_STORAGE_HINT,
  REFILL_ACTION_LABEL,
  REFILL_AT_PAR_LABEL,
  REFILL_TRANSFER_NOTE,
  SUPPLY_FLAG_UNAVAILABLE_MESSAGE,
  TAKE_FROM_SUPPLY_LABEL,
  TAKE_SELECTED_LABEL,
  applyRefillResults,
  buildRefillLines,
  capRefillQuantity,
  createSingleFlight,
  keepFailedRefillLines,
  listAdHocSupplyChoices,
  parseRefillQuantity,
  withRefillQuantity,
  withRefillSource,
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
  const [lines, setLines] = useState(/** @type {object[]} */ ([]))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [adHocStorageId, setAdHocStorageId] = useState('')
  const [adHocItemId, setAdHocItemId] = useState('')
  const [adHocQuantity, setAdHocQuantity] = useState('')
  const [adHocError, setAdHocError] = useState('')
  const productsRef = useRef(products)
  const flightRef = useRef(createSingleFlight())
  productsRef.current = products

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setLoadError('')
    ;(async () => {
      try {
        const next = await loadCatalog(workspaceId)
        if (cancelled) return
        setCatalog(next)
        setLines(buildRefillLines({
          products: productsRef.current,
          supplyStorages: next.storages,
          supplyBalances: next.balances,
          destinationStorageId: destinationId,
        }))
        const choices = listAdHocSupplyChoices({
          supplyStorages: next.storages,
          supplyBalances: next.balances,
          itemsById: next.itemsById,
          destinationStorageId: destinationId,
        })
        setAdHocStorageId(choices.storages[0]?.id ?? '')
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setLoadError(error?.message || 'Unable to load the refill list right now.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId, destinationId, loadCatalog])

  const supplyChoices = useMemo(() => listAdHocSupplyChoices({
    supplyStorages: catalog?.storages ?? [],
    supplyBalances: catalog?.balances ?? [],
    itemsById: catalog?.itemsById ?? new Map(),
    destinationStorageId: destinationId,
  }), [catalog, destinationId])

  const adHocItems = supplyChoices.items.filter((item) => item.storageId === adHocStorageId)
  const adHocItem = adHocItems.find((item) => item.stockItemId === adHocItemId) ?? null
  const selectedCount = lines.filter((line) => line.selected && line.transferable && line.quantity > 0).length
  const noSupply = catalog?.supplyReady === true && supplyChoices.storages.length === 0
  const supplyUnavailable = catalog?.supplyReady === false

  const refreshAfterMove = async (snapshot, results) => {
    const moved = results.filter((result) => result.ok).length
    const failed = results.length - moved
    try {
      const [freshProducts, freshCatalog] = await Promise.all([
        loadProducts(workspaceId, destinationId),
        loadCatalog(workspaceId),
      ])
      const freshLines = buildRefillLines({
        products: freshProducts?.products ?? [],
        supplyStorages: freshCatalog.storages,
        supplyBalances: freshCatalog.balances,
        destinationStorageId: destinationId,
      })
      setCatalog(freshCatalog)
      setLines(keepFailedRefillLines(freshLines, snapshot, results))
    } catch (refreshError) {
      setLines(applyRefillResults(snapshot, results))
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

  const handleTakeSelected = () => {
    if (busy || selectedCount === 0) return
    setNotice('')
    setBusy(true)
    const snapshot = lines
    flightRef.current(async () => {
      try {
        const results = await takeRefillLines({
          workspaceId,
          destinationStorageId: destinationId,
          lines: snapshot,
          note: REFILL_TRANSFER_NOTE,
          transfer,
        })
        await refreshAfterMove(snapshot, results)
      } finally {
        setBusy(false)
      }
    }).catch((error) => {
      setNotice(error?.message || 'Unable to take from supply right now.')
      setBusy(false)
    })
  }

  const handleAdHoc = () => {
    if (busy) return
    const parsed = parseRefillQuantity(adHocQuantity)
    if (!adHocItem || !parsed.ok) {
      setAdHocError(parsed.ok ? 'Choose a product in the supply storage.' : parsed.error)
      return
    }
    const quantity = capRefillQuantity(parsed.value, adHocItem.quantity)
    if (quantity <= 0) {
      setAdHocError('That supply storage does not have enough on hand.')
      return
    }
    const destinationProduct = (productsRef.current ?? []).find((row) => (
      `${row?.stockItemId ?? ''}` === adHocItem.stockItemId
    ))
    const destinationVersion = Number(destinationProduct?.quantityVersion)
    setAdHocError('')
    setNotice('')
    setBusy(true)
    const snapshot = lines
    flightRef.current(async () => {
      try {
        const results = await takeRefillLines({
          workspaceId,
          destinationStorageId: destinationId,
          lines: [{
            stockItemId: adHocItem.stockItemId,
            selected: true,
            transferable: true,
            needsSupplierOrder: false,
            quantity,
            sourceStorageId: adHocItem.storageId,
            sourceQuantityVersion: adHocItem.quantityVersion,
            destinationQuantityVersion: Number.isFinite(destinationVersion) && destinationVersion >= 1
              ? Math.floor(destinationVersion)
              : 1,
          }],
          note: AD_HOC_TRANSFER_NOTE,
          transfer,
        })
        if (results[0]?.ok) {
          setAdHocQuantity('')
        } else {
          setAdHocError(results[0]?.error || 'Unable to take from supply right now.')
        }
        await refreshAfterMove(snapshot, results)
      } finally {
        setBusy(false)
      }
    }).catch((error) => {
      setAdHocError(error?.message || 'Unable to take from supply right now.')
      setBusy(false)
    })
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
            <h3 id="supply-refill-title">{REFILL_ACTION_LABEL}</h3>
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
          <p className="stock-supply-refill-status" role="status">Loading refill list…</p>
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
                        On hand {qtyLabel(line.onHand, line.unit)}
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
                                  {source.storageName}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <p>
                            <span>Source</span>
                            <strong>{line.sourceStorageName}</strong>
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

            <section className="stock-supply-refill-adhoc" aria-label={TAKE_FROM_SUPPLY_LABEL}>
              <h4>{TAKE_FROM_SUPPLY_LABEL}</h4>
              <p>One product, from a supply storage into {destinationName}.</p>
              <label>
                <span>Supply storage</span>
                <select
                  value={adHocStorageId}
                  disabled={busy}
                  aria-label="Supply storage"
                  onChange={(event) => {
                    setAdHocStorageId(event.target.value)
                    setAdHocItemId('')
                    setAdHocError('')
                  }}
                >
                  {supplyChoices.storages.map((storage) => (
                    <option key={storage.id} value={storage.id}>{storage.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Product</span>
                <select
                  value={adHocItemId}
                  disabled={busy || adHocItems.length === 0}
                  aria-label="Product to take"
                  onChange={(event) => {
                    setAdHocItemId(event.target.value)
                    setAdHocError('')
                  }}
                >
                  <option value="">Choose</option>
                  {adHocItems.map((item) => (
                    <option key={item.stockItemId} value={item.stockItemId}>
                      {item.name} · {qtyLabel(item.quantity, item.unit)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Qty {adHocItem?.unit ? `(${adHocItem.unit})` : ''}</span>
                <input
                  inputMode="decimal"
                  aria-label="Quantity to take"
                  value={adHocQuantity}
                  disabled={busy || !adHocItem}
                  onChange={(event) => {
                    const parsed = parseRefillQuantity(event.target.value)
                    if (!event.target.value.trim()) {
                      setAdHocQuantity('')
                      setAdHocError('')
                      return
                    }
                    if (!parsed.ok) {
                      setAdHocQuantity(event.target.value)
                      setAdHocError(parsed.error)
                      return
                    }
                    const capped = capRefillQuantity(parsed.value, adHocItem?.quantity ?? 0)
                    setAdHocQuantity(`${capped}`)
                    setAdHocError('')
                  }}
                />
              </label>
              {adHocItem ? (
                <p>Available {qtyLabel(adHocItem.quantity, adHocItem.unit)}</p>
              ) : null}
              {adHocError ? <p className="stock-supply-refill-line-error" role="alert">{adHocError}</p> : null}
              <button
                type="button"
                className="ghost-btn"
                data-testid="supply-refill-adhoc-take"
                disabled={busy || !adHocItem || !adHocQuantity}
                onClick={handleAdHoc}
              >
                {TAKE_FROM_SUPPLY_LABEL}
              </button>
            </section>
          </>
        ) : null}

        {notice ? (
          <p className="stock-supply-refill-notice" role="status" data-testid="supply-refill-notice">{notice}</p>
        ) : null}
      </div>
    </div>
  )
}

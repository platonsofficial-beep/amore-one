/**
 * P8.30.6 — Shared stock transfer dialog.
 * Source storage is locked; operator chooses destination, quantity, note.
 * Submits through the existing transfer_stock_between_locations RPC wrapper.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatStockQuantity } from '../../lib/stockUtils'
import { getStockItemLocationBalances } from '../../services/stockLocationBalanceService'
import { listWorkspaceStorages } from '../../services/workspaceStorageService'

/**
 * @param {{
 *   item: object,
 *   sourceStorage: object,
 *   sourceQuantity?: number,
 *   sourceQuantityVersion?: number,
 *   workspaceId?: string,
 *   onClose: () => void,
 *   onSubmit: (payload: object) => void|Promise<void>,
 *   isSaving?: boolean,
 *   loadDestinations?: typeof listWorkspaceStorages,
 *   loadItemBalances?: typeof getStockItemLocationBalances,
 * }} props
 */
export function StockTransferModal({
  item,
  sourceStorage,
  sourceQuantity = 0,
  sourceQuantityVersion = 1,
  workspaceId = '',
  onClose,
  onSubmit,
  isSaving = false,
  loadDestinations = listWorkspaceStorages,
  loadItemBalances = getStockItemLocationBalances,
} = {}) {
  const [destinationId, setDestinationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [destinations, setDestinations] = useState(/** @type {object[]} */ ([]))
  const [destinationVersion, setDestinationVersion] = useState(/** @type {number|null} */ (null))
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(true)
  const [isLoadingDestVersion, setIsLoadingDestVersion] = useState(false)

  const isBusy = isSaving || isSubmitting
  const sourceId = `${sourceStorage?.id ?? ''}`.trim()
  const sourceLabel = sourceStorage?.name || sourceStorage?.locationKey || 'Storage'
  const maxQuantity = Number(sourceQuantity) || 0

  const destinationOptions = useMemo(
    () => (Array.isArray(destinations) ? destinations : []).filter((entry) => (
      `${entry?.id ?? ''}`.trim()
      && `${entry.id}`.trim() !== sourceId
      && entry.active !== false
    )),
    [destinations, sourceId],
  )

  useEffect(() => {
    let cancelled = false
    setIsLoadingDestinations(true)
    setError('')

    ;(async () => {
      try {
        const rows = await loadDestinations(workspaceId)
        if (cancelled) return
        setDestinations(Array.isArray(rows) ? rows : [])
      } catch (loadError) {
        if (cancelled) return
        setDestinations([])
        setError(loadError?.message || 'Unable to load destination storages.')
      } finally {
        if (!cancelled) setIsLoadingDestinations(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId, loadDestinations])

  useEffect(() => {
    let cancelled = false
    const destId = `${destinationId ?? ''}`.trim()
    const itemId = `${item?.id ?? ''}`.trim()
    setDestinationVersion(null)

    if (!destId || !itemId || !workspaceId) return undefined

    setIsLoadingDestVersion(true)
    ;(async () => {
      try {
        const balances = await loadItemBalances(workspaceId, itemId)
        if (cancelled) return
        const match = (Array.isArray(balances) ? balances : []).find((balance) => (
          `${balance?.workspaceStorageId ?? ''}`.trim() === destId
        ))
        if (!match) {
          setDestinationVersion(null)
          setError('This product has no balance at the selected destination yet.')
          return
        }
        setError('')
        setDestinationVersion(Math.max(1, Math.floor(Number(match.quantityVersion) || 1)))
      } catch (loadError) {
        if (cancelled) return
        setDestinationVersion(null)
        setError(loadError?.message || 'Unable to load destination balance.')
      } finally {
        if (!cancelled) setIsLoadingDestVersion(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [destinationId, item?.id, workspaceId, loadItemBalances])

  const handleDismiss = () => {
    if (isBusy) return
    onClose()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isBusy) return

    const destId = `${destinationId ?? ''}`.trim()
    const parsed = Number(quantity)

    if (!destId) {
      setError('Choose a destination storage.')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive quantity to transfer.')
      return
    }
    if (parsed > maxQuantity) {
      setError(`Transfer cannot exceed on-hand quantity (${formatStockQuantity(maxQuantity, item?.unit)}).`)
      return
    }
    if (!Number.isFinite(Number(destinationVersion)) || Number(destinationVersion) < 1) {
      setError('This product has no balance at the selected destination yet.')
      return
    }

    try {
      setError('')
      setIsSubmitting(true)
      await onSubmit({
        item,
        quantity: parsed,
        note: note.trim(),
        sourceWorkspaceStorageId: sourceId,
        destinationWorkspaceStorageId: destId,
        expectedSourceQuantityVersion: sourceQuantityVersion,
        expectedDestinationQuantityVersion: destinationVersion,
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to transfer stock right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleDismiss}>
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        data-testid="stock-transfer-modal"
      >
        <div className="drawer-header">
          <div>
            <h3>Transfer stock</h3>
            <p className="stock-modal-subtitle">{item?.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={handleDismiss} disabled={isBusy} aria-label="Close">✕</button>
        </div>

        <form className="employee-form" onSubmit={handleSubmit}>
          <div className="stock-movement-destination-lock" data-testid="stock-transfer-source-lock">
            <span className="stock-movement-destination-lock-label">Source</span>
            <strong className="stock-movement-destination-lock-value">{sourceLabel}</strong>
            <span className="stock-movement-destination-lock-note">
              Locked · On hand {formatStockQuantity(maxQuantity, item?.unit)}
            </span>
          </div>

          <label>
            Destination
            <select
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
              required
              disabled={isBusy || isLoadingDestinations}
              aria-label="Destination storage"
              data-testid="stock-transfer-destination-select"
            >
              <option value="">
                {isLoadingDestinations ? 'Loading storages…' : 'Select destination'}
              </option>
              {destinationOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name || entry.locationKey || entry.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            Quantity
            <input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0"
              required
              disabled={isBusy || isLoadingDestVersion}
            />
          </label>

          <label>
            Note
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
              disabled={isBusy}
            />
          </label>

          {error ? <div className="staff-status-banner" role="alert">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isBusy}>Cancel</button>
            <button
              type="submit"
              className="primary-btn"
              disabled={isBusy || isLoadingDestinations || isLoadingDestVersion}
            >
              {isBusy ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

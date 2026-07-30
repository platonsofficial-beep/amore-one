/**
 * P8.30.6 / P8.30.6b — Shared stock transfer dialog.
 * Source storage is locked; operator chooses destination, quantity, note.
 * Missing destination balances are allowed: RPC auto-creates; UI sends version 1.
 * Submits through the existing transfer_stock_between_locations RPC wrapper.
 */

import { useEffect, useMemo, useState } from 'react'
import { buildProductDisplayNameFromItem } from '../../lib/stockProductIdentity'
import { formatStockQuantity } from '../../lib/stockUtils'
import { getStockItemLocationBalances } from '../../services/stockLocationBalanceService'
import { listWorkspaceStorages } from '../../services/workspaceStorageService'

const NEW_DESTINATION_HELPER =
  'First transfer to this storage will automatically create its inventory balance.'

/**
 * @param {object[]} balances
 * @returns {Map<string, number>}
 */
function buildDestinationVersionMap(balances) {
  /** @type {Map<string, number>} */
  const map = new Map()
  for (const balance of Array.isArray(balances) ? balances : []) {
    const storageId = `${balance?.workspaceStorageId ?? ''}`.trim()
    if (!storageId) continue
    map.set(storageId, Math.max(1, Math.floor(Number(balance.quantityVersion) || 1)))
  }
  return map
}

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
  const [destinationVersions, setDestinationVersions] = useState(() => new Map())
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(true)
  const [isLoadingBalances, setIsLoadingBalances] = useState(true)

  const isBusy = isSaving || isSubmitting
  const sourceId = `${sourceStorage?.id ?? ''}`.trim()
  const sourceLabel = sourceStorage?.name || sourceStorage?.locationKey || 'Storage'
  const maxQuantity = Number(sourceQuantity) || 0

  const destinationOptions = useMemo(
    () => (Array.isArray(destinations) ? destinations : []).filter((entry) => (
      `${entry?.id ?? ''}`.trim()
      && `${entry.id}`.trim() !== sourceId
      && entry.active !== false
    )).map((entry) => {
      const id = `${entry.id}`.trim()
      const label = entry.name || entry.locationKey || entry.id
      const hasBalance = destinationVersions.has(id)
      return {
        id,
        label,
        hasBalance,
        displayLabel: hasBalance ? label : `${label} (New)`,
        quantityVersion: hasBalance ? destinationVersions.get(id) : 1,
      }
    }),
    [destinations, destinationVersions, sourceId],
  )

  const selectedDestination = useMemo(
    () => destinationOptions.find((entry) => entry.id === `${destinationId ?? ''}`.trim()) ?? null,
    [destinationId, destinationOptions],
  )

  const destinationHasBalance = Boolean(selectedDestination?.hasBalance)
  const expectedDestinationQuantityVersion = selectedDestination
    ? selectedDestination.quantityVersion
    : null

  useEffect(() => {
    let cancelled = false
    const itemId = `${item?.id ?? ''}`.trim()
    setIsLoadingDestinations(true)
    setIsLoadingBalances(true)
    setError('')
    setDestinationVersions(new Map())

    ;(async () => {
      try {
        const [rows, balances] = await Promise.all([
          loadDestinations(workspaceId),
          itemId && workspaceId
            ? loadItemBalances(workspaceId, itemId)
            : Promise.resolve([]),
        ])
        if (cancelled) return
        setDestinations(Array.isArray(rows) ? rows : [])
        setDestinationVersions(buildDestinationVersionMap(balances))
      } catch (loadError) {
        if (cancelled) return
        setDestinations([])
        setDestinationVersions(new Map())
        setError(loadError?.message || 'Unable to load destination storages.')
      } finally {
        if (!cancelled) {
          setIsLoadingDestinations(false)
          setIsLoadingBalances(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId, item?.id, loadDestinations, loadItemBalances])

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
    if (
      !Number.isFinite(Number(expectedDestinationQuantityVersion))
      || Number(expectedDestinationQuantityVersion) < 1
    ) {
      setError('Choose a destination storage.')
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
        expectedDestinationQuantityVersion: expectedDestinationQuantityVersion,
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to transfer stock right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLoading = isLoadingDestinations || isLoadingBalances

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
            <p className="stock-modal-subtitle">{buildProductDisplayNameFromItem(item)}</p>
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
              onChange={(event) => {
                setDestinationId(event.target.value)
                setError('')
              }}
              required
              disabled={isBusy || isLoading}
              aria-label="Destination storage"
              data-testid="stock-transfer-destination-select"
            >
              <option value="">
                {isLoading ? 'Loading storages…' : 'Select destination'}
              </option>
              {destinationOptions.map((entry) => (
                <option
                  key={entry.id}
                  value={entry.id}
                  data-has-balance={entry.hasBalance ? 'true' : 'false'}
                >
                  {entry.displayLabel}
                </option>
              ))}
            </select>
          </label>

          {selectedDestination && !destinationHasBalance ? (
            <p
              className="stock-transfer-new-destination-hint"
              data-testid="stock-transfer-new-destination-hint"
            >
              {NEW_DESTINATION_HELPER}
            </p>
          ) : null}

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
              disabled={isBusy || isLoading}
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
              disabled={isBusy || isLoading}
              data-testid="stock-transfer-submit"
            >
              {isBusy ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

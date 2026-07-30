/**
 * Shared stock movement dialog (Dashboard + Storage Center).
 * P8.30.5 — optional locked destination for Storage Receive.
 */

import { useEffect, useState } from 'react'
import { formatStockQuantity } from '../../lib/stockUtils'

/**
 * @param {{
 *   item: object,
 *   movementType: string,
 *   onClose: () => void,
 *   onSubmit: (payload: object) => void|Promise<void>,
 *   isSaving?: boolean,
 *   destinationStorage?: { id?: string, name?: string, locationKey?: string }|null,
 *   destinationLocked?: boolean,
 *   expectedQuantityVersion?: number|null,
 * }} props
 */
export function StockMovementModal({
  item,
  movementType,
  onClose,
  onSubmit,
  isSaving = false,
  destinationStorage = null,
  destinationLocked = false,
  expectedQuantityVersion = null,
}) {
  const isStockCount = movementType === 'stock_count'
  const [quantity, setQuantity] = useState(
    () => (isStockCount ? `${item.currentQuantity ?? ''}` : ''),
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = isSaving || isSubmitting

  const destinationLabel = destinationStorage
    ? (destinationStorage.name || destinationStorage.locationKey || 'Storage')
    : ''

  useEffect(() => {
    if (isStockCount) {
      setQuantity(`${item.currentQuantity ?? ''}`)
    } else {
      setQuantity('')
    }
    setNote('')
    setError('')
  }, [item, movementType, isStockCount])

  const handleDismiss = () => {
    if (isBusy) return
    onClose()
  }

  const title = movementType === 'receive'
    ? 'Receive stock'
    : movementType === 'usage'
      ? 'Record usage'
      : movementType === 'stock_count'
        ? 'Stock count'
        : 'Adjust stock'

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isBusy) return
    const parsed = Number(quantity)

    if (isStockCount) {
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Enter the counted quantity (zero or greater).')
        return
      }
    } else if (movementType === 'receive') {
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a positive quantity to receive.')
        return
      }
    } else if (movementType === 'usage') {
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a positive usage quantity.')
        return
      }
      const onHand = Number(item.currentQuantity) || 0
      if (parsed > onHand) {
        setError(`Usage cannot exceed on-hand quantity (${formatStockQuantity(onHand, item.unit)}).`)
        return
      }
    } else if (!Number.isFinite(parsed) || parsed === 0) {
      setError('Enter a non-zero quantity.')
      return
    }

    try {
      setError('')
      setIsSubmitting(true)
      await onSubmit({
        item,
        type: movementType,
        quantity: parsed,
        note: note.trim(),
        workspaceStorageId: destinationStorage?.id ?? null,
        expectedQuantityVersion,
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save movement right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleDismiss}>
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        data-testid="stock-movement-modal"
      >
        <div className="drawer-header">
          <div>
            <h3>{title}</h3>
            <p className="stock-modal-subtitle">{item.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={handleDismiss} disabled={isBusy} aria-label="Close">✕</button>
        </div>

        <form className="employee-form" onSubmit={handleSubmit}>
          {destinationLocked && destinationLabel ? (
            <div className="stock-movement-destination-lock" data-testid="stock-receive-destination-lock">
              <span className="stock-movement-destination-lock-label">Destination</span>
              <strong className="stock-movement-destination-lock-value">{destinationLabel}</strong>
              <span className="stock-movement-destination-lock-note">Locked to this storage</span>
            </div>
          ) : null}

          <label>
            {isStockCount ? 'Counted quantity' : 'Quantity'}
            <input
              type="number"
              step="any"
              min={isStockCount ? '0' : undefined}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={isStockCount ? `${item.currentQuantity ?? 0}` : movementType === 'adjustment' ? 'Use negative to reduce' : '0'}
              required
              disabled={isBusy}
            />
          </label>
          <label>
            Note
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={isStockCount ? 'e.g. Monday bar count' : 'Optional'}
              disabled={isBusy}
            />
          </label>

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isBusy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={isBusy}>
              {isBusy ? 'Saving…' : isStockCount ? 'Save stock count' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

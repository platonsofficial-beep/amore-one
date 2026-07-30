/**
 * Shared stock movement dialog (Dashboard + Storage Center).
 * P8.30.5 — optional locked destination for Storage Receive.
 * P8.30.7 / P8.30.7a / P8.30.7b — Adjustment: operation selector + positive qty + notes.
 */

import { useEffect, useMemo, useState } from 'react'
import { buildProductDisplayNameFromItem } from '../../lib/stockProductIdentity'
import { formatStockQuantity } from '../../lib/stockUtils'

/** @typedef {'remove'|'add'} StockAdjustmentOperation */

/**
 * Positive-only drafts (no sign characters). Intermediate "." allowed while typing.
 * @param {string} raw
 * @returns {boolean}
 */
export function isPositiveAdjustmentQuantityDraftAllowed(raw) {
  const text = `${raw ?? ''}`
  if (text === '') return true
  return /^(\d+(\.\d*)?|\.\d*)?$/.test(text)
}

/**
 * @param {string} raw
 * @returns {number|null}
 */
export function parsePositiveAdjustmentQuantity(raw) {
  const text = `${raw ?? ''}`.trim()
  if (!text || text === '.') return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

/**
 * UI operation chooses the sign. Never Math.abs. Never typed signs.
 * @param {StockAdjustmentOperation} operation
 * @param {number} positiveQuantity
 * @returns {number}
 */
export function toSignedAdjustmentQuantity(operation, positiveQuantity) {
  const qty = Number(positiveQuantity)
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Adjustment quantity must be a positive number.')
  }
  return operation === 'remove' ? 0 - qty : qty
}

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
 *   requireAdjustmentReason?: boolean,
 *   balanceQuantity?: number|null,
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
  // Kept for call-site compatibility; P8.30.7b removed predefined reasons.
  requireAdjustmentReason: _requireAdjustmentReason = false,
  balanceQuantity = null,
}) {
  const isStockCount = movementType === 'stock_count'
  const isAdjustment = movementType === 'adjustment'
  const itemId = `${item?.id ?? ''}`
  const [quantity, setQuantity] = useState(
    () => (isStockCount ? `${item.currentQuantity ?? ''}` : ''),
  )
  const [operation, setOperation] = useState(/** @type {StockAdjustmentOperation} */ ('remove'))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = isSaving || isSubmitting

  const destinationLabel = destinationStorage
    ? (destinationStorage.name || destinationStorage.locationKey || 'Storage')
    : ''

  const currentBalance = useMemo(() => {
    if (balanceQuantity != null && Number.isFinite(Number(balanceQuantity))) {
      return Number(balanceQuantity)
    }
    return Number(item?.currentQuantity) || 0
  }, [balanceQuantity, item?.currentQuantity])

  const positiveQuantity = isAdjustment ? parsePositiveAdjustmentQuantity(quantity) : null
  const signedAdjustment = positiveQuantity == null
    ? null
    : toSignedAdjustmentQuantity(operation, positiveQuantity)
  const previewNewBalance = signedAdjustment == null
    ? null
    : currentBalance + signedAdjustment
  const wouldGoNegative = previewNewBalance != null && previewNewBalance < 0
  const canSubmitAdjustment = !isAdjustment
    || (positiveQuantity != null && !wouldGoNegative)

  useEffect(() => {
    if (isStockCount) {
      setQuantity(`${item?.currentQuantity ?? ''}`)
    } else {
      setQuantity('')
    }
    setOperation('remove')
    setNote('')
    setError('')
    // Reset only when the opened product / movement type changes — not on object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: item.currentQuantity seed for stock_count only
  }, [itemId, movementType, isStockCount])

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

  const handleAdjustmentQuantityChange = (event) => {
    const next = event.target.value
    if (!isPositiveAdjustmentQuantityDraftAllowed(next)) return
    setQuantity(next)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isBusy) return

    let parsed
    if (isAdjustment) {
      const positive = parsePositiveAdjustmentQuantity(quantity)
      if (positive == null) {
        setError('Enter a positive quantity.')
        return
      }
      parsed = toSignedAdjustmentQuantity(operation, positive)
      if (currentBalance + parsed < 0) {
        setError('Adjustment would make the balance negative.')
        return
      }
    } else {
      parsed = Number(quantity)
    }

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
    } else if (!isAdjustment && (!Number.isFinite(parsed) || parsed === 0)) {
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
        operation: isAdjustment ? operation : undefined,
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

  const lockTestId = isAdjustment
    ? 'stock-adjustment-storage-lock'
    : 'stock-receive-destination-lock'
  const lockLabel = isAdjustment ? 'Storage' : 'Destination'
  const lockNote = isAdjustment ? 'Locked' : 'Locked to this storage'
  const saveDisabled = isBusy || (isAdjustment && !canSubmitAdjustment)
  const previewOperationLabel = operation === 'remove' ? 'Remove' : 'Add'

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
            <p className="stock-modal-subtitle">{buildProductDisplayNameFromItem(item)}</p>
          </div>
          <button type="button" className="icon-btn" onClick={handleDismiss} disabled={isBusy} aria-label="Close">✕</button>
        </div>

        <form className="employee-form" onSubmit={handleSubmit}>
          {destinationLocked && destinationLabel ? (
            <div className="stock-movement-destination-lock" data-testid={lockTestId}>
              <span className="stock-movement-destination-lock-label">{lockLabel}</span>
              <strong className="stock-movement-destination-lock-value">{destinationLabel}</strong>
              <span className="stock-movement-destination-lock-note">{lockNote}</span>
            </div>
          ) : null}

          {isAdjustment ? (
            <fieldset className="stock-adjustment-operation" disabled={isBusy}>
              <legend>Operation</legend>
              <div
                className="stock-adjustment-operation-toggle"
                role="group"
                aria-label="Adjustment operation"
                data-testid="stock-adjustment-operation"
              >
                <button
                  type="button"
                  className={`stock-adjustment-operation-btn${operation === 'remove' ? ' is-selected' : ''}`}
                  aria-pressed={operation === 'remove'}
                  data-testid="stock-adjustment-operation-remove"
                  onClick={() => {
                    setOperation('remove')
                    setError('')
                  }}
                >
                  − Remove
                </button>
                <button
                  type="button"
                  className={`stock-adjustment-operation-btn${operation === 'add' ? ' is-selected' : ''}`}
                  aria-pressed={operation === 'add'}
                  data-testid="stock-adjustment-operation-add"
                  onClick={() => {
                    setOperation('add')
                    setError('')
                  }}
                >
                  + Add
                </button>
              </div>
            </fieldset>
          ) : null}

          <label>
            {isStockCount ? 'Counted quantity' : 'Quantity'}
            {isAdjustment ? (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                value={quantity}
                onChange={handleAdjustmentQuantityChange}
                placeholder="0"
                required
                disabled={isBusy}
                aria-label="Adjustment quantity"
                data-testid="stock-adjustment-quantity"
              />
            ) : (
              <input
                type="number"
                step="any"
                min={isStockCount ? '0' : undefined}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder={isStockCount ? `${item.currentQuantity ?? 0}` : '0'}
                required
                disabled={isBusy}
              />
            )}
          </label>

          {isAdjustment ? (
            <div
              className={`stock-adjustment-preview${wouldGoNegative ? ' is-blocked' : ''}`}
              data-testid="stock-adjustment-preview"
              aria-live="polite"
            >
              <div className="stock-adjustment-preview-row">
                <span>Current</span>
                <strong>{formatStockQuantity(currentBalance, item?.unit)}</strong>
              </div>
              <div className="stock-adjustment-preview-row">
                <span>{previewOperationLabel}</span>
                <strong data-testid="stock-adjustment-preview-delta">
                  {positiveQuantity == null
                    ? '—'
                    : formatStockQuantity(positiveQuantity, item?.unit)}
                </strong>
              </div>
              <div className="stock-adjustment-preview-row">
                <span>New balance</span>
                <strong data-testid="stock-adjustment-preview-result">
                  {previewNewBalance == null
                    ? '—'
                    : formatStockQuantity(previewNewBalance, item?.unit)}
                </strong>
              </div>
              {wouldGoNegative ? (
                <p
                  className="stock-adjustment-preview-blocker"
                  role="alert"
                  data-testid="stock-adjustment-negative-blocker"
                >
                  Adjustment would make the balance negative.
                </p>
              ) : null}
            </div>
          ) : null}

          <label>
            {isAdjustment ? 'Notes' : 'Note'}
            <input
              type="text"
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
                setError('')
              }}
              placeholder={
                isStockCount
                  ? 'e.g. Monday bar count'
                  : isAdjustment
                    ? 'Describe why this adjustment was made...'
                    : 'Optional'
              }
              disabled={isBusy}
              data-testid={isAdjustment ? 'stock-adjustment-note' : undefined}
            />
          </label>

          {error ? <div className="staff-status-banner" role="alert">{error}</div> : null}

          <div className="modal-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={handleDismiss}
              disabled={isBusy}
              data-testid={isAdjustment ? 'stock-adjustment-cancel' : undefined}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={saveDisabled}
              data-testid={isAdjustment ? 'stock-adjustment-submit' : undefined}
            >
              {isBusy
                ? 'Saving…'
                : isStockCount
                  ? 'Save stock count'
                  : isAdjustment
                    ? 'Apply Adjustment'
                    : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

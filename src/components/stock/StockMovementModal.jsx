/**
 * Shared stock movement dialog (Dashboard + Storage Center).
 * P8.30.5 — optional locked destination for Storage Receive.
 * P8.30.7 — Storage Adjustment: locked storage + mandatory reason.
 * P8.30.7a — Signed adjustment amount + iPad-stable string input + preview.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatStockQuantity } from '../../lib/stockUtils'

export const STOCK_ADJUSTMENT_REASON_OPTIONS = Object.freeze([
  'Damage',
  'Waste',
  'Expired',
  'Manual correction',
  'Found stock',
  'Other',
])

/**
 * Intermediate drafts allowed while typing on iPad (must not be coerced away).
 * @param {string} raw
 * @returns {boolean}
 */
export function isAdjustmentQuantityIntermediate(raw) {
  const text = `${raw ?? ''}`.trim()
  return text === ''
    || text === '-'
    || text === '+'
    || text === '.'
    || text === '-.'
    || text === '+.'
}

/**
 * Accept only editable signed numeric drafts (intermediate or complete).
 * Rejects letters and multiple signs/decimals.
 * @param {string} raw
 * @returns {boolean}
 */
export function isAdjustmentQuantityDraftAllowed(raw) {
  const text = `${raw ?? ''}`
  if (text === '') return true
  return /^[+-]?(\d+(\.\d*)?|\.\d*)?$/.test(text)
}

/**
 * @param {string} raw
 * @returns {number|null}
 */
export function parseSignedAdjustmentQuantity(raw) {
  if (isAdjustmentQuantityIntermediate(raw)) return null
  const text = `${raw ?? ''}`.trim()
  if (!text) return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed === 0) return null
  return parsed
}

/**
 * @param {string} reason
 * @param {string} note
 * @returns {string}
 */
export function buildAdjustmentMovementNote(reason, note = '') {
  const trimmedReason = `${reason ?? ''}`.trim()
  const trimmedNote = `${note ?? ''}`.trim()
  if (!trimmedReason) return trimmedNote
  if (trimmedReason === 'Other') return trimmedNote || 'Other'
  if (!trimmedNote) return trimmedReason
  return `${trimmedReason}: ${trimmedNote}`
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatSignedAdjustmentPreview(value) {
  if (!Number.isFinite(value) || value === 0) return formatStockQuantity(value)
  if (value > 0) return `+${formatStockQuantity(value)}`
  return formatStockQuantity(value)
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
  requireAdjustmentReason = false,
  balanceQuantity = null,
}) {
  const isStockCount = movementType === 'stock_count'
  const isAdjustment = movementType === 'adjustment'
  const reasonRequired = isAdjustment && requireAdjustmentReason
  const itemId = `${item?.id ?? ''}`
  const [quantity, setQuantity] = useState(
    () => (isStockCount ? `${item.currentQuantity ?? ''}` : ''),
  )
  const [reason, setReason] = useState('')
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

  const parsedAdjustment = isAdjustment ? parseSignedAdjustmentQuantity(quantity) : null
  const previewNewBalance = parsedAdjustment == null
    ? null
    : currentBalance + parsedAdjustment
  const wouldGoNegative = previewNewBalance != null && previewNewBalance < 0
  const hasValidAdjustmentAmount = parsedAdjustment != null && !wouldGoNegative
  const hasValidReason = !reasonRequired
    || (Boolean(reason.trim()) && (reason.trim() !== 'Other' || Boolean(note.trim())))
  const canSubmitAdjustment = !isAdjustment
    || (hasValidAdjustmentAmount && hasValidReason)

  useEffect(() => {
    if (isStockCount) {
      setQuantity(`${item?.currentQuantity ?? ''}`)
    } else {
      setQuantity('')
    }
    setReason('')
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
    if (!isAdjustmentQuantityDraftAllowed(next)) return
    setQuantity(next)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isBusy) return

    let parsed
    if (isAdjustment) {
      parsed = parseSignedAdjustmentQuantity(quantity)
      if (parsed == null) {
        setError('Enter a non-zero adjustment amount.')
        return
      }
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

    if (reasonRequired) {
      const trimmedReason = reason.trim()
      if (!trimmedReason) {
        setError('Choose an adjustment reason.')
        return
      }
      if (trimmedReason === 'Other' && !note.trim()) {
        setError('Enter a note for Other.')
        return
      }
    }

    const resolvedNote = reasonRequired
      ? buildAdjustmentMovementNote(reason, note)
      : note.trim()

    try {
      setError('')
      setIsSubmitting(true)
      await onSubmit({
        item,
        type: movementType,
        quantity: parsed,
        note: resolvedNote,
        reason: reasonRequired ? reason.trim() : undefined,
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
            <div className="stock-movement-destination-lock" data-testid={lockTestId}>
              <span className="stock-movement-destination-lock-label">{lockLabel}</span>
              <strong className="stock-movement-destination-lock-value">{destinationLabel}</strong>
              <span className="stock-movement-destination-lock-note">{lockNote}</span>
            </div>
          ) : null}

          <label>
            {isStockCount ? 'Counted quantity' : isAdjustment ? 'Adjustment amount' : 'Quantity'}
            {isAdjustment ? (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                value={quantity}
                onChange={handleAdjustmentQuantityChange}
                placeholder="Use negative to reduce"
                required
                disabled={isBusy}
                aria-label="Adjustment amount"
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
                <span>Adjustment</span>
                <strong data-testid="stock-adjustment-preview-delta">
                  {parsedAdjustment == null
                    ? '—'
                    : formatSignedAdjustmentPreview(parsedAdjustment)}
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

          {reasonRequired ? (
            <label>
              Reason
              <select
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setError('')
                }}
                required
                disabled={isBusy}
                aria-label="Adjustment reason"
                data-testid="stock-adjustment-reason-select"
              >
                <option value="">Select reason</option>
                {STOCK_ADJUSTMENT_REASON_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            Note
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
                  : reasonRequired
                    ? (reason === 'Other' ? 'Required for Other' : 'Optional')
                    : 'Optional'
              }
              required={reasonRequired && reason === 'Other'}
              disabled={isBusy}
              data-testid={reasonRequired ? 'stock-adjustment-note' : undefined}
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
              {isBusy ? 'Saving…' : isStockCount ? 'Save stock count' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

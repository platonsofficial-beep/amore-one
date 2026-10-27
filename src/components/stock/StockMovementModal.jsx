/**
 * Shared stock movement dialog (Dashboard + Storage Center).
 * P8.30.5 — optional locked destination for Storage Receive.
 * P8.30.7 / P8.30.7a / P8.30.7b — Adjustment: operation selector + positive qty + notes.
 */

import { useEffect, useMemo, useState } from 'react'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { createPortal } from 'react-dom'
import { buildProductDisplayNameFromItem } from '../../lib/stockProductIdentity'
import {
  describeOtherLocationStock,
  rememberLastUsedStockMovementStorage,
  resolveStockMovementStorage,
  stockMovementStorageActionLabel,
} from '../../lib/stockMovementStorage'
import {
  ABSENT_LOCATION_BALANCE_VERSION,
  isStockLocationVersionMismatch,
} from '../../services/stockMutationService'
import { formatStockQuantity, resolveStockUsageCeiling } from '../../lib/stockUtils'
import { WASTE_REASONS, formatWasteNote } from '../../lib/stockWaste'

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
 *   storageChoices?: Array<object>|null,
 *   locationBalances?: Array<object>,
 *   lastUsedStorageId?: string,
 *   workspaceId?: string,
 *   storagesLoading?: boolean,
 *   storagesError?: string,
 *   onRetryStorages?: () => void,
 *   onReloadBalances?: () => void|Promise<void>,
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
  storageChoices = null,
  locationBalances = [],
  lastUsedStorageId = '',
  workspaceId = '',
  storagesLoading = false,
  storagesError = '',
  onRetryStorages,
  onReloadBalances,
}) {
  const isStockCount = movementType === 'stock_count'
  const isAdjustment = movementType === 'adjustment'
  const isWaste = movementType === 'waste'
  const itemId = `${item?.id ?? ''}`
  const [quantity, setQuantity] = useState(
    () => (isStockCount ? `${item.currentQuantity ?? ''}` : ''),
  )
  const [operation, setOperation] = useState(/** @type {StockAdjustmentOperation} */ ('remove'))
  const [note, setNote] = useState('')
  const [wasteReasonId, setWasteReasonId] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [storageOverrideId, setStorageOverrideId] = useState('')
  const isBusy = isSaving || isSubmitting
  const pickerMode = !destinationLocked && Array.isArray(storageChoices)

  const resolution = useMemo(() => {
    if (!pickerMode) return null
    return resolveStockMovementStorage({
      item,
      balances: locationBalances,
      storages: storageChoices,
      lastUsedStorageId,
    })
  }, [pickerMode, item, locationBalances, storageChoices, lastUsedStorageId])

  const selectedStorageId = storageOverrideId || resolution?.storage?.id || ''
  const selectedChoice = pickerMode
    ? (storageChoices.find((storage) => `${storage?.id ?? ''}` === selectedStorageId) ?? null)
    : null
  const selectedStorage = pickerMode
    ? (selectedChoice
      ? {
        id: `${selectedChoice.id}`,
        name: selectedChoice.name || selectedChoice.locationKey || 'Storage',
        locationKey: selectedChoice.locationKey || selectedChoice.name || '',
      }
      : null)
    : destinationStorage
  const selectedBalance = pickerMode
    ? (locationBalances.find((balance) => {
      const storageId = `${balance?.workspaceStorageId ?? balance?.workspace_storage_id ?? ''}`
      return storageId === selectedStorageId
    }) ?? null)
    : null
  const selectedVersion = pickerMode
    ? Number(selectedBalance?.quantityVersion ?? selectedBalance?.quantity_version)
    : Number(expectedQuantityVersion)
  const effectiveVersion = Number.isFinite(selectedVersion) && selectedVersion >= 1
    ? Math.floor(selectedVersion)
    : null
  const effectiveBalanceQuantity = pickerMode
    ? (selectedBalance == null
      ? null
      : Number(selectedBalance.quantity ?? selectedBalance.balanceQuantity))
    : balanceQuantity

  const destinationLabel = selectedStorage
    ? (selectedStorage.name || selectedStorage.locationKey || 'Storage')
    : ''

  const otherLocationNote = pickerMode && movementType === 'stock_count' && selectedStorage
    ? describeOtherLocationStock(
      locationBalances,
      selectedStorage.id,
      formatStockQuantity,
      item?.unit,
    )
    : ''

  const currentBalance = useMemo(() => {
    if (effectiveBalanceQuantity != null && effectiveBalanceQuantity !== ''
      && Number.isFinite(Number(effectiveBalanceQuantity))) {
      return Number(effectiveBalanceQuantity)
    }
    if (pickerMode) return null
    return Number(item?.currentQuantity) || 0
  }, [effectiveBalanceQuantity, item?.currentQuantity, pickerMode])

  const positiveQuantity = isAdjustment ? parsePositiveAdjustmentQuantity(quantity) : null
  const signedAdjustment = positiveQuantity == null
    ? null
    : toSignedAdjustmentQuantity(operation, positiveQuantity)
  const createsAbsentBalance = Boolean(
    pickerMode
    && selectedStorage
    && effectiveVersion == null
    && (
      movementType === 'receive'
      || movementType === 'stock_count'
      || (isAdjustment && operation === 'add')
    ),
  )
  const adjustmentBalance = currentBalance == null && createsAbsentBalance && isAdjustment
    ? 0
    : currentBalance
  const previewNewBalance = signedAdjustment == null || adjustmentBalance == null
    ? null
    : adjustmentBalance + signedAdjustment
  const wouldGoNegative = previewNewBalance != null && previewNewBalance < 0
  const canSubmitAdjustment = !isAdjustment
    || (adjustmentBalance != null && positiveQuantity != null && !wouldGoNegative)
  const missingLocationBalance = Boolean(
    pickerMode && selectedStorage && effectiveVersion == null && !createsAbsentBalance,
  )
  const movementQuantity = Number(`${quantity ?? ''}`.trim())
  const hasPositiveMovementQuantity = Number.isFinite(movementQuantity) && movementQuantity > 0
  const usageOrWasteCeiling = movementType === 'usage' || isWaste
    ? resolveStockUsageCeiling({
      destinationStorage: pickerMode ? selectedStorage : destinationStorage,
      balanceQuantity: pickerMode ? effectiveBalanceQuantity : balanceQuantity,
      currentQuantity: pickerMode ? null : item?.currentQuantity,
    })
    : null
  const wasteOrUsageInvalid = (movementType === 'usage' || isWaste) && (
    !hasPositiveMovementQuantity
    || (isWaste && !wasteReasonId)
    || usageOrWasteCeiling == null
    || movementQuantity > usageOrWasteCeiling
  )
  const saveBlocked = isBusy
    || storagesLoading
    || (isAdjustment && !canSubmitAdjustment)
    || wasteOrUsageInvalid
    || (pickerMode && (!selectedStorage || (effectiveVersion == null && !createsAbsentBalance)))

  useEffect(() => {
    setOperation('remove')
    setNote('')
    setWasteReasonId('')
    setError('')
    setPickerOpen(false)
    setStorageOverrideId('')
    if (!isStockCount) setQuantity('')
  }, [itemId, movementType, isStockCount])

  useEffect(() => {
    if (!isStockCount) return
    if (pickerMode) {
      if (effectiveBalanceQuantity == null || !Number.isFinite(Number(effectiveBalanceQuantity))) {
        setQuantity('')
        return
      }
      setQuantity(String(effectiveBalanceQuantity))
      return
    }
    setQuantity(`${item?.currentQuantity ?? ''}`)
  }, [
    itemId,
    movementType,
    isStockCount,
    pickerMode,
    selectedStorageId,
    effectiveBalanceQuantity,
    item?.currentQuantity,
  ])

  useEscapeToClose(() => {
    if (pickerOpen) {
      setPickerOpen(false)
      return
    }
    if (isBusy) return
    onClose?.()
  })

  const handleDismiss = () => {
    if (isBusy) return
    onClose()
  }

  const title = movementType === 'receive'
    ? 'Receive stock'
    : movementType === 'usage'
      ? 'Record usage'
      : isWaste
        ? 'Waste'
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

    if (isWaste && !wasteReasonId) {
      setError('Choose a reason.')
      return
    }
    if (pickerMode && !selectedStorage?.id) {
      setError('Choose a storage.')
      return
    }
    if (pickerMode && effectiveVersion == null && !createsAbsentBalance) {
      setError(`No balance at ${destinationLabel} yet. Choose a storage that already holds this product.`)
      return
    }

    let parsed
    if (isAdjustment) {
      const positive = parsePositiveAdjustmentQuantity(quantity)
      if (positive == null) {
        setError('Enter a positive quantity.')
        return
      }
      parsed = toSignedAdjustmentQuantity(operation, positive)
      if (adjustmentBalance == null) {
        setError('This storage balance is not available yet. Choose a storage that already holds this product.')
        return
      }
      if (adjustmentBalance + parsed < 0) {
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
    } else if (movementType === 'usage' || isWaste) {
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError(isWaste ? 'Enter a positive quantity.' : 'Enter a positive usage quantity.')
        return
      }
      const usageDestination = pickerMode
        ? (selectedStorage || { id: 'pending' })
        : destinationStorage
      const usageBalance = pickerMode ? effectiveBalanceQuantity : balanceQuantity
      const usageCeiling = resolveStockUsageCeiling({
        destinationStorage: usageDestination,
        balanceQuantity: usageBalance,
        currentQuantity: pickerMode ? null : item?.currentQuantity,
      })
      if (usageCeiling == null) {
        setError('This storage balance is not available yet. Refresh the location before recording usage.')
        return
      }
      if (parsed > usageCeiling) {
        const limitLabel = usageDestination ? 'balance in this storage' : 'on-hand quantity'
        const verb = isWaste ? 'Waste' : 'Usage'
        setError(`${verb} cannot exceed the ${limitLabel} (${formatStockQuantity(usageCeiling, item.unit)}).`)
        return
      }
    } else if (!isAdjustment && (!Number.isFinite(parsed) || parsed === 0)) {
      setError('Enter a non-zero quantity.')
      return
    }

    const workspaceStorageId = pickerMode
      ? selectedStorage.id
      : (destinationStorage?.id ?? null)
    const versionForSubmit = pickerMode
      ? (effectiveVersion == null ? ABSENT_LOCATION_BALANCE_VERSION : effectiveVersion)
      : expectedQuantityVersion

    try {
      setError('')
      setIsSubmitting(true)
      await onSubmit({
        item,
        type: isWaste ? 'usage' : movementType,
        quantity: parsed,
        note: isWaste ? formatWasteNote(wasteReasonId, note) : note.trim(),
        wasteReasonId: isWaste ? wasteReasonId : undefined,
        operation: isAdjustment ? operation : undefined,
        workspaceStorageId,
        expectedQuantityVersion: versionForSubmit,
      })
      if (pickerMode) {
        rememberLastUsedStockMovementStorage(workspaceId, item?.id, workspaceStorageId)
      }
      onClose()
    } catch (submitError) {
      if (isStockLocationVersionMismatch(submitError)) {
        try {
          if (typeof onReloadBalances === 'function') await onReloadBalances()
        } catch (reloadError) {
          setError(reloadError?.message || 'This balance changed, and the refresh failed. Try again.')
          return
        }
        setError('This balance changed. The storage quantity was refreshed. Check it and try again.')
        return
      }
      setError(submitError?.message || 'Unable to save movement right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const lockTestId = isWaste
    ? 'stock-waste-storage-lock'
    : (isAdjustment
      ? 'stock-adjustment-storage-lock'
      : 'stock-receive-destination-lock')
  const lockLabel = isAdjustment || isWaste ? 'Storage' : 'Destination'
  const lockNote = isAdjustment || isWaste ? 'Locked' : 'Locked to this storage'
  const saveDisabled = saveBlocked
  const countButtonQuantity = (() => {
    const text = `${quantity ?? ''}`.trim()
    if (!text || text === '.') return null
    const parsed = Number(text)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return text
  })()
  const submitLabel = isBusy
    ? 'Saving…'
    : (pickerMode && isStockCount
      ? `Set ${destinationLabel || 'storage'} to ${countButtonQuantity ?? '…'}`
        : (isStockCount
        ? 'Save stock count'
        : (isWaste ? 'Log waste' : (isAdjustment ? 'Apply Adjustment' : 'Save'))))
  const previewOperationLabel = operation === 'remove' ? 'Remove' : 'Add'

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleDismiss}>
      <div
        className="employee-modal stock-dashboard-modal stock-movement-modal task-form-modal is-responsive-sheet"
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
          <div className="stock-movement-modal-body">
          {destinationLocked && destinationLabel ? (
            <div className="stock-movement-destination-lock" data-testid={lockTestId}>
              <span className="stock-movement-destination-lock-label">{lockLabel}</span>
              <strong className="stock-movement-destination-lock-value">{destinationLabel}</strong>
              <span className="stock-movement-destination-lock-note">{lockNote}</span>
            </div>
          ) : null}

          {pickerMode ? (
            <>
              <div className="stock-movement-storage-field">
                <span className="stock-movement-storage-field-label" id="stock-movement-storage-label">Storage</span>
                <button
                  type="button"
                  className="stock-movement-storage-row"
                  data-testid="stock-movement-storage-row"
                  disabled={isBusy || storagesLoading}
                  aria-haspopup="dialog"
                  aria-expanded={pickerOpen}
                  aria-labelledby="stock-movement-storage-label"
                  onClick={() => setPickerOpen(true)}
                >
                  {storagesLoading
                    ? 'Loading storages…'
                    : (movementType === 'adjustment' || movementType === 'usage' || isWaste
                      ? (destinationLabel || 'Choose a storage')
                      : stockMovementStorageActionLabel(movementType, destinationLabel))}
                </button>
              </div>
              {storagesError ? (
                <p className="stock-movement-storage-gap" role="alert">
                  {storagesError}
                  {typeof onRetryStorages === 'function' ? (
                    <>
                      {' '}
                      <button type="button" className="ghost-btn" onClick={onRetryStorages}>Retry</button>
                    </>
                  ) : null}
                </p>
              ) : null}
              {missingLocationBalance ? (
                <p className="stock-movement-storage-gap" data-testid="stock-movement-balance-gap">
                  {`No balance at ${destinationLabel} yet. Choose a storage that already holds this product.`}
                </p>
              ) : null}
              {createsAbsentBalance ? (
                <p className="stock-movement-storage-gap" data-testid="stock-movement-balance-start">
                  {`No balance at ${destinationLabel} yet. Saving starts this storage at the quantity you enter.`}
                </p>
              ) : null}
              {otherLocationNote ? (
                <p className="stock-movement-other-locations" data-testid="stock-movement-other-locations">
                  {otherLocationNote}
                </p>
              ) : null}
            </>
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

          {isWaste ? (
            <fieldset className="stock-waste-reasons" disabled={isBusy}>
              <legend>Reason</legend>
              <div role="group" aria-label="Waste reason" data-testid="stock-waste-reasons">
                {WASTE_REASONS.map((reason) => (
                  <button
                    key={reason.id}
                    type="button"
                    className={`stock-waste-reason-btn${wasteReasonId === reason.id ? ' is-selected' : ''}`}
                    aria-pressed={wasteReasonId === reason.id}
                    data-waste-reason={reason.id}
                    onClick={() => {
                      setWasteReasonId(reason.id)
                      setError('')
                    }}
                  >
                    {reason.label}
                  </button>
                ))}
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
                placeholder="Qty"
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
                placeholder={isStockCount
                  ? `${pickerMode ? (effectiveBalanceQuantity ?? 0) : (item.currentQuantity ?? 0)}`
                  : 'Qty'}
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
                <strong>{adjustmentBalance == null ? '—' : formatStockQuantity(adjustmentBalance, item?.unit)}</strong>
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
                    : isWaste
                      ? 'Optional'
                      : 'Optional'
              }
              disabled={isBusy}
              data-testid={isAdjustment ? 'stock-adjustment-note' : undefined}
            />
          </label>

          {error ? <div className="staff-status-banner" role="alert">{error}</div> : null}
          </div>

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
              data-testid={isAdjustment ? 'stock-adjustment-submit' : 'stock-movement-submit'}
            >
              {submitLabel}
            </button>
          </div>
        </form>
        {pickerOpen ? createPortal(
          <div
            className="stock-movement-storage-sheet-backdrop"
            data-testid="stock-movement-storage-sheet"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="stock-movement-storage-sheet"
              role="dialog"
              aria-label="Choose storage"
              onClick={(event) => event.stopPropagation()}
            >
              <h4>Choose storage</h4>
              {storageChoices.length === 0 ? (
                <p className="stock-movement-storage-gap">No active storage is available.</p>
              ) : storageChoices.map((storage) => {
                const storageId = `${storage?.id ?? ''}`
                const storageName = storage?.name || storage?.locationKey || 'Storage'
                const balance = locationBalances.find((entry) => {
                  const id = `${entry?.workspaceStorageId ?? entry?.workspace_storage_id ?? ''}`
                  return id === storageId
                })
                const quantityLabel = balance == null
                  ? 'No balance'
                  : formatStockQuantity(balance.quantity, item?.unit)
                const selected = storageId === selectedStorageId
                return (
                  <button
                    key={storageId || storageName}
                    type="button"
                    className={`stock-movement-storage-option${selected ? ' is-selected' : ''}`}
                    data-testid={`stock-movement-storage-option-${storageId}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setStorageOverrideId(storageId)
                      setPickerOpen(false)
                      setError('')
                    }}
                  >
                    <span>{storageName}</span>
                    <span className="stock-movement-storage-option-qty">{quantityLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    </div>
  )
}

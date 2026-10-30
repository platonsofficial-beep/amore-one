import { useEffect, useMemo, useState } from 'react'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { OverlayPortal } from './OverlayPortal'
import {
  buildSupplierOrderGroups,
  computeOrderLineTotal,
  UNASSIGNED_SUPPLIER,
} from '../../lib/stockOrderUtils'
import { formatStockPurchasePrice, formatStockQuantity, formatInventoryUnitLabel } from '../../lib/stockUtils'

const UNDO_TOAST_MS = 6000

function RemoveFromOrderConfirm({ title, body, onCancel, onConfirm }) {
  useEscapeToClose(onCancel)
  return (
    <OverlayPortal>
      <div
        className="employee-modal-backdrop inventory-count-correction-confirm-overlay stock-create-order-remove-confirm-overlay"
        role="presentation"
        onClick={(event) => {
          // React bubbles portal clicks to the sheet's backdrop; keep the sheet open.
          event.stopPropagation()
          onCancel()
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="stock-create-order-remove-title"
          aria-describedby="stock-create-order-remove-body"
          className="inventory-count-correction-confirm-dialog stock-create-order-remove-confirm"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="stock-create-order-remove-title" className="inventory-count-correction-confirm-title">
            {title}
          </h2>
          <div id="stock-create-order-remove-body" className="inventory-count-correction-confirm-body">
            <p>{body}</p>
          </div>
          <div className="inventory-count-correction-confirm-actions">
            <button type="button" className="ghost-btn" onClick={onCancel} autoFocus>
              Cancel
            </button>
            <button type="button" className="primary-btn stock-create-order-remove-confirm-btn" onClick={onConfirm}>
              Remove
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}

function SupplierOrderGroup({
  group,
  onUpdateItemQuantity,
  onRemoveItem,
  onUpdateNotes,
  onUpdateExpectedDeliveryDate,
  onRemoveGroup,
}) {
  const groupKey = group?.groupKey ?? (`${group?.supplier ?? ''}`.trim() || UNASSIGNED_SUPPLIER)
  const supplier = `${group?.supplier ?? ''}`.trim() || UNASSIGNED_SUPPLIER
  const items = Array.isArray(group?.items) ? group.items : []

  const groupTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + computeOrderLineTotal(item.quantity, item.costPrice), 0)
  }, [items])

  if (items.length === 0) {
    return null
  }

  return (
    <section className="stock-create-order-group panel staff-panel">
      <header className="stock-create-order-group-header">
        <div>
          <h4 className="stock-create-order-group-title">{supplier}</h4>
          <p className="stock-create-order-group-meta">
            {items.length} product{items.length === 1 ? '' : 's'} · {formatStockPurchasePrice(groupTotal)}
          </p>
        </div>
        <button
          type="button"
          className="ghost-btn stock-create-order-remove-group"
          onClick={() => onRemoveGroup(groupKey, supplier, items.length)}
        >
          Remove supplier
        </button>
      </header>

      <ul className="stock-create-order-items">
        {items.map((item) => (
          <li key={item.stockItemId} className="stock-create-order-item">
            <div className="stock-create-order-item-copy">
              <strong>{item.itemName}</strong>
              <span>Need: {formatStockQuantity(item.quantity, item.unit)}</span>
            </div>
            <div className="stock-create-order-item-controls">
              <label className="stock-create-order-qty-label">
                <span className="sr-only">Quantity for {item.itemName}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="stock-create-order-qty-input"
                  value={item.quantity}
                  onChange={(event) => onUpdateItemQuantity(
                    groupKey,
                    item.stockItemId,
                    event.target.value,
                  )}
                />
              </label>
              <span className="stock-create-order-item-unit">{formatInventoryUnitLabel(item.unit) || 'units'}</span>
              <button
                type="button"
                className="icon-btn stock-create-order-remove-item"
                onClick={() => onRemoveItem(groupKey, item.stockItemId, item.itemName)}
                aria-label={`Remove ${item.itemName}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <label className="stock-create-order-delivery">
        <span>Expected delivery</span>
        <input
          type="date"
          className="stock-order-date-input"
          value={group?.expectedDeliveryDate ?? ''}
          onChange={(event) => onUpdateExpectedDeliveryDate(groupKey, event.target.value)}
        />
      </label>

      <label className="stock-create-order-notes">
        <span>Notes</span>
        <textarea
          rows={2}
          value={group?.notes ?? ''}
          placeholder="Delivery notes, reference, or instructions"
          onChange={(event) => onUpdateNotes(groupKey, event.target.value)}
        />
      </label>
    </section>
  )
}

export function StockCreateOrderModal({
  stockItems,
  initialGroups = null,
  onClose,
  onSubmit,
  isSaving = false,
}) {
  const [groups, setGroups] = useState(() => {
    if (Array.isArray(initialGroups) && initialGroups.length > 0) {
      return initialGroups
    }

    return buildSupplierOrderGroups(stockItems ?? [])
      .filter((group) => Array.isArray(group?.items) && group.items.length > 0)
      .map((group) => ({
        ...group,
        notes: '',
        expectedDeliveryDate: '',
      }))
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isBusy = isSaving || isSubmitting

  useEscapeToClose(() => {
    if (!isBusy) onClose?.()
  }, { enabled: !isBusy })

  const handleDismiss = () => {
    if (isBusy) return
    onClose()
  }

  const updateGroup = (groupKey, updater) => {
    setGroups((current) => current.map((group) => (
      (group.groupKey ?? group.supplier) === groupKey ? updater(group) : group
    )))
  }

  const handleUpdateItemQuantity = (groupKey, stockItemId, rawValue) => {
    const quantity = Math.max(0, Number(rawValue) || 0)

    updateGroup(groupKey, (group) => ({
      ...group,
      items: group.items.map((item) => (
        item.stockItemId === stockItemId
          ? {
            ...item,
            quantity,
            totalPrice: computeOrderLineTotal(quantity, item.costPrice),
          }
          : item
      )),
    }))
  }

  const [pendingRemoval, setPendingRemoval] = useState(null)
  const [undoState, setUndoState] = useState(null)

  useEffect(() => {
    if (!undoState) return undefined
    const timer = window.setTimeout(() => setUndoState(null), UNDO_TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [undoState])

  const removeItemNow = (groupKey, stockItemId) => {
    updateGroup(groupKey, (group) => ({
      ...group,
      items: group.items.filter((item) => item.stockItemId !== stockItemId),
    }))

    setGroups((current) => current.filter((group) => group.items.length > 0))
  }

  const removeGroupNow = (groupKey) => {
    setGroups((current) => current.filter((group) => (
      (group.groupKey ?? group.supplier) !== groupKey
    )))
  }

  // Removing is a one-tap mistake waiting to happen: ask first, then offer Undo.
  const handleRemoveItem = (groupKey, stockItemId, itemName = '') => {
    const name = `${itemName ?? ''}`.trim() || 'this product'
    setPendingRemoval({
      title: `Remove ${name} from this order?`,
      body: 'You can add it again from Stock later.',
      toast: `Removed ${name}`,
      apply: () => removeItemNow(groupKey, stockItemId),
    })
  }

  const handleRemoveGroup = (groupKey, supplierName = '', productCount = 0) => {
    const name = `${supplierName ?? ''}`.trim() || 'this supplier'
    const count = Number(productCount) || 0
    setPendingRemoval({
      title: `Remove ${name}?`,
      body: `Its ${count} product${count === 1 ? '' : 's'} will be removed from this order.`,
      toast: `Removed ${name}`,
      apply: () => removeGroupNow(groupKey),
    })
  }

  const confirmRemoval = () => {
    if (!pendingRemoval) return
    setUndoState({ message: pendingRemoval.toast, snapshot: groups })
    pendingRemoval.apply()
    setPendingRemoval(null)
  }

  const handleUndo = () => {
    if (!undoState) return
    setGroups(undoState.snapshot)
    setUndoState(null)
  }

  const handleUpdateNotes = (groupKey, notes) => {
    updateGroup(groupKey, (group) => ({ ...group, notes }))
  }

  const handleUpdateExpectedDeliveryDate = (groupKey, expectedDeliveryDate) => {
    updateGroup(groupKey, (group) => ({ ...group, expectedDeliveryDate }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isBusy) return
    setError('')

    const validGroups = groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.quantity > 0),
      }))
      .filter((group) => group.items.length > 0)

    if (validGroups.length === 0) {
      setError('No products selected for ordering.')
      return
    }

    setIsSubmitting(true)

    try {
      await onSubmit(validGroups)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to create orders right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const orderCount = groups.filter((group) => group.items.some((item) => item.quantity > 0)).length

  return (
    <OverlayPortal>
    <div className="employee-modal-backdrop task-modal-backdrop stock-create-order-backdrop stock-overlay" onClick={handleDismiss}>
      <form
        className="employee-modal stock-create-order-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-create-order-title"
        aria-busy={isBusy}
      >
        <header className="stock-create-order-header">
          <div>
            <p className="stock-create-order-eyebrow">Purchase order</p>
            <h3 id="stock-create-order-title">Create supplier orders</h3>
            <p className="stock-create-order-subtitle">
              Products below need reordering, grouped by supplier.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn stock-create-order-close"
            onClick={handleDismiss}
            disabled={isBusy}
            aria-label="Close create order"
          >
            ✕
          </button>
        </header>

        <div className="stock-create-order-body">
          {error ? <div className="staff-status-banner">{error}</div> : null}

          {groups.length === 0 ? (
            <div className="stock-empty-state panel staff-panel">
              <h4>Nothing to order right now</h4>
              <p>All products are above their minimum or target levels.</p>
            </div>
          ) : (
            groups.map((group) => (
              <SupplierOrderGroup
                key={`${group?.groupKey ?? group?.supplier ?? UNASSIGNED_SUPPLIER}-${group?.items?.[0]?.stockItemId ?? 'group'}`}
                group={group}
                onUpdateItemQuantity={handleUpdateItemQuantity}
                onRemoveItem={handleRemoveItem}
                onUpdateNotes={handleUpdateNotes}
                onUpdateExpectedDeliveryDate={handleUpdateExpectedDeliveryDate}
                onRemoveGroup={handleRemoveGroup}
              />
            ))
          )}

          {groups.some((group) => group.supplier === UNASSIGNED_SUPPLIER) ? (
            <p className="stock-create-order-hint">
              Products without a supplier are grouped under &ldquo;{UNASSIGNED_SUPPLIER}&rdquo;.
            </p>
          ) : null}
        </div>

        <footer className="stock-create-order-footer">
          <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-btn"
            disabled={isBusy || orderCount === 0}
          >
            {isBusy
              ? 'Creating…'
              : `Create ${orderCount} order${orderCount === 1 ? '' : 's'}`}
          </button>
        </footer>
      </form>
      {undoState ? (
        <div className="stock-create-order-undo-toast" role="status" onClick={(event) => event.stopPropagation()}>
          <span>{undoState.message}</span>
          <button type="button" className="ghost-btn" onClick={handleUndo}>Undo</button>
        </div>
      ) : null}
    </div>
    {pendingRemoval ? (
      <RemoveFromOrderConfirm
        title={pendingRemoval.title}
        body={pendingRemoval.body}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={confirmRemoval}
      />
    ) : null}
    </OverlayPortal>
  )
}

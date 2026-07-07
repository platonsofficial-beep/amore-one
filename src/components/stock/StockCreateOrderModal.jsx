import { useEffect, useState } from 'react'
import {
  buildSupplierOrderGroups,
  computeOrderLineTotal,
  UNASSIGNED_SUPPLIER,
} from '../../lib/stockOrderUtils'
import { formatStockPurchasePrice, formatStockQuantity } from '../../lib/stockUtils'

function SupplierOrderGroup({
  group,
  onUpdateItemQuantity,
  onRemoveItem,
  onUpdateNotes,
  onUpdateExpectedDeliveryDate,
  onRemoveGroup,
}) {
  const groupTotal = useMemo(() => {
    return group.items.reduce((sum, item) => sum + computeOrderLineTotal(item.quantity, item.costPrice), 0)
  }, [group.items])

  return (
    <section className="stock-create-order-group panel staff-panel">
      <header className="stock-create-order-group-header">
        <div>
          <h4 className="stock-create-order-group-title">{group.supplier}</h4>
          <p className="stock-create-order-group-meta">
            {group.items.length} product{group.items.length === 1 ? '' : 's'} · {formatStockPurchasePrice(groupTotal)}
          </p>
        </div>
        <button
          type="button"
          className="ghost-btn stock-create-order-remove-group"
          onClick={() => onRemoveGroup(group.supplier)}
        >
          Remove supplier
        </button>
      </header>

      <ul className="stock-create-order-items">
        {group.items.map((item) => (
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
                    group.supplier,
                    item.stockItemId,
                    event.target.value,
                  )}
                />
              </label>
              <span className="stock-create-order-item-unit">{item.unit || 'units'}</span>
              <button
                type="button"
                className="icon-btn stock-create-order-remove-item"
                onClick={() => onRemoveItem(group.supplier, item.stockItemId)}
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
          value={group.expectedDeliveryDate ?? ''}
          onChange={(event) => onUpdateExpectedDeliveryDate(group.supplier, event.target.value)}
        />
      </label>

      <label className="stock-create-order-notes">
        <span>Notes</span>
        <textarea
          rows={2}
          value={group.notes ?? ''}
          placeholder="Delivery notes, reference, or instructions"
          onChange={(event) => onUpdateNotes(group.supplier, event.target.value)}
        />
      </label>
    </section>
  )
}

export function StockCreateOrderModal({
  stockItems,
  onClose,
  onSubmit,
  isSaving = false,
}) {
  const [groups, setGroups] = useState(() => (
    buildSupplierOrderGroups(stockItems).map((group) => ({
      ...group,
      notes: '',
      expectedDeliveryDate: '',
    }))
  ))
  const [error, setError] = useState('')

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const updateGroup = (supplier, updater) => {
    setGroups((current) => current.map((group) => (
      group.supplier === supplier ? updater(group) : group
    )))
  }

  const handleUpdateItemQuantity = (supplier, stockItemId, rawValue) => {
    const quantity = Math.max(0, Number(rawValue) || 0)

    updateGroup(supplier, (group) => ({
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

  const handleRemoveItem = (supplier, stockItemId) => {
    updateGroup(supplier, (group) => ({
      ...group,
      items: group.items.filter((item) => item.stockItemId !== stockItemId),
    }))

    setGroups((current) => current.filter((group) => group.items.length > 0))
  }

  const handleRemoveGroup = (supplier) => {
    setGroups((current) => current.filter((group) => group.supplier !== supplier))
  }

  const handleUpdateNotes = (supplier, notes) => {
    updateGroup(supplier, (group) => ({ ...group, notes }))
  }

  const handleUpdateExpectedDeliveryDate = (supplier, expectedDeliveryDate) => {
    updateGroup(supplier, (group) => ({ ...group, expectedDeliveryDate }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
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

    try {
      await onSubmit(validGroups)
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to create orders right now.')
    }
  }

  const orderCount = groups.filter((group) => group.items.some((item) => item.quantity > 0)).length

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <form
        className="employee-modal stock-create-order-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-create-order-title"
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
            onClick={onClose}
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
                key={group.supplier}
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
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-btn"
            disabled={isSaving || orderCount === 0}
          >
            {isSaving
              ? 'Creating…'
              : `Create ${orderCount} draft order${orderCount === 1 ? '' : 's'}`}
          </button>
        </footer>
      </form>
    </div>
  )
}

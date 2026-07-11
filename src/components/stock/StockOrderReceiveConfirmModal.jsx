import {
  buildPendingReceiveLines,
  formatStockOrderNumber,
  willCompleteOrderAfterReceive,
} from '../../lib/stockOrderUtils'
import { formatStockQuantity } from '../../lib/stockUtils'
import { LoadingButton } from '../LoadingButton'

export function StockOrderReceiveConfirmModal({
  order,
  receiveNowByItemId,
  isSaving = false,
  onClose,
  onConfirm,
}) {
  const pendingLines = buildPendingReceiveLines(order, receiveNowByItemId)
  const willComplete = willCompleteOrderAfterReceive(order, receiveNowByItemId)
  const totalUnitsReceiving = pendingLines.reduce((sum, line) => sum + line.receiveNow, 0)

  const handleDismiss = () => {
    if (isSaving) return
    onClose()
  }

  const handleConfirm = () => {
    if (isSaving) return
    onConfirm()
  }

  return (
    <div className="employee-modal-backdrop stock-order-receive-confirm-backdrop task-modal-backdrop" onClick={handleDismiss}>
      <div
        className="employee-modal stock-order-receive-confirm-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-order-receive-confirm-title"
        aria-busy={isSaving}
      >
        <header className="stock-create-order-header">
          <div>
            <p className="stock-create-order-eyebrow">Confirm receiving</p>
            <h3 id="stock-order-receive-confirm-title">Receive stock</h3>
            <p className="stock-create-order-subtitle">
              Review quantities before updating inventory.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn stock-create-order-close"
            onClick={handleDismiss}
            disabled={isSaving}
            aria-label="Close receive confirmation"
          >
            ✕
          </button>
        </header>

        <div className="stock-order-receive-confirm-body">
          <dl className="stock-product-history-overview">
            <div className="stock-product-history-overview-row">
              <dt>Supplier</dt>
              <dd>{order.supplier || '—'}</dd>
            </div>
            <div className="stock-product-history-overview-row">
              <dt>Order</dt>
              <dd>{formatStockOrderNumber(order.orderNumber)}</dd>
            </div>
          </dl>

          <section className="stock-order-receive-confirm-products" aria-label="Products being received">
            <div className="stock-order-receive-confirm-products-head">
              <h4 className="stock-order-receive-confirm-products-title">Products being received</h4>
              <p className="stock-order-receive-confirm-total">
                {pendingLines.length} product{pendingLines.length === 1 ? '' : 's'} · {totalUnitsReceiving} unit{totalUnitsReceiving === 1 ? '' : 's'} total
              </p>
            </div>
            <ul className="stock-order-receive-confirm-list">
              {pendingLines.map(({ item, receiveNow }) => (
                <li key={item.id} className="stock-order-receive-confirm-item">
                  <strong>{item.itemName}</strong>
                  <span>{formatStockQuantity(receiveNow, item.unit)}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="stock-order-receive-confirm-notes panel staff-panel">
            <p>Stock levels will update immediately for the quantities above.</p>
            <p>Receive movements will be added to each product&apos;s history.</p>
            {willComplete ? (
              <p>This delivery completes the order — status will change to Received.</p>
            ) : (
              <p>The order will stay open until all products are fully received.</p>
            )}
          </div>
        </div>

        <footer className="stock-create-order-footer">
          <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            type="button"
            isLoading={isSaving}
            loadingLabel="Receiving..."
            disabled={pendingLines.length === 0}
            onClick={handleConfirm}
          >
            Confirm receive
          </LoadingButton>
        </footer>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import {
  buildPendingReceiveLines,
  formatStockOrderNumber,
  willCompleteOrderAfterReceive,
} from '../../lib/stockOrderUtils'
import { resolveListedProductName } from '../../lib/stockProductIdentity'
import { formatStockQuantity } from '../../lib/stockUtils'
import { LoadingButton } from '../LoadingButton'
import { t } from '../../i18n/i18n'

export function StockOrderReceiveConfirmModal({
  order,
  stockItems = [],
  receiveNowByItemId,
  destinationLabel = '',
  isSaving = false,
  onClose,
  onConfirm,
  onAddInvoice,
}) {
  const pendingLines = buildPendingReceiveLines(order, receiveNowByItemId)
  const willComplete = willCompleteOrderAfterReceive(order, receiveNowByItemId)
  const totalUnitsReceiving = pendingLines.reduce((sum, line) => sum + line.receiveNow, 0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEscapeToClose(() => {
    if (isSaving || isSubmitting) return
    onClose?.()
  })

  const handleDismiss = () => {
    if (isSaving || isSubmitting) return
    onClose()
  }

  const handleConfirm = async () => {
    if (isSaving || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onConfirm?.()
    } finally {
      setIsSubmitting(false)
    }
  }

  const isReceivePending = isSaving || isSubmitting

  return (
    <div className="employee-modal-backdrop stock-order-receive-confirm-backdrop task-modal-backdrop" onClick={handleDismiss}>
      <div
        className="employee-modal stock-order-receive-confirm-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-order-receive-confirm-title"
        aria-busy={isReceivePending}
      >
        <header className="stock-create-order-header">
          <div>
            <p className="stock-create-order-eyebrow">{t("Confirm receiving")}</p>
            <h3 id="stock-order-receive-confirm-title">{t("Receive stock")}</h3>
            <p className="stock-create-order-subtitle">
              {t("Review quantities before updating inventory.")}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn stock-create-order-close"
            onClick={handleDismiss}
            disabled={isReceivePending}
            aria-label={t("Close receive confirmation")}
          >
            ✕
          </button>
        </header>

        <div className="stock-order-receive-confirm-body">
          <dl className="stock-product-history-overview">
            <div className="stock-product-history-overview-row">
              <dt>{t("Supplier")}</dt>
              <dd>{order.supplier || '—'}</dd>
            </div>
            <div className="stock-product-history-overview-row">
              <dt>{t("Order")}</dt>
              <dd>{formatStockOrderNumber(order.orderNumber)}</dd>
            </div>
            {`${destinationLabel ?? ''}`.trim() ? (
              <div className="stock-product-history-overview-row">
                <dt>{t("Destination")}</dt>
                <dd>{`Into ${`${destinationLabel}`.trim()}`}</dd>
              </div>
            ) : null}
          </dl>

          <section className="stock-order-receive-confirm-products" aria-label={t("Products being received")}>
            <div className="stock-order-receive-confirm-products-head">
              <h4 className="stock-order-receive-confirm-products-title">{t("Products being received")}</h4>
              <p className="stock-order-receive-confirm-total">
                {pendingLines.length} product{pendingLines.length === 1 ? '' : 's'} · {totalUnitsReceiving} unit{totalUnitsReceiving === 1 ? '' : 's'} total
              </p>
            </div>
            <ul className="stock-order-receive-confirm-list">
              {pendingLines.map(({ item, receiveNow }) => (
                <li key={item.id} className="stock-order-receive-confirm-item">
                  <strong>
                    {resolveListedProductName(
                      item,
                      (stockItems ?? []).find((entry) => entry && `${entry.id}` === `${item.stockItemId ?? item.stock_item_id}`),
                    ) || item.itemName}
                  </strong>
                  <span>{formatStockQuantity(receiveNow, item.unit)}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="stock-order-receive-confirm-notes panel staff-panel">
            <p>{t("Stock levels will update immediately for the quantities above.")}</p>
            <p>{t("Receive movements will be added to each product's history.")}</p>
            {onAddInvoice ? (
              <p>
                <button type="button" className="ghost-btn stock-invoice-save" onClick={onAddInvoice}>
                  {t("Add invoice")}
                </button>
              </p>
            ) : null}
            {willComplete ? (
              <p>{t("This delivery completes the order — status will change to Received.")}</p>
            ) : (
              <p>{t("The order will stay open until all products are fully received.")}</p>
            )}
          </div>
        </div>

        <footer className="stock-create-order-footer">
          <button type="button" className="ghost-btn" onClick={handleDismiss} disabled={isReceivePending}>
            {t("Cancel")}
          </button>
          <LoadingButton
            type="button"
            loading={isReceivePending}
            loadingLabel="Receiving..."
            disabled={pendingLines.length === 0}
            onClick={handleConfirm}
          >
            {t("Confirm receive")}
          </LoadingButton>
        </footer>
      </div>
    </div>
  )
}

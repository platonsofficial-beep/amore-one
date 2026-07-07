import { useEffect, useMemo, useState } from 'react'
import {
  buildStockOrderTimeline,
  canCancelStockOrder,
  canEditStockOrder,
  canReceiveStockOrder,
  canMarkStockOrderSent,
  computeOrderLineTotal,
  formatStockOrderDateTime,
  formatStockOrderDeliveryDate,
  formatStockOrderLineSummary,
  formatStockOrderNumber,
  getOrderLineReceiveProgress,
  getOrderLineReceivedQuantity,
  getOrderLineRemainingQuantity,
  getOrderReceivedSummary,
  getStockOrderNextAction,
  getStockOrderStatusLabel,
  getStockOrderStatusTone,
  isOrderPartiallyReceived,
  normalizeStockOrderStatus,
} from '../../lib/stockOrderUtils'
import { formatStockPurchasePrice, formatStockQuantity } from '../../lib/stockUtils'
import { StockOrderReceiveConfirmModal } from './StockOrderReceiveConfirmModal'

function ReceiveProgressBar({ received, ordered, unit }) {
  const { percent } = getOrderLineReceiveProgress({ quantity: ordered, receivedQuantity: received })

  return (
    <div className="stock-order-receive-progress">
      <div className="stock-order-receive-progress-copy">
        <span className="stock-order-receive-progress-label">
          Received {formatStockQuantity(received, unit)} / Ordered {formatStockQuantity(ordered, unit)}
        </span>
        <span className="stock-order-receive-progress-percent">{percent}%</span>
      </div>
      <div
        className="stock-order-receive-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ordered}
        aria-valuenow={received}
        aria-label={`Received ${received} of ${ordered}`}
      >
        <span
          className="stock-order-receive-progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function OrderTimeline({ order }) {
  const steps = useMemo(() => buildStockOrderTimeline(order), [order])

  return (
    <ol className="stock-order-timeline">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`stock-order-timeline-step${step.isComplete ? ' is-complete' : ''}`}
        >
          <span className="stock-order-timeline-marker" aria-hidden="true" />
          <div className="stock-order-timeline-copy">
            <strong>{step.label}</strong>
            {step.isComplete ? (
              <>
                {step.actorName ? <span>{step.actorName}</span> : null}
                {step.timestamp ? (
                  <span>{formatStockOrderDateTime(step.timestamp)}</span>
                ) : null}
              </>
            ) : (
              <span className="stock-order-timeline-pending">Pending</span>
            )}
          </div>
          {index < steps.length - 1 ? (
            <span className="stock-order-timeline-connector" aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function DraftOrderItem({
  item,
  onQuantityChange,
  onRemove,
}) {
  const summary = formatStockOrderLineSummary(item)

  return (
    <article className="stock-order-detail-line is-editable">
      <div className="stock-order-detail-line-copy">
        <strong>{item.itemName}</strong>
        <span>{item.unit || 'units'}</span>
      </div>
      <div className="stock-order-detail-line-controls">
        <input
          type="number"
          min="0"
          step="any"
          className="stock-create-order-qty-input"
          value={item.quantity}
          onChange={(event) => onQuantityChange(item.id, event.target.value)}
          aria-label={`Quantity for ${item.itemName}`}
        />
        <span className="stock-order-detail-line-cost">
          x {formatStockPurchasePrice(item.costPrice)}
        </span>
        <span className="stock-order-detail-line-total">{summary.total}</span>
        <button
          type="button"
          className="icon-btn stock-create-order-remove-item"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.itemName}`}
        >
          ✕
        </button>
      </div>
    </article>
  )
}

function ReceivingOrderItem({
  item,
  receiveNow,
  onReceiveNowChange,
  onReceiveAllRemaining,
}) {
  const ordered = Number(item.quantity) || 0
  const received = getOrderLineReceivedQuantity(item)
  const remaining = getOrderLineRemainingQuantity(item)
  const summary = formatStockOrderLineSummary(item)

  return (
    <article className="stock-order-detail-line stock-order-receive-line">
      <div className="stock-order-detail-line-copy">
        <strong>{item.itemName}</strong>
        <span>{summary.headline}</span>
      </div>

      <ReceiveProgressBar received={received} ordered={ordered} unit={item.unit} />

      <dl className="stock-order-receive-metrics">
        <div className="stock-order-receive-metric">
          <dt>Ordered</dt>
          <dd>{formatStockQuantity(ordered, item.unit)}</dd>
        </div>
        <div className="stock-order-receive-metric">
          <dt>Received</dt>
          <dd>{formatStockQuantity(received, item.unit)}</dd>
        </div>
        <div className="stock-order-receive-metric">
          <dt>Remaining</dt>
          <dd>{formatStockQuantity(remaining, item.unit)}</dd>
        </div>
      </dl>

      {remaining > 0 ? (
        <div className="stock-order-receive-now-wrap">
          <label className="stock-order-receive-now">
            <span>Receive now</span>
            <input
              type="number"
              min="0"
              max={remaining}
              step="any"
              className="stock-create-order-qty-input"
              value={receiveNow}
              onChange={(event) => onReceiveNowChange(item.id, event.target.value, remaining)}
              aria-label={`Receive now for ${item.itemName}`}
            />
            <span>{item.unit || 'units'}</span>
          </label>
          <button
            type="button"
            className="ghost-btn stock-order-receive-all-btn"
            onClick={() => onReceiveAllRemaining(item.id, remaining)}
          >
            Receive all ({formatStockQuantity(remaining, item.unit)})
          </button>
        </div>
      ) : (
        <p className="stock-order-receive-complete">Fully received</p>
      )}
    </article>
  )
}

function formatReceivedOrderDifference(ordered, received, unit) {
  const difference = received - ordered

  if (difference === 0) {
    return {
      value: '0',
      badgeLabel: 'Complete',
      badgeTone: 'success',
    }
  }

  const quantityLabel = formatStockQuantity(Math.abs(difference), unit)

  if (difference < 0) {
    return {
      value: `-${quantityLabel}`,
      badgeLabel: 'Missing',
      badgeTone: 'warning',
    }
  }

  return {
    value: `+${quantityLabel}`,
    badgeLabel: 'Extra',
    badgeTone: 'info',
  }
}

function ReceivedOrderItem({ item }) {
  const ordered = Number(item.quantity) || 0
  const received = getOrderLineReceivedQuantity(item)
  const summary = formatStockOrderLineSummary(item)
  const differenceDisplay = formatReceivedOrderDifference(ordered, received, item.unit)

  return (
    <article className="stock-order-detail-line stock-order-completed-line is-received">
      <div className="stock-order-detail-line-copy">
        <strong>{item.itemName}</strong>
        <span>{summary.headline}</span>
      </div>

      <ReceiveProgressBar received={received} ordered={ordered} unit={item.unit} />

      <dl className="stock-order-receive-metrics">
        <div className="stock-order-receive-metric">
          <dt>Ordered</dt>
          <dd>{formatStockQuantity(ordered, item.unit)}</dd>
        </div>
        <div className="stock-order-receive-metric">
          <dt>Received</dt>
          <dd>{formatStockQuantity(received, item.unit)}</dd>
        </div>
        <div className="stock-order-receive-metric stock-order-receive-metric-difference">
          <dt>Difference</dt>
          <dd>
            <span className="stock-order-difference-value">{differenceDisplay.value}</span>
            <span className={`stock-order-status-badge tone-${differenceDisplay.badgeTone}`}>
              {differenceDisplay.badgeLabel}
            </span>
          </dd>
        </div>
      </dl>

      <span className="stock-order-detail-line-total">{summary.total}</span>
    </article>
  )
}

function CompletedOrderItem({ item }) {
  const ordered = Number(item.quantity) || 0
  const received = getOrderLineReceivedQuantity(item)
  const remaining = getOrderLineRemainingQuantity(item)
  const summary = formatStockOrderLineSummary(item)
  const difference = received - ordered

  return (
    <article className="stock-order-detail-line stock-order-completed-line">
      <div className="stock-order-detail-line-copy">
        <strong>{item.itemName}</strong>
        <span>{summary.headline}</span>
      </div>

      <dl className="stock-order-receive-metrics">
        <div className="stock-order-receive-metric">
          <dt>Ordered</dt>
          <dd>{formatStockQuantity(ordered, item.unit)}</dd>
        </div>
        <div className="stock-order-receive-metric">
          <dt>Received</dt>
          <dd>{formatStockQuantity(received, item.unit)}</dd>
        </div>
        <div className="stock-order-receive-metric">
          <dt>Difference</dt>
          <dd className={difference < 0 ? 'tone-warning' : ''}>
            {difference === 0
              ? '—'
              : formatStockQuantity(difference, item.unit)}
          </dd>
        </div>
      </dl>

      {remaining > 0 ? (
        <p className="stock-order-receive-remaining">
          Remaining: {formatStockQuantity(remaining, item.unit)}
        </p>
      ) : null}

      <span className="stock-order-detail-line-total">{summary.total}</span>
    </article>
  )
}

export function StockOrderDetailDrawer({
  order,
  onClose,
  canManage = false,
  isSaving = false,
  onSaveDraft,
  onMarkSent,
  onReceiveOrder,
  onCancel,
}) {
  const isDraft = canEditStockOrder(order)
  const isEditable = canManage && isDraft
  const canReceive = canManage && canReceiveStockOrder(order)
  const isReceived = normalizeStockOrderStatus(order.status) === 'received'
  const [draftItems, setDraftItems] = useState(order.items ?? [])
  const [notes, setNotes] = useState(order.notes ?? '')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(order.expectedDeliveryDate ?? '')
  const [receiveNowByItemId, setReceiveNowByItemId] = useState({})
  const [isReceiveConfirmOpen, setIsReceiveConfirmOpen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraftItems(order.items ?? [])
    setNotes(order.notes ?? '')
    setExpectedDeliveryDate(order.expectedDeliveryDate ?? '')
    setReceiveNowByItemId({})
    setIsReceiveConfirmOpen(false)
    setError('')
  }, [order])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (isSaving) return
        if (isReceiveConfirmOpen) {
          setIsReceiveConfirmOpen(false)
          return
        }
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, isReceiveConfirmOpen, isSaving])

  const statusTone = getStockOrderStatusTone(order.status)
  const nextAction = getStockOrderNextAction(order)
  const deliveryLabel = formatStockOrderDeliveryDate(order.expectedDeliveryDate)
  const receiveSummary = useMemo(() => getOrderReceivedSummary(order), [order])
  const partiallyReceived = isOrderPartiallyReceived(order)

  const totalCost = useMemo(() => {
    const items = isEditable ? draftItems : order.items
    return items.reduce((sum, item) => sum + computeOrderLineTotal(item.quantity, item.costPrice), 0)
  }, [draftItems, isEditable, order.items])

  const handleQuantityChange = (itemId, rawValue) => {
    const quantity = Math.max(0, Number(rawValue) || 0)
    setDraftItems((current) => current.map((item) => (
      item.id === itemId
        ? {
          ...item,
          quantity,
          totalPrice: computeOrderLineTotal(quantity, item.costPrice),
        }
        : item
    )))
  }

  const handleRemoveItem = (itemId) => {
    setDraftItems((current) => current.filter((item) => item.id !== itemId))
  }

  const handleReceiveNowChange = (itemId, rawValue, maxRemaining) => {
    const parsed = Math.max(0, Number(rawValue) || 0)
    const capped = Math.min(parsed, maxRemaining)
    setReceiveNowByItemId((current) => ({
      ...current,
      [itemId]: rawValue === '' ? '' : capped,
    }))
  }

  const handleReceiveAllRemaining = (itemId, remaining) => {
    setReceiveNowByItemId((current) => ({
      ...current,
      [itemId]: remaining,
    }))
  }

  const handleDismiss = () => {
    if (isSaving) return
    onClose()
  }

  const handleSaveDraft = async () => {
    if (isSaving) return
    setError('')
    const validItems = draftItems.filter((item) => item.quantity > 0)

    if (validItems.length === 0) {
      setError('Add at least one product to keep this order.')
      return
    }

    try {
      await onSaveDraft({
        notes,
        expectedDeliveryDate: expectedDeliveryDate || null,
        items: validItems,
      })
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save order right now.')
    }
  }

  const openReceiveConfirm = () => {
    setError('')

    const hasReceiveNow = (order.items ?? []).some(
      (item) => (Number(receiveNowByItemId[item.id]) || 0) > 0,
    )

    if (!hasReceiveNow) {
      const message = 'Enter at least one quantity to receive.'
      console.warn('[StockOrderDetailDrawer] Receive blocked:', message)
      setError(message)
      return
    }

    setIsReceiveConfirmOpen(true)
  }

  const handleConfirmReceive = async () => {
    if (isSaving) return
    setError('')

    const receiveItems = (order.items ?? []).map((item) => ({
      id: item.id,
      receiveNow: Number(receiveNowByItemId[item.id]) || 0,
    }))

    const payload = { receiveItems, orderNumber: order.orderNumber }

    try {
      await onReceiveOrder(payload)
      setReceiveNowByItemId({})
      setIsReceiveConfirmOpen(false)
    } catch (receiveError) {
      console.error('[StockOrderDetailDrawer] Receive failed:', receiveError)
      setError(receiveError?.message || 'Unable to receive stock right now.')
    }
  }

  const handleStatusAction = async (action) => {
    if (isSaving) return
    setError('')
    try {
      if (action === 'sent') {
        if (isEditable) {
          const validItems = draftItems.filter((item) => item.quantity > 0)
          if (validItems.length === 0) {
            setError('Add at least one product before sending this order.')
            return
          }
          await onSaveDraft({
            notes,
            expectedDeliveryDate: expectedDeliveryDate || null,
            items: validItems,
          })
        }
        await onMarkSent()
      }
      if (action === 'cancel') await onCancel()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update order right now.')
    }
  }

  const displayItems = isEditable ? draftItems : order.items
  const showReceivingMode = canReceive && order.status === 'sent'
  const hasReceiveInput = (order.items ?? []).some(
    (item) => (Number(receiveNowByItemId[item.id]) || 0) > 0,
  )

  return (
    <>
      <div className="stock-product-history-backdrop" onClick={handleDismiss}>
        <aside
          className="stock-product-history-drawer stock-order-detail-drawer"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-order-detail-title"
          aria-busy={isSaving}
        >
          <header className="stock-order-detail-header">
            <div className="stock-order-detail-header-copy">
              <p className="stock-order-detail-eyebrow">Purchase order</p>
              <div className="stock-product-history-title-row">
                <h2 id="stock-order-detail-title" className="stock-product-history-title">
                  {order.supplier || '—'}
                </h2>
                <span className={`stock-order-status-badge tone-${statusTone}`}>
                  {getStockOrderStatusLabel(order.status)}
                </span>
              </div>
              <p className="stock-order-detail-order-number">
                Order {formatStockOrderNumber(order.orderNumber)}
                {partiallyReceived && !isReceived ? ' · Partially received' : ''}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn stock-product-history-close"
              onClick={handleDismiss}
              disabled={isSaving}
              aria-label="Close order details"
            >
              ✕
            </button>
          </header>

          <div className="stock-product-history-scroll">
            {error ? <div className="staff-status-banner">{error}</div> : null}

            {canManage && nextAction?.hint && !isReceived && normalizeStockOrderStatus(order.status) !== 'cancelled' ? (
              <div className={`stock-order-next-step panel staff-panel tone-${nextAction.tone}`} aria-label="Next step">
                <p className="stock-order-next-step-label">Next step</p>
                <p className="stock-order-next-step-copy">{nextAction.hint}</p>
              </div>
            ) : null}

            {showReceivingMode ? (
              <div className="stock-order-receiving-guide panel staff-panel" aria-label="Receiving instructions">
                <h4>Receiving this delivery</h4>
                <p>
                  Check each product against the delivery note. Enter the quantity arriving now — use
                  {' '}
                  <strong>Receive all</strong>
                  {' '}
                  when the full remaining amount arrived.
                </p>
                <p>
                  {receiveSummary.remainingTotal} unit{receiveSummary.remainingTotal === 1 ? '' : 's'} still
                  outstanding across {displayItems.length} product{displayItems.length === 1 ? '' : 's'}.
                </p>
              </div>
            ) : null}

            {isReceived ? (
              <div className="stock-order-completion-banner panel staff-panel" aria-label="Order completed">
                <h4>Order completed</h4>
                <p>
                  Received by {order.receivedByName || 'System'}
                  {' · '}
                  {formatStockOrderDateTime(order.receivedAt)}
                </p>
                <p className="stock-order-completion-summary">
                  {receiveSummary.receivedTotal} of {receiveSummary.orderedTotal} units received across {displayItems.length} product{displayItems.length === 1 ? '' : 's'}.
                </p>
              </div>
            ) : null}

            <section className="stock-product-history-section" aria-label="Order dates">
              <h3 className="stock-product-history-section-title">Dates</h3>
              <dl className="stock-product-history-overview">
                <div className="stock-product-history-overview-row">
                  <dt>Created</dt>
                  <dd>
                    {order.createdByName || 'System'}
                    {' · '}
                    {formatStockOrderDateTime(order.createdAt)}
                  </dd>
                </div>
                <div className="stock-product-history-overview-row">
                  <dt>Expected delivery</dt>
                  <dd>
                    {isEditable ? (
                      <input
                        type="date"
                        className="stock-order-date-input"
                        value={expectedDeliveryDate ?? ''}
                        onChange={(event) => setExpectedDeliveryDate(event.target.value)}
                        aria-label="Expected delivery date"
                      />
                    ) : (
                      deliveryLabel || 'Not set'
                    )}
                  </dd>
                </div>
                {order.sentAt ? (
                  <div className="stock-product-history-overview-row">
                    <dt>Sent</dt>
                    <dd>
                      {order.sentByName || 'System'}
                      {' · '}
                      {formatStockOrderDateTime(order.sentAt)}
                    </dd>
                  </div>
                ) : null}
                {isReceived && order.receivedAt ? (
                  <div className="stock-product-history-overview-row">
                    <dt>Completed</dt>
                    <dd>
                      {order.receivedByName || 'System'}
                      {' · '}
                      {formatStockOrderDateTime(order.receivedAt)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="stock-product-history-section" aria-label="Order summary">
              <h3 className="stock-product-history-section-title">
                {isReceived ? 'Final summary' : 'Summary'}
              </h3>
              <dl className="stock-product-history-overview">
                <div className="stock-product-history-overview-row">
                  <dt>Products</dt>
                  <dd>{displayItems.length}</dd>
                </div>
                <div className="stock-product-history-overview-row">
                  <dt>{isReceived ? 'Final total' : 'Estimated total'}</dt>
                  <dd>{formatStockPurchasePrice(isEditable ? totalCost : order.totalCost)}</dd>
                </div>
                {showReceivingMode || isReceived ? (
                  <>
                    <div className="stock-product-history-overview-row">
                      <dt>Units ordered</dt>
                      <dd>{receiveSummary.orderedTotal}</dd>
                    </div>
                    <div className="stock-product-history-overview-row">
                      <dt>Units received</dt>
                      <dd>{receiveSummary.receivedTotal}</dd>
                    </div>
                    {!isReceived ? (
                      <div className="stock-product-history-overview-row">
                        <dt>Units remaining</dt>
                        <dd>{receiveSummary.remainingTotal}</dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </dl>
            </section>

            <section className="stock-product-history-section" aria-label="Products">
              <h3 className="stock-product-history-section-title">
                {isReceived ? 'Received products' : 'Products'}
              </h3>
              <div className="stock-order-detail-lines">
                {displayItems.length === 0 ? (
                  <div className="stock-product-history-empty panel staff-panel">
                    <h4>No products in this order</h4>
                    <p>Add products before sending this order.</p>
                  </div>
                ) : null}

                {isEditable ? displayItems.map((item) => (
                  <DraftOrderItem
                    key={item.id}
                    item={item}
                    onQuantityChange={handleQuantityChange}
                    onRemove={handleRemoveItem}
                  />
                )) : null}

                {showReceivingMode ? displayItems.map((item) => (
                  <ReceivingOrderItem
                    key={item.id}
                    item={item}
                    receiveNow={receiveNowByItemId[item.id] ?? ''}
                    onReceiveNowChange={handleReceiveNowChange}
                    onReceiveAllRemaining={handleReceiveAllRemaining}
                  />
                )) : null}

                {isReceived ? displayItems.map((item) => (
                  <ReceivedOrderItem key={item.id} item={item} />
                )) : null}

                {!isEditable && !showReceivingMode && !isReceived ? displayItems.map((item) => (
                  <CompletedOrderItem key={item.id} item={item} />
                )) : null}
              </div>
            </section>

            <section className="stock-product-history-section" aria-label="Notes">
              <h3 className="stock-product-history-section-title">Notes</h3>
              {isEditable ? (
                <label className="stock-create-order-notes stock-order-detail-notes">
                  <textarea
                    rows={3}
                    value={notes}
                    placeholder="Delivery notes, reference, or instructions"
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              ) : (
                <p className="stock-order-detail-notes-readonly">
                  {order.notes?.trim() ? order.notes : 'No notes added.'}
                </p>
              )}
            </section>

            <section className="stock-product-history-section" aria-label="Order timeline">
              <h3 className="stock-product-history-section-title">Timeline</h3>
              <OrderTimeline order={order} />
            </section>
          </div>

          {canManage ? (
            <>
              {error && showReceivingMode ? (
                <div className="staff-status-banner stock-order-detail-footer-error" role="alert">
                  {error}
                </div>
              ) : null}
              <footer className="stock-product-history-footer stock-order-detail-footer">
              {isEditable ? (
                <>
                  <button
                    type="button"
                    className="ghost-btn stock-product-history-action-btn"
                    onClick={() => handleStatusAction('cancel')}
                    disabled={isSaving || !canCancelStockOrder(order)}
                  >
                    {isSaving ? 'Saving…' : 'Cancel order'}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn stock-product-history-action-btn"
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : 'Save draft'}
                  </button>
                  <button
                    type="button"
                    className="primary-btn stock-product-history-action-btn"
                    onClick={() => handleStatusAction('sent')}
                    disabled={isSaving || !canMarkStockOrderSent(order) || displayItems.length === 0}
                  >
                    {isSaving ? 'Saving…' : 'Mark sent'}
                  </button>
                </>
              ) : null}

              {showReceivingMode ? (
                <button
                  type="button"
                  className="primary-btn stock-product-history-action-btn"
                  onClick={openReceiveConfirm}
                  disabled={isSaving || !hasReceiveInput}
                >
                  {isSaving ? 'Receiving…' : `Review receive${hasReceiveInput ? '' : ' — enter quantities'}`}
                </button>
              ) : null}
              </footer>
            </>
          ) : null}
        </aside>
      </div>

      {isReceiveConfirmOpen ? (
        <StockOrderReceiveConfirmModal
          order={order}
          receiveNowByItemId={receiveNowByItemId}
          isSaving={isSaving}
          onClose={() => setIsReceiveConfirmOpen(false)}
          onConfirm={handleConfirmReceive}
        />
      ) : null}
    </>
  )
}

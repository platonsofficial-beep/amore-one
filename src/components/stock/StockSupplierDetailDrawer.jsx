import { useMemo } from 'react'
import {
  formatStockOrderNumber,
  getStockOrderStatusLabel,
  getStockOrderStatusTone,
} from '../../lib/stockOrderUtils'
import {
  buildSupplierMetrics,
  formatSupplierMetricDate,
  formatSupplierProductLine,
  formatSupplierStatusLabel,
  getSupplierInitials,
  getSupplierStatusTone,
  supplierHasHistory,
} from '../../lib/stockSupplierUtils'
import { formatStockPurchasePrice } from '../../lib/stockUtils'

function DetailRow({ label, value }) {
  if (!`${value ?? ''}`.trim()) return null

  return (
    <div className="stock-supplier-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function StockSupplierDetailDrawer({
  supplier,
  stockItems = [],
  stockOrders = [],
  inventoryItems = [],
  canManage = false,
  isSaving = false,
  onClose,
  onEdit,
  onDeactivate,
  onDelete,
}) {
  const metrics = useMemo(
    () => buildSupplierMetrics(supplier, stockItems, stockOrders),
    [supplier, stockItems, stockOrders],
  )

  const hasHistory = useMemo(
    () => supplierHasHistory(supplier, { stockItems, stockOrders, inventoryItems }),
    [supplier, stockItems, stockOrders, inventoryItems],
  )

  const productLines = useMemo(
    () => metrics.linkedItems.map(formatSupplierProductLine),
    [metrics.linkedItems],
  )

  const statusTone = getSupplierStatusTone(supplier)

  return (
    <div className="stock-product-history-backdrop" onClick={onClose}>
      <aside
        className="stock-product-history-drawer stock-supplier-detail-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-supplier-detail-title"
      >
        <header className="stock-supplier-detail-header">
          <div className="stock-supplier-detail-header-copy">
            <div className="stock-supplier-detail-avatar" aria-hidden="true">
              {getSupplierInitials(supplier?.companyName)}
            </div>
            <div>
              <p className="stock-order-detail-eyebrow">Supplier</p>
              <div className="stock-product-history-title-row">
                <h2 id="stock-supplier-detail-title" className="stock-product-history-title">
                  {supplier?.companyName || 'Unnamed supplier'}
                </h2>
                <span className={`stock-order-status-badge tone-${statusTone}`}>
                  {formatSupplierStatusLabel(supplier)}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn stock-product-history-close"
            onClick={onClose}
            aria-label="Close supplier details"
          >
            ✕
          </button>
        </header>

        <div className="stock-product-history-scroll">
          <section className="stock-product-history-section" aria-label="Contact">
            <h3 className="stock-product-history-section-title">Contact</h3>
            <dl className="stock-supplier-detail-list">
              <DetailRow label="Contact person" value={supplier?.contactPerson} />
              <DetailRow label="Phone" value={supplier?.phone} />
              <DetailRow label="Email" value={supplier?.email} />
              <DetailRow label="Address" value={supplier?.address} />
              <DetailRow label="Notes" value={supplier?.notes} />
            </dl>
            {!supplier?.contactPerson && !supplier?.phone && !supplier?.email && !supplier?.address && !supplier?.notes ? (
              <p className="stock-supplier-detail-empty">No contact details added yet.</p>
            ) : null}
          </section>

          <section className="stock-product-history-section" aria-label="Products">
            <h3 className="stock-product-history-section-title">
              Products
              <span className="stock-supplier-section-count">{productLines.length}</span>
            </h3>
            {productLines.length === 0 ? (
              <div className="stock-product-history-empty panel staff-panel">
                <h4>No linked products</h4>
                <p>Stock items using this supplier name will appear here.</p>
              </div>
            ) : (
              <ul className="stock-supplier-product-list">
                {productLines.map((product) => (
                  <li key={product.id} className="stock-supplier-product-item">
                    <div className="stock-supplier-product-copy">
                      <strong>{product.name}</strong>
                      <span>{product.categoryType || 'Uncategorized'}</span>
                    </div>
                    <div className="stock-supplier-product-stats">
                      <span>{product.currentStock}</span>
                      <span className="stock-supplier-product-price">{product.lastPurchasePrice}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="stock-product-history-section" aria-label="Purchase history">
            <h3 className="stock-product-history-section-title">
              Purchase history
              <span className="stock-supplier-section-count">{metrics.linkedOrders.length}</span>
            </h3>
            {metrics.linkedOrders.length === 0 ? (
              <div className="stock-product-history-empty panel staff-panel">
                <h4>No orders yet</h4>
                <p>Purchase orders for this supplier will appear here.</p>
              </div>
            ) : (
              <ul className="stock-supplier-order-list">
                {metrics.linkedOrders.map((order) => {
                  const orderTone = getStockOrderStatusTone(order.status)
                  return (
                    <li key={order.id} className="stock-supplier-order-item">
                      <div className="stock-supplier-order-copy">
                        <strong>{formatStockOrderNumber(order.orderNumber)}</strong>
                        <span>{formatSupplierMetricDate(order.createdAt)}</span>
                      </div>
                      <div className="stock-supplier-order-meta">
                        <span className={`stock-order-status-badge tone-${orderTone}`}>
                          {getStockOrderStatusLabel(order.status)}
                        </span>
                        <span className="stock-supplier-order-value">
                          {formatStockPurchasePrice(order.totalCost)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="stock-product-history-section" aria-label="Statistics">
            <h3 className="stock-product-history-section-title">Statistics</h3>
            <dl className="stock-product-history-overview stock-supplier-stats-grid">
              <div className="stock-product-history-overview-row">
                <dt>Total orders</dt>
                <dd>{metrics.totalOrders}</dd>
              </div>
              <div className="stock-product-history-overview-row">
                <dt>Total spend</dt>
                <dd>{formatStockPurchasePrice(metrics.totalSpend)}</dd>
              </div>
              <div className="stock-product-history-overview-row">
                <dt>Average order value</dt>
                <dd>{formatStockPurchasePrice(metrics.averageOrderValue)}</dd>
              </div>
              <div className="stock-product-history-overview-row">
                <dt>Last delivery</dt>
                <dd>{metrics.lastDelivery ? formatSupplierMetricDate(metrics.lastDelivery) : '—'}</dd>
              </div>
            </dl>
          </section>
        </div>

        {canManage ? (
          <footer className="stock-product-history-footer stock-supplier-detail-footer">
            <button
              type="button"
              className="ghost-btn stock-product-history-action-btn"
              onClick={() => onEdit?.(supplier)}
              disabled={isSaving}
            >
              Edit
            </button>
            {hasHistory ? (
              <button
                type="button"
                className="ghost-btn stock-product-history-action-btn"
                onClick={() => onDeactivate?.(supplier)}
                disabled={isSaving}
              >
                {supplier?.active === false ? 'Activate' : 'Deactivate'}
              </button>
            ) : (
              <button
                type="button"
                className="ghost-btn stock-product-history-action-btn stock-supplier-delete-btn"
                onClick={() => onDelete?.(supplier)}
                disabled={isSaving}
              >
                Delete
              </button>
            )}
          </footer>
        ) : null}
      </aside>
    </div>
  )
}

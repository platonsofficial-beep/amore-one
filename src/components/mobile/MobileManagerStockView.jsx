import { buildManagerMobileStockStatusLine } from '../../lib/mobileManagerTodayUtils'

function MobileManagerMetricCard({ label, value, tone = 'default' }) {
  return (
    <div className={`mobile-manager-metric-card tone-${tone}`}>
      <span className="mobile-manager-metric-label">{label}</span>
      <strong className="mobile-manager-metric-value">{value}</strong>
    </div>
  )
}

export function MobileManagerStockView({
  stockSummary = null,
  stockOrdersSummary = null,
  hasStockModuleData = false,
  isLoading = false,
  canManageStock = false,
  isWorkspaceReady = false,
  onReceiveDeliveries,
  onOpenAllStock,
  onCreateOrder,
}) {
  const outCount = Number(stockSummary?.outOfStock) || 0
  const lowCount = Number(stockSummary?.lowStock) || 0
  const toOrderCount = Number(stockSummary?.toOrder) || 0
  const awaitingCount = Number(stockOrdersSummary?.awaitingDeliveryCount) || 0
  const partialCount = Number(stockOrdersSummary?.partialCount) || 0
  const draftCount = Number(stockOrdersSummary?.draftCount) || 0
  const pendingDeliveries = awaitingCount + partialCount
  const stockStatusLine = buildManagerMobileStockStatusLine(stockSummary, stockOrdersSummary)

  return (
    <div className="mobile-screen mobile-manager-stock">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">Inventory</p>
        <h1 className="mobile-screen-title">Stock</h1>
        <p className="mobile-screen-subtitle">{stockStatusLine}</p>
      </header>

      {isLoading ? (
        <p className="mobile-empty-note">Loading stock…</p>
      ) : (
        <>
          <section className="mobile-card mobile-manager-stock-summary" aria-label="Stock summary">
            <p className="mobile-card-label">Status</p>
            <div className="mobile-manager-metric-grid">
              <MobileManagerMetricCard
                label="Out"
                value={hasStockModuleData ? outCount : '—'}
                tone={outCount > 0 ? 'critical' : 'default'}
              />
              <MobileManagerMetricCard
                label="Low"
                value={hasStockModuleData ? lowCount : '—'}
                tone={lowCount > 0 ? 'warning' : 'default'}
              />
              <MobileManagerMetricCard
                label="To order"
                value={hasStockModuleData ? toOrderCount : '—'}
                tone={toOrderCount > 0 ? 'warning' : 'default'}
              />
              <MobileManagerMetricCard
                label="Deliveries"
                value={pendingDeliveries}
                tone={pendingDeliveries > 0 ? 'info' : 'default'}
              />
            </div>
          </section>

          {(draftCount > 0 || partialCount > 0 || awaitingCount > 0) ? (
            <section className="mobile-card mobile-manager-stock-orders" aria-label="Supplier orders">
              <p className="mobile-card-label">Supplier orders</p>
              <ul className="mobile-manager-stock-order-list">
                {awaitingCount > 0 ? (
                  <li className="mobile-manager-stock-order-item tone-info">
                    <strong>{awaitingCount} awaiting delivery</strong>
                    <span>Ready to receive</span>
                  </li>
                ) : null}
                {partialCount > 0 ? (
                  <li className="mobile-manager-stock-order-item tone-info">
                    <strong>{partialCount} partial</strong>
                    <span>Continue receiving</span>
                  </li>
                ) : null}
                {draftCount > 0 ? (
                  <li className="mobile-manager-stock-order-item tone-warning">
                    <strong>{draftCount} draft{draftCount === 1 ? '' : 's'}</strong>
                    <span>Review before sending</span>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <section className="mobile-card mobile-manager-actions-section" aria-label="Stock actions">
            <p className="mobile-card-label">Quick actions</p>
            <div className="mobile-manager-actions">
              {pendingDeliveries > 0 ? (
                <button
                  type="button"
                  className="mobile-manager-action-btn mobile-manager-action-btn-primary"
                  onClick={onReceiveDeliveries}
                >
                  Receive deliveries
                </button>
              ) : null}
              <button type="button" className="mobile-manager-action-btn" onClick={onOpenAllStock}>
                Open all stock
              </button>
              {canManageStock ? (
                <button
                  type="button"
                  className="mobile-manager-action-btn"
                  onClick={onCreateOrder}
                  disabled={!isWorkspaceReady}
                >
                  Create order
                </button>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

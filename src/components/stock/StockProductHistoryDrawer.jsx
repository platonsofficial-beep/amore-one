import { useEffect, useMemo, useState } from 'react'
import {
  formatStockCategoryTypeLine,
  resolveStockItemType,
  resolveStockStorageLocation,
  resolveStockTargetQuantity,
} from '../../lib/stockCatalog'
import {
  buildStockMonthlyInsights,
  buildStockMovementTimeline,
  formatLastCountedLabel,
  formatMonthlyMovementStat,
  formatStockMovementHeadline,
  formatStockMovementTypeLabel,
  formatStockProductHistoryTimestamp,
  getStockMovementTone,
} from '../../lib/stockProductHistory'
import {
  formatStockInventoryValue,
  formatStockPurchasePrice,
  formatStockQuantity,
  getStockStatusShortLabel,
} from '../../lib/stockUtils'
import { getStockMovementsWithAuthors } from '../../services/stockMovementService'

function OverviewRow({ label, value }) {
  return (
    <div className="stock-product-history-overview-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function MovementTimelineCard({ movement, unit }) {
  const tone = getStockMovementTone(movement.type)

  return (
    <article className={`stock-product-history-movement tone-${tone}`}>
      <header className="stock-product-history-movement-header">
        <div className="stock-product-history-movement-title-wrap">
          <span className={`stock-product-history-movement-dot tone-${tone}`} aria-hidden="true" />
          <strong className="stock-product-history-movement-type">
            {formatStockMovementTypeLabel(movement.type)}
          </strong>
        </div>
        <span className="stock-product-history-movement-headline">
          {formatStockMovementHeadline(movement, unit)}
        </span>
      </header>

      <dl className="stock-product-history-movement-levels">
        <div className="stock-product-history-movement-level">
          <dt>Before</dt>
          <dd>{formatStockQuantity(movement.quantityBefore, unit)}</dd>
        </div>
        <div className="stock-product-history-movement-level">
          <dt>After</dt>
          <dd>{formatStockQuantity(movement.quantityAfter, unit)}</dd>
        </div>
      </dl>

      <div className="stock-product-history-movement-meta">
        <p className="stock-product-history-movement-by">
          By: <span>{movement.createdByName || 'System'}</span>
        </p>
        <p className="stock-product-history-movement-when">
          {formatStockProductHistoryTimestamp(movement.createdAt)}
        </p>
      </div>

      {movement.note ? (
        <div className="stock-product-history-movement-reason">
          <span className="stock-product-history-movement-reason-label">Reason:</span>
          <p className="stock-product-history-movement-reason-text">{movement.note}</p>
        </div>
      ) : null}
    </article>
  )
}

export function StockProductHistoryDrawer({
  item,
  workspaceId,
  onClose,
  canManage = false,
  onReceive,
  onStockCount,
  onEdit,
}) {
  const [movements, setMovements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadHistory = async () => {
      setIsLoading(true)
      setError('')

      try {
        const records = await getStockMovementsWithAuthors(workspaceId, {
          itemId: item.id,
          limit: 200,
        })
        if (isMounted) {
          setMovements(records)
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError?.message || 'Unable to load product history right now.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadHistory()

    return () => {
      isMounted = false
    }
  }, [item.id, item.currentQuantity, item.updatedAt, workspaceId])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
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
  }, [onClose])

  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)
  const targetQuantity = resolveStockTargetQuantity(item)
  const supplierLabel = `${item.supplier ?? ''}`.trim() || '—'
  const costPrice = Number(item.costPrice ?? item.cost_price)
  const hasCost = Number.isFinite(costPrice) && costPrice > 0
  const inventoryValue = (Number(item.currentQuantity) || 0) * (hasCost ? costPrice : 0)

  const timeline = useMemo(() => {
    return buildStockMovementTimeline(movements, item.currentQuantity)
  }, [movements, item.currentQuantity])

  const monthlyInsights = useMemo(() => {
    return buildStockMonthlyInsights(movements)
  }, [movements])

  const lastCountedLabel = formatLastCountedLabel(item.lastCount)

  return (
    <div className="stock-product-history-backdrop" onClick={onClose}>
      <aside
        className="stock-product-history-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-product-history-title"
      >
        <header className="stock-product-history-header">
          <div className="stock-product-history-header-copy">
            <div className="stock-product-history-title-row">
              <h2 id="stock-product-history-title" className="stock-product-history-title">
                {item.name}
              </h2>
              <span className={`stock-item-status-badge tone-${item.status}`}>
                {getStockStatusShortLabel(item.status)}
              </span>
            </div>
            <p className="stock-product-history-subtitle">
              {formatStockCategoryTypeLine(item.category, itemType)}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn stock-product-history-close"
            onClick={onClose}
            aria-label="Close product history"
          >
            ✕
          </button>
        </header>

        <div className="stock-product-history-scroll">
          {isLoading ? <div className="staff-status-banner">Loading product history…</div> : null}
          {error ? <div className="staff-status-banner">{error}</div> : null}

          {!isLoading && !error ? (
            <>
              <section className="stock-product-history-section" aria-label="Product overview">
                <h3 className="stock-product-history-section-title">Product overview</h3>
                <dl className="stock-product-history-overview">
                  <OverviewRow
                    label="Current stock"
                    value={formatStockQuantity(item.currentQuantity, item.unit)}
                  />
                  <OverviewRow
                    label="Minimum"
                    value={formatStockQuantity(item.minimumQuantity, item.unit)}
                  />
                  <OverviewRow
                    label="Target"
                    value={targetQuantity === null
                      ? 'Not set'
                      : formatStockQuantity(targetQuantity, item.unit)}
                  />
                  <OverviewRow label="Location" value={location} />
                  <OverviewRow label="Supplier" value={supplierLabel} />
                  <OverviewRow
                    label="Cost"
                    value={hasCost
                      ? `${formatStockPurchasePrice(costPrice)} / ${item.unit || 'unit'}`
                      : '—'}
                  />
                  <OverviewRow
                    label="Inventory value"
                    value={hasCost ? formatStockInventoryValue(inventoryValue) : '—'}
                  />
                </dl>
              </section>

              <section className="stock-product-history-section" aria-label="Product insights">
                <h3 className="stock-product-history-section-title">This month</h3>
                <dl className="stock-product-history-insights">
                  <OverviewRow
                    label="Received"
                    value={formatMonthlyMovementStat('received', monthlyInsights.received, item.unit)}
                  />
                  <OverviewRow
                    label="Used"
                    value={formatMonthlyMovementStat('used', monthlyInsights.used, item.unit)}
                  />
                  <OverviewRow
                    label="Adjustments"
                    value={formatMonthlyMovementStat('adjustments', monthlyInsights.adjustments, item.unit)}
                  />
                  <OverviewRow label="Last counted" value={lastCountedLabel} />
                </dl>
              </section>

              <section className="stock-product-history-section" aria-label="Movement timeline">
                <h3 className="stock-product-history-section-title">Movement timeline</h3>

                {timeline.length === 0 ? (
                  <div className="stock-product-history-empty panel staff-panel">
                    <h4>No stock history yet.</h4>
                    <p>Receive, use or count this item to start tracking.</p>
                  </div>
                ) : (
                  <div className="stock-product-history-timeline">
                    {timeline.map((movement) => (
                      <MovementTimelineCard
                        key={movement.id}
                        movement={movement}
                        unit={item.unit}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>

        {canManage ? (
          <footer className="stock-product-history-footer" aria-label="Quick actions">
            <button type="button" className="ghost-btn stock-product-history-action-btn" onClick={onReceive}>
              Receive
            </button>
            <button type="button" className="ghost-btn stock-product-history-action-btn" onClick={onStockCount}>
              Stock count
            </button>
            <button type="button" className="ghost-btn stock-product-history-action-btn" onClick={onEdit}>
              Edit
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  )
}

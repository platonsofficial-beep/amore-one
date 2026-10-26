import { buildStockLiveFacts } from '../../lib/stockLiveCard'

function LiveRow({ label, tone = 'default', onClick }) {
  return (
    <button
      type="button"
      className={`stock-live-card-row tone-${tone}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="stock-live-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export function StockLiveCard({
  belowParCount = 0,
  parsReady = false,
  parsStatus = 'ready',
  stockOrders = [],
  lastInventoryCountAt = null,
  now = new Date(),
  onOpenBelowPar,
  onOpenDrafts,
  onOpenCounts,
}) {
  const facts = buildStockLiveFacts({
    belowParCount,
    parsReady: parsStatus === 'ready' && parsReady,
    orders: stockOrders,
    lastInventoryCountAt,
    now,
  })
  const belowParLabel = parsStatus === 'loading'
    ? 'Checking pars…'
    : parsStatus === 'error'
      ? 'Pars could not be loaded'
      : facts.belowParLabel

  return (
    <section className="stock-live-card panel staff-panel" aria-label="Stock live">
      <h3 className="stock-live-card-title">Stock</h3>
      <div className="stock-live-card-rows">
        <LiveRow
          label={belowParLabel}
          tone={parsStatus === 'ready' ? facts.belowParTone : 'default'}
          onClick={onOpenBelowPar}
        />
        <LiveRow label={facts.draftLabel} tone={facts.draftTone} onClick={onOpenDrafts} />
        <LiveRow label={facts.lastCountLabel} onClick={onOpenCounts} />
      </div>
    </section>
  )
}

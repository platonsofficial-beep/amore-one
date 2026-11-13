import { buildStockLiveFacts } from '../../lib/stockLiveCard'
import { formatSharedStockHealthLine } from '../../lib/stockUtils'
import { LoadFailed, LoadingLines } from '../common/DataPending'
import { t } from '../../i18n/i18n'

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
  loadStatus = 'ready',
  onRetry,
  stockSummary = null,
  belowParCount = 0,
  parsReady = false,
  parsStatus = 'ready',
  stockOrders = [],
  lastInventoryCountAt = null,
  now = new Date(),
  timeZone = '',
  onOpenHealth,
  onOpenBelowPar,
  onOpenDrafts,
  onOpenCounts,
}) {
  if (loadStatus !== 'ready') {
    return (
      <section className={`stock-live-card panel staff-panel is-${loadStatus}`} aria-label={t("Stock live")} aria-busy={loadStatus === 'loading' ? 'true' : undefined}>
        <h3 className="stock-live-card-title">{t("Stock")}</h3>
        {loadStatus === 'error' ? (
          <div className="stock-live-card-pending"><LoadFailed onRetry={onRetry} /></div>
        ) : (
          <div className="stock-live-card-rows">
            {[0, 1, 2].map((row) => (
              <div key={row} className="stock-live-card-row stock-live-card-row-pending" aria-hidden={row > 0 ? 'true' : undefined}>
                <LoadingLines label={t("Loading stock")} />
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  const facts = buildStockLiveFacts({
    belowParCount,
    parsReady: parsStatus === 'ready' && parsReady,
    orders: stockOrders,
    lastInventoryCountAt,
    now,
    timeZone,
  })
  const sharedHealth = stockSummary ? formatSharedStockHealthLine(stockSummary) : ''
  const belowParLabel = parsStatus === 'loading'
    ? t("Checking pars…")
    : parsStatus === 'error'
      ? t("Pars could not be loaded")
      : facts.belowParLabel
  const healthLabel = sharedHealth || belowParLabel
  const healthTone = sharedHealth
    ? ((Number(stockSummary?.outOfStock) || 0) > 0
      ? 'danger'
      : (Number(stockSummary?.lowStock) || 0) > 0
        ? 'warning'
        : 'default')
    : (parsStatus === 'ready' ? facts.belowParTone : 'default')

  return (
    <section className="stock-live-card panel staff-panel" aria-label={t("Stock live")}>
      <h3 className="stock-live-card-title">{t("Stock")}</h3>
      <div className="stock-live-card-rows">
        <LiveRow
          label={healthLabel}
          tone={healthTone}
          onClick={sharedHealth ? (onOpenHealth || onOpenBelowPar) : onOpenBelowPar}
        />
        <LiveRow label={facts.draftLabel} tone={facts.draftTone} onClick={onOpenDrafts} />
        <LiveRow label={facts.lastCountLabel} onClick={onOpenCounts} />
      </div>
    </section>
  )
}

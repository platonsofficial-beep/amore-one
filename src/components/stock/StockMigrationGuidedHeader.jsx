/**
 * Guided workflow header — decision-relevant migration orientation.
 * Presentation only.
 */
export function StockMigrationGuidedHeader({ model }) {
  const data = model ?? {}
  const healthScore = data.healthScore
  const healthDisplay = healthScore === null || healthScore === undefined
    ? '—'
    : `${healthScore}`

  return (
    <div className="stock-migration-guided-header">
      <div className="stock-migration-guided-header-grid">
        <div className="stock-migration-guided-metric">
          <p className="stock-migration-guided-metric-label">Status</p>
          <p className="stock-migration-guided-metric-value">{data.sessionStatusLabel ?? '—'}</p>
        </div>
        <div className="stock-migration-guided-metric">
          <p className="stock-migration-guided-metric-label">Current step</p>
          <p className="stock-migration-guided-metric-value">{data.currentStage ?? '—'}</p>
        </div>
        <div className="stock-migration-guided-metric">
          <p className="stock-migration-guided-metric-label">Progress</p>
          <p className="stock-migration-guided-metric-value">{data.progressLabel ?? '—'}</p>
          <p className="stock-migration-guided-metric-sub">
            {Number.isFinite(Number(data.progressPercent))
              ? `${data.progressPercent}%`
              : '—'}
          </p>
        </div>
        <div className="stock-migration-guided-metric">
          <p className="stock-migration-guided-metric-label">Readiness</p>
          <p className="stock-migration-guided-metric-value">{data.readinessLabel ?? '—'}</p>
          <p className="stock-migration-guided-metric-sub">
            Health
            {' '}
            {healthDisplay}
          </p>
        </div>
        {data.manualReviewCount > 0 ? (
          <div className="stock-migration-guided-metric stock-migration-guided-metric--alert">
            <p className="stock-migration-guided-metric-label">Manual review</p>
            <p className="stock-migration-guided-metric-value">
              {data.manualReviewCount === 1
                ? '1 item'
                : `${data.manualReviewCount} items`}
            </p>
          </div>
        ) : null}
      </div>

      <div className="stock-migration-guided-next" aria-live="polite">
        <p className="stock-migration-guided-next-label">Next action</p>
        <p className="stock-migration-guided-next-value">{data.nextAction ?? 'Review migration status'}</p>
      </div>
    </div>
  )
}

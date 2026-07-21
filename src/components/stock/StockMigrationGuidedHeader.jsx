/**
 * Guided workflow hero — primary operator orientation.
 * Presentation only. No mutation controls.
 */
export function StockMigrationGuidedHeader({ model }) {
  const data = model ?? {}
  const healthScore = data.healthScore
  const healthDisplay = healthScore === null || healthScore === undefined
    ? '—'
    : `${healthScore}`

  const completed = Number(data.completedStageCount ?? 0) || 0
  const total = Number(data.totalStageCount ?? 0) || 0
  const hasCurrent = Boolean(data.currentStage && data.currentStage !== 'Unknown' && data.currentStage !== 'Completed')
  const remaining = Math.max(0, total - completed - (hasCurrent ? 1 : 0))
  const percent = Number.isFinite(Number(data.progressPercent))
    ? Math.max(0, Math.min(100, Number(data.progressPercent)))
    : 0

  return (
    <div className="stock-migration-guided-header">
      <div className="stock-migration-guided-hero">
        <p className="stock-migration-guided-hero-eyebrow">Current stage</p>
        <h3 className="stock-migration-guided-hero-stage">{data.currentStage ?? '—'}</h3>

        <div className="stock-migration-guided-hero-meta" aria-label="Migration metadata">
          <div className="stock-migration-guided-meta-item">
            <span className="stock-migration-guided-meta-label">Status</span>
            <span className="stock-migration-guided-meta-value">{data.sessionStatusLabel ?? '—'}</span>
          </div>
          <div className="stock-migration-guided-meta-item">
            <span className="stock-migration-guided-meta-label">Progress</span>
            <span className="stock-migration-guided-meta-value">{data.progressLabel ?? '—'}</span>
          </div>
          <div className="stock-migration-guided-meta-item">
            <span className="stock-migration-guided-meta-label">Readiness</span>
            <span className="stock-migration-guided-meta-value">
              {data.readinessLabel ?? '—'}
              <span className="stock-migration-guided-meta-sub">
                · Health
                {' '}
                {healthDisplay}
              </span>
            </span>
          </div>
          {data.manualReviewCount > 0 ? (
            <div className="stock-migration-guided-meta-item stock-migration-guided-meta-item--alert">
              <span className="stock-migration-guided-meta-label">Manual review</span>
              <span className="stock-migration-guided-meta-value">
                {data.manualReviewCount === 1
                  ? '1 item'
                  : `${data.manualReviewCount} items`}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="stock-migration-guided-next" aria-live="polite">
        <p className="stock-migration-guided-next-label">Next action</p>
        <p className="stock-migration-guided-next-value">{data.nextAction ?? 'Review migration status'}</p>
        <p className="stock-migration-guided-next-hint">
          Display only — use the operator controls below when you are ready to proceed.
        </p>
      </div>

      <div className="stock-migration-guided-progress" aria-label="Migration progress">
        <div className="stock-migration-guided-progress-top">
          <p className="stock-migration-guided-progress-title">Progress</p>
          <p className="stock-migration-guided-progress-percent">{`${percent}%`}</p>
        </div>

        <div
          className="stock-migration-guided-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={data.progressLabel ?? `${percent}%`}
        >
          <div
            className="stock-migration-guided-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="stock-migration-guided-progress-stats">
          <div className="stock-migration-guided-progress-stat is-completed">
            <span className="stock-migration-guided-progress-stat-label">Completed</span>
            <span className="stock-migration-guided-progress-stat-value">{completed}</span>
          </div>
          <div className="stock-migration-guided-progress-stat is-current">
            <span className="stock-migration-guided-progress-stat-label">Current</span>
            <span className="stock-migration-guided-progress-stat-value">
              {hasCurrent ? (data.currentStage ?? '—') : '—'}
            </span>
          </div>
          <div className="stock-migration-guided-progress-stat is-remaining">
            <span className="stock-migration-guided-progress-stat-label">Remaining</span>
            <span className="stock-migration-guided-progress-stat-value">{remaining}</span>
          </div>
        </div>

        <p className="stock-migration-guided-progress-caption">{data.progressLabel ?? '—'}</p>
      </div>
    </div>
  )
}

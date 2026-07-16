/**
 * Read-only Migration Health panel.
 * Executive summary only — no actions.
 */
export function StockMigrationHealthPanel({
  health = null,
  metricsAvailable = false,
}) {
  const scoreLabel = metricsAvailable && health?.score !== null && health?.score !== undefined
    ? `${health.score}%`
    : 'Unknown'
  const statusLabel = metricsAvailable
    ? (health?.status ?? 'Unknown')
    : 'Unknown'
  const readinessLabel = metricsAvailable
    ? (health?.readiness ?? 'Unknown')
    : 'Unknown'
  const summary = metricsAvailable
    ? (health?.summary ?? 'Migration health cannot yet be determined.')
    : 'Migration health cannot yet be determined.'
  const gaugeValue = metricsAvailable && Number.isFinite(Number(health?.score))
    ? Math.max(0, Math.min(100, Number(health.score)))
    : 0

  const statusClass = `${statusLabel}`.toLowerCase().replace(/\s+/g, '-')
  const readinessClass = `${readinessLabel}`.toLowerCase().replace(/\s+/g, '-')

  return (
    <section className="panel staff-panel stock-migration-panel stock-migration-health-panel" aria-label="Migration health">
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Migration Health</h3>
        <p className="stock-migration-panel-copy">
          Executive readiness summary for the current workspace.
        </p>
      </div>

      <div className="stock-migration-health-body">
        <div className="stock-migration-health-score-block">
          <p className="stock-migration-health-score-label">Health Score</p>
          <p className="stock-migration-health-score-value">{scoreLabel}</p>
          <div
            className="stock-migration-health-gauge"
            role="meter"
            aria-label="Health score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={metricsAvailable ? gaugeValue : 0}
            aria-valuetext={scoreLabel}
          >
            <div
              className="stock-migration-health-gauge-fill"
              style={{ width: `${metricsAvailable ? gaugeValue : 0}%` }}
            />
          </div>
        </div>

        <div className="stock-migration-health-badges">
          <span className={`stock-migration-health-badge is-status-${statusClass}`}>
            {statusLabel}
          </span>
          <span className={`stock-migration-health-badge is-readiness-${readinessClass}`}>
            {readinessLabel}
          </span>
        </div>

        <p className="stock-migration-health-summary">{summary}</p>
      </div>
    </section>
  )
}

/**
 * Read-only Migration Session summary card.
 * Informational placeholder until persistence exists.
 */
export function StockMigrationSessionCard({
  summary = null,
}) {
  const sessionId = summary?.sessionId ?? '—'
  const operator = summary?.operator ?? '—'
  const startedAt = summary?.startedAt ?? '—'
  const finishedAt = summary?.finishedAt ?? '—'
  const status = summary?.status ?? 'Not Started'

  return (
    <section
      className="panel staff-panel stock-migration-panel stock-migration-session-panel"
      aria-label="Migration session"
    >
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Migration Session</h3>
        <p className="stock-migration-panel-copy">
          Read-only session placeholder. Persistence is not enabled yet.
        </p>
      </div>

      <dl className="stock-migration-status-list stock-migration-session-list">
        <div className="stock-migration-status-row">
          <dt>Session</dt>
          <dd>{sessionId}</dd>
        </div>
        <div className="stock-migration-status-row">
          <dt>Operator</dt>
          <dd>{operator}</dd>
        </div>
        <div className="stock-migration-status-row">
          <dt>Started</dt>
          <dd>{startedAt}</dd>
        </div>
        <div className="stock-migration-status-row">
          <dt>Finished</dt>
          <dd>{finishedAt}</dd>
        </div>
        <div className="stock-migration-status-row">
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
      </dl>
    </section>
  )
}

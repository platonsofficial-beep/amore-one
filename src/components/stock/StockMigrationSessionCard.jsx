/**
 * Read-only live Migration Session summary card.
 * Displays persisted session data when available.
 */
export function StockMigrationSessionCard({
  summary = null,
  isLoading = false,
  errorMessage = '',
  unavailable = false,
  sessionAvailable = false,
}) {
  const sessionId = summary?.sessionId ?? '—'
  const operator = summary?.operator ?? '—'
  const startedAt = summary?.startedAt ?? '—'
  const finishedAt = summary?.finishedAt ?? '—'
  const status = summary?.status ?? 'Not Started'

  const copy = isLoading
    ? 'Loading session…'
    : (errorMessage || unavailable)
      ? 'Session data is temporarily unavailable.'
      : sessionAvailable
        ? 'Live session for the current workspace.'
        : 'No migration session has been started for this workspace.'

  return (
    <section
      className="panel staff-panel stock-migration-panel stock-migration-session-panel"
      aria-label="Migration session"
      aria-busy={isLoading ? 'true' : undefined}
    >
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Migration Session</h3>
        <p className="stock-migration-panel-copy">{copy}</p>
      </div>

      {errorMessage ? (
        <div className="staff-status-banner" role="status">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <p className="stock-migration-panel-copy" role="status">Loading…</p>
      ) : (
        <dl className="stock-migration-status-list stock-migration-session-list">
          <div className="stock-migration-status-row">
            <dt>Session ID</dt>
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
            <dt>Current Status</dt>
            <dd>{status}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}

/**
 * Read-only Migration Session Steps panel.
 * Evidence display only — no actions.
 */
export function StockMigrationSessionSteps({
  rows = [],
  isLoading = false,
  errorMessage = '',
  unavailable = false,
  stepsAvailable = false,
}) {
  const list = Array.isArray(rows) ? rows : []

  const copy = isLoading
    ? 'Loading session steps…'
    : (errorMessage || unavailable)
      ? 'Session steps data is temporarily unavailable.'
      : stepsAvailable
        ? 'Persistent stage evidence for the current or latest migration session.'
        : 'Session steps will appear here once they are recorded.'

  return (
    <section
      className="panel staff-panel stock-migration-panel"
      aria-label="Migration session steps"
      aria-busy={isLoading ? 'true' : undefined}
    >
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Migration Session Steps</h3>
        <p className="stock-migration-panel-copy">{copy}</p>
      </div>

      {errorMessage ? (
        <div className="staff-status-banner" role="status">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <p className="stock-migration-panel-copy" role="status">Loading…</p>
      ) : !stepsAvailable && !errorMessage ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            No migration session steps yet.
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            No migration session steps yet.
          </p>
        </div>
      ) : (
        <div className="stock-migration-log-wrap">
          <table className="stock-migration-log-table stock-migration-queue-table">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Status</th>
                <th scope="col">Started</th>
                <th scope="col">Completed</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id ?? `${row.sessionId}-${row.stepName}`}>
                  <td>{row.step}</td>
                  <td>{row.status}</td>
                  <td>{row.startedAt}</td>
                  <td>{row.completedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

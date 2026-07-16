/**
 * Read-only Migration Activity Log.
 * Append-only history display — no actions.
 */
export function StockMigrationActivityLog({
  rows = [],
  isLoading = false,
  errorMessage = '',
  unavailable = false,
  activityAvailable = false,
}) {
  const list = Array.isArray(rows) ? rows : []

  const copy = isLoading
    ? 'Loading activity…'
    : (errorMessage || unavailable)
      ? 'Activity data is temporarily unavailable.'
      : activityAvailable
        ? 'Operator-level session activity for the current workspace.'
        : 'Activity history will appear here once sessions are recorded.'

  return (
    <section
      className="panel staff-panel stock-migration-panel"
      aria-label="Migration activity log"
      aria-busy={isLoading ? 'true' : undefined}
    >
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Activity Log</h3>
        <p className="stock-migration-panel-copy">{copy}</p>
      </div>

      {errorMessage ? (
        <div className="staff-status-banner" role="status">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <p className="stock-migration-panel-copy" role="status">Loading…</p>
      ) : !activityAvailable && !errorMessage ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            No migration activity yet.
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            No migration activity yet.
          </p>
        </div>
      ) : (
        <div className="stock-migration-log-wrap">
          <table className="stock-migration-log-table stock-migration-queue-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Operator</th>
                <th scope="col">Activity</th>
                <th scope="col">Session</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id ?? `${row.sessionId}-${row.createdAt}-${row.activity}`}>
                  <td>{row.createdAt}</td>
                  <td>{row.operator}</td>
                  <td>{row.activity}</td>
                  <td>{row.sessionId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

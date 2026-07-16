/**
 * Read-only Attention / Blocked Queue for Inventory Migration.
 * No row actions.
 */
export function StockMigrationAttentionQueue({
  rows = [],
  metricsAvailable = false,
}) {
  const list = Array.isArray(rows) ? rows : []
  const queueSizeLabel = metricsAvailable ? `${list.length}` : 'Unknown'

  return (
    <section className="panel staff-panel stock-migration-panel" aria-label="Attention blocked queue">
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Attention / Blocked Queue</h3>
        <p className="stock-migration-panel-copy">
          Read-only map rows that require operator attention ({queueSizeLabel}).
        </p>
      </div>

      {!metricsAvailable ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            Attention queue unavailable.
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            No migration issues detected.
          </p>
        </div>
      ) : (
        <div className="stock-migration-log-wrap">
          <table className="stock-migration-log-table stock-migration-queue-table">
            <thead>
              <tr>
                <th scope="col">Legacy Item ID</th>
                <th scope="col">Legacy Name</th>
                <th scope="col">Issue</th>
                <th scope="col">Current Status</th>
                <th scope="col">Resolution Type</th>
                <th scope="col">Created At</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id ?? `${row.legacyItemId}-${row.createdAt}`}>
                  <td>{row.legacyItemId}</td>
                  <td>{row.legacyName}</td>
                  <td>
                    <span className="stock-migration-issue-cell">
                      <span
                        className={`stock-migration-severity-badge stock-migration-severity-${`${row.severity ?? 'Unknown'}`.toLowerCase()}`}
                      >
                        {row.severity === 'Warning' || row.severity === 'Attention'
                          ? row.severity
                          : 'Unknown'}
                      </span>
                      <span>{row.issue}</span>
                    </span>
                  </td>
                  <td>{row.currentStatus}</td>
                  <td>{row.resolutionType}</td>
                  <td>{row.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * Read-only Manual Review Queue table for Inventory Migration.
 * No row actions.
 */
export function StockMigrationManualReviewQueue({
  rows = [],
  metricsAvailable = false,
}) {
  const list = Array.isArray(rows) ? rows : []
  const queueSizeLabel = metricsAvailable ? `${list.length}` : 'Unknown'

  return (
    <section className="panel staff-panel stock-migration-panel" aria-label="Manual review queue">
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Manual Review Queue</h3>
        <p className="stock-migration-panel-copy">
          Read-only map rows with status manual ({queueSizeLabel}).
        </p>
      </div>

      {!metricsAvailable ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            Manual review queue unavailable.
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="stock-migration-log-wrap">
          <p className="stock-migration-log-empty stock-migration-queue-empty">
            No manual review items.
          </p>
        </div>
      ) : (
        <div className="stock-migration-log-wrap">
          <table className="stock-migration-log-table stock-migration-queue-table">
            <thead>
              <tr>
                <th scope="col">Legacy Item ID</th>
                <th scope="col">Legacy Name</th>
                <th scope="col">Category</th>
                <th scope="col">Conflict Reason</th>
                <th scope="col">Current Resolution</th>
                <th scope="col">Created At</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id ?? `${row.legacyItemId}-${row.createdAt}`}>
                  <td>{row.legacyItemId}</td>
                  <td>{row.legacyName}</td>
                  <td>{row.category}</td>
                  <td>{row.conflictReason}</td>
                  <td>{row.currentResolution}</td>
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

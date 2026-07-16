const SUMMARY_CARDS = [
  { id: 'legacy', label: 'Legacy Items', value: '—' },
  { id: 'classified', label: 'Classified', value: '—' },
  { id: 'auto-link', label: 'Auto Link', value: '—' },
  { id: 'auto-create', label: 'Auto Create', value: '—' },
  { id: 'manual', label: 'Manual Review', value: '—' },
  { id: 'completed', label: 'Completed', value: '—' },
]

const PIPELINE_STAGES = [
  'Foundation',
  'Classification',
  'Auto Link',
  'Auto Create',
  'Integrity Audit',
  'Preflight',
  'Preview',
  'Phase 1',
  'Phase 2',
  'Completed',
]

const EXECUTION_ACTIONS = [
  'Run Classification',
  'Run Auto Link',
  'Run Auto Create',
  'Run Preview',
  'Execute Phase 1',
  'Execute Phase 2',
]

/**
 * Read-only Inventory Migration dashboard skeleton.
 * No queries, no handlers, no migration execution.
 */
export function StockInventoryMigrationView() {
  return (
    <section className="stock-migration-page" aria-label="Inventory migration">
      <header className="stock-migration-header">
        <div className="stock-migration-header-copy">
          <h2 className="stock-migration-title">Inventory Migration</h2>
          <p className="stock-migration-subtitle">
            Safely migrate legacy inventory into the new Stock system.
          </p>
        </div>
      </header>

      <div className="stock-summary-grid stock-summary-grid-six" aria-label="Migration summary">
        {SUMMARY_CARDS.map((card) => (
          <article key={card.id} className="stock-summary-card">
            <p className="stock-summary-label">{card.label}</p>
            <p className="stock-summary-value">{card.value}</p>
          </article>
        ))}
      </div>

      <div className="stock-migration-main">
        <div className="stock-migration-main-column">
          <section className="panel staff-panel stock-migration-panel" aria-label="Migration pipeline">
            <div className="stock-migration-panel-header">
              <h3 className="stock-migration-panel-title">Pipeline</h3>
              <p className="stock-migration-panel-copy">
                Controlled stages from foundation through completion.
              </p>
            </div>

            <ol className="stock-migration-timeline">
              {PIPELINE_STAGES.map((stage, index) => (
                <li key={stage} className="stock-migration-timeline-item">
                  <div className="stock-migration-timeline-marker" aria-hidden="true">
                    <span className="stock-migration-timeline-dot" />
                    {index < PIPELINE_STAGES.length - 1 ? (
                      <span className="stock-migration-timeline-connector" />
                    ) : null}
                  </div>
                  <div className="stock-migration-timeline-body">
                    <p className="stock-migration-timeline-stage">{stage}</p>
                    <p className="stock-migration-timeline-meta">Pending</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel staff-panel stock-migration-panel" aria-label="Execution controls">
            <div className="stock-migration-panel-header">
              <h3 className="stock-migration-panel-title">Execution</h3>
              <p className="stock-migration-panel-copy">
                Operator actions stay disabled until live controls are wired.
              </p>
            </div>

            <div className="stock-migration-actions">
              {EXECUTION_ACTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="ghost-btn stock-migration-action-btn"
                  disabled
                  aria-disabled="true"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="panel staff-panel stock-migration-panel stock-migration-status-panel" aria-label="Migration status">
          <div className="stock-migration-panel-header">
            <h3 className="stock-migration-panel-title">Migration Status</h3>
            <p className="stock-migration-panel-copy">Placeholder status only. No live data.</p>
          </div>

          <dl className="stock-migration-status-list">
            <div className="stock-migration-status-row">
              <dt>Status</dt>
              <dd>Not Started</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Environment</dt>
              <dd>Production</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Workspace</dt>
              <dd>AMORE.NICOSIA</dd>
            </div>
          </dl>
        </aside>
      </div>

      <section className="panel staff-panel stock-migration-panel" aria-label="Future activity log">
        <div className="stock-migration-panel-header">
          <h3 className="stock-migration-panel-title">Future Activity Log</h3>
          <p className="stock-migration-panel-copy">
            Operator actions and stage results will appear here.
          </p>
        </div>

        <div className="stock-migration-log-wrap">
          <table className="stock-migration-log-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Stage</th>
                <th scope="col">Result</th>
                <th scope="col">Operator</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="stock-migration-log-empty">
                  No activity yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

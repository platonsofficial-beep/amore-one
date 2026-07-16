/**
 * Read-only Migration Operator panel.
 * Workflow guidance only — buttons stay disabled.
 */
import {
  OPERATOR_EXECUTION_TOOLTIP,
} from '../../lib/inventoryMigrationOperator'

function statusClass(status) {
  return `is-${`${status ?? 'unknown'}`.toLowerCase().replace(/\s+/g, '-')}`
}

export function StockMigrationOperatorPanel({
  operator = null,
}) {
  const currentStep = operator?.currentStep ?? 'Unknown'
  const checklist = Array.isArray(operator?.checklist) ? operator.checklist : []
  const requiredAction = operator?.requiredAction ?? 'Migration cannot yet continue.'
  const notes = Array.isArray(operator?.notes) ? operator.notes : []
  const buttons = Array.isArray(operator?.buttons) ? operator.buttons : []

  return (
    <section className="panel staff-panel stock-migration-panel stock-migration-operator-panel" aria-label="Migration operator">
      <div className="stock-migration-panel-header">
        <h3 className="stock-migration-panel-title">Migration Operator</h3>
        <p className="stock-migration-panel-copy">
          Read-only operator workflow for the current workspace. Execution stays in the SQL editor.
        </p>
      </div>

      <div className="stock-migration-operator-grid">
        <div className="stock-migration-operator-current">
          <p className="stock-migration-operator-label">Current Step</p>
          <p className="stock-migration-operator-current-value">{currentStep}</p>
        </div>

        <div className="stock-migration-operator-action-card">
          <p className="stock-migration-operator-label">Required Action</p>
          <p className="stock-migration-operator-action-value">{requiredAction}</p>
        </div>
      </div>

      <div className="stock-migration-operator-section">
        <h4 className="stock-migration-operator-section-title">Operator Checklist</h4>
        <ul className="stock-migration-operator-checklist">
          {checklist.map((step) => (
            <li key={step.id} className="stock-migration-operator-check-row">
              <div className="stock-migration-operator-check-copy">
                <p className="stock-migration-operator-check-title">{step.title}</p>
                <p className="stock-migration-operator-check-description">{step.description}</p>
              </div>
              <span className={`stock-migration-operator-status ${statusClass(step.status)}`}>
                {step.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="stock-migration-operator-section">
        <h4 className="stock-migration-operator-section-title">Operator Notes</h4>
        <ul className="stock-migration-operator-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="stock-migration-operator-section">
        <h4 className="stock-migration-operator-section-title">Execution</h4>
        <p className="stock-migration-panel-copy">
          Buttons remain disabled. SQL Editor remains authoritative.
        </p>
        <div className="stock-migration-actions stock-migration-operator-actions">
          {buttons.map((label) => (
            <button
              key={label}
              type="button"
              className="ghost-btn stock-migration-action-btn"
              disabled
              aria-disabled="true"
              title={OPERATOR_EXECUTION_TOOLTIP}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * P8.16.0 — Inventory Import Wizard Shell Foundation.
 *
 * Premium fullscreen layout shell only. No upload, parse, validate, map,
 * classify, persistence, or Apply wiring.
 */

export const INVENTORY_IMPORT_WIZARD_STEPS = Object.freeze([
  { id: 'upload', label: 'Upload File', number: 1 },
  { id: 'columns', label: 'Review Columns', number: 2 },
  { id: 'data', label: 'Review Data', number: 3 },
  { id: 'preview', label: 'Import Preview', number: 4 },
  { id: 'ready', label: 'Ready to Import', number: 5 },
])

/**
 * Fullscreen Inventory Import wizard shell.
 *
 * @param {{ onClose?: () => void }} props
 */
export function InventoryImportWizardShell({ onClose = undefined } = {}) {
  return (
    <div
      className="employee-modal-backdrop inventory-import-wizard-backdrop"
      role="presentation"
    >
      <div
        className="inventory-import-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-import-wizard-title"
        aria-describedby="inventory-import-wizard-subtitle"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="inventory-import-wizard-header">
          <div className="inventory-import-wizard-header-copy">
            <h2
              id="inventory-import-wizard-title"
              className="inventory-import-wizard-title"
            >
              Inventory Import
            </h2>
            <p
              id="inventory-import-wizard-subtitle"
              className="inventory-import-wizard-subtitle"
            >
              Import inventory from CSV or Excel
            </p>
          </div>
          <div className="inventory-import-wizard-header-actions">
            <button
              type="button"
              className="ghost-btn inventory-import-wizard-exit-btn"
              onClick={typeof onClose === 'function' ? onClose : undefined}
              aria-label="Close"
            >
              Close (Exit)
            </button>
          </div>
        </header>

        <nav
          className="inventory-import-wizard-progress"
          aria-label="Import wizard progress"
        >
          <ol className="inventory-import-wizard-steps">
            {INVENTORY_IMPORT_WIZARD_STEPS.map((step) => {
              const isActive = step.number === 1
              return (
                <li
                  key={step.id}
                  className={`inventory-import-wizard-step${isActive ? ' is-active' : ' is-disabled'}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span className="inventory-import-wizard-step-index" aria-hidden="true">
                    {step.number}
                  </span>
                  <span className="inventory-import-wizard-step-label">{step.label}</span>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="inventory-import-wizard-body">
          <div className="inventory-import-wizard-upload-card">
            <span className="inventory-import-wizard-upload-icon" aria-hidden="true">
              ▤
            </span>
            <h3 className="inventory-import-wizard-upload-title">Upload inventory file</h3>
            <p className="inventory-import-wizard-upload-description">
              Choose a CSV or Excel file to begin importing your inventory.
            </p>
            <button
              type="button"
              className="primary-btn inventory-import-wizard-choose-btn"
              disabled
              aria-disabled="true"
            >
              Choose File
            </button>
            <div
              className="inventory-import-wizard-dropzone"
              aria-disabled="true"
            >
              Drag & drop coming soon
            </div>
          </div>
        </div>

        <footer className="inventory-import-wizard-footer">
          <button
            type="button"
            className="ghost-btn inventory-import-wizard-nav-btn"
            disabled
            aria-disabled="true"
          >
            Back
          </button>
          <button
            type="button"
            className="primary-btn inventory-import-wizard-nav-btn inventory-import-wizard-continue-btn"
            disabled
            aria-disabled="true"
          >
            Continue
          </button>
        </footer>
      </div>
    </div>
  )
}

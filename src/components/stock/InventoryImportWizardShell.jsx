/**
 * P8.16.0 / P8.16.0a / P8.16.1 — Inventory Import Wizard Shell.
 *
 * File selection foundation only. No parse, validate, map, classify,
 * persistence, upload, or Apply wiring.
 */

import { useRef, useState } from 'react'

export const INVENTORY_IMPORT_WIZARD_STEPS = Object.freeze([
  { id: 'upload', label: 'Upload File', number: 1 },
  { id: 'columns', label: 'Review Columns', number: 2 },
  { id: 'data', label: 'Review Data', number: 3 },
  { id: 'preview', label: 'Import Preview', number: 4 },
  { id: 'ready', label: 'Ready to Import', number: 5 },
])

export const INVENTORY_IMPORT_ACCEPTED_EXTENSIONS = Object.freeze([
  'csv',
  'xlsx',
  'xls',
])

const INVENTORY_IMPORT_FILE_ACCEPT = '.csv,.xlsx,.xls'
const INVENTORY_IMPORT_FILE_INPUT_ID = 'inventory-import-file-input'

/**
 * @param {string} filename
 * @returns {string}
 */
export function getInventoryImportFileExtension(filename) {
  const match = /\.([^.]+)$/.exec(String(filename || '').trim())
  return match ? match[1].toLowerCase() : ''
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatInventoryImportFileSize(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size < 0) return '0 B'
  if (size < 1024) return `${Math.round(size)} B`
  if (size < 1024 * 1024) {
    const kb = size / 1024
    return `${kb >= 10 ? kb.toFixed(0) : kb.toFixed(1)} KB`
  }
  const mb = size / (1024 * 1024)
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
}

/**
 * @param {string} extension
 * @returns {boolean}
 */
function isAcceptedInventoryImportExtension(extension) {
  return INVENTORY_IMPORT_ACCEPTED_EXTENSIONS.includes(extension)
}

/**
 * Fullscreen Inventory Import wizard shell.
 *
 * @param {{ onClose?: () => void }} props
 */
export function InventoryImportWizardShell({ onClose = undefined } = {}) {
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectionError, setSelectionError] = useState('')

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function clearSelectedFile() {
    setSelectedFile(null)
    setSelectionError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const extension = getInventoryImportFileExtension(file.name)
    if (!isAcceptedInventoryImportExtension(extension)) {
      setSelectedFile(null)
      setSelectionError(
        'Unsupported file type. Choose a .csv, .xlsx, or .xls file.',
      )
      event.target.value = ''
      return
    }

    setSelectionError('')
    setSelectedFile({
      name: file.name,
      extension,
      sizeLabel: formatInventoryImportFileSize(file.size),
    })
    event.target.value = ''
  }

  function handleContinuePlaceholder() {
    // P8.16.1: Continue is visual-only. No parser/step advance.
  }

  const hasSelectedFile = selectedFile != null

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
                  className={`inventory-import-wizard-step${isActive ? ' is-active' : ' is-upcoming'}`}
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
          <div
            className={`inventory-import-wizard-upload-card${hasSelectedFile ? ' is-selected' : ''}`}
          >
            <label htmlFor={INVENTORY_IMPORT_FILE_INPUT_ID} className="sr-only">
              Choose inventory CSV or Excel file
            </label>
            <input
              id={INVENTORY_IMPORT_FILE_INPUT_ID}
              ref={fileInputRef}
              type="file"
              accept={INVENTORY_IMPORT_FILE_ACCEPT}
              className="sr-only"
              onChange={handleFileChange}
            />

            {hasSelectedFile ? (
              <>
                <div className="inventory-import-wizard-upload-visual" aria-hidden="true">
                  <span className="inventory-import-wizard-upload-icon inventory-import-wizard-upload-icon-success">
                    ✓
                  </span>
                </div>
                <div className="inventory-import-wizard-upload-copy">
                  <h3 className="inventory-import-wizard-upload-title">
                    File selected
                  </h3>
                  <p className="inventory-import-wizard-selected-name">
                    {selectedFile.name}
                  </p>
                  <div className="inventory-import-wizard-selected-meta">
                    <span className="inventory-import-wizard-extension-badge">
                      .{selectedFile.extension}
                    </span>
                    <span className="inventory-import-wizard-selected-size">
                      {selectedFile.sizeLabel}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary-btn inventory-import-wizard-choose-btn"
                  onClick={openFilePicker}
                  aria-controls={INVENTORY_IMPORT_FILE_INPUT_ID}
                >
                  Choose Different File
                </button>
              </>
            ) : (
              <>
                <div className="inventory-import-wizard-upload-visual" aria-hidden="true">
                  <span className="inventory-import-wizard-upload-icon">▤</span>
                </div>
                <div className="inventory-import-wizard-upload-copy">
                  <h3 className="inventory-import-wizard-upload-title">
                    Upload Inventory File
                  </h3>
                  <p className="inventory-import-wizard-upload-description">
                    Choose a CSV or Excel file to begin importing your inventory.
                  </p>
                </div>
                <button
                  type="button"
                  className="primary-btn inventory-import-wizard-choose-btn"
                  onClick={openFilePicker}
                  aria-controls={INVENTORY_IMPORT_FILE_INPUT_ID}
                >
                  Choose File
                </button>
              </>
            )}

            {selectionError ? (
              <p
                className="inventory-import-wizard-selection-error"
                role="alert"
              >
                {selectionError}
              </p>
            ) : null}
          </div>
        </div>

        {hasSelectedFile ? (
          <footer className="inventory-import-wizard-footer">
            <button
              type="button"
              className="ghost-btn inventory-import-wizard-nav-btn"
              onClick={clearSelectedFile}
            >
              Back
            </button>
            <button
              type="button"
              className="primary-btn inventory-import-wizard-nav-btn inventory-import-wizard-continue-btn"
              onClick={handleContinuePlaceholder}
            >
              Continue
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  )
}

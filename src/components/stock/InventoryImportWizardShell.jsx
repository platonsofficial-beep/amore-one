/**
 * P8.16.0–P8.16.2 — Inventory Import Wizard Shell.
 *
 * File selection + decoder/parser integration for Review Columns.
 * No validator, mapper, classifier, persistence, upload, or Apply wiring.
 */

import { useRef, useState } from 'react'
import * as inventoryImportFileDecoder from '../../lib/inventoryImportFileDecoder'
import * as inventoryImportTabularParser from '../../lib/inventoryImportTabularParser'

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
 * @param {{ isBlank?: boolean, isDuplicate?: boolean }} header
 * @returns {'Ready'|'Blank header'|'Duplicate header'}
 */
export function getInventoryImportHeaderStatusLabel(header) {
  if (header?.isBlank) return 'Blank header'
  if (header?.isDuplicate) return 'Duplicate header'
  return 'Ready'
}

/**
 * @param {unknown} sourceHeader
 * @param {boolean} isBlank
 * @returns {string}
 */
export function formatInventoryImportSourceHeaderDisplay(sourceHeader, isBlank) {
  if (isBlank) return 'Blank header'
  if (typeof sourceHeader === 'string') return sourceHeader
  if (typeof sourceHeader === 'number' || typeof sourceHeader === 'boolean') {
    return String(sourceHeader)
  }
  return 'Blank header'
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getSafeProcessErrorMessage(error) {
  if (
    error instanceof inventoryImportFileDecoder.InventoryImportDecoderError
    || error instanceof inventoryImportTabularParser.InventoryImportParserError
  ) {
    return error.message
  }
  return 'Unable to read the selected file.'
}

/**
 * Fullscreen Inventory Import wizard shell.
 *
 * @param {{ onClose?: () => void }} props
 */
export function InventoryImportWizardShell({ onClose = undefined } = {}) {
  const fileInputRef = useRef(null)
  const processingLockRef = useRef(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectionError, setSelectionError] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  function openFilePicker() {
    if (isProcessing) return
    fileInputRef.current?.click()
  }

  function clearSelectedFile() {
    if (isProcessing) return
    setSelectedFile(null)
    setSelectionError('')
    setParseResult(null)
    setWizardStep(1)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleFileChange(event) {
    if (isProcessing) return
    const file = event.target.files?.[0]
    if (!file) return

    const extension = getInventoryImportFileExtension(file.name)
    if (!isAcceptedInventoryImportExtension(extension)) {
      setSelectedFile(null)
      setParseResult(null)
      setWizardStep(1)
      setSelectionError(
        'Unsupported file type. Choose a .csv, .xlsx, or .xls file.',
      )
      event.target.value = ''
      return
    }

    setSelectionError('')
    setParseResult(null)
    setWizardStep(1)
    setSelectedFile({
      file,
      name: file.name,
      extension,
      sizeLabel: formatInventoryImportFileSize(file.size),
    })
    event.target.value = ''
  }

  async function handleContinueToColumnReview() {
    if (processingLockRef.current) return
    if (wizardStep !== 1 || !selectedFile?.file || isProcessing) return

    processingLockRef.current = true
    setIsProcessing(true)
    setSelectionError('')

    try {
      const decoded = await inventoryImportFileDecoder.decodeInventoryImportFile(
        selectedFile.file,
      )
      const parsed = inventoryImportTabularParser.parseInventoryImportTable({
        headers: decoded.headers,
        rows: decoded.rows,
        headerRowNumber: decoded.headerRowNumber,
      })
      setParseResult(parsed)
      setWizardStep(2)
    } catch (error) {
      setSelectionError(getSafeProcessErrorMessage(error))
    } finally {
      setIsProcessing(false)
      processingLockRef.current = false
    }
  }

  function handleBackFromStep2() {
    if (isProcessing) return
    setWizardStep(1)
    setSelectionError('')
  }

  const hasSelectedFile = selectedFile != null
  const showStep1Footer = hasSelectedFile && wizardStep === 1
  const showStep2Footer = wizardStep === 2

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
              let stateClass = ' is-upcoming'
              if (step.number < wizardStep) stateClass = ' is-completed'
              else if (step.number === wizardStep) stateClass = ' is-active'

              return (
                <li
                  key={step.id}
                  className={`inventory-import-wizard-step${stateClass}`}
                  aria-current={step.number === wizardStep ? 'step' : undefined}
                >
                  <span className="inventory-import-wizard-step-index" aria-hidden="true">
                    {step.number < wizardStep ? '✓' : step.number}
                  </span>
                  <span className="inventory-import-wizard-step-label">{step.label}</span>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="inventory-import-wizard-body">
          {wizardStep === 2 && parseResult ? (
            <div className="inventory-import-wizard-review-columns">
              <div className="inventory-import-wizard-review-summary">
                <h3 className="inventory-import-wizard-review-title">
                  Review Columns
                </h3>
                <p className="inventory-import-wizard-review-meta">
                  <span>{selectedFile?.name}</span>
                  <span className="inventory-import-wizard-extension-badge">
                    .{selectedFile?.extension}
                  </span>
                  <span>
                    {parseResult.summary.sourceColumnCount} columns
                  </span>
                  <span>
                    {parseResult.summary.sourceRowCount} data rows
                  </span>
                </p>
              </div>

              <div className="inventory-import-wizard-review-table-wrap">
                <table className="inventory-import-wizard-review-table">
                  <thead>
                    <tr>
                      <th scope="col">Column</th>
                      <th scope="col">Source Header</th>
                      <th scope="col">Normalized Header</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.headers.map((header) => {
                      const status = getInventoryImportHeaderStatusLabel(header)
                      const sourceDisplay = formatInventoryImportSourceHeaderDisplay(
                        header.sourceHeader,
                        header.isBlank,
                      )
                      const normalizedDisplay = header.isBlank
                        ? '—'
                        : header.normalized

                      return (
                        <tr key={`col-${header.columnIndex}`}>
                          <td>{header.columnIndex + 1}</td>
                          <td>
                            <span
                              className={
                                header.isBlank
                                  ? 'inventory-import-wizard-header-placeholder'
                                  : undefined
                              }
                            >
                              {sourceDisplay}
                            </span>
                          </td>
                          <td>{normalizedDisplay}</td>
                          <td>
                            <span
                              className={`inventory-import-wizard-status-pill is-${status === 'Ready' ? 'ready' : status === 'Blank header' ? 'blank' : 'duplicate'}`}
                            >
                              {status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
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
                disabled={isProcessing}
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
                    {isProcessing ? (
                      <p
                        className="inventory-import-wizard-processing"
                        aria-live="polite"
                      >
                        Reading file…
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="primary-btn inventory-import-wizard-choose-btn"
                    onClick={openFilePicker}
                    aria-controls={INVENTORY_IMPORT_FILE_INPUT_ID}
                    disabled={isProcessing}
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
                    disabled={isProcessing}
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
          )}
        </div>

        {showStep1Footer ? (
          <footer className="inventory-import-wizard-footer">
            <button
              type="button"
              className="ghost-btn inventory-import-wizard-nav-btn"
              onClick={clearSelectedFile}
              disabled={isProcessing}
            >
              Back
            </button>
            <button
              type="button"
              className="primary-btn inventory-import-wizard-nav-btn inventory-import-wizard-continue-btn"
              onClick={handleContinueToColumnReview}
              disabled={isProcessing}
            >
              Continue to Column Review
            </button>
          </footer>
        ) : null}

        {showStep2Footer ? (
          <footer className="inventory-import-wizard-footer">
            <button
              type="button"
              className="ghost-btn inventory-import-wizard-nav-btn"
              onClick={handleBackFromStep2}
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
        ) : null}
      </div>
    </div>
  )
}

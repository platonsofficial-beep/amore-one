/**
 * P8.16.0–P8.16.4 — Inventory Import Wizard Shell.
 *
 * File selection, optional worksheet selection, format detection, parser →
 * Review Columns. No validator, mapper, classifier, persistence, upload, or Apply.
 */

import { useMemo, useRef, useState } from 'react'
import { useWorkspaceStockCatalog } from '../../hooks/useWorkspaceStockCatalog'
import * as inventoryImportFileDecoder from '../../lib/inventoryImportFileDecoder'
import * as inventoryImportFormatDetector from '../../lib/inventoryImportFormatDetector'
import * as inventoryOperationalSheetParser from '../../lib/inventoryOperationalSheetParser'
import * as inventoryImportTabularParser from '../../lib/inventoryImportTabularParser'
import * as inventoryOperationalProductMatcher from '../../lib/inventoryOperationalProductMatcher'
import { InventoryOperationalMatchingSummary } from './InventoryOperationalMatchingSummary'
import { InventoryOperationalReview } from './InventoryOperationalReview'

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
    || error instanceof inventoryImportFormatDetector.InventoryImportFormatDetectorError
    || error instanceof inventoryOperationalSheetParser.InventoryOperationalSheetParserError
  ) {
    return error.message
  }
  return 'Unable to read the selected file.'
}

/**
 * @param {{
 *   headers: unknown[],
 *   rows: unknown[][],
 *   headerRowNumber: number,
 *   sourceFormat?: string,
 * }} decoded
 */
function detectAndParseDecodedTable(decoded) {
  const detection = inventoryImportFormatDetector.detectInventoryImportFormat({
    headers: decoded.headers,
    rows: decoded.rows,
    headerRowNumber: decoded.headerRowNumber,
    sourceFormat: decoded.sourceFormat,
  })
  const parsed = inventoryImportTabularParser.parseInventoryImportTable({
    headers: decoded.headers,
    rows: decoded.rows,
    headerRowNumber: decoded.headerRowNumber,
  })

  let operationalModel = null
  if (detection.format === inventoryImportFormatDetector.INVENTORY_IMPORT_FORMAT.OPERATIONAL) {
    operationalModel = inventoryOperationalSheetParser.parseInventoryOperationalSheet({
      headers: decoded.headers,
      rows: decoded.rows,
      headerRowNumber: decoded.headerRowNumber,
      sourceFormat: decoded.sourceFormat,
    })
  }

  return { detection, parsed, operationalModel }
}

/**
 * Fullscreen Inventory Import wizard shell.
 *
 * @param {{
 *   onClose?: () => void,
 *   workspaceId?: string,
 *   loadWorkspaceStockItems?: (workspaceId: string) => Promise<object[]>,
 * }} props
 */
export function InventoryImportWizardShell({
  onClose = undefined,
  workspaceId = '',
  loadWorkspaceStockItems = undefined,
} = {}) {
  const fileInputRef = useRef(null)
  const processingLockRef = useRef(false)
  const [wizardView, setWizardView] = useState('upload')
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectionError, setSelectionError] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [formatDetection, setFormatDetection] = useState(null)
  const [operationalModel, setOperationalModel] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [worksheetOptions, setWorksheetOptions] = useState([])
  const [selectedWorksheetName, setSelectedWorksheetName] = useState('')

  const isOperationalFormat = formatDetection?.format
    === inventoryImportFormatDetector.INVENTORY_IMPORT_FORMAT.OPERATIONAL
  const workspaceStockCatalog = useWorkspaceStockCatalog({
    workspaceId,
    enabled: wizardView === 'columns' && isOperationalFormat && Boolean(operationalModel),
    ...(loadWorkspaceStockItems ? { loadItems: loadWorkspaceStockItems } : {}),
  })

  const operationalMatchingResult = useMemo(() => {
    if (!operationalModel) return null
    if (workspaceStockCatalog.status !== 'success') return null

    try {
      return inventoryOperationalProductMatcher.matchInventoryOperationalProducts({
        operationalModel,
        existingStockItems: workspaceStockCatalog.items,
      })
    } catch {
      return null
    }
  }, [operationalModel, workspaceStockCatalog.status, workspaceStockCatalog.items])

  const progressStep = wizardView === 'columns' ? 2 : 1

  function resetWorksheetState() {
    setWorksheetOptions([])
    setSelectedWorksheetName('')
  }

  function clearDetectionAndParse() {
    setParseResult(null)
    setFormatDetection(null)
    setOperationalModel(null)
  }

  function openFilePicker() {
    if (isProcessing) return
    fileInputRef.current?.click()
  }

  function clearSelectedFile() {
    if (isProcessing) return
    setSelectedFile(null)
    setSelectionError('')
    clearDetectionAndParse()
    resetWorksheetState()
    setWizardView('upload')
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
      clearDetectionAndParse()
      resetWorksheetState()
      setWizardView('upload')
      setSelectionError(
        'Unsupported file type. Choose a .csv, .xlsx, or .xls file.',
      )
      event.target.value = ''
      return
    }

    setSelectionError('')
    clearDetectionAndParse()
    resetWorksheetState()
    setWizardView('upload')
    setSelectedFile({
      file,
      name: file.name,
      extension,
      sizeLabel: formatInventoryImportFileSize(file.size),
    })
    event.target.value = ''
  }

  async function handleContinueFromUpload() {
    if (processingLockRef.current) return
    if (wizardView !== 'upload' || !selectedFile?.file || isProcessing) return

    processingLockRef.current = true
    setIsProcessing(true)
    setSelectionError('')
    clearDetectionAndParse()

    try {
      const extension = selectedFile.extension

      if (extension === 'csv') {
        const decoded = await inventoryImportFileDecoder.decodeInventoryImportFile(
          selectedFile.file,
        )
        const { detection, parsed, operationalModel: nextOperationalModel } = detectAndParseDecodedTable(decoded)
        setFormatDetection(detection)
        setParseResult(parsed)
        setOperationalModel(nextOperationalModel)
        resetWorksheetState()
        setWizardView('columns')
        return
      }

      const inspection = await inventoryImportFileDecoder.inspectInventoryImportWorkbook(
        selectedFile.file,
      )

      if (inspection.worksheetCount === 1) {
        const decoded = await inventoryImportFileDecoder.decodeInventoryImportWorksheet(
          selectedFile.file,
          inspection.worksheets[0].name,
        )
        const { detection, parsed, operationalModel: nextOperationalModel } = detectAndParseDecodedTable(decoded)
        setFormatDetection(detection)
        setParseResult(parsed)
        setOperationalModel(nextOperationalModel)
        resetWorksheetState()
        setWizardView('columns')
        return
      }

      setWorksheetOptions(inspection.worksheets)
      setSelectedWorksheetName('')
      clearDetectionAndParse()
      setWizardView('worksheets')
    } catch (error) {
      clearDetectionAndParse()
      setSelectionError(getSafeProcessErrorMessage(error))
    } finally {
      setIsProcessing(false)
      processingLockRef.current = false
    }
  }

  async function handleContinueFromWorksheetSelection() {
    if (processingLockRef.current) return
    if (
      wizardView !== 'worksheets'
      || !selectedFile?.file
      || !selectedWorksheetName
      || isProcessing
    ) {
      return
    }

    processingLockRef.current = true
    setIsProcessing(true)
    setSelectionError('')
    clearDetectionAndParse()

    try {
      const decoded = await inventoryImportFileDecoder.decodeInventoryImportWorksheet(
        selectedFile.file,
        selectedWorksheetName,
      )
      const { detection, parsed, operationalModel: nextOperationalModel } = detectAndParseDecodedTable(decoded)
      setFormatDetection(detection)
      setParseResult(parsed)
      setOperationalModel(nextOperationalModel)
      setWizardView('columns')
    } catch (error) {
      clearDetectionAndParse()
      setSelectionError(getSafeProcessErrorMessage(error))
    } finally {
      setIsProcessing(false)
      processingLockRef.current = false
    }
  }

  function handleBackFromWorksheets() {
    if (isProcessing) return
    resetWorksheetState()
    setSelectionError('')
    clearDetectionAndParse()
    setWizardView('upload')
  }

  function handleBackFromColumns() {
    if (isProcessing) return
    setWizardView('upload')
    setSelectionError('')
    clearDetectionAndParse()
    resetWorksheetState()
  }

  const hasSelectedFile = selectedFile != null
  const showUploadFooter = hasSelectedFile && wizardView === 'upload'
  const showWorksheetFooter = wizardView === 'worksheets'
  const showColumnsFooter = wizardView === 'columns'

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
              if (step.number < progressStep) stateClass = ' is-completed'
              else if (step.number === progressStep) stateClass = ' is-active'

              return (
                <li
                  key={step.id}
                  className={`inventory-import-wizard-step${stateClass}`}
                  aria-current={step.number === progressStep ? 'step' : undefined}
                >
                  <span className="inventory-import-wizard-step-index" aria-hidden="true">
                    {step.number < progressStep ? '✓' : step.number}
                  </span>
                  <span className="inventory-import-wizard-step-label">{step.label}</span>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="inventory-import-wizard-body">
          {wizardView === 'columns' && parseResult ? (
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

              {formatDetection ? (
                <section
                  className={`inventory-import-wizard-format-card is-${formatDetection.format}`}
                  aria-label="Detected worksheet format"
                  data-operational-category-count={operationalModel?.summary.categoryCount ?? ''}
                  data-operational-product-count={operationalModel?.summary.productCount ?? ''}
                >
                  <div className="inventory-import-wizard-format-card-head">
                    <h4 className="inventory-import-wizard-format-label">
                      {formatDetection.label}
                    </h4>
                    {formatDetection.matchStrength === 'strong' ? (
                      <span className="inventory-import-wizard-format-strength">
                        Strong match
                      </span>
                    ) : null}
                    {formatDetection.matchStrength === 'possible' ? (
                      <span className="inventory-import-wizard-format-strength">
                        Possible match
                      </span>
                    ) : null}
                  </div>
                  <p className="inventory-import-wizard-format-summary">
                    {formatDetection.summary}
                  </p>
                  {formatDetection.evidence.length > 0 ? (
                    <ul className="inventory-import-wizard-format-evidence">
                      {formatDetection.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {formatDetection.format === inventoryImportFormatDetector.INVENTORY_IMPORT_FORMAT.OPERATIONAL ? (
                    <p className="inventory-import-wizard-format-notice">
                      A specialized operational-stock import flow will handle this layout in a later step.
                    </p>
                  ) : null}
                  {formatDetection.format === inventoryImportFormatDetector.INVENTORY_IMPORT_FORMAT.UNKNOWN ? (
                    <p className="inventory-import-wizard-format-notice">
                      You can still review the detected columns below.
                    </p>
                  ) : null}
                </section>
              ) : null}

              {formatDetection?.format === inventoryImportFormatDetector.INVENTORY_IMPORT_FORMAT.OPERATIONAL
                && operationalModel
                ? (
                  <InventoryOperationalReview model={operationalModel} />
                ) : null}

              {isOperationalFormat && operationalModel ? (
                <section
                  className="inventory-workspace-stock-card"
                  aria-label="Workspace stock"
                  data-workspace-stock-status={workspaceStockCatalog.status}
                  data-workspace-stock-count={
                    workspaceStockCatalog.status === 'success'
                      ? workspaceStockCatalog.productCount
                      : ''
                  }
                >
                  {workspaceStockCatalog.status === 'loading' ? (
                    <p className="inventory-workspace-stock-loading" role="status">
                      Loading workspace stock…
                    </p>
                  ) : null}

                  {workspaceStockCatalog.status === 'success' ? (
                    <div className="inventory-operational-review-summary">
                      <h3 className="inventory-operational-review-title">
                        Workspace Stock
                      </h3>
                      <p className="inventory-operational-review-meta">
                        <span>
                          Loaded products:
                          {' '}
                          {workspaceStockCatalog.productCount}
                        </span>
                        <span>Read-only</span>
                      </p>
                    </div>
                  ) : null}

                  {workspaceStockCatalog.status === 'error' ? (
                    <div
                      className="inventory-operational-review-empty inventory-workspace-stock-error"
                      role="alert"
                    >
                      <p className="inventory-operational-review-empty-title">
                        Unable to load workspace stock
                      </p>
                      <p className="inventory-operational-review-empty-copy">
                        {workspaceStockCatalog.errorMessage
                          || 'Something went wrong while reading stock items for this workspace.'}
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {operationalMatchingResult ? (
                <InventoryOperationalMatchingSummary result={operationalMatchingResult} />
              ) : null}

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
          ) : null}

          {wizardView === 'worksheets' ? (
            <div className="inventory-import-wizard-worksheet-card">
              <div className="inventory-import-wizard-worksheet-copy">
                <h3 className="inventory-import-wizard-worksheet-title">
                  Choose Worksheet
                </h3>
                <p className="inventory-import-wizard-worksheet-subtitle">
                  This workbook contains multiple worksheets.
                </p>
                <p className="inventory-import-wizard-worksheet-hint">
                  Select the worksheet you want to import.
                </p>
              </div>

              <div
                className="inventory-import-wizard-worksheet-list"
                role="radiogroup"
                aria-label="Worksheets"
              >
                {worksheetOptions.map((sheet) => {
                  const isSelected = selectedWorksheetName === sheet.name
                  return (
                    <button
                      key={sheet.name}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`inventory-import-wizard-worksheet-option${isSelected ? ' is-selected' : ''}`}
                      disabled={isProcessing}
                      onClick={() => setSelectedWorksheetName(sheet.name)}
                    >
                      <span className="inventory-import-wizard-worksheet-name">
                        {sheet.name}
                      </span>
                      <span className="inventory-import-wizard-worksheet-meta">
                        {sheet.estimatedRowCount} estimated rows · {sheet.estimatedColumnCount} estimated columns
                      </span>
                    </button>
                  )
                })}
              </div>

              {isProcessing ? (
                <p
                  className="inventory-import-wizard-processing"
                  aria-live="polite"
                >
                  Reading file…
                </p>
              ) : null}

              {selectionError ? (
                <p
                  className="inventory-import-wizard-selection-error"
                  role="alert"
                >
                  {selectionError}
                </p>
              ) : null}
            </div>
          ) : null}

          {wizardView === 'upload' ? (
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
          ) : null}
        </div>

        {showUploadFooter ? (
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
              onClick={handleContinueFromUpload}
              disabled={isProcessing}
            >
              Continue to Column Review
            </button>
          </footer>
        ) : null}

        {showWorksheetFooter ? (
          <footer className="inventory-import-wizard-footer">
            <button
              type="button"
              className="ghost-btn inventory-import-wizard-nav-btn"
              onClick={handleBackFromWorksheets}
              disabled={isProcessing}
            >
              Back
            </button>
            <button
              type="button"
              className="primary-btn inventory-import-wizard-nav-btn inventory-import-wizard-continue-btn"
              onClick={handleContinueFromWorksheetSelection}
              disabled={isProcessing || !selectedWorksheetName}
            >
              Continue to Column Review
            </button>
          </footer>
        ) : null}

        {showColumnsFooter ? (
          <footer className="inventory-import-wizard-footer">
            <button
              type="button"
              className="ghost-btn inventory-import-wizard-nav-btn"
              onClick={handleBackFromColumns}
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

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
import * as inventoryOperationalImportPreview from '../../lib/inventoryOperationalImportPreview'
import * as inventoryOperationalMatchResolutions from '../../lib/inventoryOperationalMatchResolutions'
import * as inventoryNewProductDrafts from '../../lib/inventoryNewProductDrafts'
import {
  INVENTORY_IMPORT_ELIGIBILITY_BLOCKER,
  INVENTORY_IMPORT_ELIGIBILITY_WARNING,
  INVENTORY_IMPORT_QUANTITY_POLICY,
  evaluateInventoryImportReadyEligibility,
} from '../../lib/inventoryImportEligibility'
import { STOCK_LOCATIONS } from '../../lib/stockCatalog'
import { InventoryOperationalImportPreview } from './InventoryOperationalImportPreview'
import { InventoryOperationalMatchResolution } from './InventoryOperationalMatchResolution'
import { InventoryOperationalMatchingSummary } from './InventoryOperationalMatchingSummary'
import { InventoryNewProductReview } from './InventoryNewProductReview'
import { InventoryOperationalReview } from './InventoryOperationalReview'

const DEFAULT_IMPORT_SESSION_POLICY = Object.freeze({
  quantityPolicy: INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE,
  existingQuantityOverwriteConfirmed: false,
  newProductLocationFallback: null,
})

const IMPORT_ELIGIBILITY_BLOCKER_LABELS = Object.freeze({
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.QUANTITY_POLICY_UNSET]:
    'Choose a stock quantity policy',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_MATCHES]:
    'Resolve remaining possible matches',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.FORBIDDEN_UPDATE_ACTION]:
    'Metadata updates are not allowed in this import',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_NAME]:
    'New products need a product name',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_UNIT]:
    'New products need a unit',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION]:
    'Choose a location or fallback for new products',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.INVALID_LOCATION_FALLBACK]:
    'Fallback location must be a valid Stock location',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_OPENING_QUANTITY]:
    'Opening stock requires a quantity on every applicable row',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.INVALID_OPENING_QUANTITY]:
    'Opening stock quantities must be zero or greater',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.EXISTING_QUANTITY_OVERWRITE_UNCONFIRMED]:
    'Confirm replacing quantities on existing products',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.DUPLICATE_EXISTING_TARGET]:
    'More than one row targets the same existing product',
  [INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.REMAINING_OPERATIONAL_BLOCKER]:
    'Resolve remaining review issues',
})

const IMPORT_ELIGIBILITY_WARNING_LABELS = Object.freeze({
  [INVENTORY_IMPORT_ELIGIBILITY_WARNING.CATEGORY_DEFAULTED_TO_OTHER]:
    'Some new products use category Other',
  [INVENTORY_IMPORT_ELIGIBILITY_WARNING.EXISTING_LOCATION_CONFLICT]:
    'Source location differs from an existing product location',
  [INVENTORY_IMPORT_ELIGIBILITY_WARNING.MATCHED_ITEM_INACTIVE]:
    'Some matched products are inactive',
  [INVENTORY_IMPORT_ELIGIBILITY_WARNING.SOURCE_QUANTITY_EVIDENCE_ONLY]:
    'Spreadsheet quantities are kept as evidence only',
  [INVENTORY_IMPORT_ELIGIBILITY_WARNING.SOURCE_LOCATION_EVIDENCE_ONLY]:
    'Some source locations still need a fallback',
})

/**
 * @param {string|undefined} code
 * @returns {string}
 */
export function getInventoryImportEligibilityBlockerLabel(code) {
  if (typeof code !== 'string' || !code) return String(code ?? '')
  return IMPORT_ELIGIBILITY_BLOCKER_LABELS[code] ?? code
}

/**
 * @param {string|undefined} code
 * @returns {string}
 */
export function getInventoryImportEligibilityWarningLabel(code) {
  if (typeof code !== 'string' || !code) return String(code ?? '')
  return IMPORT_ELIGIBILITY_WARNING_LABELS[code] ?? code
}

/**
 * Presentational messages for a disabled Import Preview Continue control.
 * Maps evaluator blocker codes only — does not re-implement eligibility rules.
 *
 * @param {{
 *   canContinue?: boolean,
 *   eligibility?: { isReady?: boolean, blockingReasons?: string[] }|null,
 * }} [input]
 * @returns {string[]}
 */
export function listInventoryImportPreviewContinueMessages({
  canContinue = false,
  eligibility = null,
} = {}) {
  if (canContinue) return []

  /** @type {string[]} */
  const messages = []
  const reasons = Array.isArray(eligibility?.blockingReasons)
    ? eligibility.blockingReasons
    : []

  for (const code of reasons) {
    messages.push(getInventoryImportEligibilityBlockerLabel(code))
  }

  if (messages.length === 0) {
    messages.push('Finish required validation before continuing.')
  }

  return messages
}

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
 * Presentational messages for a disabled Review Data Continue control.
 * Derived only from existing gate inputs — does not invent validation rules.
 *
 * @param {{
 *   canContinue?: boolean,
 *   previewStatus?: string,
 *   unresolvedPossibleMatches?: number|null,
 * }} [input]
 * @returns {string[]}
 */
export function listInventoryImportReviewDataContinueMessages({
  canContinue = false,
  previewStatus = 'idle',
  unresolvedPossibleMatches = null,
} = {}) {
  if (canContinue) return []

  /** @type {string[]} */
  const messages = []

  if (previewStatus !== 'ready' && previewStatus !== 'error') {
    messages.push('Review remaining products.')
  }

  if (Number.isFinite(unresolvedPossibleMatches) && unresolvedPossibleMatches > 0) {
    messages.push(
      unresolvedPossibleMatches === 1
        ? '1 possible match requires review'
        : `${unresolvedPossibleMatches} possible matches require review`,
    )
  }

  if (messages.length === 0) {
    messages.push('Finish required validation before continuing.')
  }

  messages.push('Finish all required validations to continue')
  return messages
}

/**
 * @param {{ messages: string[] }} props
 */
function InventoryImportContinueValidationPanel({ messages }) {
  if (!Array.isArray(messages) || messages.length === 0) return null

  return (
    <div
      className="inventory-import-wizard-validation-panel"
      role="status"
      aria-live="polite"
    >
      <p className="inventory-import-wizard-validation-title">
        Continue is unavailable
      </p>
      <ul className="inventory-import-wizard-validation-list">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  )
}

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
  const [matchResolutions, setMatchResolutions] = useState({})
  const [newProductDrafts, setNewProductDrafts] = useState({})
  const [importSessionPolicy, setImportSessionPolicy] = useState(() => ({
    ...DEFAULT_IMPORT_SESSION_POLICY,
  }))

  const isOperationalFormat = formatDetection?.format
    === inventoryImportFormatDetector.INVENTORY_IMPORT_FORMAT.OPERATIONAL
  const workspaceStockCatalog = useWorkspaceStockCatalog({
    workspaceId,
    enabled: (wizardView === 'columns' || wizardView === 'data' || wizardView === 'preview')
      && isOperationalFormat
      && Boolean(operationalModel),
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

  const operationalImportPreviewState = useMemo(() => {
    if (!operationalModel || !operationalMatchingResult) {
      return { status: 'idle', preview: null, errorMessage: '' }
    }
    if (workspaceStockCatalog.status !== 'success') {
      return { status: 'idle', preview: null, errorMessage: '' }
    }

    try {
      return {
        status: 'ready',
        preview: inventoryOperationalImportPreview.buildInventoryOperationalImportPreview({
          operationalModel,
          matchingResult: operationalMatchingResult,
          existingStockItems: workspaceStockCatalog.items,
        }),
        errorMessage: '',
      }
    } catch (error) {
      const message = error instanceof inventoryOperationalImportPreview.InventoryOperationalImportPreviewError
        ? error.message
        : 'Unable to build the operational import preview.'
      return {
        status: 'error',
        preview: null,
        errorMessage: message,
      }
    }
  }, [
    operationalModel,
    operationalMatchingResult,
    workspaceStockCatalog.status,
    workspaceStockCatalog.items,
  ])

  const resolutionOperationalImportPreview = useMemo(() => {
    if (operationalImportPreviewState.status !== 'ready' || !operationalImportPreviewState.preview) {
      return null
    }
    try {
      return inventoryOperationalMatchResolutions.applyInventoryOperationalMatchResolutions({
        preview: operationalImportPreviewState.preview,
        resolutions: matchResolutions,
      })
    } catch {
      return operationalImportPreviewState.preview
    }
  }, [operationalImportPreviewState, matchResolutions])

  const resolvedOperationalImportPreview = useMemo(() => {
    if (!resolutionOperationalImportPreview) return null
    try {
      return inventoryNewProductDrafts.applyInventoryNewProductDrafts({
        preview: resolutionOperationalImportPreview,
        drafts: newProductDrafts,
      })
    } catch {
      return resolutionOperationalImportPreview
    }
  }, [resolutionOperationalImportPreview, newProductDrafts])

  const readyEligibility = useMemo(() => {
    if (!resolvedOperationalImportPreview) return null
    return evaluateInventoryImportReadyEligibility({
      preview: resolvedOperationalImportPreview,
      policy: importSessionPolicy,
    })
  }, [resolvedOperationalImportPreview, importSessionPolicy])

  const newProductCategoryOptions = useMemo(() => (
    inventoryNewProductDrafts.listNewProductCategoryOptions({
      catalogItems: workspaceStockCatalog.items,
      preview: resolutionOperationalImportPreview,
    })
  ), [workspaceStockCatalog.items, resolutionOperationalImportPreview])

  const progressStep = wizardView === 'ready'
    ? 5
    : wizardView === 'preview'
      ? 4
      : wizardView === 'data'
        ? 3
        : wizardView === 'columns'
          ? 2
          : 1

  function resetWorksheetState() {
    setWorksheetOptions([])
    setSelectedWorksheetName('')
  }

  function clearDetectionAndParse() {
    setParseResult(null)
    setFormatDetection(null)
    setOperationalModel(null)
    setMatchResolutions({})
    setNewProductDrafts({})
    setImportSessionPolicy({ ...DEFAULT_IMPORT_SESSION_POLICY })
  }

  function handleQuantityPolicyChange(nextPolicy) {
    const normalized = nextPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
      ? INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
      : INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE
    setImportSessionPolicy((current) => ({
      ...current,
      quantityPolicy: normalized,
      existingQuantityOverwriteConfirmed: normalized === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
        ? current.existingQuantityOverwriteConfirmed
        : false,
    }))
  }

  function handleOverwriteConfirmationChange(confirmed) {
    setImportSessionPolicy((current) => ({
      ...current,
      existingQuantityOverwriteConfirmed: confirmed === true,
    }))
  }

  function handleLocationFallbackChange(nextLocation) {
    const trimmed = `${nextLocation ?? ''}`.trim()
    setImportSessionPolicy((current) => ({
      ...current,
      newProductLocationFallback: trimmed === '' ? null : trimmed,
    }))
  }

  function handleMatchResolutionChange(rowKey, next) {
    setMatchResolutions((current) => ({
      ...current,
      [rowKey]: {
        decision: next.decision,
        selectedStockItemId: next.selectedStockItemId ?? null,
      },
    }))
  }

  function handleNewProductDraftChange(rowKey, next) {
    setNewProductDrafts((current) => ({
      ...current,
      [rowKey]: {
        productName: next.productName,
        category: next.category,
        unit: next.unit ?? null,
      },
    }))
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

  function canContinueFromColumnsToReviewData() {
    if (
      formatDetection?.format
      !== inventoryImportFormatDetector.INVENTORY_IMPORT_FORMAT.OPERATIONAL
    ) {
      return false
    }
    if (!operationalModel) return false
    const productCount = operationalModel.summary?.productCount
    return Number.isFinite(productCount) && productCount > 0
  }

  function handleContinueFromColumns() {
    if (wizardView !== 'columns') return
    if (!canContinueFromColumnsToReviewData()) return
    setWizardView('data')
  }

  function handleBackFromData() {
    if (isProcessing) return
    setWizardView('columns')
  }

  function canContinueFromDataToImportPreview() {
    if (operationalImportPreviewState.status === 'error') return true
    if (operationalImportPreviewState.status !== 'ready') return false
    if (!resolvedOperationalImportPreview?.summary) return false
    return resolvedOperationalImportPreview.summary.unresolvedPossibleMatches === 0
  }

  function handleContinueFromData() {
    if (wizardView !== 'data') return
    if (!canContinueFromDataToImportPreview()) return
    setWizardView('preview')
  }

  function handleBackFromPreview() {
    if (isProcessing) return
    setWizardView('data')
  }

  function canContinueFromPreviewToReady() {
    if (operationalImportPreviewState.status === 'error') return false
    if (operationalImportPreviewState.status !== 'ready') return false
    return readyEligibility?.isReady === true
  }

  function handleContinueFromPreview() {
    if (wizardView !== 'preview') return
    if (!canContinueFromPreviewToReady()) return
    setWizardView('ready')
  }

  function handleBackFromReady() {
    if (isProcessing) return
    setWizardView('preview')
  }

  const hasSelectedFile = selectedFile != null
  const showUploadFooter = hasSelectedFile && wizardView === 'upload'
  const showWorksheetFooter = wizardView === 'worksheets'
  const showColumnsFooter = wizardView === 'columns'
  const showDataFooter = wizardView === 'data'
  const showPreviewFooter = wizardView === 'preview'
  const showReadyFooter = wizardView === 'ready'
  const canContinueFromColumns = canContinueFromColumnsToReviewData()
  const canContinueFromData = canContinueFromDataToImportPreview()
  const canContinueFromPreview = canContinueFromPreviewToReady()
  const reviewDataContinueMessages = listInventoryImportReviewDataContinueMessages({
    canContinue: canContinueFromData,
    previewStatus: operationalImportPreviewState.status,
    unresolvedPossibleMatches:
      resolvedOperationalImportPreview?.summary?.unresolvedPossibleMatches ?? null,
  })
  const previewContinueMessages = listInventoryImportPreviewContinueMessages({
    canContinue: canContinueFromPreview,
    eligibility: readyEligibility,
  })
  const showOverwriteConfirmation = (
    importSessionPolicy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
    && (readyEligibility?.quantity?.linkedItemsAffectedByOpeningStock ?? 0) > 0
  )
  const showLocationFallbackControl = (readyEligibility?.counts?.create ?? 0) > 0
  const locationFallbackAffectedCount = importSessionPolicy.newProductLocationFallback
    ? (readyEligibility?.location?.fallbackAffectedRowCount ?? 0)
    : (readyEligibility?.location?.unresolvedCreateLocationCount ?? 0)

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

          {wizardView === 'data' && operationalModel ? (
            <div className="inventory-import-wizard-review-data">
              <div className="inventory-import-wizard-review-summary">
                <h3 className="inventory-import-wizard-review-title">
                  Review Data
                </h3>
                <p className="inventory-import-wizard-review-meta">
                  <span>{selectedFile?.name}</span>
                  {selectedWorksheetName ? (
                    <span>
                      Sheet:
                      {' '}
                      {selectedWorksheetName}
                    </span>
                  ) : null}
                  <span>
                    {operationalModel.summary.categoryCount}
                    {' '}
                    categories
                  </span>
                  <span>
                    {operationalModel.summary.productCount}
                    {' '}
                    products
                  </span>
                </p>
              </div>

              <InventoryOperationalReview model={operationalModel} />

              {isOperationalFormat ? (
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

              {operationalImportPreviewState.status === 'ready' ? (
                <InventoryOperationalMatchResolution
                  basePreview={operationalImportPreviewState.preview}
                  resolutions={matchResolutions}
                  onChangeResolution={handleMatchResolutionChange}
                />
              ) : null}
            </div>
          ) : null}

          {wizardView === 'preview' && operationalModel ? (
            <div className="inventory-import-wizard-import-preview">
              <div className="inventory-import-wizard-review-summary">
                <h3 className="inventory-import-wizard-review-title">
                  Import Preview
                </h3>
                <p className="inventory-import-wizard-review-meta">
                  <span>{selectedFile?.name}</span>
                  {selectedWorksheetName ? (
                    <span>
                      Sheet:
                      {' '}
                      {selectedWorksheetName}
                    </span>
                  ) : null}
                  <span>
                    {operationalModel.summary.categoryCount}
                    {' '}
                    categories
                  </span>
                  <span>
                    {operationalModel.summary.productCount}
                    {' '}
                    products
                  </span>
                </p>
              </div>

              {operationalImportPreviewState.status === 'ready' && readyEligibility ? (
                <section
                  className="inventory-import-policy-panel"
                  aria-label="Import policies"
                >
                  <div className="inventory-import-policy-section">
                    <h4 className="inventory-import-policy-title">
                      Stock quantity policy
                    </h4>
                    <div
                      className="inventory-import-policy-options"
                      role="radiogroup"
                      aria-label="Stock quantity policy"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={
                          importSessionPolicy.quantityPolicy
                          === INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE
                        }
                        className={`inventory-import-policy-option${
                          importSessionPolicy.quantityPolicy
                          === INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE
                            ? ' is-selected'
                            : ''
                        }`}
                        onClick={() => handleQuantityPolicyChange(
                          INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE,
                        )}
                      >
                        <span className="inventory-import-policy-option-label">
                          Do not change current stock quantities
                        </span>
                        <span className="inventory-import-policy-option-copy">
                          New products will start at 0. Existing quantities will remain unchanged. No stock movements will be created.
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={
                          importSessionPolicy.quantityPolicy
                          === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
                        }
                        className={`inventory-import-policy-option${
                          importSessionPolicy.quantityPolicy
                          === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
                            ? ' is-selected'
                            : ''
                        }`}
                        onClick={() => handleQuantityPolicyChange(
                          INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
                        )}
                      >
                        <span className="inventory-import-policy-option-label">
                          Apply spreadsheet quantities as opening stock
                        </span>
                        <span className="inventory-import-policy-option-copy">
                          Quantities will replace current stock values. Values are absolute, not added. Intended for onboarding or controlled initialization.
                        </span>
                      </button>
                    </div>
                  </div>

                  {showOverwriteConfirmation ? (
                    <label className="inventory-import-policy-confirm">
                      <input
                        type="checkbox"
                        checked={importSessionPolicy.existingQuantityOverwriteConfirmed}
                        onChange={(event) => {
                          handleOverwriteConfirmationChange(event.target.checked)
                        }}
                      />
                      <span>
                        I understand that the current quantities of
                        {' '}
                        {readyEligibility.quantity.linkedItemsAffectedByOpeningStock}
                        {' '}
                        existing products will be replaced.
                      </span>
                    </label>
                  ) : null}

                  {showLocationFallbackControl ? (
                    <div className="inventory-import-policy-section">
                      <label
                        className="inventory-import-policy-field-label"
                        htmlFor="inventory-import-location-fallback"
                      >
                        Fallback location for unresolved new products
                      </label>
                      <p className="inventory-import-policy-field-copy">
                        Applies only to new products without a recognized location.
                        Existing linked products keep their current location.
                      </p>
                      <select
                        id="inventory-import-location-fallback"
                        className="inventory-import-policy-select"
                        value={importSessionPolicy.newProductLocationFallback ?? ''}
                        onChange={(event) => {
                          handleLocationFallbackChange(event.target.value)
                        }}
                      >
                        <option value="">No fallback selected</option>
                        {STOCK_LOCATIONS.map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                      <p className="inventory-import-policy-affected" role="status">
                        {locationFallbackAffectedCount === 1
                          ? '1 unresolved new product will use this fallback'
                          : `${locationFallbackAffectedCount} unresolved new products will use this fallback`}
                      </p>
                    </div>
                  ) : null}

                  <div
                    className={`inventory-import-eligibility-summary${
                      readyEligibility.isReady ? ' is-ready' : ' is-blocked'
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {readyEligibility.isReady ? (
                      <>
                        <p className="inventory-import-eligibility-summary-title">
                          Ready to continue
                        </p>
                        <p className="inventory-import-eligibility-summary-meta">
                          {readyEligibility.counts.create}
                          {' '}
                          create ·
                          {' '}
                          {readyEligibility.counts.link}
                          {' '}
                          link ·
                          {' '}
                          {readyEligibility.counts.skip}
                          {' '}
                          skip
                          {importSessionPolicy.quantityPolicy
                          === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
                            ? (
                              <>
                                {' '}
                                ·
                                {' '}
                                {readyEligibility.quantity.linkedItemsAffectedByOpeningStock}
                                {' '}
                                existing quantities replaced
                              </>
                            )
                            : null}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="inventory-import-eligibility-summary-title">
                          Resolve the remaining items before continuing
                        </p>
                        <ul className="inventory-import-eligibility-summary-list">
                          {readyEligibility.blockingReasons.map((code) => (
                            <li key={code}>
                              {getInventoryImportEligibilityBlockerLabel(code)}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {readyEligibility.warningReasons.length > 0 ? (
                      <ul className="inventory-import-eligibility-warning-list">
                        {readyEligibility.warningReasons.map((code) => (
                          <li key={code}>
                            {getInventoryImportEligibilityWarningLabel(code)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {operationalImportPreviewState.status === 'ready' ? (
                <InventoryNewProductReview
                  preview={resolutionOperationalImportPreview}
                  drafts={newProductDrafts}
                  categoryOptions={newProductCategoryOptions}
                  onChangeDraft={handleNewProductDraftChange}
                />
              ) : null}

              {operationalImportPreviewState.status === 'ready'
                || operationalImportPreviewState.status === 'error'
                ? (
                  <InventoryOperationalImportPreview
                    preview={resolvedOperationalImportPreview}
                    errorMessage={operationalImportPreviewState.errorMessage}
                  />
                ) : null}
            </div>
          ) : null}

          {wizardView === 'ready' && operationalModel ? (
            <div className="inventory-import-wizard-ready">
              <div className="inventory-import-wizard-review-summary">
                <h3 className="inventory-import-wizard-review-title">
                  Ready to Import
                </h3>
                <p className="inventory-import-wizard-review-meta">
                  <span>{selectedFile?.name}</span>
                  <span>Apply Import is not available yet</span>
                </p>
              </div>
              <div className="inventory-operational-review-empty" role="status">
                <p className="inventory-operational-review-empty-title">
                  Ready to Import
                </p>
                <p className="inventory-operational-review-empty-copy">
                  Review is complete. Applying this import will be enabled in a later step.
                </p>
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
              onClick={handleContinueFromColumns}
              disabled={!canContinueFromColumns}
              aria-disabled={!canContinueFromColumns ? 'true' : undefined}
            >
              Continue
            </button>
          </footer>
        ) : null}

        {showDataFooter ? (
          <footer className="inventory-import-wizard-footer inventory-import-wizard-footer-stack">
            <InventoryImportContinueValidationPanel messages={reviewDataContinueMessages} />
            <div className="inventory-import-wizard-footer-actions">
              <button
                type="button"
                className="ghost-btn inventory-import-wizard-nav-btn"
                onClick={handleBackFromData}
              >
                Back
              </button>
              <button
                type="button"
                className="primary-btn inventory-import-wizard-nav-btn inventory-import-wizard-continue-btn"
                onClick={handleContinueFromData}
                disabled={!canContinueFromData}
                aria-disabled={!canContinueFromData ? 'true' : undefined}
              >
                Continue
              </button>
            </div>
          </footer>
        ) : null}

        {showPreviewFooter ? (
          <footer className="inventory-import-wizard-footer inventory-import-wizard-footer-stack">
            <InventoryImportContinueValidationPanel messages={previewContinueMessages} />
            <div className="inventory-import-wizard-footer-actions">
              <button
                type="button"
                className="ghost-btn inventory-import-wizard-nav-btn"
                onClick={handleBackFromPreview}
              >
                Back
              </button>
              <button
                type="button"
                className="primary-btn inventory-import-wizard-nav-btn inventory-import-wizard-continue-btn"
                onClick={handleContinueFromPreview}
                disabled={!canContinueFromPreview}
                aria-disabled={!canContinueFromPreview ? 'true' : undefined}
              >
                Continue
              </button>
            </div>
          </footer>
        ) : null}

        {showReadyFooter ? (
          <footer className="inventory-import-wizard-footer">
            <button
              type="button"
              className="ghost-btn inventory-import-wizard-nav-btn"
              onClick={handleBackFromReady}
            >
              Back
            </button>
            <button
              type="button"
              className="primary-btn inventory-import-wizard-nav-btn inventory-import-wizard-continue-btn"
              disabled
              aria-disabled="true"
            >
              Apply Import
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import {
  buildStockImportPlan,
  downloadStockImportTemplate,
  getStockImportTemplateHeaders,
  parseStockImportCsv,
} from '../../lib/stockCsvImport'

export function StockImportModal({
  stockItems = [],
  onClose,
  onImport,
  isSaving = false,
}) {
  const fileInputRef = useRef(null)
  const [csvText, setCsvText] = useState('')
  const [parseErrors, setParseErrors] = useState([])
  const [importSummary, setImportSummary] = useState(null)
  const [error, setError] = useState('')

  const parsed = useMemo(() => {
    if (!csvText.trim()) {
      return { rows: [], errors: [] }
    }
    return parseStockImportCsv(csvText)
  }, [csvText])

  const importPlan = useMemo(() => {
    if (!parsed.rows.length) return null
    return buildStockImportPlan(parsed.rows, stockItems)
  }, [parsed.rows, stockItems])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setCsvText(text)
      const nextParsed = parseStockImportCsv(text)
      setParseErrors(nextParsed.errors)
      setImportSummary(null)
      setError('')
    } catch (readError) {
      setError(readError?.message || 'Unable to read CSV file.')
    } finally {
      event.target.value = ''
    }
  }

  const handleImport = async () => {
    if (!importPlan) {
      setError('Choose a CSV file with product rows first.')
      return
    }

    if (parseErrors.length > 0) {
      setError('Fix CSV header issues before importing.')
      return
    }

    const totalChanges = importPlan.creates.length + importPlan.updates.length
    if (totalChanges === 0) {
      setError('No valid rows to import.')
      return
    }

    try {
      setError('')
      const summary = await onImport(importPlan)
      setImportSummary(summary)
    } catch (importError) {
      setError(importError?.message || 'Unable to import products right now.')
    }
  }

  const templateHeaders = getStockImportTemplateHeaders().join(',')

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal stock-dashboard-modal stock-import-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-import-title"
      >
        <div className="drawer-header">
          <div>
            <h3 id="stock-import-title">Import products</h3>
            <p className="stock-modal-subtitle">Upload a CSV to create or update stock products.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="stock-import-body">
          <p className="stock-import-template">
            Columns: {templateHeaders}
          </p>

          <div className="stock-import-actions">
            <button
              type="button"
              className="ghost-btn stock-import-template-btn"
              onClick={downloadStockImportTemplate}
            >
              Download CSV template
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="stock-import-file-input"
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="ghost-btn stock-import-choose-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose CSV file
          </button>

          {parseErrors.length > 0 ? (
            <div className="staff-status-banner">
              {parseErrors.join(' ')}
            </div>
          ) : null}

          {importPlan ? (
            <div className="stock-import-preview panel staff-panel">
              <p><strong>Ready to import</strong></p>
              <p>{importPlan.creates.length} to create · {importPlan.updates.length} to update · {importPlan.skipped.length} skipped</p>
              {importPlan.skipped.length > 0 ? (
                <ul className="stock-import-skipped-list">
                  {importPlan.skipped.slice(0, 5).map((row) => (
                    <li key={`${row.rowNumber}-${row.name}`}>
                      Row {row.rowNumber}: {row.name || 'Unnamed'} — {row.reason}
                    </li>
                  ))}
                  {importPlan.skipped.length > 5 ? (
                    <li>…and {importPlan.skipped.length - 5} more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          {importSummary ? (
            <div className="stock-import-summary panel staff-panel">
              <p><strong>Import complete</strong></p>
              <p>Created: {importSummary.created}</p>
              <p>Updated: {importSummary.updated}</p>
              <p>Skipped: {importSummary.skipped}</p>
            </div>
          ) : null}

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
            <button
              type="button"
              className="primary-btn"
              onClick={handleImport}
              disabled={isSaving || !importPlan || parseErrors.length > 0}
            >
              {isSaving ? 'Importing…' : 'Import products'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

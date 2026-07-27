import { useEffect, useMemo, useState } from 'react'
import { getInventoryCountPostedReview } from '../../services/inventoryCountService'

function formatQuantity(value) {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return `${numeric}`
}

function formatDifference(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (value > 0) return `+${value}`
  return `${value}`
}

function quantitiesEqual(left, right) {
  const a = left === null || left === undefined || left === '' ? null : Number(left)
  const b = right === null || right === undefined || right === '' ? null : Number(right)
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return a === b
}

function parseDraftQuantity(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return null
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : null
}

/**
 * Build local correction draft rows from a posted review snapshot.
 * UI foundation only — does not mutate stock.
 */
export function buildInventoryCountCorrectionDraft(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const originalCounted = item?.countedQuantity ?? null
    return {
      id: `${item?.id ?? ''}`.trim(),
      itemName: `${item?.itemName ?? ''}`.trim() || '—',
      unit: `${item?.unit ?? ''}`.trim(),
      storageLocation: `${item?.storageLocation ?? ''}`.trim() || '—',
      lineStatus: `${item?.lineStatus ?? ''}`.trim().toLowerCase() || 'pending',
      originalCountedQuantity: originalCounted,
      correctedQuantity: originalCounted,
      correctedInput: originalCounted === null || originalCounted === undefined
        ? ''
        : `${originalCounted}`,
    }
  }).filter((row) => row.id)
}

/**
 * Rows whose corrected quantity differs from the original counted quantity.
 */
export function getInventoryCountCorrectionChanges(draftRows = []) {
  return (Array.isArray(draftRows) ? draftRows : [])
    .filter((row) => !quantitiesEqual(row.originalCountedQuantity, row.correctedQuantity))
    .map((row) => {
      const oldQuantity = row.originalCountedQuantity
      const newQuantity = row.correctedQuantity
      const oldNumeric = oldQuantity === null || oldQuantity === undefined ? null : Number(oldQuantity)
      const newNumeric = newQuantity === null || newQuantity === undefined ? null : Number(newQuantity)
      const difference = (
        oldNumeric !== null
        && newNumeric !== null
        && Number.isFinite(oldNumeric)
        && Number.isFinite(newNumeric)
      )
        ? newNumeric - oldNumeric
        : null

      return {
        id: row.id,
        itemName: row.itemName,
        storageLocation: row.storageLocation,
        oldQuantity,
        newQuantity,
        difference,
      }
    })
}

function CorrectionSummaryPanel({ changes, onClose }) {
  return (
    <div
      className="employee-modal-backdrop inventory-count-correction-summary-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-count-correction-summary-title"
        className="inventory-count-correction-summary-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="inventory-count-correction-summary-title"
          className="inventory-count-correction-summary-title"
        >
          Review Corrections
        </h2>
        <p className="inventory-count-correction-summary-copy">
          Summary only. No stock updates are applied in this step.
        </p>

        {changes.length === 0 ? (
          <div className="stock-empty-state inventory-count-correction-summary-empty">
            <h4>No corrections yet</h4>
            <p>Enter Correction Mode and change at least one quantity to review differences.</p>
          </div>
        ) : (
          <div className="inventory-count-correction-summary-table-wrap">
            <table className="inventory-count-correction-summary-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Old quantity</th>
                  <th scope="col">New quantity</th>
                  <th scope="col">Difference</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.id}>
                    <td>
                      <div className="inventory-count-correction-item-name">{change.itemName}</div>
                      <div className="inventory-count-correction-item-meta">
                        {change.storageLocation}
                      </div>
                    </td>
                    <td>{formatQuantity(change.oldQuantity)}</td>
                    <td>{formatQuantity(change.newQuantity)}</td>
                    <td>{formatDifference(change.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="inventory-count-correction-summary-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * P8.20.5 — Correction Review workspace foundation.
 * Loads posted snapshot for draft corrections. No apply / RPC / stock mutation.
 */
export function InventoryCountCorrectionReview({
  sessionId,
  workspaceId,
  onCancel,
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [session, setSession] = useState(null)
  const [draftRows, setDraftRows] = useState([])
  const [isCorrectionMode, setIsCorrectionMode] = useState(false)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalizedSessionId = `${sessionId ?? ''}`.trim()
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    if (!normalizedSessionId || !normalizedWorkspaceId) {
      setIsLoading(false)
      setLoadError('Unable to open correction review right now.')
      setSession(null)
      setDraftRows([])
      return undefined
    }

    setIsLoading(true)
    setLoadError('')
    setSession(null)
    setDraftRows([])
    setIsCorrectionMode(false)
    setIsSummaryOpen(false)

    const loadSnapshot = async () => {
      try {
        const payload = await getInventoryCountPostedReview({
          workspaceId: normalizedWorkspaceId,
          sessionId: normalizedSessionId,
        })
        if (cancelled) return
        setSession(payload?.session ?? null)
        setDraftRows(buildInventoryCountCorrectionDraft(payload?.items))
      } catch (error) {
        if (cancelled) return
        setSession(null)
        setDraftRows([])
        setLoadError(error?.message || 'Unable to load posted inventory count for correction right now.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadSnapshot()
    return () => {
      cancelled = true
    }
  }, [sessionId, workspaceId])

  const changes = useMemo(
    () => getInventoryCountCorrectionChanges(draftRows),
    [draftRows],
  )
  const changedIdSet = useMemo(
    () => new Set(changes.map((change) => change.id)),
    [changes],
  )

  const handleCorrectedInputChange = (rowId, nextValue) => {
    if (!isCorrectionMode) return
    setDraftRows((current) => current.map((row) => {
      if (row.id !== rowId) return row
      return {
        ...row,
        correctedInput: nextValue,
        correctedQuantity: parseDraftQuantity(nextValue),
      }
    }))
  }

  return (
    <section
      className="inventory-count-correction-review"
      aria-label="Inventory count correction review"
      data-inventory-count-correction-review="true"
      data-correction-mode={isCorrectionMode ? 'true' : 'false'}
      data-session-id={sessionId}
    >
      <header className="inventory-count-correction-review-header">
        <div className="inventory-count-correction-review-header-copy">
          <p className="inventory-count-correction-review-eyebrow">Correction Foundation</p>
          <div className="inventory-count-correction-review-title-row">
            <h2 className="inventory-count-correction-review-title">
              {session?.countTypeLabel || 'Inventory Count'} — Suggest Correction
            </h2>
            <span className="inventory-count-session-pill is-status is-posted">
              {session?.statusLabel || 'Posted'}
            </span>
          </div>
          <p className="inventory-count-correction-review-subtitle">
            Draft corrections against the posted snapshot. Stock is not updated in this step.
          </p>
        </div>
        <div className="inventory-count-correction-review-header-actions">
          {!isCorrectionMode ? (
            <button
              type="button"
              className="primary-btn inventory-count-correction-mode-btn"
              disabled={isLoading || Boolean(loadError) || draftRows.length === 0}
              onClick={() => setIsCorrectionMode(true)}
            >
              Enter Correction Mode
            </button>
          ) : (
            <span className="inventory-count-correction-mode-badge" role="status">
              Correction Mode
            </span>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="staff-status-banner" role="status">Loading posted snapshot…</div>
      ) : null}

      {loadError ? (
        <div className="staff-status-banner auth-banner-error" role="alert">
          {loadError}
        </div>
      ) : null}

      {!isLoading && !loadError ? (
        <div className="inventory-count-correction-review-table-wrap">
          {draftRows.length === 0 ? (
            <div className="stock-empty-state">
              <h4>No lines to correct</h4>
              <p>This posted count has no session item rows.</p>
            </div>
          ) : (
            <table className="inventory-count-correction-review-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Location</th>
                  <th scope="col">Original counted</th>
                  <th scope="col">Corrected quantity</th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((row) => {
                  const isChanged = changedIdSet.has(row.id)
                  return (
                    <tr
                      key={row.id}
                      className={isChanged ? 'is-changed' : undefined}
                      data-correction-changed={isChanged ? 'true' : 'false'}
                    >
                      <td>
                        <div className="inventory-count-correction-item-name">{row.itemName}</div>
                        <div className="inventory-count-correction-item-meta">
                          {row.unit || '—'}
                          {row.lineStatus === 'skipped' ? ' · Skipped' : ''}
                        </div>
                      </td>
                      <td>{row.storageLocation}</td>
                      <td>{formatQuantity(row.originalCountedQuantity)}</td>
                      <td>
                        {isCorrectionMode ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            className="inventory-count-correction-qty-input"
                            aria-label={`Corrected quantity for ${row.itemName}`}
                            value={row.correctedInput}
                            onChange={(event) => {
                              handleCorrectedInputChange(row.id, event.target.value)
                            }}
                          />
                        ) : (
                          <span className="inventory-count-correction-qty-readonly">
                            {formatQuantity(row.correctedQuantity)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      <footer className="inventory-count-correction-review-footer">
        <button
          type="button"
          className="ghost-btn inventory-count-correction-footer-btn"
          onClick={() => onCancel?.()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="primary-btn inventory-count-correction-footer-btn"
          disabled={isLoading || Boolean(loadError)}
          onClick={() => setIsSummaryOpen(true)}
        >
          Review Corrections
        </button>
      </footer>

      {isSummaryOpen ? (
        <CorrectionSummaryPanel
          changes={changes}
          onClose={() => setIsSummaryOpen(false)}
        />
      ) : null}
    </section>
  )
}

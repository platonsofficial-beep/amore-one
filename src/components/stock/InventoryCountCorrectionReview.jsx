import { useEffect, useMemo, useState } from 'react'
import {
  applyInventoryCountCorrections,
  getInventoryCountPostedReview,
} from '../../services/inventoryCountService'

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
 * Sum previously applied correction deltas per session item.
 * effective = posted counted + sum(deltas)
 */
export function sumPriorCorrectionDeltasBySessionItemId(corrections = []) {
  const deltaBySessionItemId = new Map()
  for (const correction of Array.isArray(corrections) ? corrections : []) {
    for (const line of correction?.lines ?? []) {
      const sessionItemId = `${line?.sessionItemId ?? line?.session_item_id ?? ''}`.trim()
      if (!sessionItemId) continue
      const delta = Number(line?.deltaQuantity ?? line?.delta_quantity)
      if (!Number.isFinite(delta)) continue
      deltaBySessionItemId.set(
        sessionItemId,
        (deltaBySessionItemId.get(sessionItemId) || 0) + delta,
      )
    }
  }
  return deltaBySessionItemId
}

/**
 * Pure apply math matching the RPC effective-baseline contract.
 */
export function computeInventoryCountCorrectionApplyMath({
  countedQuantity,
  priorDeltaQuantities = [],
  correctedQuantity,
} = {}) {
  const counted = Number(countedQuantity)
  const corrected = Number(correctedQuantity)
  if (!Number.isFinite(counted) || !Number.isFinite(corrected)) {
    return {
      effectiveBefore: null,
      appliedDelta: null,
      effectiveAfter: null,
    }
  }
  const priorSum = (Array.isArray(priorDeltaQuantities) ? priorDeltaQuantities : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0)
  const effectiveBefore = counted + priorSum
  const appliedDelta = corrected - effectiveBefore
  return {
    effectiveBefore,
    appliedDelta,
    effectiveAfter: effectiveBefore + appliedDelta,
  }
}

/**
 * Build local correction draft rows from a posted review snapshot.
 * Execution baseline = latest effective quantity (counted + prior deltas).
 */
export function buildInventoryCountCorrectionDraft(items = [], corrections = []) {
  const priorDeltaBySessionItemId = sumPriorCorrectionDeltasBySessionItemId(corrections)
  const correctedSet = new Set(priorDeltaBySessionItemId.keys())
  // Also accept a legacy id list for older call sites/tests.
  if (
    Array.isArray(corrections)
    && corrections.length > 0
    && corrections.every((entry) => typeof entry === 'string' || typeof entry === 'number')
  ) {
    for (const id of corrections) {
      const normalized = `${id ?? ''}`.trim()
      if (normalized) correctedSet.add(normalized)
    }
  }

  return (Array.isArray(items) ? items : []).map((item) => {
    const originalCounted = item?.countedQuantity ?? null
    const id = `${item?.id ?? ''}`.trim()
    const priorDeltaSum = priorDeltaBySessionItemId.get(id) || 0
    const originalNumeric = originalCounted === null || originalCounted === undefined
      ? null
      : Number(originalCounted)
    const effectiveQuantity = (
      originalNumeric !== null
      && Number.isFinite(originalNumeric)
    )
      ? originalNumeric + priorDeltaSum
      : originalCounted
    return {
      id,
      itemId: `${item?.itemId ?? ''}`.trim() || null,
      itemName: `${item?.itemName ?? ''}`.trim() || '—',
      unit: `${item?.unit ?? ''}`.trim(),
      storageLocation: `${item?.storageLocation ?? ''}`.trim() || '—',
      lineStatus: `${item?.lineStatus ?? ''}`.trim().toLowerCase() || 'pending',
      originalCountedQuantity: originalCounted,
      effectiveQuantity,
      correctedQuantity: effectiveQuantity,
      correctedInput: effectiveQuantity === null || effectiveQuantity === undefined
        ? ''
        : `${effectiveQuantity}`,
      hasAppliedCorrection: correctedSet.has(id),
    }
  }).filter((row) => row.id)
}

/**
 * Rows whose corrected quantity differs from the current effective quantity.
 */
export function getInventoryCountCorrectionChanges(draftRows = []) {
  return (Array.isArray(draftRows) ? draftRows : [])
    .filter((row) => !quantitiesEqual(
      row.effectiveQuantity ?? row.originalCountedQuantity,
      row.correctedQuantity,
    ))
    .map((row) => {
      const oldQuantity = row.effectiveQuantity ?? row.originalCountedQuantity
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
        sessionItemId: row.id,
        itemId: row.itemId ?? null,
        itemName: row.itemName,
        storageLocation: row.storageLocation,
        oldQuantity,
        newQuantity,
        originalCountedQuantity: row.originalCountedQuantity ?? null,
        effectiveQuantity: oldQuantity,
        correctedQuantity: newQuantity,
        difference,
      }
    })
    .filter((row) => row.difference !== 0 && row.difference !== null)
}

function ApplyCorrectionsConfirmDialog({
  isApplying,
  error,
  onCancel,
  onConfirm,
}) {
  return (
    <div
      className="employee-modal-backdrop inventory-count-correction-confirm-overlay"
      role="presentation"
      onClick={() => {
        if (!isApplying) onCancel?.()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-count-correction-apply-title"
        aria-describedby="inventory-count-correction-apply-body"
        className="inventory-count-correction-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="inventory-count-correction-apply-title"
          className="inventory-count-correction-confirm-title"
        >
          Apply Inventory Corrections?
        </h2>
        <div
          id="inventory-count-correction-apply-body"
          className="inventory-count-correction-confirm-body"
        >
          <p>These corrections will update the current stock.</p>
          <p>The original posted inventory count will remain unchanged.</p>
          <p>New adjustment movements will be created for every corrected product.</p>
        </div>
        {error ? (
          <p className="inventory-count-session-card-error" role="alert">{error}</p>
        ) : null}
        <div className="inventory-count-correction-confirm-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={isApplying}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn inventory-count-correction-apply-confirm-btn"
            disabled={isApplying}
            onClick={onConfirm}
          >
            {isApplying ? 'Applying…' : 'Apply Corrections'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CorrectionSummaryPanel({
  changes,
  isApplying,
  applyError,
  onClose,
  onRequestApply,
}) {
  return (
    <div
      className="employee-modal-backdrop inventory-count-correction-summary-overlay"
      role="presentation"
      onClick={() => {
        if (!isApplying) onClose?.()
      }}
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
          Review current effective, corrected, and delta values before applying.
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
                  <th scope="col">Current Effective</th>
                  <th scope="col">Corrected</th>
                  <th scope="col">Delta</th>
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

        {applyError ? (
          <p className="inventory-count-session-card-error" role="alert">{applyError}</p>
        ) : null}

        <div className="inventory-count-correction-summary-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={isApplying}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="primary-btn inventory-count-correction-apply-btn"
            disabled={isApplying || changes.length === 0}
            onClick={onRequestApply}
          >
            Apply Corrections
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * P8.20.5 / P8.20.6 — Correction Review workspace + apply foundation.
 * Apply creates append-only adjustments; original posted session stays immutable.
 */
export function InventoryCountCorrectionReview({
  sessionId,
  workspaceId,
  onCancel,
  onApplied,
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [session, setSession] = useState(null)
  const [draftRows, setDraftRows] = useState([])
  const [isCorrectionMode, setIsCorrectionMode] = useState(false)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

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
    setIsConfirmOpen(false)
    setApplyError('')

    const loadSnapshot = async () => {
      try {
        const payload = await getInventoryCountPostedReview({
          workspaceId: normalizedWorkspaceId,
          sessionId: normalizedSessionId,
        })
        if (cancelled) return
        setSession(payload?.session ?? null)
        setDraftRows(buildInventoryCountCorrectionDraft(
          payload?.items,
          payload?.corrections ?? [],
        ))
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
    if (!isCorrectionMode || isApplying) return
    setDraftRows((current) => current.map((row) => {
      if (row.id !== rowId) return row
      return {
        ...row,
        correctedInput: nextValue,
        correctedQuantity: parseDraftQuantity(nextValue),
      }
    }))
  }

  const handleRequestApply = () => {
    if (changes.length === 0 || isApplying) return
    setApplyError('')
    setIsConfirmOpen(true)
  }

  const handleConfirmApply = async () => {
    if (changes.length === 0 || isApplying) return
    const normalizedSessionId = `${sessionId ?? ''}`.trim()
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
    if (!normalizedSessionId || !normalizedWorkspaceId) return

    setIsApplying(true)
    setApplyError('')

    try {
      const result = await applyInventoryCountCorrections({
        workspaceId: normalizedWorkspaceId,
        sessionId: normalizedSessionId,
        corrections: changes,
      })
      setIsConfirmOpen(false)
      setIsSummaryOpen(false)
      onApplied?.({
        message: result?.message,
        lineCount: result?.lineCount,
      })
    } catch (error) {
      setApplyError(error?.message || 'Unable to apply inventory count corrections right now.')
    } finally {
      setIsApplying(false)
    }
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
          <p className="inventory-count-correction-review-eyebrow">Correction Review</p>
          <div className="inventory-count-correction-review-title-row">
            <h2 className="inventory-count-correction-review-title">
              {session?.countTypeLabel || 'Inventory Count'} — Suggest Correction
            </h2>
            <span className="inventory-count-session-pill is-status is-posted">
              {session?.statusLabel || 'Posted'}
            </span>
          </div>
          <p className="inventory-count-correction-review-subtitle">
            Draft corrections against the posted snapshot. Applying creates new adjustment
            movements only — the original posted count stays unchanged.
          </p>
        </div>
        <div className="inventory-count-correction-review-header-actions">
          {!isCorrectionMode ? (
            <button
              type="button"
              className="primary-btn inventory-count-correction-mode-btn"
              disabled={isLoading || Boolean(loadError) || draftRows.length === 0 || isApplying}
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
                  <th scope="col">Current Effective</th>
                  <th scope="col">Corrected quantity</th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((row) => {
                  const isDraftChanged = changedIdSet.has(row.id)
                  const isPermanentlyHighlighted = isDraftChanged || row.hasAppliedCorrection
                  return (
                    <tr
                      key={row.id}
                      className={isPermanentlyHighlighted ? 'is-changed' : undefined}
                      data-correction-changed={isDraftChanged ? 'true' : 'false'}
                      data-correction-applied={row.hasAppliedCorrection ? 'true' : 'false'}
                    >
                      <td>
                        <div className="inventory-count-correction-item-name">{row.itemName}</div>
                        <div className="inventory-count-correction-item-meta">
                          {row.unit || '—'}
                          {row.lineStatus === 'skipped' ? ' · Skipped' : ''}
                          {row.hasAppliedCorrection ? ' · Corrected' : ''}
                        </div>
                      </td>
                      <td>{row.storageLocation}</td>
                      <td>
                        {formatQuantity(row.effectiveQuantity)}
                        {row.hasAppliedCorrection
                          && !quantitiesEqual(row.originalCountedQuantity, row.effectiveQuantity) ? (
                          <div className="inventory-count-correction-item-meta">
                            Posted {formatQuantity(row.originalCountedQuantity)}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {isCorrectionMode ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            className="inventory-count-correction-qty-input"
                            aria-label={`Corrected quantity for ${row.itemName}`}
                            value={row.correctedInput}
                            disabled={isApplying}
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
          disabled={isApplying}
          onClick={() => onCancel?.()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="primary-btn inventory-count-correction-footer-btn"
          disabled={isLoading || Boolean(loadError) || isApplying}
          onClick={() => {
            setApplyError('')
            setIsSummaryOpen(true)
          }}
        >
          Review Corrections
        </button>
      </footer>

      {isSummaryOpen ? (
        <CorrectionSummaryPanel
          changes={changes}
          isApplying={isApplying}
          applyError={isConfirmOpen ? '' : applyError}
          onClose={() => {
            if (isApplying) return
            setIsSummaryOpen(false)
            setApplyError('')
          }}
          onRequestApply={handleRequestApply}
        />
      ) : null}

      {isConfirmOpen ? (
        <ApplyCorrectionsConfirmDialog
          isApplying={isApplying}
          error={applyError}
          onCancel={() => {
            if (isApplying) return
            setIsConfirmOpen(false)
          }}
          onConfirm={() => {
            void handleConfirmApply()
          }}
        />
      ) : null}
    </section>
  )
}

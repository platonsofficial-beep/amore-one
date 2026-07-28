import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { canManageStock } from '../../lib/permissions'
import {
  getInventoryCountPostedReview,
  reverseInventoryCountSession,
} from '../../services/inventoryCountService'
import { sumPriorCorrectionDeltasBySessionItemId } from './InventoryCountCorrectionReview'

const AUDIT_ORIGINAL_ANCHOR_ID = 'inventory-count-audit-original'
const AUDIT_REVERSAL_ANCHOR_ID = 'inventory-count-audit-reversal'

function getCorrectionDetailAnchorId(version) {
  return `inventory-count-audit-correction-${version}`
}

function scrollToAuditAnchor(anchorId) {
  if (typeof document === 'undefined') return
  const node = document.getElementById(anchorId)
  if (!node || typeof node.scrollIntoView !== 'function') return
  node.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function correctionLineGroupKey(line) {
  return `${line?.sessionItemId ?? line?.itemId ?? line?.itemName ?? line?.id ?? ''}`.trim()
}

function formatDeltaBadge(value) {
  if (value === null || value === undefined || value === '') return '0'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  if (numeric > 0) return `+${numeric}`
  if (numeric < 0) return `−${Math.abs(numeric)}`
  return '0'
}

function deltaToneClass(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return 'is-neutral'
  return numeric > 0 ? 'is-positive' : 'is-negative'
}

const VISIBILITY_LABELS = {
  blind: 'Blind Count',
  open: 'Open Count',
}

function formatSessionDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatAppliedAt(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.getDate()
  const month = date.toLocaleString(undefined, { month: 'short' })
  const year = date.getFullYear()
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${day} ${month} ${year} at ${time}`
}

function formatQuantity(value) {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return Number.isInteger(numeric) ? `${numeric}` : `${numeric}`
}

function formatVariance(value) {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  if (numeric > 0) return `+${numeric}`
  return `${numeric}`
}

function formatSignedImpact(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return null
  if (numeric > 0) return `+${numeric}`
  return `−${Math.abs(numeric)}`
}

function formatLocations(locations = []) {
  const keys = (Array.isArray(locations) ? locations : [])
    .map((location) => `${location?.locationKey ?? ''}`.trim())
    .filter(Boolean)
  if (keys.length === 0) return '—'
  return keys.join(', ')
}

function shortMovementId(value) {
  const id = `${value ?? ''}`.trim()
  if (!id) return '—'
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…`
}

function formatAppliedCorrectionBadge(correctionCount) {
  const count = Number(correctionCount) || 0
  if (count <= 0) return ''
  return count === 1 ? '1 Applied Correction' : `${count} Applied Corrections`
}

function formatNetStockImpact(netDelta) {
  if (netDelta === null || netDelta === undefined || !Number.isFinite(Number(netDelta))) {
    return null
  }
  const numeric = Number(netDelta)
  if (numeric === 0) return 'Net stock impact 0'
  if (numeric > 0) return `Net stock impact +${numeric}`
  return `Net stock impact −${Math.abs(numeric)}`
}

function formatAdjustmentState(line) {
  const signed = formatSignedImpact(line?.deltaQuantity)
  const hasMovement = Boolean(`${line?.movementId ?? ''}`.trim())
  if (!signed) {
    return hasMovement
      ? 'Adjustment applied'
      : 'No stock adjustment recorded'
  }
  if (hasMovement) {
    return `${signed} stock adjustment applied`
  }
  return `${signed} recorded · adjustment reference unavailable`
}

/**
 * Derive chronological correction versions from loaded batches.
 * Oldest applied batch = Correction 1. Display order: Original → Correction 1 → …
 * Does not persist a version field.
 */
export function buildPostedCorrectionVersionHistory(corrections = []) {
  const batches = (Array.isArray(corrections) ? corrections : [])
    .filter((batch) => batch?.id)
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime()
      const rightTime = new Date(right.createdAt || 0).getTime()
      if (leftTime !== rightTime) return leftTime - rightTime
      return `${left.id}`.localeCompare(`${right.id}`)
    })

  return batches.map((batch, index) => {
    const lines = Array.isArray(batch.lines) ? batch.lines : []
    const productCount = lines.length || Number(batch.lineCount) || 0
    const netDelta = lines.reduce((sum, line) => {
      const delta = Number(line?.deltaQuantity)
      return Number.isFinite(delta) ? sum + delta : sum
    }, 0)

    return {
      id: batch.id,
      version: index + 1,
      versionLabel: `Correction ${index + 1}`,
      detailAnchorId: getCorrectionDetailAnchorId(index + 1),
      createdAt: batch.createdAt || null,
      operatorName: `${batch.operatorName ?? ''}`.trim() || '—',
      productCount,
      netDelta: lines.length > 0 ? netDelta : null,
      lines,
    }
  })
}

/**
 * Compact audit summary from already-loaded correction versions.
 * Original / effective are reconstructed per corrected product from history lines.
 */
export function buildPostedCorrectionAuditSummary(correctionVersions = []) {
  const byKey = new Map()

  for (const version of Array.isArray(correctionVersions) ? correctionVersions : []) {
    for (const line of version?.lines ?? []) {
      const key = correctionLineGroupKey(line)
      if (!key) continue
      const current = byKey.get(key) || { original: null, deltaSum: 0 }
      const original = Number(line?.originalQuantity)
      if (current.original === null && Number.isFinite(original)) {
        current.original = original
      }
      const delta = Number(line?.deltaQuantity)
      if (Number.isFinite(delta)) {
        current.deltaSum += delta
      }
      byKey.set(key, current)
    }
  }

  let originalPostedQuantity = 0
  let currentEffectiveQuantity = 0
  let netAdjustment = 0
  let hasQuantity = false

  for (const entry of byKey.values()) {
    if (entry.original === null) continue
    hasQuantity = true
    originalPostedQuantity += entry.original
    currentEffectiveQuantity += entry.original + entry.deltaSum
    netAdjustment += entry.deltaSum
  }

  return {
    originalPostedQuantity: hasQuantity ? originalPostedQuantity : null,
    currentEffectiveQuantity: hasQuantity ? currentEffectiveQuantity : null,
    totalCorrections: (Array.isArray(correctionVersions) ? correctionVersions : []).length,
    netAdjustment: hasQuantity ? netAdjustment : null,
  }
}

/**
 * Per-line Posted Qty / Current Effective / Δ Since Posted from loaded snapshot + corrections.
 * Effective baseline matches the correction workspace: countedQuantity + Σ deltas.
 */
export function buildPostedLineAuditQuantities(items = [], corrections = []) {
  const deltaBySessionItemId = sumPriorCorrectionDeltasBySessionItemId(corrections)
  const byItemId = new Map()

  for (const item of Array.isArray(items) ? items : []) {
    const id = `${item?.id ?? ''}`.trim()
    if (!id) continue

    const postedQtyRaw = item?.resultAfterPost
    const postedQty = postedQtyRaw === null || postedQtyRaw === undefined
      ? null
      : Number(postedQtyRaw)
    const countedRaw = item?.countedQuantity
    const countedQty = countedRaw === null || countedRaw === undefined
      ? null
      : Number(countedRaw)
    const baseline = (
      countedQty !== null && Number.isFinite(countedQty)
    )
      ? countedQty
      : (postedQty !== null && Number.isFinite(postedQty) ? postedQty : null)
    const priorDelta = deltaBySessionItemId.get(id) || 0
    const currentEffective = baseline === null ? null : baseline + priorDelta
    const deltaSincePosted = (
      currentEffective !== null
      && postedQty !== null
      && Number.isFinite(postedQty)
    )
      ? currentEffective - postedQty
      : null

    byItemId.set(id, {
      postedQuantity: postedQty !== null && Number.isFinite(postedQty) ? postedQty : null,
      currentEffectiveQuantity: currentEffective,
      deltaSincePosted,
    })
  }

  return byItemId
}

/**
 * P8.20.4 / P8.20.7 — Dedicated read-only Posted Count historical review.
 * Uses persisted post-audit fields only. No Active Count workspace / Finish Preview.
 * P8.22.8 — Reverse action foundation (managers only; no Home/Timeline badges).
 */
export function InventoryCountPostedReview({
  sessionId,
  workspaceId,
  onClose,
  onSuggestCorrection,
  notice = '',
}) {
  const { role } = useAuth()
  const canManage = canManageStock(role)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [review, setReview] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [isReverseDialogOpen, setIsReverseDialogOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const [reverseNote, setReverseNote] = useState('')
  const [isReversing, setIsReversing] = useState(false)
  const [reverseError, setReverseError] = useState('')
  const isReversingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const normalizedSessionId = `${sessionId ?? ''}`.trim()
      const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

      if (!normalizedSessionId || !normalizedWorkspaceId) {
        if (!cancelled) {
          setIsLoading(false)
          setLoadError('Unable to open posted inventory count review right now.')
          setReview(null)
        }
        return
      }

      if (!cancelled) {
        setIsLoading(true)
        setLoadError('')
        setReview(null)
      }

      try {
        const payload = await getInventoryCountPostedReview({
          workspaceId: normalizedWorkspaceId,
          sessionId: normalizedSessionId,
        })
        if (cancelled) return
        setReview(payload)
      } catch (error) {
        if (cancelled) return
        setReview(null)
        setLoadError(error?.message || 'Unable to load posted inventory count right now.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [sessionId, workspaceId, reloadKey])

  const session = review?.session
  const summary = review?.summary
  const items = Array.isArray(review?.items) ? review.items : []
  const locations = Array.isArray(review?.locations) ? review.locations : []
  const corrections = Array.isArray(review?.corrections) ? review.corrections : []
  const correctionCount = Number(review?.correctionCount) || 0
  const hasCorrections = Boolean(review?.hasCorrections) || correctionCount > 0
  const isAlreadyReversed = Boolean(`${session?.reversedAt ?? ''}`.trim())
  const canShowReverse = (
    canManage
    && !isAlreadyReversed
    && !isLoading
    && Boolean(review)
    && !loadError
  )
  const canShowSuggestCorrection = (
    !isAlreadyReversed
    && !isLoading
    && Boolean(review)
    && !loadError
  )
  const trimmedReverseReason = `${reverseReason}`.trim()
  const canSubmitReverse = Boolean(trimmedReverseReason) && !isReversing

  const correctionVersions = useMemo(
    () => buildPostedCorrectionVersionHistory(corrections),
    [corrections],
  )
  const auditSummary = useMemo(
    () => buildPostedCorrectionAuditSummary(correctionVersions),
    [correctionVersions],
  )
  const lineAuditByItemId = useMemo(
    () => buildPostedLineAuditQuantities(items, corrections),
    [items, corrections],
  )
  const appliedBadgeLabel = formatAppliedCorrectionBadge(correctionCount)
  const visibilityLabel = VISIBILITY_LABELS[session?.visibility] || session?.visibility || '—'
  const operatorName = `${session?.operatorName ?? ''}`.trim() || '—'
  const postedByName = `${session?.postedByName ?? ''}`.trim()
    || (session?.postedBy ? '—' : operatorName)
  const sessionNote = `${session?.note ?? ''}`.trim()
  const reversalReason = `${session?.reversalReason ?? ''}`.trim()
  const reversalNote = `${review?.reversal?.note ?? ''}`.trim()
  const reversedById = `${session?.reversedBy ?? ''}`.trim()
  const reversedByLabel = (
    reversedById && reversedById === `${session?.postedBy ?? ''}`.trim()
      ? postedByName
      : (
        reversedById && reversedById === `${session?.startedBy ?? ''}`.trim()
          ? operatorName
          : (reversedById ? shortMovementId(reversedById) : '—')
      )
  )
  const showAuditTimeline = hasCorrections || isAlreadyReversed
  const statusPillLabel = isAlreadyReversed ? 'Reversed' : (session?.statusLabel || 'Posted')
  const statusPillClass = isAlreadyReversed
    ? 'inventory-count-session-pill is-status is-reversed'
    : 'inventory-count-session-pill is-status is-posted'

  const closeReverseDialog = () => {
    if (isReversing) return
    setIsReverseDialogOpen(false)
    setReverseReason('')
    setReverseNote('')
    setReverseError('')
  }

  const openReverseDialog = () => {
    if (!canShowReverse || isReversing) return
    setReverseError('')
    setReverseReason('')
    setReverseNote('')
    setIsReverseDialogOpen(true)
  }

  const handleConfirmReverse = async () => {
    if (!canSubmitReverse || isReversingRef.current) return

    const normalizedSessionId = `${sessionId ?? ''}`.trim()
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
    if (!normalizedSessionId || !normalizedWorkspaceId) {
      setReverseError('Unable to reverse inventory count right now.')
      return
    }

    isReversingRef.current = true
    setIsReversing(true)
    setReverseError('')

    try {
      await reverseInventoryCountSession({
        workspaceId: normalizedWorkspaceId,
        sessionId: normalizedSessionId,
        reason: trimmedReverseReason,
        note: reverseNote,
      })
      setIsReverseDialogOpen(false)
      setReverseReason('')
      setReverseNote('')
      setReverseError('')
      setReloadKey((value) => value + 1)
    } catch (error) {
      setReverseError(error?.message || 'Unable to reverse inventory count right now.')
    } finally {
      isReversingRef.current = false
      setIsReversing(false)
    }
  }

  return (
    <section
      className="inventory-count-posted-review"
      aria-label="Posted inventory count review"
      data-inventory-count-posted-review="true"
      data-session-id={sessionId}
      data-inventory-count-reversed={isAlreadyReversed ? 'true' : 'false'}
    >
      <header className="inventory-count-posted-review-header">
        <div className="inventory-count-posted-review-header-copy">
          <p className="inventory-count-posted-review-eyebrow">Posted Count History</p>
          <div className="inventory-count-posted-review-title-row">
            <h2 className="inventory-count-posted-review-title">
              {session?.countTypeLabel || 'Inventory Count'}
            </h2>
            <span
              className={statusPillClass}
              data-inventory-count-review-status={isAlreadyReversed ? 'reversed' : 'posted'}
            >
              {statusPillLabel}
            </span>
            {hasCorrections && appliedBadgeLabel ? (
              <span
                className="inventory-count-session-pill is-corrected"
                data-inventory-count-corrected-badge="true"
              >
                {appliedBadgeLabel}
              </span>
            ) : null}
          </div>
          <dl className="inventory-count-posted-review-meta">
            <div>
              <dt>Started</dt>
              <dd>{formatSessionDate(session?.startedAt)}</dd>
            </div>
            <div>
              <dt>Posted</dt>
              <dd>{formatSessionDate(session?.postedAt)}</dd>
            </div>
            <div>
              <dt>Operator</dt>
              <dd>{operatorName}</dd>
            </div>
            <div>
              <dt>Posted by</dt>
              <dd>{postedByName}</dd>
            </div>
            <div>
              <dt>Locations</dt>
              <dd>{formatLocations(locations)}</dd>
            </div>
            <div>
              <dt>Count mode</dt>
              <dd>{visibilityLabel}</dd>
            </div>
            {isAlreadyReversed ? (
              <>
                <div data-inventory-count-reversed-at="true">
                  <dt>Reversed at</dt>
                  <dd>{formatSessionDate(session?.reversedAt)}</dd>
                </div>
                <div data-inventory-count-reversed-by="true">
                  <dt>Reversed by</dt>
                  <dd>{reversedByLabel}</dd>
                </div>
                <div data-inventory-count-reversal-reason="true">
                  <dt>Reason</dt>
                  <dd>{reversalReason || '—'}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {sessionNote ? (
            <p className="inventory-count-posted-review-note">
              <span className="inventory-count-posted-review-note-label">Session note</span>
              {sessionNote}
            </p>
          ) : null}
        </div>
        <div className="inventory-count-posted-review-header-actions">
          <button
            type="button"
            className="ghost-btn inventory-count-posted-review-back-btn"
            onClick={() => onClose?.()}
          >
            Back
          </button>
          {canShowReverse ? (
            <button
              type="button"
              className="ghost-btn inventory-count-posted-review-reverse-btn"
              data-inventory-count-reverse-action="true"
              disabled={isReversing}
              onClick={openReverseDialog}
            >
              Reverse
            </button>
          ) : null}
          {canShowSuggestCorrection ? (
            <button
              type="button"
              className="primary-btn inventory-count-posted-review-suggest-btn"
              disabled={isLoading || Boolean(loadError) || !review}
              onClick={() => onSuggestCorrection?.()}
            >
              Suggest Correction
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className="staff-status-banner auth-banner-success" role="status">
          {notice}
        </div>
      ) : null}

      {isLoading ? (
        <div className="staff-status-banner" role="status">Loading posted count…</div>
      ) : null}

      {loadError ? (
        <div className="staff-status-banner auth-banner-error" role="alert">
          {loadError}
        </div>
      ) : null}

      {!isLoading && !loadError && review ? (
        <>
          <div
            className="inventory-count-posted-review-summary"
            aria-label="Posted count summary"
          >
            {[
              ['Total lines', summary?.totalLines],
              ['Counted', summary?.countedLines],
              ['Skipped', summary?.skippedLines],
              ['Changed', summary?.changedItems],
              ['Unchanged', summary?.unchangedItems],
              ['Positive / over', summary?.positiveVariances],
              ['Negative / short', summary?.negativeVariances],
            ].map(([label, value]) => (
              <div key={label} className="inventory-count-posted-review-summary-card">
                <span className="inventory-count-posted-review-summary-label">{label}</span>
                <span className="inventory-count-posted-review-summary-value">
                  {Number(value) || 0}
                </span>
              </div>
            ))}
          </div>

          {showAuditTimeline ? (
            <section
              className="inventory-count-posted-review-corrections"
              aria-label={hasCorrections ? 'Correction history' : 'Posted count audit timeline'}
              data-inventory-count-correction-history={hasCorrections ? 'true' : undefined}
              data-inventory-count-audit-timeline="true"
            >
              <div className="inventory-count-posted-review-corrections-header">
                <h3 className="inventory-count-posted-review-corrections-title">
                  {hasCorrections ? 'Correction history' : 'Audit timeline'}
                </h3>
                <p className="inventory-count-posted-review-corrections-order-note">
                  {isAlreadyReversed
                    ? 'Chronological: Posted, then corrections (if any), then Reversal.'
                    : 'Chronological: Original, then Correction 1 (oldest) → newest.'}
                </p>
              </div>

              {hasCorrections ? (
              <>
              {isAlreadyReversed ? (
                <div
                  className="inventory-count-posted-review-audit-historical-note"
                  data-inventory-count-audit-historical-note="true"
                  role="note"
                >
                  <span className="inventory-count-posted-review-audit-historical-badge">
                    Reversal Applied
                  </span>
                  <p className="inventory-count-posted-review-audit-historical-copy">
                    Inventory impact has been fully compensated.
                    Historical values are preserved for audit purposes.
                  </p>
                </div>
              ) : null}
              <div
                className="inventory-count-posted-review-audit-summary"
                data-inventory-count-audit-summary="true"
                aria-label="Audit summary"
              >
                <div className="inventory-count-posted-review-audit-summary-item">
                  <span className="inventory-count-posted-review-audit-summary-label">
                    Posted Total
                  </span>
                  <span className="inventory-count-posted-review-audit-summary-value">
                    {formatQuantity(auditSummary.originalPostedQuantity)}
                  </span>
                </div>
                <div className="inventory-count-posted-review-audit-summary-item is-effective">
                  <span className="inventory-count-posted-review-audit-summary-label">
                    Current Total
                  </span>
                  <span className="inventory-count-posted-review-audit-summary-value">
                    {formatQuantity(auditSummary.currentEffectiveQuantity)}
                  </span>
                </div>
                <div className="inventory-count-posted-review-audit-summary-item">
                  <span className="inventory-count-posted-review-audit-summary-label">
                    Correction Batches
                  </span>
                  <span className="inventory-count-posted-review-audit-summary-value">
                    {auditSummary.totalCorrections}
                  </span>
                </div>
                <div className="inventory-count-posted-review-audit-summary-item">
                  <span className="inventory-count-posted-review-audit-summary-label">
                    Net Adjustment
                  </span>
                  <span
                    className={`inventory-count-posted-review-audit-summary-value ${deltaToneClass(auditSummary.netAdjustment)}`.trim()}
                  >
                    {formatDeltaBadge(auditSummary.netAdjustment)}
                  </span>
                </div>
              </div>
              </>
              ) : null}

              <nav
                className="inventory-count-posted-review-timeline"
                aria-label="Posted count audit timeline"
                data-inventory-count-correction-timeline="true"
              >
                <ol className="inventory-count-posted-review-timeline-list">
                  <li className="inventory-count-posted-review-timeline-item is-original">
                    <button
                      type="button"
                      className="inventory-count-posted-review-timeline-node"
                      data-timeline-target="original"
                      onClick={() => scrollToAuditAnchor(AUDIT_ORIGINAL_ANCHOR_ID)}
                    >
                      <span className="inventory-count-posted-review-timeline-dot" aria-hidden="true" />
                      <span className="inventory-count-posted-review-timeline-label">
                        Posted Count
                      </span>
                    </button>
                  </li>
                  {correctionVersions.map((version) => (
                    <li
                      key={`timeline-${version.id}`}
                      className="inventory-count-posted-review-timeline-item"
                    >
                      <button
                        type="button"
                        className="inventory-count-posted-review-timeline-node"
                        data-timeline-target={version.version}
                        onClick={() => scrollToAuditAnchor(version.detailAnchorId)}
                      >
                        <span className="inventory-count-posted-review-timeline-dot" aria-hidden="true" />
                        <span className="inventory-count-posted-review-timeline-label">
                          {version.versionLabel}
                        </span>
                        <span
                          className={`inventory-count-posted-review-delta-badge ${deltaToneClass(version.netDelta)}`.trim()}
                          data-correction-delta-badge="true"
                        >
                          {formatDeltaBadge(version.netDelta)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {isAlreadyReversed ? (
                    <li
                      className="inventory-count-posted-review-timeline-item is-reversal"
                      data-inventory-count-timeline-reversal="true"
                    >
                      <button
                        type="button"
                        className="inventory-count-posted-review-timeline-node"
                        data-timeline-target="reversal"
                        onClick={() => scrollToAuditAnchor(AUDIT_REVERSAL_ANCHOR_ID)}
                      >
                        <span className="inventory-count-posted-review-timeline-dot" aria-hidden="true" />
                        <span className="inventory-count-posted-review-timeline-label">
                          Final Reversal
                        </span>
                      </button>
                    </li>
                  ) : null}
                </ol>
              </nav>

              <div className="inventory-count-posted-review-timeline-details">
                <article
                  id={AUDIT_ORIGINAL_ANCHOR_ID}
                  className="inventory-count-posted-review-version-card is-original"
                  data-correction-version="original"
                >
                  <div className="inventory-count-posted-review-version-label">Original</div>
                  <p className="inventory-count-posted-review-version-summary">
                    Posted inventory count ·
                    {' '}
                    {formatSessionDate(session?.postedAt)}
                    {' · '}
                    {postedByName}
                  </p>
                  <p className="inventory-count-posted-review-version-copy">
                    Immutable historical record. Corrections below are append-only adjustments.
                  </p>
                </article>

                <ol className="inventory-count-posted-review-version-list">
                  {correctionVersions.map((version) => {
                    const netImpact = formatNetStockImpact(version.netDelta)
                    const productLabel = version.productCount === 1
                      ? '1 product corrected'
                      : `${version.productCount} products corrected`
                    return (
                      <li
                        key={version.id}
                        id={version.detailAnchorId}
                        className="inventory-count-posted-review-version-card"
                        data-correction-version={version.version}
                      >
                        <div className="inventory-count-posted-review-version-card-header">
                          <div className="inventory-count-posted-review-version-label">
                            {version.versionLabel}
                          </div>
                          <span
                            className={`inventory-count-posted-review-delta-badge ${deltaToneClass(version.netDelta)}`.trim()}
                            data-correction-delta-badge="true"
                          >
                            {formatDeltaBadge(version.netDelta)}
                          </span>
                        </div>
                        <p className="inventory-count-posted-review-version-summary">
                          Applied
                          {' '}
                          {formatAppliedAt(version.createdAt)}
                          {' · '}
                          {version.operatorName}
                        </p>
                        <p className="inventory-count-posted-review-version-meta">
                          {productLabel}
                          {netImpact ? ` · ${netImpact}` : ''}
                        </p>
                        <ul className="inventory-count-posted-review-version-lines">
                          {version.lines.map((line) => {
                            const lineTone = deltaToneClass(line.deltaQuantity)
                            return (
                              <li
                                key={line.id}
                                className="inventory-count-posted-review-version-line"
                              >
                                <div className="inventory-count-posted-review-version-line-name">
                                  {line.itemName || 'Product'}
                                </div>
                                <div className="inventory-count-posted-review-version-line-qty">
                                  Original
                                  {' '}
                                  {formatQuantity(line.originalQuantity)}
                                  {' → Corrected '}
                                  {formatQuantity(line.correctedQuantity)}
                                </div>
                                <div
                                  className={`inventory-count-posted-review-version-line-impact ${lineTone}`.trim()}
                                >
                                  {formatAdjustmentState(line)}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    )
                  })}
                </ol>

                {isAlreadyReversed ? (
                  <article
                    id={AUDIT_REVERSAL_ANCHOR_ID}
                    className="inventory-count-posted-review-version-card is-reversal"
                    data-inventory-count-reversal-event="true"
                  >
                    <div className="inventory-count-posted-review-version-label">Final Reversal</div>
                    <p className="inventory-count-posted-review-version-summary">
                      Inventory count reversed ·
                      {' '}
                      {formatSessionDate(session?.reversedAt)}
                      {' · '}
                      {reversedByLabel}
                    </p>
                    <div className="inventory-count-posted-review-reversal-fields">
                      <div
                        className="inventory-count-posted-review-reversal-field"
                        data-inventory-count-reversal-event-reason="true"
                      >
                        <span className="inventory-count-posted-review-reversal-field-label">
                          Reason
                        </span>
                        <p className="inventory-count-posted-review-reversal-field-value">
                          {reversalReason || '—'}
                        </p>
                      </div>
                      {reversalNote ? (
                        <div
                          className="inventory-count-posted-review-reversal-field"
                          data-inventory-count-reversal-event-note="true"
                        >
                          <span className="inventory-count-posted-review-reversal-field-label">
                            Note
                          </span>
                          <p className="inventory-count-posted-review-reversal-field-value">
                            {reversalNote}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <p className="inventory-count-posted-review-version-copy">
                      Compensating adjustments were appended. Original posted history remains unchanged.
                    </p>
                  </article>
                ) : null}
              </div>
            </section>
          ) : null}

          <div
            className="inventory-count-posted-review-table-wrap"
            data-inventory-count-posted-lines="true"
          >
            {items.length === 0 ? (
              <div className="stock-empty-state">
                <h4>No posted lines</h4>
                <p>This posted count has no session item rows.</p>
              </div>
            ) : (
              <table className="inventory-count-posted-review-table">
                <thead>
                  <tr>
                    <th scope="col" className="is-item">Item</th>
                    <th scope="col" className="is-location">Location</th>
                    <th scope="col" className="is-num">Expected</th>
                    <th scope="col" className="is-num">Counted</th>
                    <th scope="col" className="is-num">Variance</th>
                    <th scope="col" className="is-num">Posted</th>
                    <th scope="col" className="is-num">Current</th>
                    <th scope="col" className="is-num">Δ</th>
                    <th scope="col" className="is-movement">Movement</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const variance = item.varianceQuantity
                    const varianceTone = deltaToneClass(variance)
                    const lineAudit = lineAuditByItemId.get(`${item.id ?? ''}`.trim()) || null
                    const deltaSincePosted = lineAudit?.deltaSincePosted
                    const deltaTone = deltaToneClass(deltaSincePosted)
                    const itemName = `${item.itemName ?? ''}`.trim() || '—'
                    const locationLabel = `${item.storageLocation ?? ''}`.trim() || '—'
                    const unitMeta = [
                      `${item.unit ?? ''}`.trim() || '—',
                      item.lineStatus === 'skipped' ? 'Skipped' : '',
                    ].filter(Boolean).join(' · ')
                    const movementId = `${item.postedMovementId ?? ''}`.trim()
                    return (
                      <tr key={item.id}>
                        <td className="is-item">
                          <div
                            className="inventory-count-posted-review-item-name"
                            title={itemName === '—' ? undefined : itemName}
                          >
                            {itemName}
                          </div>
                          <div
                            className="inventory-count-posted-review-item-meta"
                            title={unitMeta === '—' ? undefined : unitMeta}
                          >
                            {unitMeta}
                          </div>
                        </td>
                        <td
                          className="is-location"
                          title={locationLabel === '—' ? undefined : locationLabel}
                        >
                          {locationLabel}
                        </td>
                        <td className="is-num">{formatQuantity(item.expectedAtCount)}</td>
                        <td className="is-num">{formatQuantity(item.countedQuantity)}</td>
                        <td className={`is-num ${varianceTone}`.trim()}>{formatVariance(variance)}</td>
                        <td className="is-num inventory-count-posted-review-posted-qty" data-posted-qty="true">
                          {formatQuantity(lineAudit?.postedQuantity ?? item.resultAfterPost)}
                        </td>
                        <td
                          className="is-num inventory-count-posted-review-effective-qty"
                          data-current-effective="true"
                        >
                          {formatQuantity(lineAudit?.currentEffectiveQuantity)}
                        </td>
                        <td className="is-num" data-delta-since-posted="true">
                          <span
                            className={`inventory-count-posted-review-delta-badge is-compact ${deltaTone}`.trim()}
                          >
                            {formatDeltaBadge(deltaSincePosted)}
                          </span>
                        </td>
                        <td className="is-movement">
                          <code
                            className="inventory-count-posted-review-movement"
                            title={movementId || undefined}
                          >
                            {shortMovementId(movementId)}
                          </code>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {isReverseDialogOpen && !isAlreadyReversed ? (
        <div
          className="employee-modal-backdrop inventory-count-reverse-overlay"
          role="presentation"
          data-inventory-count-reverse-dialog="true"
          onClick={() => {
            if (!isReversing) closeReverseDialog()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-count-reverse-title"
            aria-describedby="inventory-count-reverse-body"
            className="inventory-count-reverse-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="inventory-count-reverse-title"
              className="inventory-count-reverse-dialog-title"
            >
              Reverse Inventory Count?
            </h2>
            <div
              id="inventory-count-reverse-body"
              className="inventory-count-reverse-dialog-body"
            >
              <p>The original inventory count remains in history.</p>
              <p>
                Stock changes created by this count and its corrections will be compensated
                with new adjustment movements.
              </p>
              <p>Later stock movements are not affected.</p>
              <p>This action cannot be undone from the app.</p>
              <p>If another correction is needed later, start a new inventory count.</p>
            </div>

            <label className="inventory-count-reverse-field">
              <span className="inventory-count-reverse-field-label">
                Reason
                <span className="inventory-count-reverse-field-required">Required</span>
              </span>
              <textarea
                className="inventory-count-reverse-reason"
                data-inventory-count-reverse-reason="true"
                rows={3}
                value={reverseReason}
                disabled={isReversing}
                onChange={(event) => setReverseReason(event.target.value)}
                placeholder="Why is this posted count being reversed?"
              />
            </label>

            <label className="inventory-count-reverse-field">
              <span className="inventory-count-reverse-field-label">
                Internal note
                <span className="inventory-count-reverse-field-optional">Optional</span>
              </span>
              <textarea
                className="inventory-count-reverse-note"
                data-inventory-count-reverse-note="true"
                rows={2}
                value={reverseNote}
                disabled={isReversing}
                onChange={(event) => setReverseNote(event.target.value)}
                placeholder="Optional internal note"
              />
            </label>

            {reverseError ? (
              <p className="inventory-count-session-card-error" role="alert">
                {reverseError}
              </p>
            ) : null}

            <div className="inventory-count-reverse-dialog-actions">
              <button
                type="button"
                className="ghost-btn"
                disabled={isReversing}
                onClick={closeReverseDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn inventory-count-reverse-confirm-btn"
                data-inventory-count-reverse-confirm="true"
                disabled={!canSubmitReverse}
                onClick={() => {
                  void handleConfirmReverse()
                }}
              >
                {isReversing ? 'Reversing…' : 'Reverse'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

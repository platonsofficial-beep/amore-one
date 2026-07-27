import { useEffect, useState } from 'react'
import { getInventoryCountPostedReview } from '../../services/inventoryCountService'

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

/**
 * P8.20.4 — Dedicated read-only Posted Count historical review.
 * Uses persisted post-audit fields only. No Active Count workspace / Finish Preview.
 */
export function InventoryCountPostedReview({
  sessionId,
  workspaceId,
  onClose,
  onSuggestCorrection,
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [review, setReview] = useState(null)

  useEffect(() => {
    let cancelled = false
    const normalizedSessionId = `${sessionId ?? ''}`.trim()
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    if (!normalizedSessionId || !normalizedWorkspaceId) {
      setIsLoading(false)
      setLoadError('Unable to open posted inventory count review right now.')
      setReview(null)
      return undefined
    }

    setIsLoading(true)
    setLoadError('')
    setReview(null)

    const loadReview = async () => {
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

    void loadReview()
    return () => {
      cancelled = true
    }
  }, [sessionId, workspaceId])

  const session = review?.session
  const summary = review?.summary
  const items = Array.isArray(review?.items) ? review.items : []
  const locations = Array.isArray(review?.locations) ? review.locations : []
  const visibilityLabel = VISIBILITY_LABELS[session?.visibility] || session?.visibility || '—'
  const operatorName = `${session?.operatorName ?? ''}`.trim() || '—'
  const postedByName = `${session?.postedByName ?? ''}`.trim()
    || (session?.postedBy ? '—' : operatorName)
  const sessionNote = `${session?.note ?? ''}`.trim()

  return (
    <section
      className="inventory-count-posted-review"
      aria-label="Posted inventory count review"
      data-inventory-count-posted-review="true"
      data-session-id={sessionId}
    >
      <header className="inventory-count-posted-review-header">
        <div className="inventory-count-posted-review-header-copy">
          <p className="inventory-count-posted-review-eyebrow">Posted Count History</p>
          <div className="inventory-count-posted-review-title-row">
            <h2 className="inventory-count-posted-review-title">
              {session?.countTypeLabel || 'Inventory Count'}
            </h2>
            <span className="inventory-count-session-pill is-status is-posted">
              {session?.statusLabel || 'Posted'}
            </span>
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
          <button
            type="button"
            className="primary-btn inventory-count-posted-review-suggest-btn"
            disabled={isLoading || Boolean(loadError) || !review}
            onClick={() => onSuggestCorrection?.()}
          >
            Suggest Correction
          </button>
        </div>
      </header>

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

          <div className="inventory-count-posted-review-table-wrap">
            {items.length === 0 ? (
              <div className="stock-empty-state">
                <h4>No posted lines</h4>
                <p>This posted count has no session item rows.</p>
              </div>
            ) : (
              <table className="inventory-count-posted-review-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Location</th>
                    <th scope="col">Expected at count</th>
                    <th scope="col">Counted</th>
                    <th scope="col">Variance</th>
                    <th scope="col">Live at post</th>
                    <th scope="col">Result after post</th>
                    <th scope="col">Posted movement</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const variance = item.varianceQuantity
                    const varianceTone = Number(variance) > 0
                      ? 'is-positive'
                      : Number(variance) < 0
                        ? 'is-negative'
                        : 'is-neutral'
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="inventory-count-posted-review-item-name">
                            {item.itemName || '—'}
                          </div>
                          <div className="inventory-count-posted-review-item-meta">
                            {item.unit || '—'}
                            {item.lineStatus === 'skipped' ? ' · Skipped' : ''}
                          </div>
                        </td>
                        <td>{item.storageLocation || '—'}</td>
                        <td>{formatQuantity(item.expectedAtCount)}</td>
                        <td>{formatQuantity(item.countedQuantity)}</td>
                        <td className={varianceTone}>{formatVariance(variance)}</td>
                        <td>{formatQuantity(item.liveQuantityAtPost)}</td>
                        <td>{formatQuantity(item.resultAfterPost)}</td>
                        <td>
                          <code
                            className="inventory-count-posted-review-movement"
                            title={item.postedMovementId || undefined}
                          >
                            {shortMovementId(item.postedMovementId)}
                          </code>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="inventory-count-posted-review-footnote" role="note">
            Corrections will be handled through a separate audited workflow.
          </p>
        </>
      ) : null}
    </section>
  )
}

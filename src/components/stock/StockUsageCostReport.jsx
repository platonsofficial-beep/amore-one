import { useEffect, useState } from 'react'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { buildStockUsageCostReport } from '../../lib/stockUsageCostReport'
import { formatStockPurchasePrice, formatStockQuantity } from '../../lib/stockUtils'
import { formatTimestampDayAndTime24 } from '../../lib/timeFormatUtils'
import {
  getInventoryCountSessionItems,
  listInventoryCountHomeSessions,
} from '../../services/inventoryCountService'
import { getStockMovementsInPeriod } from '../../services/stockMovementService'

function postedCounts(sessions) {
  return (sessions ?? [])
    .filter((session) => session?.status === 'posted' && session.postedAt && !`${session.reversedAt ?? ''}`.trim())
    .slice()
    .sort((left, right) => Date.parse(left.postedAt) - Date.parse(right.postedAt))
}

function countLabel(session, timeZone) {
  const when = formatTimestampDayAndTime24(session.postedAt, 'Posted', timeZone)
  const kind = session.countTypeLabel || 'Count'
  return `${when} · ${kind}`
}

function moneyLabel(value, quantityMissing) {
  if (quantityMissing) return '—'
  if (value == null) return 'No cost'
  return formatStockPurchasePrice(value)
}

function qtyLabel(value, unit) {
  if (value == null || !Number.isFinite(value)) return '—'
  return formatStockQuantity(value, unit)
}

/**
 * Manager-only usage and cost between two posted counts.
 * Read-only. Loaders are injectable for tests.
 */
export function StockUsageCostReport({
  workspaceId = '',
  items = [],
  timeZone = '',
  onClose,
  loadSessions = listInventoryCountHomeSessions,
  loadLines = getInventoryCountSessionItems,
  loadMovements = getStockMovementsInPeriod,
} = {}) {
  const [sessions, setSessions] = useState([])
  const [sessionsError, setSessionsError] = useState('')
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [openingId, setOpeningId] = useState('')
  const [closingId, setClosingId] = useState('')
  const [report, setReport] = useState(null)
  const [reportError, setReportError] = useState('')
  const [reportLoading, setReportLoading] = useState(false)

  useEscapeToClose(() => onClose?.())

  useEffect(() => {
    let cancelled = false
    setSessionsLoading(true)
    setSessionsError('')
    loadSessions({ workspaceId }).then((rows) => {
      if (cancelled) return
      const posted = postedCounts(rows)
      setSessions(posted)
      if (posted.length >= 2) {
        setOpeningId(posted[posted.length - 2].id)
        setClosingId(posted[posted.length - 1].id)
      }
      setSessionsLoading(false)
    }).catch((error) => {
      if (cancelled) return
      setSessions([])
      setSessionsError(error?.message || 'Unable to load posted counts.')
      setSessionsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspaceId, loadSessions])

  useEffect(() => {
    const opening = sessions.find((session) => session.id === openingId)
    const closing = sessions.find((session) => session.id === closingId)
    if (!opening || !closing) {
      setReport(null)
      setReportError('')
      return undefined
    }
    if (Date.parse(opening.postedAt) >= Date.parse(closing.postedAt)) {
      setReport(null)
      setReportError('Closing count must be after the opening count.')
      return undefined
    }

    let cancelled = false
    setReportLoading(true)
    setReportError('')
    Promise.all([
      loadLines({ workspaceId, sessionId: opening.id }),
      loadLines({ workspaceId, sessionId: closing.id }),
      loadMovements(workspaceId, { after: opening.postedAt, before: closing.postedAt }),
    ]).then(([openingLines, closingLines, movementResult]) => {
      if (cancelled) return
      setReport(buildStockUsageCostReport({
        openingLines,
        closingLines,
        movements: movementResult?.movements ?? [],
        items,
        movementHistoryTruncated: movementResult?.truncated === true,
      }))
      setReportLoading(false)
    }).catch((error) => {
      if (cancelled) return
      setReport(null)
      setReportError(error?.message || 'Unable to build this usage report.')
      setReportLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspaceId, sessions, openingId, closingId, items, loadLines, loadMovements])

  const summary = report?.summary

  return (
    <div
      className="employee-modal-backdrop task-modal-backdrop"
      onClick={() => onClose?.()}
      data-testid="stock-usage-cost-report"
    >
      <div
        className="employee-modal stock-dashboard-modal task-form-modal is-responsive-sheet stock-usage-report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-usage-report-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3 id="stock-usage-report-title">Usage & cost</h3>
            <p className="stock-modal-subtitle">
              Opening + Received − Waste − Logged use ± Transfers ± Adjustments − Closing = Used
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {sessionsLoading ? <p className="stock-usage-report-status">Loading posted counts…</p> : null}
        {sessionsError ? <p className="stock-usage-report-status is-error" role="alert">{sessionsError}</p> : null}
        {!sessionsLoading && !sessionsError && sessions.length < 2 ? (
          <p className="stock-usage-report-status">Post two inventory counts to compare a period.</p>
        ) : null}

        {sessions.length >= 2 ? (
          <div className="stock-usage-report-controls">
            <label>
              Opening count
              <select
                value={openingId}
                onChange={(event) => setOpeningId(event.target.value)}
                data-testid="stock-usage-opening-count"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>{countLabel(session, timeZone)}</option>
                ))}
              </select>
            </label>
            <label>
              Closing count
              <select
                value={closingId}
                onChange={(event) => setClosingId(event.target.value)}
                data-testid="stock-usage-closing-count"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>{countLabel(session, timeZone)}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {reportLoading ? <p className="stock-usage-report-status">Building the period…</p> : null}
        {reportError ? <p className="stock-usage-report-status is-error" role="alert">{reportError}</p> : null}

        {summary ? (
          <div className="stock-usage-report-summary" data-testid="stock-usage-report-summary">
            <span>{summary.productCount} product{summary.productCount === 1 ? '' : 's'}</span>
            <span>
              Usage cost {summary.hasUsageCost ? formatStockPurchasePrice(summary.usageCost) : 'No cost'}
            </span>
            <span>
              Waste cost {summary.hasWasteCost ? formatStockPurchasePrice(summary.wasteCost) : 'No cost'}
            </span>
            {summary.missingCountCount > 0 ? (
              <span>{summary.missingCountCount} missing a count</span>
            ) : null}
            {summary.missingCostCount > 0 ? (
              <span>{summary.missingCostCount} with no cost</span>
            ) : null}
            {summary.movementHistoryTruncated ? (
              <span>Movement history was cut off. Used is hidden.</span>
            ) : null}
          </div>
        ) : null}

        <div className="stock-usage-report-list">
          {(report?.categories ?? []).map((category) => (
            <section key={category.category} className="stock-usage-report-category">
              <header>
                <h4>{category.category}</h4>
                <p>
                  {category.hasUsageCost ? `Usage ${formatStockPurchasePrice(category.usageCost)}` : 'No usage cost'}
                  {' · '}
                  {category.hasWasteCost ? `Waste ${formatStockPurchasePrice(category.wasteCost)}` : 'No waste cost'}
                  {category.missingCostCount > 0 ? ` · ${category.missingCostCount} with no cost` : ''}
                  {category.missingCountCount > 0 ? ` · ${category.missingCountCount} missing a count` : ''}
                </p>
              </header>
              {report.products.filter((product) => product.category === category.category).map((product) => (
                <article key={product.itemId} className="stock-usage-report-card" data-stock-item-id={product.itemId}>
                  <strong>{product.name}</strong>
                  {product.gap ? <p className="stock-usage-report-gap">{product.gap}</p> : null}
                  <dl>
                    <div><dt>Opening</dt><dd>{qtyLabel(product.opening, product.unit)}</dd></div>
                    <div><dt>Received</dt><dd>{qtyLabel(product.received, product.unit)}</dd></div>
                    <div><dt>Waste</dt><dd>{qtyLabel(product.waste, product.unit)}</dd></div>
                    <div><dt>Logged use</dt><dd>{qtyLabel(product.loggedUse, product.unit)}</dd></div>
                    <div><dt>Transfers</dt><dd>{qtyLabel(product.transfer, product.unit)}</dd></div>
                    <div><dt>Adjustments</dt><dd>{qtyLabel(product.adjustment, product.unit)}</dd></div>
                    <div><dt>Closing</dt><dd>{qtyLabel(product.closing, product.unit)}</dd></div>
                    <div><dt>Used</dt><dd>{product.used == null ? '—' : qtyLabel(product.used, product.unit)}</dd></div>
                    <div><dt>Usage cost</dt><dd>{moneyLabel(product.usageCost, product.used == null)}</dd></div>
                    <div><dt>Waste cost</dt><dd>{moneyLabel(product.wasteCost, false)}</dd></div>
                  </dl>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

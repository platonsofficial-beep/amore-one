import { useEffect, useMemo, useState } from 'react'
import {
  buildInventoryMigrationHealth,
  buildInventoryMigrationPipeline,
  createEmptyInventoryMigrationMetrics,
  resolveInventoryMigrationCurrentStage,
  resolveInventoryMigrationProgressPercent,
  resolveInventoryMigrationStatus,
} from '../../lib/inventoryMigrationMetrics'
import { buildInventoryMigrationOperator } from '../../lib/inventoryMigrationOperator'
import { buildInventoryMigrationAuditEvidence } from '../../lib/inventoryMigrationAuditEvidence'
import { buildInventoryMigrationSessionPlaceholder } from '../../lib/inventoryMigrationSession'
import { getInventoryMigrationMetrics } from '../../services/inventoryMigrationMetricsService'
import { StockMigrationAttentionQueue } from './StockMigrationAttentionQueue'
import { StockMigrationHealthPanel } from './StockMigrationHealthPanel'
import { StockMigrationManualReviewQueue } from './StockMigrationManualReviewQueue'
import { StockMigrationOperatorPanel } from './StockMigrationOperatorPanel'
import { StockMigrationSessionCard } from './StockMigrationSessionCard'

const EXECUTION_ACTIONS = [
  'Run Classification',
  'Run Auto Link',
  'Run Auto Create',
  'Run Preview',
  'Execute Phase 1',
  'Execute Phase 2',
]

function formatMetricValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n}` : '0'
}

function formatLastUpdated(iso) {
  if (!iso) return 'Unknown'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}

function pipelineStateClass(state) {
  const normalized = `${state ?? ''}`.toLowerCase().replace(/\s+/g, '-')
  return `is-${normalized}`
}

/**
 * Inventory Migration dashboard — live read-only metrics and pipeline.
 * No mutation handlers. Execution buttons remain disabled.
 */
export function StockInventoryMigrationView({
  workspaceId = '',
  workspaceLabel = '',
  isWorkspaceReady = false,
}) {
  const [metrics, setMetrics] = useState(createEmptyInventoryMigrationMetrics)
  const [manualReviewRows, setManualReviewRows] = useState([])
  const [attentionRows, setAttentionRows] = useState([])
  const [metricsAvailable, setMetricsAvailable] = useState(false)
  const [tableReachable, setTableReachable] = useState(false)
  const [fetchedAt, setFetchedAt] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [noticeMessage, setNoticeMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadMetrics() {
      if (!isWorkspaceReady || !`${workspaceId ?? ''}`.trim()) {
        if (!cancelled) {
          setMetrics(createEmptyInventoryMigrationMetrics())
          setManualReviewRows([])
          setAttentionRows([])
          setMetricsAvailable(false)
          setTableReachable(false)
          setFetchedAt(null)
          setNoticeMessage('')
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)
      const result = await getInventoryMigrationMetrics(workspaceId)
      if (cancelled) return

      setMetrics(result.metrics)
      setManualReviewRows(Array.isArray(result.manualReviewRows) ? result.manualReviewRows : [])
      setAttentionRows(Array.isArray(result.attentionRows) ? result.attentionRows : [])
      setMetricsAvailable(Boolean(result.metricsAvailable))
      setTableReachable(Boolean(result.tableReachable))
      setFetchedAt(result.fetchedAt ?? null)
      setNoticeMessage(result.error ? result.error : '')
      setIsLoading(false)
    }

    loadMetrics()
    return () => {
      cancelled = true
    }
  }, [workspaceId, isWorkspaceReady])

  const migrationStatus = metricsAvailable
    ? resolveInventoryMigrationStatus(metrics)
    : 'Unknown'

  const pipeline = useMemo(
    () => buildInventoryMigrationPipeline({
      metrics,
      metricsAvailable,
      tableReachable,
    }),
    [metrics, metricsAvailable, tableReachable],
  )

  const progressPercent = resolveInventoryMigrationProgressPercent(metrics, metricsAvailable)
  const currentStage = resolveInventoryMigrationCurrentStage(pipeline)
  const displayWorkspace = `${workspaceLabel ?? ''}`.trim() || '—'

  const auditEvidence = useMemo(
    () => buildInventoryMigrationAuditEvidence({
      metrics,
      metricsAvailable,
      tableReachable,
    }),
    [metrics, metricsAvailable, tableReachable],
  )

  const health = useMemo(
    () => buildInventoryMigrationHealth({
      metrics,
      metricsAvailable,
      tableReachable,
      pipeline,
      manualQueueSize: metricsAvailable ? metrics.manualReview : 0,
      attentionQueueSize: metricsAvailable ? attentionRows.length : 0,
      auditEvidence,
    }),
    [metrics, metricsAvailable, tableReachable, pipeline, attentionRows.length, auditEvidence],
  )

  const operator = useMemo(
    () => buildInventoryMigrationOperator({
      metrics,
      metricsAvailable,
      tableReachable,
      auditEvidence,
    }),
    [metrics, metricsAvailable, tableReachable, auditEvidence],
  )

  const sessionPlaceholder = useMemo(
    () => buildInventoryMigrationSessionPlaceholder({
      workspaceId: isWorkspaceReady ? workspaceId : null,
    }),
    [workspaceId, isWorkspaceReady],
  )

  const summaryCards = [
    { id: 'legacy', label: 'Legacy Items', value: metricsAvailable ? formatMetricValue(metrics.legacyItems) : 'Unknown' },
    { id: 'classified', label: 'Classified', value: metricsAvailable ? formatMetricValue(metrics.classified) : 'Unknown' },
    { id: 'auto-link', label: 'Auto Link', value: metricsAvailable ? formatMetricValue(metrics.autoLink) : 'Unknown' },
    { id: 'auto-create', label: 'Auto Create', value: metricsAvailable ? formatMetricValue(metrics.autoCreate) : 'Unknown' },
    { id: 'manual', label: 'Manual Review', value: metricsAvailable ? formatMetricValue(metrics.manualReview) : 'Unknown' },
    { id: 'completed', label: 'Completed', value: metricsAvailable ? formatMetricValue(metrics.completed) : 'Unknown' },
  ]

  return (
    <section className="stock-migration-page" aria-label="Inventory migration">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading migration metrics…</div> : null}

      <header className="stock-migration-header">
        <div className="stock-migration-header-copy">
          <h2 className="stock-migration-title">Inventory Migration</h2>
          <p className="stock-migration-subtitle">
            Safely migrate legacy inventory into the new Stock system.
          </p>
        </div>
      </header>

      <div className="stock-summary-grid stock-summary-grid-six" aria-label="Migration summary">
        {summaryCards.map((card) => (
          <article key={card.id} className="stock-summary-card">
            <p className="stock-summary-label">{card.label}</p>
            <p className="stock-summary-value">{card.value}</p>
          </article>
        ))}
      </div>

      <StockMigrationHealthPanel
        health={health}
        metricsAvailable={metricsAvailable}
      />

      <StockMigrationSessionCard summary={sessionPlaceholder.summary} />

      <StockMigrationOperatorPanel operator={operator} />

      <div className="stock-migration-main">
        <div className="stock-migration-main-column">
          <section className="panel staff-panel stock-migration-panel" aria-label="Migration pipeline">
            <div className="stock-migration-panel-header">
              <h3 className="stock-migration-panel-title">Pipeline</h3>
              <p className="stock-migration-panel-copy">
                Live stage status from the current workspace migration map.
              </p>
            </div>

            <ol className="stock-migration-timeline">
              {pipeline.map((item, index) => (
                <li
                  key={item.id}
                  className={`stock-migration-timeline-item ${pipelineStateClass(item.state)}`}
                >
                  <div className="stock-migration-timeline-marker" aria-hidden="true">
                    <span className="stock-migration-timeline-dot" />
                    {index < pipeline.length - 1 ? (
                      <span className="stock-migration-timeline-connector" />
                    ) : null}
                  </div>
                  <div className="stock-migration-timeline-body">
                    <div className="stock-migration-timeline-copy">
                      <p className="stock-migration-timeline-stage">{item.title}</p>
                      <p className="stock-migration-timeline-description">{item.description}</p>
                    </div>
                    <span className={`stock-migration-state-badge ${pipelineStateClass(item.state)}`}>
                      {item.state}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel staff-panel stock-migration-panel" aria-label="Execution controls">
            <div className="stock-migration-panel-header">
              <h3 className="stock-migration-panel-title">Execution</h3>
              <p className="stock-migration-panel-copy">
                Operator actions stay disabled until live controls are wired.
              </p>
            </div>

            <div className="stock-migration-actions">
              {EXECUTION_ACTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="ghost-btn stock-migration-action-btn"
                  disabled
                  aria-disabled="true"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="panel staff-panel stock-migration-panel stock-migration-status-panel" aria-label="Migration status">
          <div className="stock-migration-panel-header">
            <h3 className="stock-migration-panel-title">Migration Status</h3>
            <p className="stock-migration-panel-copy">Live read-only status for the current workspace.</p>
          </div>

          <dl className="stock-migration-status-list">
            <div className="stock-migration-status-row">
              <dt>Status</dt>
              <dd>{migrationStatus}</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Total Progress</dt>
              <dd>{progressPercent === null ? 'Unknown' : `${progressPercent}%`}</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Current Stage</dt>
              <dd>{currentStage}</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Health Score</dt>
              <dd>
                {metricsAvailable && health?.score !== null && health?.score !== undefined
                  ? `${health.score}%`
                  : 'Unknown'}
              </dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Readiness</dt>
              <dd>{metricsAvailable ? (health?.readiness ?? 'Unknown') : 'Unknown'}</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Last Refresh</dt>
              <dd>{formatLastUpdated(fetchedAt)}</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Manual Queue Size</dt>
              <dd>{metricsAvailable ? formatMetricValue(metrics.manualReview) : 'Unknown'}</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Attention Items</dt>
              <dd>{metricsAvailable ? formatMetricValue(attentionRows.length) : 'Unknown'}</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Environment</dt>
              <dd>Production</dd>
            </div>
            <div className="stock-migration-status-row">
              <dt>Workspace</dt>
              <dd>{displayWorkspace}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <StockMigrationManualReviewQueue
        rows={manualReviewRows}
        metricsAvailable={metricsAvailable}
      />

      <StockMigrationAttentionQueue
        rows={attentionRows}
        metricsAvailable={metricsAvailable}
      />

      <section className="panel staff-panel stock-migration-panel" aria-label="Future activity log">
        <div className="stock-migration-panel-header">
          <h3 className="stock-migration-panel-title">Future Activity Log</h3>
          <p className="stock-migration-panel-copy">
            Operator actions and stage results will appear here.
          </p>
        </div>

        <div className="stock-migration-log-wrap">
          <table className="stock-migration-log-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Stage</th>
                <th scope="col">Result</th>
                <th scope="col">Operator</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="stock-migration-log-empty">
                  No activity yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { buildInventoryMigrationSessionPlaceholder, MIGRATION_SESSION_STATUS } from '../../lib/inventoryMigrationSession'
import { getInventoryMigrationMetrics } from '../../services/inventoryMigrationMetricsService'
import { getInventoryMigrationActivity } from '../../services/inventoryMigrationActivityService'
import { getInventoryMigrationSessionSummary } from '../../services/inventoryMigrationSessionService'
import { getInventoryMigrationSessionSteps } from '../../services/inventoryMigrationSessionStepsService'
import { getInventoryMigrationStepResults } from '../../services/inventoryMigrationStepResultsService'
import { getInventoryMigrationStageAttentionAcknowledgements } from '../../services/inventoryMigrationStageAttentionAcknowledgementsService'
import { StockMigrationActivityLog } from './StockMigrationActivityLog'
import { StockMigrationAdvancedDiagnostics } from './StockMigrationAdvancedDiagnostics'
import { StockMigrationAttentionQueue } from './StockMigrationAttentionQueue'
import { StockMigrationGuidedWorkflow } from './StockMigrationGuidedWorkflow'
import { StockMigrationHealthPanel } from './StockMigrationHealthPanel'
import { StockMigrationManualReviewWorkspace } from './StockMigrationManualReviewWorkspace'
import { StockMigrationOperatorPanel } from './StockMigrationOperatorPanel'
import { StockMigrationPreflightWorkspace } from './StockMigrationPreflightWorkspace'
import { StockMigrationSessionCard } from './StockMigrationSessionCard'
import { StockMigrationSessionSteps } from './StockMigrationSessionSteps'

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
  const [sessionSummary, setSessionSummary] = useState(
    () => buildInventoryMigrationSessionPlaceholder().summary,
  )
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [sessionUnavailable, setSessionUnavailable] = useState(false)
  const [sessionAvailable, setSessionAvailable] = useState(false)
  const [activityRows, setActivityRows] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityUnavailable, setActivityUnavailable] = useState(false)
  const [activityAvailable, setActivityAvailable] = useState(false)
  const [sessionStepRows, setSessionStepRows] = useState([])
  const [sessionStepsLoading, setSessionStepsLoading] = useState(false)
  const [sessionStepsError, setSessionStepsError] = useState('')
  const [sessionStepsUnavailable, setSessionStepsUnavailable] = useState(false)
  const [sessionStepsAvailable, setSessionStepsAvailable] = useState(false)
  const [sessionStepResults, setSessionStepResults] = useState([])
  const [stageAttentionAcknowledgements, setStageAttentionAcknowledgements] = useState([])
  const [reloadNonce, setReloadNonce] = useState(0)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const pageRef = useRef(null)
  const diagnosticsOpenRef = useRef(false)

  diagnosticsOpenRef.current = diagnosticsOpen

  const refreshMigrationState = useCallback(() => {
    setReloadNonce((current) => current + 1)
  }, [])

  // Expand diagnostics before Manual Review checkpoint scroll (StageNavigator untouched).
  useEffect(() => {
    const root = pageRef.current
    if (!root) return undefined

    function onCheckpointClickCapture(event) {
      const target = event.target
      if (!target || typeof target.closest !== 'function') return
      const link = target.closest('.stock-migration-guided-checkpoint-link')
      if (!link || !root.contains(link)) return
      if (diagnosticsOpenRef.current) return

      event.preventDefault()
      event.stopPropagation()
      setDiagnosticsOpen(true)

      window.setTimeout(() => {
        const workspace = document.querySelector('.stock-migration-review-workspace')
        if (workspace && typeof workspace.scrollIntoView === 'function') {
          workspace.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 240)
    }

    root.addEventListener('click', onCheckpointClickCapture, true)
    return () => {
      root.removeEventListener('click', onCheckpointClickCapture, true)
    }
  }, [])

  const resolvedSessionId = (
    sessionSummary?.sessionId && sessionSummary.sessionId !== '—'
      ? `${sessionSummary.sessionId}`
      : ''
  )
  const sessionRunning = sessionSummary?.statusKey === MIGRATION_SESSION_STATUS.RUNNING

  // Activity service is workspace-scoped; Operator Panel needs current-session rows only.
  // Filter preserves row objects and existing newest-first order.
  const operatorActivityRows = useMemo(() => {
    const list = Array.isArray(activityRows) ? activityRows : []
    if (!resolvedSessionId) return []
    return list.filter((row) => `${row?.sessionId ?? ''}`.trim() === resolvedSessionId)
  }, [activityRows, resolvedSessionId])

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
          setSessionSummary(buildInventoryMigrationSessionPlaceholder().summary)
          setSessionError('')
          setSessionUnavailable(false)
          setSessionAvailable(false)
          setSessionLoading(false)
          setActivityRows([])
          setActivityError('')
          setActivityUnavailable(false)
          setActivityAvailable(false)
          setActivityLoading(false)
          setSessionStepRows([])
          setSessionStepsError('')
          setSessionStepsUnavailable(false)
          setSessionStepsAvailable(false)
          setSessionStepsLoading(false)
          setSessionStepResults([])
          setStageAttentionAcknowledgements([])
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)
      setSessionLoading(true)
      setActivityLoading(true)
      setSessionStepsLoading(true)
      const [result, sessionResult, activityResult, stepsResult] = await Promise.all([
        getInventoryMigrationMetrics(workspaceId),
        getInventoryMigrationSessionSummary(workspaceId),
        getInventoryMigrationActivity(workspaceId),
        getInventoryMigrationSessionSteps(workspaceId),
      ])
      if (cancelled) return

      setMetrics(result.metrics)
      setManualReviewRows(Array.isArray(result.manualReviewRows) ? result.manualReviewRows : [])
      setAttentionRows(Array.isArray(result.attentionRows) ? result.attentionRows : [])
      setMetricsAvailable(Boolean(result.metricsAvailable))
      setTableReachable(Boolean(result.tableReachable))
      setFetchedAt(result.fetchedAt ?? null)
      setNoticeMessage(result.error ? result.error : '')
      setSessionSummary(
        sessionResult?.summary
          ?? buildInventoryMigrationSessionPlaceholder({ workspaceId }).summary,
      )
      setSessionError(sessionResult?.error ? `${sessionResult.error}` : '')
      setSessionUnavailable(Boolean(sessionResult?.unavailable))
      setSessionAvailable(Boolean(sessionResult?.sessionAvailable))
      setSessionLoading(false)
      setActivityRows(Array.isArray(activityResult?.rows) ? activityResult.rows : [])
      setActivityError(activityResult?.error ? `${activityResult.error}` : '')
      setActivityUnavailable(Boolean(activityResult?.unavailable))
      setActivityAvailable(Boolean(activityResult?.activityAvailable))
      setActivityLoading(false)
      setSessionStepRows(Array.isArray(stepsResult?.rows) ? stepsResult.rows : [])
      setSessionStepsError(stepsResult?.error ? `${stepsResult.error}` : '')
      setSessionStepsUnavailable(Boolean(stepsResult?.unavailable))
      setSessionStepsAvailable(Boolean(stepsResult?.stepsAvailable))
      setSessionStepsLoading(false)

      const activeSessionId = `${sessionResult?.session?.sessionId ?? ''}`.trim()
        || (
          sessionResult?.summary?.sessionId && sessionResult.summary.sessionId !== '—'
            ? `${sessionResult.summary.sessionId}`.trim()
            : ''
        )

      if (!activeSessionId) {
        setSessionStepResults([])
        setStageAttentionAcknowledgements([])
        setIsLoading(false)
        return
      }

      const [stepResultsResult, acknowledgementsResult] = await Promise.all([
        getInventoryMigrationStepResults(workspaceId, { sessionId: activeSessionId }),
        getInventoryMigrationStageAttentionAcknowledgements(workspaceId, {
          sessionId: activeSessionId,
        }),
      ])
      if (cancelled) return

      setSessionStepResults(Array.isArray(stepResultsResult?.rows) ? stepResultsResult.rows : [])
      setStageAttentionAcknowledgements(
        Array.isArray(acknowledgementsResult?.rows) ? acknowledgementsResult.rows : [],
      )
      setIsLoading(false)
    }

    loadMetrics()
    return () => {
      cancelled = true
    }
  }, [workspaceId, isWorkspaceReady, reloadNonce])

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

  const summaryCards = [
    { id: 'legacy', label: 'Legacy Items', value: metricsAvailable ? formatMetricValue(metrics.legacyItems) : 'Unknown' },
    { id: 'classified', label: 'Classified', value: metricsAvailable ? formatMetricValue(metrics.classified) : 'Unknown' },
    { id: 'auto-link', label: 'Auto Link', value: metricsAvailable ? formatMetricValue(metrics.autoLink) : 'Unknown' },
    { id: 'auto-create', label: 'Auto Create', value: metricsAvailable ? formatMetricValue(metrics.autoCreate) : 'Unknown' },
    { id: 'manual', label: 'Manual Review', value: metricsAvailable ? formatMetricValue(metrics.manualReview) : 'Unknown' },
    { id: 'completed', label: 'Completed', value: metricsAvailable ? formatMetricValue(metrics.completed) : 'Unknown' },
  ]

  return (
    <section
      ref={pageRef}
      className="stock-migration-page"
      aria-label="Inventory migration"
    >
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

      <StockMigrationGuidedWorkflow
        operator={operator}
        sessionSummary={sessionSummary}
        health={health}
        metrics={metrics}
        metricsAvailable={metricsAvailable}
        manualReviewCount={Array.isArray(manualReviewRows) ? manualReviewRows.length : 0}
        attentionCount={metricsAvailable ? attentionRows.length : 0}
      />

      <StockMigrationPreflightWorkspace
        workspaceLabel={displayWorkspace}
        metrics={metrics}
        metricsAvailable={metricsAvailable}
        tableReachable={tableReachable}
        health={health}
        auditEvidence={auditEvidence}
        attentionCount={metricsAvailable ? attentionRows.length : 0}
        acknowledgementCount={
          Array.isArray(stageAttentionAcknowledgements)
            ? stageAttentionAcknowledgements.length
            : 0
        }
        isLoading={isLoading}
      />

      <StockMigrationAdvancedDiagnostics
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      >
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

        <StockMigrationSessionCard
          summary={sessionSummary}
          isLoading={sessionLoading}
          errorMessage={sessionError}
          unavailable={sessionUnavailable}
          sessionAvailable={sessionAvailable}
        />

        <StockMigrationOperatorPanel
          operator={operator}
          workspaceId={workspaceId}
          sessionId={resolvedSessionId}
          sessionRunning={sessionRunning}
          sessionStepRows={sessionStepRows}
          sessionStepResults={sessionStepResults}
          stageAttentionAcknowledgements={stageAttentionAcknowledgements}
          activityRows={operatorActivityRows}
          isWorkspaceReady={isWorkspaceReady}
          onRefresh={refreshMigrationState}
        />

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

        <StockMigrationManualReviewWorkspace
          rows={manualReviewRows}
          metricsAvailable={metricsAvailable}
          isLoading={isLoading}
        />

        <StockMigrationAttentionQueue
          rows={attentionRows}
          metricsAvailable={metricsAvailable}
        />

        <StockMigrationSessionSteps
          rows={sessionStepRows}
          isLoading={sessionStepsLoading}
          errorMessage={sessionStepsError}
          unavailable={sessionStepsUnavailable}
          stepsAvailable={sessionStepsAvailable}
        />

        <StockMigrationActivityLog
          rows={activityRows}
          isLoading={activityLoading}
          errorMessage={activityError}
          unavailable={activityUnavailable}
          activityAvailable={activityAvailable}
        />
      </StockMigrationAdvancedDiagnostics>
    </section>
  )
}

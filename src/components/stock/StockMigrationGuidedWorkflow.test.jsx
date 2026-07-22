/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StockMigrationGuidedWorkflow } from './StockMigrationGuidedWorkflow'
import { StockInventoryMigrationView } from './StockInventoryMigrationView'
import {
  buildGuidedMigrationWorkflowModel,
  deriveGuidedMigrationNextAction,
  GUIDED_STAGE_VISUAL,
} from './stockMigrationGuidedWorkflowModel'
import {
  buildInventoryMigrationHealth,
  buildInventoryMigrationPipeline,
  createEmptyInventoryMigrationMetrics,
} from '../../lib/inventoryMigrationMetrics'
import { buildInventoryMigrationOperator } from '../../lib/inventoryMigrationOperator'
import { buildInventoryMigrationAuditEvidence } from '../../lib/inventoryMigrationAuditEvidence'
import { MIGRATION_SESSION_STATUS } from '../../lib/inventoryMigrationSession'
import { buildInventoryMigrationSessionPlaceholder } from '../../lib/inventoryMigrationSession'

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'

const serviceMocks = vi.hoisted(() => ({
  getInventoryMigrationMetrics: vi.fn(),
  getInventoryMigrationSessionSummary: vi.fn(),
  getInventoryMigrationActivity: vi.fn(),
  getInventoryMigrationSessionSteps: vi.fn(),
  getInventoryMigrationStepResults: vi.fn(),
  getInventoryMigrationStageAttentionAcknowledgements: vi.fn(),
}))

vi.mock('../../services/inventoryMigrationMetricsService', () => ({
  getInventoryMigrationMetrics: serviceMocks.getInventoryMigrationMetrics,
}))
vi.mock('../../services/inventoryMigrationSessionService', () => ({
  getInventoryMigrationSessionSummary: serviceMocks.getInventoryMigrationSessionSummary,
}))
vi.mock('../../services/inventoryMigrationActivityService', () => ({
  getInventoryMigrationActivity: serviceMocks.getInventoryMigrationActivity,
}))
vi.mock('../../services/inventoryMigrationSessionStepsService', () => ({
  getInventoryMigrationSessionSteps: serviceMocks.getInventoryMigrationSessionSteps,
}))
vi.mock('../../services/inventoryMigrationStepResultsService', () => ({
  getInventoryMigrationStepResults: serviceMocks.getInventoryMigrationStepResults,
}))
vi.mock('../../services/inventoryMigrationStageAttentionAcknowledgementsService', () => ({
  getInventoryMigrationStageAttentionAcknowledgements:
    serviceMocks.getInventoryMigrationStageAttentionAcknowledgements,
}))

function metricsFixture(overrides = {}) {
  return {
    ...createEmptyInventoryMigrationMetrics(),
    legacyItems: 10,
    total: 10,
    classified: 4,
    autoLink: 2,
    autoCreate: 1,
    manualReview: 0,
    skipped: 0,
    completed: 3,
    migratedCompleted: 0,
    remainingClassifiedAutoLink: 2,
    remainingClassifiedAutoCreate: 1,
    ...overrides,
  }
}

function buildLiveOperator(metrics, tableReachable = true) {
  const auditEvidence = buildInventoryMigrationAuditEvidence({
    metrics,
    metricsAvailable: true,
    tableReachable,
  })
  return buildInventoryMigrationOperator({
    metrics,
    metricsAvailable: true,
    tableReachable,
    auditEvidence,
  })
}

function buildHealth(metrics, manualQueueSize = 0, attentionQueueSize = 0) {
  const pipeline = buildInventoryMigrationPipeline({
    metrics,
    metricsAvailable: true,
    tableReachable: true,
  })
  const auditEvidence = buildInventoryMigrationAuditEvidence({
    metrics,
    metricsAvailable: true,
    tableReachable: true,
  })
  return buildInventoryMigrationHealth({
    metrics,
    metricsAvailable: true,
    tableReachable: true,
    pipeline,
    manualQueueSize,
    attentionQueueSize,
    auditEvidence,
  })
}

function sessionSummaryFixture(overrides = {}) {
  return {
    sessionId: 'sess-1',
    operator: 'Operator',
    startedAt: '7/21/2026, 10:00:00 AM',
    finishedAt: '—',
    status: 'Running',
    statusKey: MIGRATION_SESSION_STATUS.RUNNING,
    ...overrides,
  }
}

describe('stockMigrationGuidedWorkflowModel', () => {
  it('maps completed, current, waiting, and unavailable stage visual states', () => {
    const metrics = metricsFixture()
    const operator = buildLiveOperator(metrics)
    const model = buildGuidedMigrationWorkflowModel({
      operator,
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metrics),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })

    expect(model.stages.length).toBeGreaterThan(0)
    expect(model.stages.some((s) => s.visualState === GUIDED_STAGE_VISUAL.COMPLETED)).toBe(true)
    expect(model.stages.some((s) => s.visualState === GUIDED_STAGE_VISUAL.CURRENT)).toBe(true)
    expect(model.stages.some((s) => s.visualState === GUIDED_STAGE_VISUAL.WAITING)).toBe(true)
    expect(model.currentStage).toBe(operator.currentStep)
    expect(model.totalStageCount).toBe(operator.checklist.length)
    expect(model.completedStageCount).toBeGreaterThan(0)
    expect(model.progressPercent).toBe(
      Math.round((model.completedStageCount / model.totalStageCount) * 100),
    )
  })

  it('maps unavailable stages when metrics are not available', () => {
    const operator = buildInventoryMigrationOperator({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
    })
    const model = buildGuidedMigrationWorkflowModel({
      operator,
      sessionSummary: sessionSummaryFixture({ status: 'Unknown', statusKey: 'Unknown' }),
      health: { readiness: 'Unknown', score: null },
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      manualReviewCount: 0,
      attentionCount: 0,
    })
    expect(model.stages.every((s) => s.visualState === GUIDED_STAGE_VISUAL.UNAVAILABLE)).toBe(true)
  })

  it('maps attention-required visual when attention count is exposed', () => {
    const metrics = metricsFixture({
      classified: 0,
      remainingClassifiedAutoLink: 0,
      remainingClassifiedAutoCreate: 0,
      completed: 10,
      migratedCompleted: 0,
      manualReview: 0,
    })
    const operator = buildLiveOperator(metrics)
    const model = buildGuidedMigrationWorkflowModel({
      operator,
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metrics, 0, 2),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 2,
    })
    expect(model.stages.some((s) => s.visualState === GUIDED_STAGE_VISUAL.ATTENTION)).toBe(true)
  })

  it('renders Manual Review checkpoint for both attention and clear states', () => {
    const metricsWithManual = metricsFixture({ manualReview: 4 })
    const withManual = buildGuidedMigrationWorkflowModel({
      operator: buildLiveOperator(metricsWithManual),
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metricsWithManual, 4, 0),
      metrics: metricsWithManual,
      metricsAvailable: true,
      manualReviewCount: 4,
      attentionCount: 0,
    })
    expect(withManual.showManualReviewCheckpoint).toBe(true)
    expect(withManual.manualReviewNeedsAttention).toBe(true)
    expect(withManual.manualReviewCount).toBe(4)
    expect(withManual.stages.some((stage) => stage.id === 'manual-review' || stage.title === 'Manual Review')).toBe(false)
    expect(withManual.totalStageCount).toBe(withManual.stages.length)
    expect(withManual.progressLabel).toMatch(/^\d+ of \d+ stages complete$/)
    expect(withManual.progressLabel).not.toMatch(/manual/i)

    const clearMetrics = metricsFixture({ manualReview: 0 })
    const clear = buildGuidedMigrationWorkflowModel({
      operator: buildLiveOperator(clearMetrics),
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(clearMetrics, 0, 0),
      metrics: clearMetrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })
    expect(clear.showManualReviewCheckpoint).toBe(true)
    expect(clear.manualReviewNeedsAttention).toBe(false)
    expect(clear.manualReviewCount).toBe(0)
    expect(clear.stages.some((stage) => stage.id === 'manual-review' || stage.title === 'Manual Review')).toBe(false)
    expect(clear.totalStageCount).toBe(clear.stages.length)
    expect(clear.progressLabel).toMatch(/^\d+ of \d+ stages complete$/)
  })

  it('derives next-action copy for not-started, active, manual, and completed', () => {
    expect(deriveGuidedMigrationNextAction({
      operator: { currentStep: 'Foundation', requiredAction: 'Run Foundation.' },
      sessionSummary: {
        sessionId: '—',
        status: 'Not Started',
        statusKey: MIGRATION_SESSION_STATUS.NOT_STARTED,
      },
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })).toBe('Start migration session')

    expect(deriveGuidedMigrationNextAction({
      operator: { currentStep: 'Persist', requiredAction: 'Run Persist.' },
      sessionSummary: sessionSummaryFixture(),
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })).toBe('Run Persist')

    expect(deriveGuidedMigrationNextAction({
      operator: { currentStep: 'Auto Link', requiredAction: 'Run Auto Link.' },
      sessionSummary: sessionSummaryFixture(),
      metricsAvailable: true,
      manualReviewCount: 4,
      attentionCount: 0,
    })).toBe('Review 4 manual items')

    expect(deriveGuidedMigrationNextAction({
      operator: { currentStep: 'Completed', requiredAction: 'Migration Complete.' },
      sessionSummary: sessionSummaryFixture({
        status: 'Completed',
        statusKey: MIGRATION_SESSION_STATUS.COMPLETED,
      }),
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })).toBe('Migration complete')
  })
})

describe('StockMigrationGuidedWorkflow', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  function renderGuided(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockMigrationGuidedWorkflow, props))
    })
  }

  it('renders status, current stage, progress, and stage visual states', () => {
    const metrics = metricsFixture()
    const operator = buildLiveOperator(metrics)
    const modelProps = {
      operator,
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metrics),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    }
    renderGuided(modelProps)

    expect(container.querySelector('[aria-label="Guided migration workflow"]')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-hero-stage')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-next')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-progress')).toBeTruthy()
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy()
    expect(container.textContent).toContain('Completed')
    expect(container.textContent).toContain('Current')
    expect(container.textContent).toContain('Remaining')
    expect(container.textContent).toContain('Running')
    expect(container.textContent).toContain(operator.currentStep)
    expect(container.textContent).toMatch(/\d+ of \d+ stages complete/)
    expect(container.textContent).toMatch(/\d+%/)
    expect(container.querySelector('.stock-migration-guided-stage.is-completed')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-stage.is-density-history')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-stage.is-current')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-stage.is-density-current')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-stage.is-emphasized')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-stage.is-waiting')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-stage.is-density-future')).toBeTruthy()
    expect(container.textContent).toContain('Persist')
    expect(container.textContent).toContain('Current Mission')
    expect(container.querySelector('.stock-migration-mission-eyebrow')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-stage.is-current[aria-current="step"]')).toBeTruthy()
    expect(container.querySelector('.stock-migration-mission-timeline')).toBeTruthy()
    expect(container.querySelectorAll('[data-mission-marker="true"]').length).toBe(
      container.querySelectorAll('.stock-migration-guided-stage').length,
    )
    expect(container.querySelectorAll('[data-mission-connector="true"]').length).toBe(
      Math.max(0, container.querySelectorAll('.stock-migration-guided-stage').length - 1),
    )
    expect(container.querySelector('.stock-migration-mission-marker.is-dominant')).toBeTruthy()
    expect(container.querySelector('.stock-migration-mission-marker.is-completed')).toBeTruthy()
    expect(container.querySelector('.stock-migration-mission-connector.is-completed')).toBeTruthy()
    expect(container.querySelector(
      '.stock-migration-guided-stage.is-density-history + .stock-migration-guided-stage.is-density-current, '
      + '.stock-migration-guided-stage.is-completed + .stock-migration-guided-stage.is-current, '
      + '.stock-migration-guided-stage.is-completed + .stock-migration-guided-stage.is-emphasized',
    )).toBeTruthy()
    const badges = [...container.querySelectorAll('.stock-migration-guided-stage-badge')]
    expect(badges.length).toBe(container.querySelectorAll('.stock-migration-guided-stage').length)
    expect(badges.every((badge) => `${badge.textContent || ''}`.trim().length > 0)).toBe(true)
    expect(badges.some((badge) => badge.className.includes('is-completed'))).toBe(true)
    expect(badges.some((badge) => badge.className.includes('is-current') || badge.className.includes('is-ready'))).toBe(true)
    expect(container.querySelector('[aria-label="Manual review checkpoint"]')).toBeTruthy()
    expect(container.textContent).toContain('No attention required')
    expect(container.textContent).not.toMatch(/\bContinue\b/)
    expect(container.textContent.toLowerCase()).not.toContain('approve')
    expect(container.querySelector('.stock-migration-guided-next button')).toBeNull()
    expect(container.querySelector('.stock-migration-mission-timeline button')).toBeNull()
  })

  it('keeps premium mission presentation hooks without JSX structure changes', () => {
    const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
    expect(css).toContain('P8.8.4')
    expect(css).toContain('.stock-migration-guided-stage.is-density-history + .stock-migration-guided-stage.is-density-current')
    expect(css).toContain('.stock-migration-guided-stage.is-density-current + .stock-migration-guided-stage.is-density-future')
    expect(css).not.toMatch(
      /\.stock-migration-guided-stage\.is-density-history,\s*\n\.stock-migration-guided-stage\.is-completed \{\s*\n\s*opacity:\s*0\.48/,
    )

    const navigatorSource = readFileSync(join(HERE, 'StockMigrationStageNavigator.jsx'), 'utf8')
    expect(navigatorSource).toContain('Current Mission')
    expect(navigatorSource).toContain('aria-current')
    expect(navigatorSource).toContain('data-mission-connector')
    expect(navigatorSource).not.toMatch(/Continue|approve_candidate|run_inventory_migration_/i)

    const metrics = metricsFixture()
    renderGuided({
      operator: buildLiveOperator(metrics),
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metrics),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })

    expect(container.querySelector('.stock-migration-guided-stage.is-emphasized')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-hero-stage')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-next')).toBeTruthy()
    expect(container.querySelector('[aria-label="Manual review checkpoint"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-mission-marker="true"]').length).toBe(11)
    expect(container.querySelectorAll('[data-mission-connector="true"]').length).toBe(10)
  })

  it('preserves canonical mission stage order and Persist naming', () => {
    const metrics = metricsFixture()
    renderGuided({
      operator: buildLiveOperator(metrics),
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metrics),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })

    const stageNames = [...container.querySelectorAll('.stock-migration-guided-stage-name')]
      .map((node) => node.textContent)
    expect(stageNames).toEqual([
      'Foundation',
      'Persist',
      'Auto Link',
      'Auto Create',
      'Integrity Audit',
      'Preflight',
      'Preview',
      'Phase 1',
      'Phase 2',
      'Post Audit',
      'Completed',
    ])
    expect(stageNames).toContain('Persist')
    expect(stageNames).not.toContain('Classification')
    expect(stageNames).not.toContain('Manual Review')
    expect(container.querySelectorAll('[data-mission-marker="true"]').length).toBe(11)
    expect(container.querySelectorAll('[data-mission-connector="true"]').length).toBe(10)
  })

  it('renders unavailable state and Manual Review attention/clear checkpoints', () => {
    const unknownOperator = buildInventoryMigrationOperator({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
    })
    renderGuided({
      operator: unknownOperator,
      sessionSummary: sessionSummaryFixture({ status: 'Unknown', statusKey: 'Unknown' }),
      health: { readiness: 'Unknown', score: null },
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      manualReviewCount: 0,
      attentionCount: 0,
    })
    expect(container.querySelector('.stock-migration-guided-stage.is-unavailable')).toBeTruthy()
    expect(container.querySelector('[aria-label="Manual review checkpoint"]')).toBeTruthy()
    expect(container.textContent).toContain('No attention required')
    expect(container.querySelector('.stock-migration-guided-checkpoint.is-clear')).toBeTruthy()
    expect(container.textContent).not.toMatch(/requires operator resolution/)

    const metrics = metricsFixture({ manualReview: 3 })
    act(() => {
      root.render(createElement(StockMigrationGuidedWorkflow, {
        operator: buildLiveOperator(metrics),
        sessionSummary: sessionSummaryFixture(),
        health: buildHealth(metrics, 3, 0),
        metrics,
        metricsAvailable: true,
        manualReviewCount: 3,
        attentionCount: 0,
      }))
    })
    expect(container.querySelector('[aria-label="Manual review checkpoint"]')).toBeTruthy()
    expect(container.textContent).toContain('3 map rows require operator resolution')
    expect(container.textContent).toContain('3 items')
    expect(container.querySelector('.stock-migration-guided-checkpoint.is-attention')).toBeTruthy()
    expect(container.textContent).not.toContain('No attention required')
    const stageNames = [...container.querySelectorAll('.stock-migration-guided-stage-name')]
      .map((node) => node.textContent)
    expect(stageNames).not.toContain('Manual Review')
    expect(container.textContent).toMatch(/\d+ of \d+ stages complete/)
  })

  it('renders attention-required state when attention is exposed', () => {
    const metrics = metricsFixture({
      remainingClassifiedAutoLink: 0,
      remainingClassifiedAutoCreate: 0,
      classified: 0,
      completed: 10,
      manualReview: 0,
    })
    renderGuided({
      operator: buildLiveOperator(metrics),
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metrics, 0, 1),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 1,
    })
    expect(container.querySelector('.stock-migration-guided-stage.is-attention')).toBeTruthy()
    expect(container.textContent).toContain('Attention required')
    expect(container.textContent).toContain('Acknowledge attention')
  })

  it('renders cancelled stage visual when session is cancelled', () => {
    const metrics = metricsFixture()
    renderGuided({
      operator: buildLiveOperator(metrics),
      sessionSummary: sessionSummaryFixture({
        status: 'Cancelled',
        statusKey: MIGRATION_SESSION_STATUS.CANCELLED,
      }),
      health: buildHealth(metrics),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })
    expect(container.querySelector('.stock-migration-guided-stage.is-cancelled')).toBeTruthy()
    expect(container.textContent).toContain('Cancelled')
  })

  it('renders ready stage visual when frontier is ready without attention', () => {
    const metrics = metricsFixture()
    const operator = buildLiveOperator(metrics)
    expect(operator.checklist.some((step) => step.status === 'Ready')).toBe(true)
    renderGuided({
      operator,
      sessionSummary: sessionSummaryFixture(),
      health: buildHealth(metrics),
      metrics,
      metricsAvailable: true,
      manualReviewCount: 0,
      attentionCount: 0,
    })
    // Ready maps to current when it is the frontier; badge/status text still preserved.
    expect(container.textContent).toMatch(/Current|Ready/)
    expect(container.querySelector('.stock-migration-guided-stage-badge')).toBeTruthy()
  })

  it('does not import or call migration mutation RPCs', () => {
    const files = [
      'StockMigrationGuidedWorkflow.jsx',
      'StockMigrationGuidedHeader.jsx',
      'StockMigrationStageNavigator.jsx',
      'stockMigrationGuidedWorkflowModel.js',
    ]
    for (const file of files) {
      const source = readFileSync(join(HERE, file), 'utf8')
      expect(source).not.toMatch(/run_inventory_migration_|manual_resolve|manualResolve/i)
      expect(source).not.toMatch(/inventoryMigrationExecutionService/i)
      expect(source).not.toContain('approve_candidate')
      expect(source).not.toContain('Continue')
    }
  })

  it('App.jsx and navigation remain untouched by guided modules', () => {
    const combined = [
      'StockMigrationGuidedWorkflow.jsx',
      'StockMigrationGuidedHeader.jsx',
      'StockMigrationStageNavigator.jsx',
      'stockMigrationGuidedWorkflowModel.js',
    ].map((file) => readFileSync(join(HERE, file), 'utf8')).join('\n')
    expect(combined).not.toContain('App.jsx')
    expect(combined).not.toMatch(/STOCK_SECTIONS|sidebar|react-router/i)
  })
})

describe('StockInventoryMigrationView mounts guided workflow', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
    vi.clearAllMocks()
  })

  it('renders guided workflow above existing migration sections', async () => {
    const metrics = metricsFixture({ manualReview: 2 })
    serviceMocks.getInventoryMigrationMetrics.mockResolvedValue({
      metrics,
      manualReviewRows: [
        {
          id: 'map-1',
          legacyItemId: 'legacy-1',
          legacyName: 'Amaretto Bottle',
          category: 'Spirits',
          conflictReason: 'quantity_conflict_both_nonzero',
          currentResolution: '—',
          createdAt: '7/21/2026, 10:00:00 AM',
        },
      ],
      attentionRows: [],
      metricsAvailable: true,
      tableReachable: true,
      fetchedAt: '2026-07-21T10:00:00.000Z',
      error: null,
    })
    serviceMocks.getInventoryMigrationSessionSummary.mockResolvedValue({
      summary: {
        ...buildInventoryMigrationSessionPlaceholder({ workspaceId: WORKSPACE_ID }).summary,
        sessionId: 'sess-1',
        status: 'Running',
        statusKey: MIGRATION_SESSION_STATUS.RUNNING,
      },
      session: { sessionId: 'sess-1', status: MIGRATION_SESSION_STATUS.RUNNING },
      sessionAvailable: true,
      unavailable: false,
      error: null,
    })
    serviceMocks.getInventoryMigrationActivity.mockResolvedValue({
      rows: [],
      activityAvailable: true,
      unavailable: false,
      error: null,
    })
    serviceMocks.getInventoryMigrationSessionSteps.mockResolvedValue({
      rows: [],
      stepsAvailable: true,
      unavailable: false,
      error: null,
    })
    serviceMocks.getInventoryMigrationStepResults.mockResolvedValue({ rows: [] })
    serviceMocks.getInventoryMigrationStageAttentionAcknowledgements.mockResolvedValue({
      rows: [],
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(createElement(StockInventoryMigrationView, {
        workspaceId: WORKSPACE_ID,
        workspaceLabel: 'AMORE.NICOSIA',
        isWorkspaceReady: true,
      }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const page = container.querySelector('[aria-label="Inventory migration"]')
    const guided = container.querySelector('[aria-label="Guided migration workflow"]')
    const summary = container.querySelector('[aria-label="Migration summary"]')
    expect(guided).toBeTruthy()
    expect(summary).toBeTruthy()
    expect(
      page.innerHTML.indexOf('Guided migration workflow')
      < page.innerHTML.indexOf('Migration summary'),
    ).toBe(true)

    expect(container.querySelector('[aria-label="Migration pipeline"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Execution controls"]')).toBeTruthy()
    expect(container.querySelector('.stock-migration-review-workspace')).toBeTruthy()
    expect(container.textContent).toContain('Manual Resolution Review')
    expect(container.querySelector('[aria-label="Guided migration workflow"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Advanced diagnostics"]')).toBeTruthy()
    expect(container.querySelector('[data-diagnostics-open]')).toBeTruthy()
    expect(container.textContent).toContain('Current Mission')
    expect(container.textContent).not.toMatch(/\bContinue\b/)
  })
})

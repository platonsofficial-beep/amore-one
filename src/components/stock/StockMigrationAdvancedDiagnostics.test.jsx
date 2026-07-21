/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StockMigrationAdvancedDiagnostics } from './StockMigrationAdvancedDiagnostics'
import { StockInventoryMigrationView } from './StockInventoryMigrationView'
import { createEmptyInventoryMigrationMetrics } from '../../lib/inventoryMigrationMetrics'
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

function stubServices({ manualRows = [], attentionRows = [] } = {}) {
  serviceMocks.getInventoryMigrationMetrics.mockResolvedValue({
    metrics: {
      ...createEmptyInventoryMigrationMetrics(),
      legacyItems: 4,
      total: 4,
      classified: 1,
      completed: 1,
      manualReview: manualRows.length,
      remainingClassifiedAutoLink: 1,
      remainingClassifiedAutoCreate: 1,
    },
    manualReviewRows: manualRows,
    attentionRows,
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
}

describe('StockMigrationAdvancedDiagnostics', () => {
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

  it('stays collapsed by default and expands on toggle while keeping children mounted', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    let open = false
    function Harness() {
      return createElement(StockMigrationAdvancedDiagnostics, {
        open,
        onOpenChange: (next) => {
          open = next
          act(() => {
            root.render(createElement(Harness))
          })
        },
        children: createElement('div', {
          'data-testid': 'diagnostics-child',
          'aria-label': 'Migration operator',
        }, 'Operator stays mounted'),
      })
    }

    act(() => {
      root.render(createElement(Harness))
    })

    const shell = container.querySelector('[aria-label="Advanced diagnostics"]')
    const toggle = container.querySelector('.stock-migration-diagnostics-toggle')
    expect(shell).toBeTruthy()
    expect(shell.getAttribute('data-diagnostics-open')).toBe('false')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-testid="diagnostics-child"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration operator"]')).toBeTruthy()

    act(() => {
      toggle.click()
    })
    expect(container.querySelector('[aria-label="Advanced diagnostics"]')
      .getAttribute('data-diagnostics-open')).toBe('true')
    expect(container.querySelector('.stock-migration-diagnostics-toggle')
      .getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-testid="diagnostics-child"]')).toBeTruthy()
  })

  it('does not introduce backend or RPC imports', () => {
    const source = readFileSync(join(HERE, 'StockMigrationAdvancedDiagnostics.jsx'), 'utf8')
    expect(source).not.toMatch(/inventoryMigrationExecutionService|run_inventory_migration_/i)
    expect(source).not.toMatch(/from ['\"].*services\//)
  })
})

describe('StockInventoryMigrationView advanced diagnostics', () => {
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
    vi.useRealTimers()
  })

  async function renderView(manualRows = []) {
    stubServices({ manualRows })
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
  }

  it('keeps diagnostics collapsed by default with all panels mounted', async () => {
    await renderView([
      {
        id: 'map-1',
        legacyItemId: 'legacy-1',
        legacyName: 'Amaretto Bottle',
        category: 'Spirits',
        conflictReason: 'quantity_conflict_both_nonzero',
        currentResolution: '—',
        createdAt: '7/21/2026, 10:00:00 AM',
      },
    ])

    const diagnostics = container.querySelector('[aria-label="Advanced diagnostics"]')
    expect(diagnostics).toBeTruthy()
    expect(diagnostics.getAttribute('data-diagnostics-open')).toBe('false')
    expect(container.querySelector('[aria-label="Guided migration workflow"]')).toBeTruthy()
    expect(container.querySelector('.stock-migration-guided-hero-stage')).toBeTruthy()
    expect(container.querySelector('.stock-migration-mission-timeline')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration summary"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration health"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration session"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration operator"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration pipeline"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Execution controls"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration status"]')).toBeTruthy()
    expect(container.querySelector('.stock-migration-review-workspace')).toBeTruthy()
    expect(container.querySelector('[aria-label="Attention blocked queue"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration session steps"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration activity log"]')).toBeTruthy()
  })

  it('expands on toggle and expands before Manual Review scroll', async () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    await renderView([
      {
        id: 'map-1',
        legacyItemId: 'legacy-1',
        legacyName: 'Amaretto Bottle',
        category: 'Spirits',
        conflictReason: 'quantity_conflict_both_nonzero',
        currentResolution: '—',
        createdAt: '7/21/2026, 10:00:00 AM',
      },
    ])

    const toggle = container.querySelector('.stock-migration-diagnostics-toggle')
    act(() => {
      toggle.click()
    })
    expect(container.querySelector('[data-diagnostics-open="true"]')).toBeTruthy()

    act(() => {
      toggle.click()
    })
    expect(container.querySelector('[data-diagnostics-open="false"]')).toBeTruthy()

    const checkpointLink = container.querySelector('.stock-migration-guided-checkpoint-link')
    expect(checkpointLink).toBeTruthy()

    await act(async () => {
      checkpointLink.click()
    })
    expect(container.querySelector('[data-diagnostics-open="true"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration operator"]')).toBeTruthy()
    expect(container.querySelector('.stock-migration-review-workspace')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(260)
    })
    expect(scrollIntoView).toHaveBeenCalled()
  })
})

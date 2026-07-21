/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StockMigrationManualReviewWorkspace } from './StockMigrationManualReviewWorkspace'
import { StockInventoryMigrationView } from './StockInventoryMigrationView'
import { createEmptyInventoryMigrationMetrics } from '../../lib/inventoryMigrationMetrics'
import { buildInventoryMigrationSessionPlaceholder } from '../../lib/inventoryMigrationSession'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const HERE = dirname(fileURLToPath(import.meta.url))

const manualRowsFixture = Object.freeze([
  Object.freeze({
    id: 'map-aaa',
    legacyItemId: 'legacy-111',
    legacyName: 'Amaretto Bottle',
    category: 'Spirits',
    conflictReason: 'quantity_conflict_both_nonzero',
    currentResolution: '—',
    createdAt: '7/21/2026, 10:00:00 AM',
  }),
  Object.freeze({
    id: 'map-bbb',
    legacyItemId: 'legacy-222',
    legacyName: 'Orange Syrup',
    category: 'Syrups & Purées',
    conflictReason: 'ambiguous_supplier',
    currentResolution: '—',
    createdAt: '7/21/2026, 10:05:00 AM',
  }),
])

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

function stubServices(manualRows = []) {
  serviceMocks.getInventoryMigrationMetrics.mockResolvedValue({
    metrics: {
      ...createEmptyInventoryMigrationMetrics(),
      manualReview: manualRows.length,
    },
    manualReviewRows: manualRows,
    attentionRows: [],
    metricsAvailable: true,
    tableReachable: true,
    fetchedAt: '2026-07-21T10:00:00.000Z',
    error: null,
  })
  serviceMocks.getInventoryMigrationSessionSummary.mockResolvedValue({
    summary: buildInventoryMigrationSessionPlaceholder({ workspaceId: WORKSPACE_ID }).summary,
    session: null,
    sessionAvailable: false,
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

function setInputValue(input, value) {
  const proto = Object.getPrototypeOf(input)
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('StockMigrationManualReviewWorkspace', () => {
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

  function renderWorkspace(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockMigrationManualReviewWorkspace, props))
    })
  }

  it('1. loading state renders', () => {
    renderWorkspace({ rows: [], metricsAvailable: true, isLoading: true })
    expect(container.textContent).toContain('Loading manual review')
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('2. no-manual-rows empty state renders', () => {
    renderWorkspace({ rows: [], metricsAvailable: true, isLoading: false })
    expect(container.textContent).toContain('No manual review items')
  })

  it('3–4. split workspace and row count render when rows exist', () => {
    renderWorkspace({
      rows: manualRowsFixture,
      metricsAvailable: true,
      isLoading: false,
    })
    expect(container.querySelector('.stock-migration-review-split')).toBeTruthy()
    expect(container.textContent).toContain('2 items')
    expect(container.textContent).toContain('2 rows')
    expect(container.textContent).toContain('Amaretto Bottle')
    expect(container.textContent).toContain('Orange Syrup')
  })

  it('5–6. search filters case-insensitively and shows no-results', () => {
    renderWorkspace({
      rows: manualRowsFixture,
      metricsAvailable: true,
      isLoading: false,
    })
    const input = container.querySelector('.stock-migration-review-search-input')
    act(() => {
      setInputValue(input, '  AMARETTO  ')
    })
    expect(container.textContent).toContain('Amaretto Bottle')
    expect(container.textContent).not.toContain('Orange Syrup')
    expect(container.textContent).toContain('1 row matching')

    act(() => {
      setInputValue(input, 'zzzz-no-match')
    })
    expect(container.textContent).toContain('No matching rows')
  })

  it('7–11. selection updates inspector; placeholders and no-selection work', () => {
    renderWorkspace({
      rows: manualRowsFixture,
      metricsAvailable: true,
      isLoading: false,
    })
    expect(container.textContent).toContain('Select a row')

    const options = container.querySelectorAll('[role="option"]')
    expect(options.length).toBe(2)

    act(() => {
      options[0].click()
    })

    expect(options[0].getAttribute('aria-selected')).toBe('true')
    expect(options[0].className).toContain('is-selected')
    expect(container.textContent).toContain('Legacy item ID')
    expect(container.textContent).toContain('legacy-111')
    expect(container.textContent).toContain('quantity_conflict_both_nonzero')
    expect(container.textContent).toContain('Supplier')
    expect(container.textContent).toContain('Confidence')
    const fieldValues = [...container.querySelectorAll('.stock-migration-review-field dd')]
      .map((node) => node.textContent)
    expect(fieldValues.filter((value) => value === '—').length).toBeGreaterThan(0)
  })

  it('12–16. no mutation controls render', () => {
    renderWorkspace({
      rows: manualRowsFixture,
      metricsAvailable: true,
      isLoading: false,
    })
    const text = container.textContent.toLowerCase()
    expect(text).not.toMatch(/\bapprove\b/)
    expect(text).not.toContain('force create')
    expect(text).not.toContain('force_create')
    expect(text).not.toContain('reset_manual')
    expect(container.querySelector('button[type="submit"]')).toBeNull()
    const labels = [...container.querySelectorAll('button')].map((btn) => btn.textContent.toLowerCase())
    expect(labels.some((label) => /\bskip\b/.test(label))).toBe(false)
    expect(labels.some((label) => /\breset\b/.test(label))).toBe(false)
  })

  it('17. does not import or call migration mutation RPCs', () => {
    const files = [
      'StockMigrationManualReviewWorkspace.jsx',
      'StockMigrationManualReviewList.jsx',
      'StockMigrationManualReviewInspector.jsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(HERE, file), 'utf8')
      expect(source).not.toMatch(/manual_resolve|manualResolve|run_inventory_migration_/i)
      expect(source).not.toMatch(/inventoryMigrationExecutionService/i)
      expect(source).not.toContain('approve_candidate')
      expect(source).not.toContain('force_create')
    }
  })

  it('19–20. App.jsx and navigation remain untouched by this workspace module', () => {
    const workspaceSource = readFileSync(join(HERE, 'StockMigrationManualReviewWorkspace.jsx'), 'utf8')
    const listSource = readFileSync(join(HERE, 'StockMigrationManualReviewList.jsx'), 'utf8')
    const inspectorSource = readFileSync(join(HERE, 'StockMigrationManualReviewInspector.jsx'), 'utf8')
    const combined = `${workspaceSource}\n${listSource}\n${inspectorSource}`
    expect(combined).not.toContain('App.jsx')
    expect(combined).not.toMatch(/STOCK_SECTIONS|sidebar|navigate\(|react-router/i)
  })
})

describe('StockInventoryMigrationView mounts review workspace', () => {
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

  it('18. existing migration content remains mounted with the new workspace', async () => {
    stubServices(manualRowsFixture)
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

    expect(container.querySelector('.stock-migration-review-workspace')).toBeTruthy()
    expect(container.querySelector('[aria-label="Migration status"]')).toBeTruthy()
    expect(container.textContent).toContain('Manual Resolution Review')
    expect(container.textContent).toContain('Amaretto Bottle')
    expect(container.textContent).toContain('Migration')
  })
})

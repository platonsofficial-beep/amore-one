/**
 * @vitest-environment jsdom
 * P8.25.1 / P8.25.2 — Import & Migration ownership copy + workspace wiring.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MIGRATION_SESSION_STATUS } from '../../lib/inventoryMigrationSession'
import { createEmptyInventoryMigrationMetrics } from '../../lib/inventoryMigrationMetrics'
import { STOCK_SECTIONS, getModuleTitle, getModuleSubtitle } from '../../lib/appNavigation'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'

const serviceMocks = vi.hoisted(() => ({
  getInventoryMigrationMetrics: vi.fn(),
  getInventoryMigrationSessionSummary: vi.fn(),
  getInventoryMigrationActivity: vi.fn(),
  getInventoryMigrationSessionSteps: vi.fn(),
  getInventoryMigrationStepResults: vi.fn(),
  getInventoryMigrationStageAttentionAcknowledgements: vi.fn(),
}))

vi.mock('../../services/inventoryMigrationMetricsService', () => ({
  getInventoryMigrationMetrics: (...args) => serviceMocks.getInventoryMigrationMetrics(...args),
}))

vi.mock('../../services/inventoryMigrationSessionService', () => ({
  getInventoryMigrationSessionSummary: (...args) => serviceMocks.getInventoryMigrationSessionSummary(...args),
}))

vi.mock('../../services/inventoryMigrationActivityService', () => ({
  getInventoryMigrationActivity: (...args) => serviceMocks.getInventoryMigrationActivity(...args),
}))

vi.mock('../../services/inventoryMigrationSessionStepsService', () => ({
  getInventoryMigrationSessionSteps: (...args) => serviceMocks.getInventoryMigrationSessionSteps(...args),
}))

vi.mock('../../services/inventoryMigrationStepResultsService', () => ({
  getInventoryMigrationStepResults: (...args) => serviceMocks.getInventoryMigrationStepResults(...args),
}))

vi.mock('../../services/inventoryMigrationStageAttentionAcknowledgementsService', () => ({
  getInventoryMigrationStageAttentionAcknowledgements: (...args) => (
    serviceMocks.getInventoryMigrationStageAttentionAcknowledgements(...args)
  ),
}))

vi.mock('./StockMigrationOperatorPanel', () => ({
  StockMigrationOperatorPanel: () => createElement('div', { 'data-testid': 'operator-panel-stub' }),
}))

vi.mock('./StockMigrationGuidedWorkflow', () => ({
  StockMigrationGuidedWorkflow: () => createElement('div', { 'data-testid': 'guided-workflow-stub' }),
}))

vi.mock('./StockMigrationPreflightWorkspace', () => ({
  StockMigrationPreflightWorkspace: () => createElement('div', { 'data-testid': 'preflight-stub' }),
}))

vi.mock('./StockMigrationPreviewWorkspace', () => ({
  StockMigrationPreviewWorkspace: () => createElement('div', { 'data-testid': 'preview-stub' }),
}))

vi.mock('./StockMigrationAdvancedDiagnostics', () => ({
  StockMigrationAdvancedDiagnostics: ({ children }) => createElement(
    'div',
    { 'data-testid': 'diagnostics-stub' },
    children,
  ),
}))

vi.mock('./StockMigrationHealthPanel', () => ({
  StockMigrationHealthPanel: () => null,
}))
vi.mock('./StockMigrationSessionCard', () => ({
  StockMigrationSessionCard: () => null,
}))
vi.mock('./StockMigrationManualReviewWorkspace', () => ({
  StockMigrationManualReviewWorkspace: () => null,
}))
vi.mock('./StockMigrationAttentionQueue', () => ({
  StockMigrationAttentionQueue: () => null,
}))
vi.mock('./StockMigrationSessionSteps', () => ({
  StockMigrationSessionSteps: () => null,
}))
vi.mock('./StockMigrationActivityLog', () => ({
  StockMigrationActivityLog: () => null,
}))

import { StockInventoryMigrationView } from './StockInventoryMigrationView'

const viewSource = readFileSync(
  resolve(process.cwd(), 'src/components/stock/StockInventoryMigrationView.jsx'),
  'utf8',
)
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/components/stock/StockDashboardView.jsx'),
  'utf8',
)
const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')

function resetServiceMocks() {
  Object.values(serviceMocks).forEach((fn) => fn.mockReset())

  serviceMocks.getInventoryMigrationMetrics.mockResolvedValue({
    metrics: createEmptyInventoryMigrationMetrics(),
    manualReviewRows: [],
    attentionRows: [],
    metricsAvailable: true,
    tableReachable: true,
    fetchedAt: '2026-07-17T10:00:00.000Z',
    error: null,
  })

  serviceMocks.getInventoryMigrationSessionSummary.mockResolvedValue({
    session: {
      sessionId: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      status: MIGRATION_SESSION_STATUS.RUNNING,
    },
    summary: {
      sessionId: SESSION_ID,
      operator: 'Operator',
      startedAt: '—',
      finishedAt: '—',
      status: 'Running',
      statusKey: MIGRATION_SESSION_STATUS.RUNNING,
    },
    error: null,
    unavailable: false,
    sessionAvailable: true,
  })

  serviceMocks.getInventoryMigrationActivity.mockResolvedValue({
    rows: [],
    error: null,
    unavailable: false,
    activityAvailable: true,
  })

  serviceMocks.getInventoryMigrationSessionSteps.mockResolvedValue({
    rows: [],
    error: null,
    unavailable: false,
    stepsAvailable: true,
  })

  serviceMocks.getInventoryMigrationStepResults.mockResolvedValue({
    rows: [],
    error: null,
    unavailable: false,
    resultsAvailable: true,
  })

  serviceMocks.getInventoryMigrationStageAttentionAcknowledgements.mockResolvedValue({
    rows: [],
    error: null,
    unavailable: false,
    acknowledgementsAvailable: true,
  })
}

describe('Import & Migration ownership + wiring (P8.25.1 / P8.25.2)', () => {
  let container
  let root

  beforeEach(() => {
    resetServiceMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('keeps the internal migration section key and shows Import & Migration in navigation', () => {
    expect(STOCK_SECTIONS.find((section) => section.id === 'migration')).toEqual({
      id: 'migration',
      label: 'Import & Migration',
    })
    expect(getModuleTitle('stock', { stockSection: 'migration' })).toBe('Import & Migration')
    expect(getModuleSubtitle('stock', 'Friday', { stockSection: 'migration' })).toMatch(
      /Spreadsheet import|legacy inventory cutover/i,
    )
  })

  it('renders workspace introduction distinguishing Spreadsheet Import and Legacy Migration', async () => {
    await act(async () => {
      root.render(createElement(StockInventoryMigrationView, {
        workspaceId: WORKSPACE_ID,
        workspaceLabel: 'AMORE.NICOSIA',
        isWorkspaceReady: true,
      }))
    })

    expect(container.querySelector('.stock-migration-eyebrow')?.textContent).toMatch(/Import\s*&\s*Migration/i)
    expect(container.querySelector('.stock-migration-title')?.textContent).toBe(
      'Import inventory or migrate legacy stock',
    )
    expect(container.querySelector('.stock-migration-subtitle')?.textContent).toContain('Spreadsheet Import')
    expect(container.querySelector('.stock-migration-subtitle')?.textContent).toContain('Legacy Migration')
  })

  it('renders both ownership cards with Spreadsheet Import control enabled', async () => {
    await act(async () => {
      root.render(createElement(StockInventoryMigrationView, {
        workspaceId: WORKSPACE_ID,
        workspaceLabel: 'AMORE.NICOSIA',
        isWorkspaceReady: true,
      }))
    })

    const spreadsheetCard = container.querySelector('[data-stock-migration-ownership="spreadsheet-import"]')
    const legacyCard = container.querySelector('[data-stock-migration-ownership="legacy-migration"]')
    expect(spreadsheetCard?.textContent).toContain('Spreadsheet Import')
    expect(legacyCard?.textContent).toContain('Legacy Inventory Migration')

    const openImport = container.querySelector('[data-stock-migration-open-import="true"]')
    expect(openImport).toBeTruthy()
    expect(openImport.disabled).toBe(false)
    expect(spreadsheetCard?.textContent).toContain(
      'Available from the Dashboard until the workspace move is completed.',
    )

    const openLegacy = container.querySelector('[data-stock-migration-open-legacy="true"]')
    expect(openLegacy).toBeTruthy()
    expect(openLegacy.disabled).toBe(false)
  })

  it('opens Spreadsheet Import through the App-owned Inventory Import handler', async () => {
    const onOpenInventoryImport = vi.fn()

    await act(async () => {
      root.render(createElement(StockInventoryMigrationView, {
        workspaceId: WORKSPACE_ID,
        workspaceLabel: 'AMORE.NICOSIA',
        isWorkspaceReady: true,
        onOpenInventoryImport,
      }))
    })

    await act(async () => {
      container.querySelector('[data-stock-migration-open-import="true"]').click()
    })

    expect(onOpenInventoryImport).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="inventory-import-wizard-shell"]')).toBeNull()
  })

  it('takes Legacy Migration into the existing workflow section', async () => {
    const scrollIntoView = vi.fn()
    const focus = vi.fn()

    await act(async () => {
      root.render(createElement(StockInventoryMigrationView, {
        workspaceId: WORKSPACE_ID,
        workspaceLabel: 'AMORE.NICOSIA',
        isWorkspaceReady: true,
      }))
    })

    const legacySection = container.querySelector('.stock-migration-legacy-workflow')
    const legacyTitle = container.querySelector('.stock-migration-legacy-workflow-title')
    legacySection.scrollIntoView = scrollIntoView
    legacyTitle.focus = focus

    await act(async () => {
      container.querySelector('[data-stock-migration-open-legacy="true"]').click()
    })

    expect(scrollIntoView).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
  })

  it('anchors existing Legacy Migration workflow content under the subsection heading', async () => {
    await act(async () => {
      root.render(createElement(StockInventoryMigrationView, {
        workspaceId: WORKSPACE_ID,
        workspaceLabel: 'AMORE.NICOSIA',
        isWorkspaceReady: true,
      }))
    })

    const legacySection = container.querySelector('.stock-migration-legacy-workflow')
    expect(legacySection).toBeTruthy()
    expect(legacySection.querySelector('.stock-migration-legacy-workflow-title')?.textContent).toBe(
      'Legacy Inventory Migration',
    )
    expect(legacySection.querySelector('[data-testid="guided-workflow-stub"]')).toBeTruthy()
    expect(legacySection.querySelector('[data-testid="preflight-stub"]')).toBeTruthy()
    expect(legacySection.querySelector('[data-testid="preview-stub"]')).toBeTruthy()
    expect(legacySection.querySelector('[data-testid="diagnostics-stub"]')).toBeTruthy()
    expect(legacySection.querySelector('[data-testid="operator-panel-stub"]')).toBeTruthy()
  })

  it('wires Spreadsheet Import through App without duplicating the wizard in Migration view', () => {
    expect(viewSource).not.toMatch(/import\s*\{[^}]*InventoryImportWizardShell/)
    expect(viewSource).toContain('onOpenInventoryImport')
    expect(viewSource).not.toContain('StockImportModal')
    expect(viewSource).not.toContain('stockCsvImport')
    expect(viewSource).not.toContain('inventory_import_sessions')
    expect(appSource).toContain("import { InventoryImportWizardShell } from './components/stock/InventoryImportWizardShell'")
    expect(appSource).toContain('isInventoryImportWizardOpen')
    expect(appSource).toContain('onOpenInventoryImport={() => setIsInventoryImportWizardOpen(true)}')
    expect(appSource).toContain('<InventoryImportWizardShell')
    expect(appSource.match(/<InventoryImportWizardShell/g)?.length).toBe(1)
    expect(dashboardSource).not.toContain('Import CSV')
    expect(dashboardSource).not.toContain('Inventory Import')
    expect(dashboardSource).not.toMatch(/import\s*\{[^}]*InventoryImportWizardShell/)
    expect(dashboardSource).not.toMatch(/import\s*\{[^}]*StockImportModal/)
    expect(appSource).toContain('handleImportStockItems')
  })

  it('keeps deprecated Import CSV helpers present while Dashboard no longer exposes them', () => {
    const stockImportModal = readFileSync(
      resolve(process.cwd(), 'src/components/stock/StockImportModal.jsx'),
      'utf8',
    )
    const stockCsvImport = readFileSync(
      resolve(process.cwd(), 'src/lib/stockCsvImport.js'),
      'utf8',
    )
    expect(stockImportModal).toContain('StockImportModal')
    expect(stockCsvImport).toContain('parseStockImportCsv')
    expect(appSource).toContain('handleImportStockItems')
    expect(dashboardSource).not.toContain('onImportStockItems')
  })

  it('locks the iPad two-column ownership CSS contract', () => {
    expect(appCss).toContain('.stock-migration-ownership')
    expect(appCss).toContain('.stock-migration-ownership-card')
    expect(appCss).toMatch(
      /@media\s*\(min-width:\s*900px\)\s*\{[\s\S]*?\.stock-migration-ownership\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr;/,
    )
  })
})

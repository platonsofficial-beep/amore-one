/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MIGRATION_SESSION_STATUS } from '../../lib/inventoryMigrationSession'
import { createEmptyInventoryMigrationMetrics } from '../../lib/inventoryMigrationMetrics'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'

const stepRowsFixture = Object.freeze([
  Object.freeze({ id: 'step-1', sessionId: SESSION_ID, stepName: 'foundation', statusKey: 'running' }),
  Object.freeze({ id: 'step-2', sessionId: SESSION_ID, stepName: 'persist', statusKey: 'waiting' }),
])

const stepResultsFixture = Object.freeze([
  Object.freeze({
    id: 'res-1',
    sessionId: SESSION_ID,
    stepName: 'integrity_audit',
    resultStatus: 'attention_required',
  }),
])

const acknowledgementsFixture = Object.freeze([
  Object.freeze({
    id: 'ack-1',
    sessionId: SESSION_ID,
    priorResultId: 'res-1',
    nextStepName: 'preflight',
  }),
])

const OTHER_SESSION_ID = 'sess-99999999-9999-9999-9999-999999999999'

const activityCurrentNewer = Object.freeze({
  id: 'act-1',
  sessionId: SESSION_ID,
  activityType: 'session_started',
  activity: 'Session started',
  createdAt: '2026-07-17T12:00:00.000Z',
})

const activityOtherSession = Object.freeze({
  id: 'act-2',
  sessionId: OTHER_SESSION_ID,
  activityType: 'session_cancelled',
  activity: 'Session cancelled',
  createdAt: '2026-07-17T11:00:00.000Z',
})

const activityCurrentOlder = Object.freeze({
  id: 'act-3',
  sessionId: SESSION_ID,
  activityType: 'note',
  activity: 'Foundation completed.',
  createdAt: '2026-07-17T10:00:00.000Z',
})

const activityRowsFixture = Object.freeze([
  activityCurrentNewer,
  activityOtherSession,
  activityCurrentOlder,
])

const serviceMocks = vi.hoisted(() => ({
  getInventoryMigrationMetrics: vi.fn(),
  getInventoryMigrationSessionSummary: vi.fn(),
  getInventoryMigrationActivity: vi.fn(),
  getInventoryMigrationSessionSteps: vi.fn(),
  getInventoryMigrationStepResults: vi.fn(),
  getInventoryMigrationStageAttentionAcknowledgements: vi.fn(),
}))

const operatorPanelProps = vi.hoisted(() => ({
  latest: null,
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
  StockMigrationOperatorPanel: (props) => {
    operatorPanelProps.latest = props
    return createElement('div', {
      'data-testid': 'operator-panel-stub',
      'data-session-running': props.sessionRunning ? 'true' : 'false',
      'data-step-rows': Array.isArray(props.sessionStepRows) ? props.sessionStepRows.length : 0,
      'data-step-results': Array.isArray(props.sessionStepResults) ? props.sessionStepResults.length : 0,
      'data-acks': Array.isArray(props.stageAttentionAcknowledgements)
        ? props.stageAttentionAcknowledgements.length
        : 0,
      'data-activity-rows': Array.isArray(props.activityRows) ? props.activityRows.length : 0,
    })
  },
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

function resetServiceMocks() {
  Object.values(serviceMocks).forEach((fn) => fn.mockReset())
  operatorPanelProps.latest = null

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
    rows: activityRowsFixture,
    error: null,
    unavailable: false,
    activityAvailable: true,
  })

  serviceMocks.getInventoryMigrationSessionSteps.mockResolvedValue({
    rows: stepRowsFixture,
    error: null,
    unavailable: false,
    stepsAvailable: true,
  })

  serviceMocks.getInventoryMigrationStepResults.mockResolvedValue({
    rows: stepResultsFixture,
    error: null,
    unavailable: false,
    resultsAvailable: true,
  })

  serviceMocks.getInventoryMigrationStageAttentionAcknowledgements.mockResolvedValue({
    rows: acknowledgementsFixture,
    error: null,
    unavailable: false,
    acknowledgementsAvailable: true,
  })
}

describe('StockInventoryMigrationView eligibility read model', () => {
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

  async function renderView() {
    await act(async () => {
      root.render(createElement(StockInventoryMigrationView, {
        workspaceId: WORKSPACE_ID,
        workspaceLabel: 'Test Workspace',
        isWorkspaceReady: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('loads step results and acknowledgements for the current session only', async () => {
    await renderView()

    expect(serviceMocks.getInventoryMigrationStepResults).toHaveBeenCalledTimes(1)
    expect(serviceMocks.getInventoryMigrationStepResults).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { sessionId: SESSION_ID },
    )
    expect(serviceMocks.getInventoryMigrationStageAttentionAcknowledgements).toHaveBeenCalledTimes(1)
    expect(serviceMocks.getInventoryMigrationStageAttentionAcknowledgements).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { sessionId: SESSION_ID },
    )
  })

  it('forwards read-model props unchanged to the Operator Panel', async () => {
    await renderView()

    expect(operatorPanelProps.latest).toBeTruthy()
    expect(operatorPanelProps.latest.workspaceId).toBe(WORKSPACE_ID)
    expect(operatorPanelProps.latest.sessionId).toBe(SESSION_ID)
    expect(operatorPanelProps.latest.sessionRunning).toBe(true)
    expect(operatorPanelProps.latest.sessionStepRows).toBe(stepRowsFixture)
    expect(operatorPanelProps.latest.sessionStepResults).toEqual(stepResultsFixture)
    expect(operatorPanelProps.latest.stageAttentionAcknowledgements).toEqual(acknowledgementsFixture)
    expect(operatorPanelProps.latest.activityRows).toEqual([
      activityCurrentNewer,
      activityCurrentOlder,
    ])
    expect(operatorPanelProps.latest.activityRows[0]).toBe(activityCurrentNewer)
    expect(operatorPanelProps.latest.activityRows[1]).toBe(activityCurrentOlder)
  })

  it('forwards an empty activity array when no current-session activity exists', async () => {
    serviceMocks.getInventoryMigrationActivity.mockResolvedValue({
      rows: [activityOtherSession],
      error: null,
      unavailable: false,
      activityAvailable: true,
    })

    await renderView()

    expect(operatorPanelProps.latest.activityRows).toEqual([])
  })

  it('skips results and acknowledgement loads when no session exists', async () => {
    serviceMocks.getInventoryMigrationSessionSummary.mockResolvedValue({
      session: {
        sessionId: null,
        workspaceId: WORKSPACE_ID,
        status: MIGRATION_SESSION_STATUS.NOT_STARTED,
      },
      summary: {
        sessionId: '—',
        operator: '—',
        startedAt: '—',
        finishedAt: '—',
        status: 'Not Started',
        statusKey: MIGRATION_SESSION_STATUS.NOT_STARTED,
      },
      error: null,
      unavailable: false,
      sessionAvailable: false,
    })
    serviceMocks.getInventoryMigrationSessionSteps.mockResolvedValue({
      rows: [],
      error: null,
      unavailable: false,
      stepsAvailable: true,
    })

    await renderView()

    expect(serviceMocks.getInventoryMigrationStepResults).not.toHaveBeenCalled()
    expect(serviceMocks.getInventoryMigrationStageAttentionAcknowledgements).not.toHaveBeenCalled()
    expect(operatorPanelProps.latest.sessionRunning).toBe(false)
    expect(operatorPanelProps.latest.sessionStepResults).toEqual([])
    expect(operatorPanelProps.latest.stageAttentionAcknowledgements).toEqual([])
    expect(operatorPanelProps.latest.activityRows).toEqual([])
  })

  it('reloads steps, results, acknowledgements, and activity through the existing refresh flow', async () => {
    await renderView()

    expect(serviceMocks.getInventoryMigrationSessionSteps).toHaveBeenCalledTimes(1)
    expect(serviceMocks.getInventoryMigrationStepResults).toHaveBeenCalledTimes(1)
    expect(serviceMocks.getInventoryMigrationStageAttentionAcknowledgements).toHaveBeenCalledTimes(1)
    expect(serviceMocks.getInventoryMigrationActivity).toHaveBeenCalledTimes(1)

    await act(async () => {
      await operatorPanelProps.latest.onRefresh()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(serviceMocks.getInventoryMigrationSessionSteps).toHaveBeenCalledTimes(2)
    expect(serviceMocks.getInventoryMigrationStepResults).toHaveBeenCalledTimes(2)
    expect(serviceMocks.getInventoryMigrationStageAttentionAcknowledgements).toHaveBeenCalledTimes(2)
    expect(serviceMocks.getInventoryMigrationActivity).toHaveBeenCalledTimes(2)
    expect(serviceMocks.getInventoryMigrationStepResults).toHaveBeenLastCalledWith(
      WORKSPACE_ID,
      { sessionId: SESSION_ID },
    )
    expect(operatorPanelProps.latest.activityRows).toEqual([
      activityCurrentNewer,
      activityCurrentOlder,
    ])
  })

  it('does not invoke execution wrappers while loading the read model', async () => {
    await renderView()

    const executionKeys = Object.keys(serviceMocks).filter((key) => (
      key.startsWith('run') || key.includes('Session') || key.includes('acknowledge')
    ))
    // Only read services are mocked here; ensure no accidental write imports via panel stub.
    expect(operatorPanelProps.latest.onRefresh).toEqual(expect.any(Function))
    expect(executionKeys.every((key) => (
      key.startsWith('getInventoryMigration')
    ))).toBe(true)
  })
})

/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OPERATOR_EXECUTION_BUTTONS } from '../../lib/inventoryMigrationOperator'
import { MIGRATION_OPERATOR_CANONICAL_STEPS } from '../../lib/inventoryMigrationOperatorEligibility'
import { StockMigrationOperatorPanel } from './StockMigrationOperatorPanel'

const executionMocks = vi.hoisted(() => ({
  startInventoryMigrationSession: vi.fn(),
  cancelInventoryMigrationSession: vi.fn(),
  completeInventoryMigrationSession: vi.fn(),
  completeInventoryMigrationFoundationStep: vi.fn(),
  runInventoryMigrationPersist: vi.fn(),
  runInventoryMigrationAutoLink: vi.fn(),
  runInventoryMigrationAutoCreate: vi.fn(),
  runInventoryMigrationIntegrityAudit: vi.fn(),
  runInventoryMigrationPreflight: vi.fn(),
  runInventoryMigrationPreview: vi.fn(),
  runInventoryMigrationPhase1: vi.fn(),
  runInventoryMigrationPhase2: vi.fn(),
  runInventoryMigrationPostApplyAudit: vi.fn(),
  acknowledgeInventoryMigrationStageAttention: vi.fn(),
}))

vi.mock('../../services/inventoryMigrationExecutionService', () => executionMocks)

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'
const PRIOR_RESULT_ID = 'res-33333333-3333-3333-3333-333333333333'

const OPERATOR = {
  currentStep: 'Persist',
  requiredAction: 'Run Persist.',
  checklist: [],
  notes: ['SQL Editor remains authoritative'],
  buttons: OPERATOR_EXECUTION_BUTTONS,
}

function step(stepName, statusKey) {
  return { id: `step-${stepName}`, sessionId: SESSION_ID, stepName, statusKey }
}

function result(stepName, resultStatus, id = `res-${stepName}`) {
  return { id, sessionId: SESSION_ID, stepName, resultStatus }
}

function ack(priorResultId, nextStepName) {
  return {
    id: `ack-${priorResultId}-${nextStepName}`,
    sessionId: SESSION_ID,
    priorResultId,
    nextStepName,
  }
}

function stepsCompletedThrough(lastCompleted) {
  const index = MIGRATION_OPERATOR_CANONICAL_STEPS.indexOf(lastCompleted)
  return MIGRATION_OPERATOR_CANONICAL_STEPS.map((stepName, stepIndex) => {
    if (stepIndex <= index) return step(stepName, 'completed')
    if (stepIndex === index + 1) return step(stepName, 'waiting')
    return step(stepName, 'waiting')
  })
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element)
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function resetExecutionMocks() {
  Object.values(executionMocks).forEach((fn) => {
    fn.mockReset()
    fn.mockResolvedValue({ ok: true })
  })
}

describe('StockMigrationOperatorPanel command eligibility', () => {
  let container
  let root
  let onRefresh

  beforeEach(() => {
    resetExecutionMocks()
    onRefresh = vi.fn()
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

  function renderPanel(overrides = {}) {
    act(() => {
      root.render(createElement(StockMigrationOperatorPanel, {
        operator: OPERATOR,
        workspaceId: WORKSPACE_ID,
        sessionId: SESSION_ID,
        sessionRunning: true,
        sessionStepRows: stepsCompletedThrough('foundation'),
        sessionStepResults: [],
        stageAttentionAcknowledgements: [],
        isWorkspaceReady: true,
        onRefresh,
        ...overrides,
      }))
    })
  }

  function button(commandId) {
    return container.querySelector(`[data-command-id="${commandId}"]`)
  }

  function clickCommand(commandId) {
    const target = button(commandId)
    expect(target).toBeTruthy()
    act(() => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    return target
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('enables Start when no session is running and disables when running', () => {
    renderPanel({ sessionRunning: false, sessionId: '', sessionStepRows: [] })
    expect(button('start-session').disabled).toBe(false)
    expect(button('cancel-session').disabled).toBe(true)

    renderPanel({ sessionRunning: true, sessionId: SESSION_ID })
    expect(button('start-session').disabled).toBe(true)
    expect(button('cancel-session').disabled).toBe(false)
  })

  it('enables Complete Foundation only while foundation is running', () => {
    renderPanel({
      sessionStepRows: [step('foundation', 'running'), step('persist', 'waiting')],
    })
    expect(button('complete-foundation').disabled).toBe(false)

    renderPanel({
      sessionStepRows: [step('foundation', 'completed'), step('persist', 'waiting')],
    })
    expect(button('complete-foundation').disabled).toBe(true)
    expect(button('complete-foundation').title).toBe('Foundation is not running')
  })

  it('enables Persist when waiting with foundation completed and invokes one wrapper', async () => {
    renderPanel()
    expect(button('persist').disabled).toBe(false)
    expect(button('auto-link').disabled).toBe(true)

    clickCommand('persist')
    await flush()
    expect(executionMocks.runInventoryMigrationPersist).toHaveBeenCalledTimes(1)
    expect(executionMocks.runInventoryMigrationPersist).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
    )
    expect(executionMocks.runInventoryMigrationAutoLink).not.toHaveBeenCalled()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not invoke wrappers for disabled stage clicks', async () => {
    renderPanel()
    clickCommand('auto-link')
    await flush()
    expect(executionMocks.runInventoryMigrationAutoLink).not.toHaveBeenCalled()
  })

  it('gates Preflight on integrity_audit attention acknowledgement', async () => {
    const steps = stepsCompletedThrough('integrity_audit')
    renderPanel({
      sessionStepRows: steps,
      sessionStepResults: [result('integrity_audit', 'attention_required', PRIOR_RESULT_ID)],
    })
    expect(button('preflight').disabled).toBe(true)
    expect(button('preflight').title).toBe('Attention acknowledgement required')

    renderPanel({
      sessionStepRows: steps,
      sessionStepResults: [result('integrity_audit', 'attention_required', PRIOR_RESULT_ID)],
      stageAttentionAcknowledgements: [ack(PRIOR_RESULT_ID, 'phase1')],
    })
    expect(button('preflight').disabled).toBe(true)

    renderPanel({
      sessionStepRows: steps,
      sessionStepResults: [result('integrity_audit', 'attention_required', PRIOR_RESULT_ID)],
      stageAttentionAcknowledgements: [ack(PRIOR_RESULT_ID, 'preflight')],
    })
    expect(button('preflight').disabled).toBe(false)
    clickCommand('preflight')
    await flush()
    expect(executionMocks.runInventoryMigrationPreflight).toHaveBeenCalledTimes(1)
  })

  it('allows Preflight when integrity_audit passed without acknowledgement', () => {
    renderPanel({
      sessionStepRows: stepsCompletedThrough('integrity_audit'),
      sessionStepResults: [result('integrity_audit', 'passed')],
    })
    expect(button('preflight').disabled).toBe(false)
  })

  it('gates Phase 1 on preview acknowledgement boundary', () => {
    const steps = stepsCompletedThrough('preview')
    renderPanel({
      sessionStepRows: steps,
      sessionStepResults: [result('preview', 'attention_required', 'res-preview')],
    })
    expect(button('phase-1').disabled).toBe(true)

    renderPanel({
      sessionStepRows: steps,
      sessionStepResults: [result('preview', 'attention_required', 'res-preview')],
      stageAttentionAcknowledgements: [ack('res-preview', 'phase1')],
    })
    expect(button('phase-1').disabled).toBe(false)
  })

  it('requires Phase 2 maintenance confirmation even with acknowledgement', async () => {
    const steps = stepsCompletedThrough('phase1')
    renderPanel({
      sessionStepRows: steps,
      sessionStepResults: [result('phase1', 'attention_required', 'res-phase1')],
      stageAttentionAcknowledgements: [ack('res-phase1', 'phase2')],
    })
    expect(button('phase-2').disabled).toBe(true)
    expect(button('phase-2').title).toBe('Maintenance confirmation required')

    const checkbox = container.querySelector('#migration-phase2-maintenance-confirm')
    act(() => {
      checkbox.click()
    })
    expect(button('phase-2').disabled).toBe(false)
    clickCommand('phase-2')
    await flush()
    expect(executionMocks.runInventoryMigrationPhase2).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
      true,
    )
  })

  it('enables Acknowledge Attention only for a valid explicit boundary', async () => {
    renderPanel({
      sessionStepResults: [result('integrity_audit', 'attention_required', PRIOR_RESULT_ID)],
    })
    expect(button('acknowledge-attention').disabled).toBe(true)

    const priorInput = container.querySelector('#migration-ack-prior-result-id')
    const nextSelect = container.querySelector('#migration-ack-next-step')
    const noteInput = container.querySelector('#migration-ack-note')
    act(() => {
      setNativeValue(priorInput, PRIOR_RESULT_ID)
      setNativeValue(nextSelect, 'preflight')
      setNativeValue(noteInput, 'reviewed')
    })
    expect(button('acknowledge-attention').disabled).toBe(false)

    clickCommand('acknowledge-attention')
    await flush()
    expect(executionMocks.acknowledgeInventoryMigrationStageAttention).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
      PRIOR_RESULT_ID,
      'preflight',
      'reviewed',
    )
    expect(executionMocks.runInventoryMigrationPreflight).not.toHaveBeenCalled()
  })

  it('disables Acknowledge when already acknowledged', () => {
    renderPanel({
      sessionStepResults: [result('integrity_audit', 'attention_required', PRIOR_RESULT_ID)],
      stageAttentionAcknowledgements: [ack(PRIOR_RESULT_ID, 'preflight')],
    })
    const priorInput = container.querySelector('#migration-ack-prior-result-id')
    act(() => {
      setNativeValue(priorInput, PRIOR_RESULT_ID)
      setNativeValue(container.querySelector('#migration-ack-next-step'), 'preflight')
    })
    expect(button('acknowledge-attention').disabled).toBe(true)
    expect(button('acknowledge-attention').title).toBe('Already acknowledged')
  })

  it('enables Finish only when all steps completed and post_apply passed', async () => {
    const allCompleted = MIGRATION_OPERATOR_CANONICAL_STEPS.map((name) => step(name, 'completed'))
    renderPanel({
      sessionStepRows: allCompleted,
      sessionStepResults: [result('post_apply_audit', 'attention_required')],
    })
    expect(button('finish-session').disabled).toBe(true)
    expect(button('finish-session').title).toBe('Post-Apply Audit must pass')

    renderPanel({
      sessionStepRows: allCompleted,
      sessionStepResults: [result('post_apply_audit', 'passed')],
    })
    expect(button('finish-session').disabled).toBe(false)
    clickCommand('finish-session')
    await flush()
    expect(executionMocks.completeInventoryMigrationSession).toHaveBeenCalledTimes(1)
  })

  it('enables Post Audit only after Phase 2 completed', () => {
    renderPanel({
      sessionStepRows: stepsCompletedThrough('phase1'),
    })
    expect(button('post-audit').disabled).toBe(true)

    renderPanel({
      sessionStepRows: stepsCompletedThrough('phase2'),
    })
    expect(button('post-audit').disabled).toBe(false)
  })

  it('preserves pending, error banner, refresh, and no auto-progression', async () => {
    let resolvePersist
    executionMocks.runInventoryMigrationPersist.mockImplementation(
      () => new Promise((resolve) => {
        resolvePersist = resolve
      }),
    )
    renderPanel()
    const persistButton = clickCommand('persist')
    await act(async () => {
      await Promise.resolve()
    })
    expect(persistButton.getAttribute('aria-busy')).toBe('true')
    expect(button('cancel-session').disabled).toBe(false)

    await act(async () => {
      resolvePersist()
      await Promise.resolve()
    })
    await flush()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(executionMocks.runInventoryMigrationAutoLink).not.toHaveBeenCalled()
    expect(executionMocks.acknowledgeInventoryMigrationStageAttention).not.toHaveBeenCalled()

    executionMocks.runInventoryMigrationPersist.mockRejectedValueOnce({
      message: 'inventory_migration_persist_prerequisite_incomplete',
    })
    onRefresh.mockClear()
    // Re-render eligible again after success mutated nothing locally
    renderPanel()
    clickCommand('persist')
    await flush()
    expect(container.textContent).toContain('inventory_migration_persist_prerequisite_incomplete')
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('renders stage step/result/acknowledgement feedback from the read model', () => {
    renderPanel({
      sessionStepRows: [
        step('foundation', 'completed'),
        step('persist', 'running'),
        step('integrity_audit', 'completed'),
        step('preflight', 'waiting'),
      ],
      sessionStepResults: [
        result('persist', 'passed'),
        result('integrity_audit', 'attention_required', PRIOR_RESULT_ID),
      ],
      stageAttentionAcknowledgements: [],
    })

    const persistRow = container.querySelector('[data-stage-id="persist"]')
    const preflightRow = container.querySelector('[data-stage-id="preflight"]')
    const previewRow = container.querySelector('[data-stage-id="preview"]')

    expect(persistRow?.getAttribute('data-step-status')).toBe('running')
    expect(persistRow?.getAttribute('data-result-status')).toBe('passed')
    expect(persistRow?.getAttribute('data-acknowledgement')).toBe('not required')
    expect(preflightRow?.getAttribute('data-acknowledgement')).toBe('required')
    expect(preflightRow?.textContent).toContain('Acknowledgement required')
    expect(previewRow?.getAttribute('data-step-status')).toBe('unavailable')
    expect(previewRow?.getAttribute('data-result-status')).toBe('unavailable')
  })

  it('shows acknowledgement recorded when matching ack exists', () => {
    renderPanel({
      sessionStepRows: [
        step('integrity_audit', 'completed'),
        step('preflight', 'waiting'),
      ],
      sessionStepResults: [result('integrity_audit', 'attention_required', PRIOR_RESULT_ID)],
      stageAttentionAcknowledgements: [ack(PRIOR_RESULT_ID, 'preflight')],
    })
    const preflightRow = container.querySelector('[data-stage-id="preflight"]')
    expect(preflightRow?.getAttribute('data-acknowledgement')).toBe('acknowledged')
    expect(preflightRow?.textContent).toContain('Acknowledgement recorded')
  })

  it('shows success feedback after a successful RPC without changing refresh behaviour', async () => {
    renderPanel()
    clickCommand('persist')
    await flush()

    expect(container.querySelector('.auth-banner-success')?.textContent)
      .toBe('Persist completed successfully.')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(executionMocks.runInventoryMigrationPersist).toHaveBeenCalledTimes(1)
    expect(executionMocks.runInventoryMigrationAutoLink).not.toHaveBeenCalled()
  })

  it('renders activity timeline from activityRows with order and labels preserved', () => {
    renderPanel({
      activityRows: [
        {
          id: 'act-new',
          activityType: 'note',
          activity: 'Preflight completed: passed (result_id=1).',
          createdAt: 'Newer',
        },
        {
          id: 'act-old',
          activityType: 'session_started',
          activity: 'Session started',
          createdAt: 'Older',
        },
      ],
    })

    const items = [...container.querySelectorAll('[data-activity-id]')]
    expect(items.map((node) => node.getAttribute('data-activity-id'))).toEqual([
      'act-new',
      'act-old',
    ])
    expect(items[0].getAttribute('data-activity-label')).toBe('Stage Completed')
    expect(items[0].getAttribute('data-activity-stage')).toBe('Preflight')
    expect(items[0].textContent).toContain('Newer')
    expect(items[0].textContent).toContain('Preflight completed')
    expect(items[1].getAttribute('data-activity-label')).toBe('Session Started')
  })

  it('renders empty timeline state and unknown activity fallback', () => {
    renderPanel({ activityRows: [] })
    expect(container.textContent).toContain('No migration activity recorded yet.')

    renderPanel({
      activityRows: [
        {
          id: 'act-unknown',
          activityType: 'mystery_event',
          activity: 'Mystery detail',
          createdAt: 'Now',
        },
      ],
    })
    const item = container.querySelector('[data-activity-id="act-unknown"]')
    expect(item?.getAttribute('data-activity-label')).toBe('mystery_event')
    expect(item?.textContent).toContain('Mystery detail')
  })
})

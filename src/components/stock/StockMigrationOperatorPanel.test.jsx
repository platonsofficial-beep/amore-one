/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OPERATOR_EXECUTION_BUTTONS } from '../../lib/inventoryMigrationOperator'
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

describe('StockMigrationOperatorPanel command integration', () => {
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
        isWorkspaceReady: true,
        onRefresh,
        ...overrides,
      }))
    })
  }

  function clickCommand(commandId) {
    const button = container.querySelector(`[data-command-id="${commandId}"]`)
    expect(button).toBeTruthy()
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    return button
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('invokes start session with workspace only and refreshes after success', async () => {
    renderPanel()
    clickCommand('start-session')
    await flush()

    expect(executionMocks.startInventoryMigrationSession).toHaveBeenCalledTimes(1)
    expect(executionMocks.startInventoryMigrationSession).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(executionMocks.runInventoryMigrationPersist).not.toHaveBeenCalled()
  })

  it('invokes cancel, foundation complete, and finish with workspace + session', async () => {
    renderPanel()

    clickCommand('cancel-session')
    await flush()
    expect(executionMocks.cancelInventoryMigrationSession).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
    )

    clickCommand('complete-foundation')
    await flush()
    expect(executionMocks.completeInventoryMigrationFoundationStep).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
    )

    clickCommand('finish-session')
    await flush()
    expect(executionMocks.completeInventoryMigrationSession).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
    )

    expect(onRefresh).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['persist', 'runInventoryMigrationPersist'],
    ['auto-link', 'runInventoryMigrationAutoLink'],
    ['auto-create', 'runInventoryMigrationAutoCreate'],
    ['integrity-audit', 'runInventoryMigrationIntegrityAudit'],
    ['preflight', 'runInventoryMigrationPreflight'],
    ['preview', 'runInventoryMigrationPreview'],
    ['phase-1', 'runInventoryMigrationPhase1'],
    ['post-audit', 'runInventoryMigrationPostApplyAudit'],
  ])('stage command %s calls only its wrapper', async (commandId, mockKey) => {
    renderPanel()
    clickCommand(commandId)
    await flush()

    expect(executionMocks[mockKey]).toHaveBeenCalledTimes(1)
    expect(executionMocks[mockKey]).toHaveBeenCalledWith(WORKSPACE_ID, SESSION_ID)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    const otherCalls = Object.entries(executionMocks)
      .filter(([key]) => key !== mockKey)
      .flatMap(([, fn]) => fn.mock.calls)
    expect(otherCalls).toHaveLength(0)
  })

  it('phase 2 forwards maintenance confirmation boolean exactly', async () => {
    renderPanel()
    const checkbox = container.querySelector('#migration-phase2-maintenance-confirm')
    expect(checkbox).toBeTruthy()

    clickCommand('phase-2')
    await flush()
    expect(executionMocks.runInventoryMigrationPhase2).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
      false,
    )

    resetExecutionMocks()
    onRefresh.mockClear()
    act(() => {
      checkbox.click()
    })
    expect(checkbox.checked).toBe(true)
    clickCommand('phase-2')
    await flush()
    expect(executionMocks.runInventoryMigrationPhase2).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
      true,
    )
  })

  it('acknowledge attention forwards exact prior result, next step, and optional note', async () => {
    renderPanel()

    const priorInput = container.querySelector('#migration-ack-prior-result-id')
    const nextSelect = container.querySelector('#migration-ack-next-step')
    const noteInput = container.querySelector('#migration-ack-note')

    act(() => {
      setNativeValue(priorInput, PRIOR_RESULT_ID)
      setNativeValue(nextSelect, 'phase1')
      setNativeValue(noteInput, 'reviewed')
    })

    clickCommand('acknowledge-attention')
    await flush()

    expect(executionMocks.acknowledgeInventoryMigrationStageAttention).toHaveBeenCalledTimes(1)
    expect(executionMocks.acknowledgeInventoryMigrationStageAttention).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SESSION_ID,
      PRIOR_RESULT_ID,
      'phase1',
      'reviewed',
    )
    expect(executionMocks.runInventoryMigrationPreflight).not.toHaveBeenCalled()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows loading on the clicked action only and surfaces errors without refresh', async () => {
    let resolvePersist
    executionMocks.runInventoryMigrationPersist.mockImplementation(
      () => new Promise((resolve) => {
        resolvePersist = resolve
      }),
    )

    renderPanel()
    const persistButton = clickCommand('persist')
    const autoLinkButton = container.querySelector('[data-command-id="auto-link"]')

    await act(async () => {
      await Promise.resolve()
    })

    expect(persistButton.getAttribute('aria-busy')).toBe('true')
    expect(persistButton.disabled).toBe(true)
    expect(autoLinkButton.disabled).toBe(false)
    expect(persistButton.textContent).toContain('Running')

    await act(async () => {
      resolvePersist()
      await Promise.resolve()
    })
    await flush()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    executionMocks.runInventoryMigrationAutoLink.mockRejectedValueOnce({
      message: 'inventory_migration_auto_link_prerequisite_incomplete',
    })
    onRefresh.mockClear()
    clickCommand('auto-link')
    await flush()

    expect(container.textContent).toContain('inventory_migration_auto_link_prerequisite_incomplete')
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does not auto-progress stages or auto-acknowledge after a stage succeeds', async () => {
    renderPanel()
    clickCommand('persist')
    await flush()

    expect(executionMocks.runInventoryMigrationPersist).toHaveBeenCalledTimes(1)
    expect(executionMocks.runInventoryMigrationAutoLink).not.toHaveBeenCalled()
    expect(executionMocks.acknowledgeInventoryMigrationStageAttention).not.toHaveBeenCalled()
  })
})

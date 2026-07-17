// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  MIGRATION_OPERATOR_CANONICAL_STEPS,
  findMatchingAttentionAcknowledgement,
  resolveMigrationOperatorCommandEligibility,
  selectMigrationSessionStep,
  selectMigrationStepResult,
} from './inventoryMigrationOperatorEligibility'

const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'
const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'

function step(stepName, statusKey, sessionId = SESSION_ID) {
  return { id: `step-${stepName}`, sessionId, stepName, statusKey }
}

function result(stepName, resultStatus, id = `res-${stepName}`, sessionId = SESSION_ID) {
  return { id, sessionId, stepName, resultStatus }
}

function ack(priorResultId, nextStepName, sessionId = SESSION_ID) {
  return { id: `ack-${priorResultId}-${nextStepName}`, sessionId, priorResultId, nextStepName }
}

function completedThrough(lastCompletedStep) {
  const index = MIGRATION_OPERATOR_CANONICAL_STEPS.indexOf(lastCompletedStep)
  return MIGRATION_OPERATOR_CANONICAL_STEPS.map((stepName, stepIndex) => {
    if (stepIndex < index) return step(stepName, 'completed')
    if (stepIndex === index) return step(stepName, 'completed')
    if (stepIndex === index + 1) return step(stepName, 'waiting')
    return step(stepName, 'waiting')
  })
}

describe('inventoryMigrationOperatorEligibility', () => {
  it('selects the unique session/step result row', () => {
    const rows = [
      result('preview', 'passed', 'res-other', 'other-session'),
      result('preview', 'attention_required', 'res-preview'),
    ]
    expect(selectMigrationStepResult(rows, SESSION_ID, 'preview')?.id).toBe('res-preview')
    expect(selectMigrationSessionStep([step('persist', 'waiting')], SESSION_ID, 'persist')?.statusKey)
      .toBe('waiting')
  })

  it('matches acknowledgements only on session + prior result + next step', () => {
    const rows = [
      ack('res-1', 'preflight', 'other'),
      ack('res-2', 'preflight'),
      ack('res-1', 'phase1'),
      ack('res-1', 'preflight'),
    ]
    expect(findMatchingAttentionAcknowledgement(rows, SESSION_ID, 'res-1', 'preflight')?.id)
      .toBe('ack-res-1-preflight')
  })

  describe('session lifecycle', () => {
    it('enables Start only when no session is running', () => {
      expect(resolveMigrationOperatorCommandEligibility('start-session', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: false,
      }).enabled).toBe(true)

      expect(resolveMigrationOperatorCommandEligibility('start-session', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
      })).toEqual({
        enabled: false,
        reason: 'A migration session is already running',
      })
    })

    it('enables Cancel only for a running session with ID', () => {
      expect(resolveMigrationOperatorCommandEligibility('cancel-session', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: false,
        sessionId: SESSION_ID,
      }).enabled).toBe(false)

      expect(resolveMigrationOperatorCommandEligibility('cancel-session', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
      }).enabled).toBe(true)
    })

    it('enables Complete Foundation only while foundation is running', () => {
      expect(resolveMigrationOperatorCommandEligibility('complete-foundation', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: [step('foundation', 'waiting')],
      }).reason).toBe('Foundation is not running')

      expect(resolveMigrationOperatorCommandEligibility('complete-foundation', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: [step('foundation', 'running')],
      }).enabled).toBe(true)
    })
  })

  describe('stage sequence', () => {
    it('enables a waiting stage only when predecessor is completed', () => {
      const rows = completedThrough('foundation')
      expect(resolveMigrationOperatorCommandEligibility('persist', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: rows,
      }).enabled).toBe(true)

      expect(resolveMigrationOperatorCommandEligibility('auto-link', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: rows,
      }).reason).toBe('Previous stage is not completed')
    })

    it('disables running and completed targets', () => {
      const rows = [
        step('foundation', 'completed'),
        step('persist', 'running'),
      ]
      expect(resolveMigrationOperatorCommandEligibility('persist', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: rows,
      }).reason).toBe('Stage is already running')

      expect(resolveMigrationOperatorCommandEligibility('persist', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: [
          step('foundation', 'completed'),
          step('persist', 'completed'),
        ],
      }).reason).toBe('Stage is already completed')
    })
  })

  describe.each([
    ['preflight', 'integrity_audit', 'integrity-audit'],
    ['phase-1', 'preview', 'preview'],
    ['phase-2', 'phase1', 'phase-1'],
  ])('attention gate for %s', (commandId, priorStep, _label) => {
    const nextStep = MIGRATION_OPERATOR_STAGE_COMMANDS_LOOKUP(commandId)

    function baseSteps() {
      const priorIndex = MIGRATION_OPERATOR_CANONICAL_STEPS.indexOf(priorStep)
      return MIGRATION_OPERATOR_CANONICAL_STEPS.map((stepName, index) => {
        if (index <= priorIndex) return step(stepName, 'completed')
        if (index === priorIndex + 1) return step(stepName, 'waiting')
        return step(stepName, 'waiting')
      })
    }

    it('allows passed prior without acknowledgement', () => {
      const eligibility = resolveMigrationOperatorCommandEligibility(commandId, {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: baseSteps(),
        sessionStepResults: [result(priorStep, 'passed')],
        confirmMaintenanceWindow: commandId === 'phase-2',
      })
      expect(eligibility.enabled).toBe(true)
    })

    it('blocks attention_required without matching acknowledgement', () => {
      const eligibility = resolveMigrationOperatorCommandEligibility(commandId, {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: baseSteps(),
        sessionStepResults: [result(priorStep, 'attention_required', 'res-attn')],
        confirmMaintenanceWindow: commandId === 'phase-2',
      })
      expect(eligibility).toEqual({
        enabled: false,
        reason: 'Attention acknowledgement required',
      })
    })

    it('allows exact matching acknowledgement only', () => {
      const prior = result(priorStep, 'attention_required', 'res-attn')
      const enabled = resolveMigrationOperatorCommandEligibility(commandId, {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: baseSteps(),
        sessionStepResults: [prior],
        stageAttentionAcknowledgements: [ack('res-attn', nextStep)],
        confirmMaintenanceWindow: commandId === 'phase-2',
      })
      expect(enabled.enabled).toBe(true)

      const wrongResult = resolveMigrationOperatorCommandEligibility(commandId, {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: baseSteps(),
        sessionStepResults: [prior],
        stageAttentionAcknowledgements: [ack('res-other', nextStep)],
        confirmMaintenanceWindow: commandId === 'phase-2',
      })
      expect(wrongResult.enabled).toBe(false)

      const unrelatedNext = nextStep === 'preflight' ? 'phase1' : 'preflight'
      const wrongNext = resolveMigrationOperatorCommandEligibility(commandId, {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: baseSteps(),
        sessionStepResults: [prior],
        stageAttentionAcknowledgements: [ack('res-attn', unrelatedNext)],
        confirmMaintenanceWindow: commandId === 'phase-2',
      })
      expect(wrongNext.enabled).toBe(false)
    })

    it('blocks when prior result is missing', () => {
      expect(resolveMigrationOperatorCommandEligibility(commandId, {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: baseSteps(),
        sessionStepResults: [],
        confirmMaintenanceWindow: commandId === 'phase-2',
      }).reason).toBe('Prior stage result is missing')
    })
  })

  it('requires maintenance confirmation for Phase 2 after attention prerequisites', () => {
    const steps = completedThrough('phase1')
    const prior = result('phase1', 'passed')
    expect(resolveMigrationOperatorCommandEligibility('phase-2', {
      workspaceId: WORKSPACE_ID,
      sessionRunning: true,
      sessionId: SESSION_ID,
      sessionStepRows: steps,
      sessionStepResults: [prior],
      confirmMaintenanceWindow: false,
    }).reason).toBe('Maintenance confirmation required')

    expect(resolveMigrationOperatorCommandEligibility('phase-2', {
      workspaceId: WORKSPACE_ID,
      sessionRunning: true,
      sessionId: SESSION_ID,
      sessionStepRows: steps,
      sessionStepResults: [prior],
      confirmMaintenanceWindow: true,
    }).enabled).toBe(true)
  })

  describe('acknowledge attention', () => {
    const prior = result('integrity_audit', 'attention_required', 'res-int')

    it('enables only a valid explicit V1 boundary without existing ack', () => {
      expect(resolveMigrationOperatorCommandEligibility('acknowledge-attention', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepResults: [prior],
        ackPriorResultId: 'res-int',
        ackNextStepName: 'preflight',
      }).enabled).toBe(true)
    })

    it('disables invalid and already-acknowledged cases', () => {
      expect(resolveMigrationOperatorCommandEligibility('acknowledge-attention', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepResults: [prior],
        ackPriorResultId: '',
        ackNextStepName: 'preflight',
      }).reason).toBe('Prior result ID is required')

      expect(resolveMigrationOperatorCommandEligibility('acknowledge-attention', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepResults: [result('integrity_audit', 'passed', 'res-pass')],
        ackPriorResultId: 'res-pass',
        ackNextStepName: 'preflight',
      }).reason).toBe('Prior result is not attention_required')

      expect(resolveMigrationOperatorCommandEligibility('acknowledge-attention', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepResults: [prior],
        ackPriorResultId: 'res-int',
        ackNextStepName: 'phase1',
      }).reason).toBe('Invalid next-step boundary')

      expect(resolveMigrationOperatorCommandEligibility('acknowledge-attention', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepResults: [prior],
        stageAttentionAcknowledgements: [ack('res-int', 'preflight')],
        ackPriorResultId: 'res-int',
        ackNextStepName: 'preflight',
      }).reason).toBe('Already acknowledged')
    })
  })

  describe('finish session', () => {
    it('requires all steps completed and post_apply passed', () => {
      const allCompleted = MIGRATION_OPERATOR_CANONICAL_STEPS.map((name) => step(name, 'completed'))
      expect(resolveMigrationOperatorCommandEligibility('finish-session', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: allCompleted,
        sessionStepResults: [result('post_apply_audit', 'attention_required')],
      }).reason).toBe('Post-Apply Audit must pass')

      expect(resolveMigrationOperatorCommandEligibility('finish-session', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: allCompleted,
        sessionStepResults: [result('post_apply_audit', 'passed')],
      }).enabled).toBe(true)

      expect(resolveMigrationOperatorCommandEligibility('finish-session', {
        workspaceId: WORKSPACE_ID,
        sessionRunning: true,
        sessionId: SESSION_ID,
        sessionStepRows: completedThrough('phase2'),
        sessionStepResults: [result('post_apply_audit', 'passed')],
      }).enabled).toBe(false)
    })
  })
})

function MIGRATION_OPERATOR_STAGE_COMMANDS_LOOKUP(commandId) {
  if (commandId === 'preflight') return 'preflight'
  if (commandId === 'phase-1') return 'phase1'
  if (commandId === 'phase-2') return 'phase2'
  return ''
}

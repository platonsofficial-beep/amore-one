import { describe, expect, it } from 'vitest'
import { MIGRATION_OPERATOR_CANONICAL_STEPS } from './inventoryMigrationOperatorEligibility'
import { buildMigrationOperatorSessionSummary } from './inventoryMigrationSessionSummary'

const SESSION_ID = 'sess-summary-1111-1111-1111-111111111111'

function step(stepName, statusKey, timestamps = {}) {
  return {
    id: `step-${stepName}`,
    sessionId: SESSION_ID,
    stepName,
    statusKey,
    startedAt: timestamps.startedAt ?? '—',
    completedAt: timestamps.completedAt ?? '—',
  }
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

function stepsThrough(lastCompleted, nextStatus = 'waiting') {
  const index = MIGRATION_OPERATOR_CANONICAL_STEPS.indexOf(lastCompleted)
  return MIGRATION_OPERATOR_CANONICAL_STEPS.map((stepName, stepIndex) => {
    if (stepIndex < index) return step(stepName, 'completed')
    if (stepIndex === index) return step(stepName, 'completed')
    if (stepIndex === index + 1) return step(stepName, nextStatus)
    return step(stepName, 'waiting')
  })
}

describe('buildMigrationOperatorSessionSummary', () => {
  it('renders Not Started status and unavailable values without a session', () => {
    const summary = buildMigrationOperatorSessionSummary({})
    expect(summary.status).toBe('Not Started')
    expect(summary.currentStage).toBe('—')
    expect(summary.startedAt).toBe('—')
    expect(summary.completedAt).toBe('—')
    expect(summary.totalStages).toBe(10)
    expect(summary.completedStages).toBe(0)
    expect(summary.waitingStages).toBe(0)
    expect(summary.runningStage).toBe('—')
    expect(summary.passedStages).toBe(0)
    expect(summary.attentionRequiredStages).toBe(0)
    expect(summary.acknowledgedAttentionItems).toBe(0)
    expect(summary.duration).toBe('—')
  })

  it('uses running step as current stage and running stage label', () => {
    const sessionStepRows = stepsThrough('foundation', 'running')
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: true,
      sessionStepRows,
    })
    expect(summary.status).toBe('Running')
    expect(summary.currentStage).toBe('Persist')
    expect(summary.runningStage).toBe('Persist')
    expect(summary.completedStages).toBe(1)
    expect(summary.waitingStages).toBe(8)
    expect(summary.duration).toBe('In progress')
  })

  it('uses first waiting after completed chain as current stage', () => {
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: true,
      sessionStepRows: stepsThrough('persist', 'waiting'),
    })
    expect(summary.currentStage).toBe('Auto Link')
    expect(summary.completedStages).toBe(2)
    expect(summary.waitingStages).toBe(8)
    expect(summary.runningStage).toBe('—')
  })

  it('marks current stage Completed when all steps are completed', () => {
    const sessionStepRows = MIGRATION_OPERATOR_CANONICAL_STEPS.map((stepName) => (
      step(stepName, 'completed', {
        startedAt: stepName === 'foundation' ? '2026-07-17T10:00:00.000Z' : '—',
        completedAt: stepName === 'post_apply_audit' ? '2026-07-17T10:05:30.000Z' : '—',
      })
    ))
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: false,
      sessionStepRows,
    })
    expect(summary.status).toBe('Completed')
    expect(summary.currentStage).toBe('Completed')
    expect(summary.completedStages).toBe(10)
    expect(summary.waitingStages).toBe(0)
    expect(summary.startedAt).toBe('2026-07-17T10:00:00.000Z')
    expect(summary.completedAt).toBe('2026-07-17T10:05:30.000Z')
    expect(summary.duration).toBe('5m 30s')
  })

  it('counts passed and attention-required results', () => {
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: true,
      sessionStepRows: stepsThrough('integrity_audit', 'waiting'),
      sessionStepResults: [
        result('foundation', 'passed'),
        result('persist', 'passed'),
        result('auto_link', 'passed'),
        result('auto_create', 'passed'),
        result('integrity_audit', 'attention_required'),
      ],
    })
    expect(summary.passedStages).toBe(4)
    expect(summary.attentionRequiredStages).toBe(1)
  })

  it('counts acknowledged attention items from acknowledgement rows', () => {
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: true,
      sessionStepRows: stepsThrough('integrity_audit', 'waiting'),
      sessionStepResults: [result('integrity_audit', 'attention_required', 'res-integrity')],
      stageAttentionAcknowledgements: [
        ack('res-integrity', 'preflight'),
        ack('res-other', 'phase1'),
      ],
    })
    expect(summary.acknowledgedAttentionItems).toBe(2)
  })

  it('shows In progress when duration timestamps are not calculable', () => {
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: true,
      sessionStepRows: [
        step('foundation', 'completed', { startedAt: 'not-a-timestamp' }),
        ...MIGRATION_OPERATOR_CANONICAL_STEPS.slice(1).map((stepName) => step(stepName, 'waiting')),
      ],
    })
    expect(summary.startedAt).toBe('not-a-timestamp')
    expect(summary.completedAt).toBe('—')
    expect(summary.duration).toBe('In progress')
  })

  it('shows unavailable completed at until all stages finish', () => {
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: true,
      sessionStepRows: [
        step('foundation', 'completed', { startedAt: '2026-07-17T10:00:00.000Z' }),
        ...MIGRATION_OPERATOR_CANONICAL_STEPS.slice(1).map((stepName) => step(stepName, 'waiting')),
      ],
    })
    expect(summary.startedAt).toBe('2026-07-17T10:00:00.000Z')
    expect(summary.completedAt).toBe('—')
    expect(summary.duration).toBe('In progress')
  })

  it('returns unavailable current stage when the frontier step is missing', () => {
    const summary = buildMigrationOperatorSessionSummary({
      sessionId: SESSION_ID,
      sessionRunning: true,
      sessionStepRows: [step('foundation', 'completed')],
    })
    expect(summary.currentStage).toBe('—')
    expect(summary.completedStages).toBe(1)
    expect(summary.waitingStages).toBe(0)
  })
})

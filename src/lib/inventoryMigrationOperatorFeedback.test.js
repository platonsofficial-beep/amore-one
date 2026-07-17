// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildMigrationOperatorStageFeedback,
  formatMigrationOperatorCommandSuccess,
} from './inventoryMigrationOperatorFeedback'

const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'

function step(stepName, statusKey) {
  return { id: `step-${stepName}`, sessionId: SESSION_ID, stepName, statusKey }
}

function result(stepName, resultStatus, id = `res-${stepName}`) {
  return { id, sessionId: SESSION_ID, stepName, resultStatus }
}

function ack(priorResultId, nextStepName) {
  return { id: `ack-${priorResultId}`, sessionId: SESSION_ID, priorResultId, nextStepName }
}

describe('inventoryMigrationOperatorFeedback', () => {
  it('renders waiting/running/completed and unavailable results', () => {
    const rows = buildMigrationOperatorStageFeedback({
      sessionId: SESSION_ID,
      sessionStepRows: [
        step('foundation', 'completed'),
        step('persist', 'running'),
        step('auto_link', 'waiting'),
      ],
      sessionStepResults: [
        result('persist', 'attention_required'),
      ],
    })

    const foundation = rows.find((row) => row.id === 'foundation')
    const persist = rows.find((row) => row.id === 'persist')
    const autoLink = rows.find((row) => row.id === 'auto_link')
    const preview = rows.find((row) => row.id === 'preview')

    expect(foundation).toMatchObject({
      stepStatus: 'completed',
      resultStatus: 'unavailable',
      acknowledgement: 'not required',
    })
    expect(persist).toMatchObject({
      stepStatus: 'running',
      resultStatus: 'attention_required',
      acknowledgement: 'not required',
    })
    expect(autoLink).toMatchObject({
      stepStatus: 'waiting',
      resultStatus: 'unavailable',
    })
    expect(preview).toMatchObject({
      stepStatus: 'unavailable',
      resultStatus: 'unavailable',
      acknowledgement: 'not required',
    })
  })

  it('marks acknowledgement required / acknowledged for V1 boundaries', () => {
    const required = buildMigrationOperatorStageFeedback({
      sessionId: SESSION_ID,
      sessionStepRows: [step('integrity_audit', 'completed'), step('preflight', 'waiting')],
      sessionStepResults: [result('integrity_audit', 'attention_required', 'res-int')],
    })
    expect(required.find((row) => row.id === 'preflight')?.acknowledgement).toBe('required')

    const acknowledged = buildMigrationOperatorStageFeedback({
      sessionId: SESSION_ID,
      sessionStepRows: [step('integrity_audit', 'completed'), step('preflight', 'waiting')],
      sessionStepResults: [result('integrity_audit', 'attention_required', 'res-int')],
      stageAttentionAcknowledgements: [ack('res-int', 'preflight')],
    })
    expect(acknowledged.find((row) => row.id === 'preflight')?.acknowledgement)
      .toBe('acknowledged')

    const passed = buildMigrationOperatorStageFeedback({
      sessionId: SESSION_ID,
      sessionStepRows: [step('integrity_audit', 'completed'), step('preflight', 'waiting')],
      sessionStepResults: [result('integrity_audit', 'passed', 'res-int')],
    })
    expect(passed.find((row) => row.id === 'preflight')?.acknowledgement).toBe('not required')
  })

  it('formats success labels for executed commands', () => {
    expect(formatMigrationOperatorCommandSuccess('persist'))
      .toBe('Persist completed successfully.')
    expect(formatMigrationOperatorCommandSuccess('acknowledge-attention'))
      .toBe('Acknowledge Attention completed successfully.')
  })
})

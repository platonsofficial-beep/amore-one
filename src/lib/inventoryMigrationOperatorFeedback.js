/**
 * Presentation-only stage execution feedback for the Migration Operator panel.
 * Uses already-loaded read-model rows. Does not change eligibility or invoke RPCs.
 */

import {
  MIGRATION_OPERATOR_ATTENTION_BOUNDARIES,
  MIGRATION_OPERATOR_CANONICAL_STEPS,
  findMatchingAttentionAcknowledgement,
  selectMigrationSessionStep,
  selectMigrationStepResult,
} from './inventoryMigrationOperatorEligibility'

const STAGE_LABELS = Object.freeze({
  foundation: 'Foundation',
  persist: 'Persist',
  auto_link: 'Auto Link',
  auto_create: 'Auto Create',
  integrity_audit: 'Integrity Audit',
  preflight: 'Preflight',
  preview: 'Preview',
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  post_apply_audit: 'Post-Apply Audit',
})

const BOUNDARY_BY_NEXT = Object.freeze(
  Object.fromEntries(
    MIGRATION_OPERATOR_ATTENTION_BOUNDARIES.map((boundary) => [
      boundary.nextStepName,
      boundary,
    ]),
  ),
)

function asText(value) {
  return `${value ?? ''}`.trim()
}

function normalizeStepStatus(statusKey) {
  const status = asText(statusKey)
  if (status === 'waiting' || status === 'running' || status === 'completed') {
    return status
  }
  return 'unavailable'
}

function normalizeResultStatus(resultStatus) {
  const status = asText(resultStatus)
  if (status === 'passed' || status === 'attention_required') {
    return status
  }
  return 'unavailable'
}

function resolveAcknowledgementState({
  stepName,
  sessionId,
  sessionStepResults,
  stageAttentionAcknowledgements,
}) {
  const boundary = BOUNDARY_BY_NEXT[stepName]
  if (!boundary) {
    return 'not required'
  }

  const priorResult = selectMigrationStepResult(
    sessionStepResults,
    sessionId,
    boundary.priorStepName,
  )
  if (!priorResult) {
    return 'not required'
  }

  const priorStatus = asText(priorResult.resultStatus)
  if (priorStatus === 'passed') {
    return 'not required'
  }
  if (priorStatus !== 'attention_required') {
    return 'not required'
  }

  const match = findMatchingAttentionAcknowledgement(
    stageAttentionAcknowledgements,
    sessionId,
    priorResult.id,
    boundary.nextStepName,
  )
  return match ? 'acknowledged' : 'required'
}

/**
 * Build one feedback row per canonical stage from loaded session state.
 */
export function buildMigrationOperatorStageFeedback({
  sessionId = '',
  sessionStepRows = [],
  sessionStepResults = [],
  stageAttentionAcknowledgements = [],
} = {}) {
  const steps = Array.isArray(sessionStepRows) ? sessionStepRows : []
  const results = Array.isArray(sessionStepResults) ? sessionStepResults : []
  const acknowledgements = Array.isArray(stageAttentionAcknowledgements)
    ? stageAttentionAcknowledgements
    : []

  return MIGRATION_OPERATOR_CANONICAL_STEPS.map((stepName) => {
    const stepRow = selectMigrationSessionStep(steps, sessionId, stepName)
    const resultRow = selectMigrationStepResult(results, sessionId, stepName)

    return {
      id: stepName,
      title: STAGE_LABELS[stepName] ?? stepName,
      stepStatus: stepRow ? normalizeStepStatus(stepRow.statusKey) : 'unavailable',
      resultStatus: resultRow
        ? normalizeResultStatus(resultRow.resultStatus)
        : 'unavailable',
      acknowledgement: resolveAcknowledgementState({
        stepName,
        sessionId,
        sessionStepResults: results,
        stageAttentionAcknowledgements: acknowledgements,
      }),
    }
  })
}

export const MIGRATION_OPERATOR_COMMAND_SUCCESS_LABELS = Object.freeze({
  'start-session': 'Start Session',
  'cancel-session': 'Cancel Session',
  'complete-foundation': 'Complete Foundation',
  'finish-session': 'Finish Session',
  'acknowledge-attention': 'Acknowledge Attention',
  persist: 'Persist',
  'auto-link': 'Auto Link',
  'auto-create': 'Auto Create',
  'integrity-audit': 'Integrity Audit',
  preflight: 'Preflight',
  preview: 'Preview',
  'phase-1': 'Phase 1',
  'phase-2': 'Phase 2',
  'post-audit': 'Post Audit',
})

export function formatMigrationOperatorCommandSuccess(commandId) {
  const label = MIGRATION_OPERATOR_COMMAND_SUCCESS_LABELS[commandId] ?? 'Command'
  return `${label} completed successfully.`
}

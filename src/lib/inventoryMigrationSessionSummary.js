/**
 * Presentation-only Operator Panel session summary.
 * Uses already-loaded session/step/result/ack props. Does not fetch or mutate.
 */

import {
  MIGRATION_OPERATOR_CANONICAL_STEPS,
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

function asText(value) {
  return `${value ?? ''}`.trim()
}

function isUnavailable(value) {
  const text = asText(value)
  return !text || text === '—'
}

function displayValue(value) {
  return isUnavailable(value) ? '—' : asText(value)
}

function stageLabel(stepName) {
  return STAGE_LABELS[stepName] ?? stepName
}

function tryParseTimestamp(value) {
  if (isUnavailable(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDuration(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null
  }
  const totalSeconds = Math.floor((endMs - startMs) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * Current stage from step status only:
 * 1. running
 * 2. first waiting after completed chain
 * 3. completed (if finished)
 * 4. unavailable
 */
function resolveCurrentStage(stepsByName) {
  for (const stepName of MIGRATION_OPERATOR_CANONICAL_STEPS) {
    const step = stepsByName.get(stepName)
    if (step && asText(step.statusKey) === 'running') {
      return stageLabel(stepName)
    }
  }

  for (const stepName of MIGRATION_OPERATOR_CANONICAL_STEPS) {
    const step = stepsByName.get(stepName)
    const status = step ? asText(step.statusKey) : ''
    if (status === 'completed') continue
    if (status === 'waiting') return stageLabel(stepName)
    return '—'
  }

  return 'Completed'
}

function resolveSessionStatus({ sessionRunning, sessionId, allCompleted }) {
  if (sessionRunning) return 'Running'
  if (allCompleted) return 'Completed'
  if (sessionId) return 'Not running'
  return 'Not Started'
}

/**
 * Build compact session summary metrics from already-loaded Operator Panel props.
 */
export function buildMigrationOperatorSessionSummary({
  sessionId = '',
  sessionRunning = false,
  sessionStepRows = [],
  sessionStepResults = [],
  stageAttentionAcknowledgements = [],
} = {}) {
  const resolvedSessionId = asText(sessionId)
  const steps = Array.isArray(sessionStepRows) ? sessionStepRows : []
  const results = Array.isArray(sessionStepResults) ? sessionStepResults : []
  const acknowledgements = Array.isArray(stageAttentionAcknowledgements)
    ? stageAttentionAcknowledgements
    : []

  const stepsByName = new Map()
  for (const stepName of MIGRATION_OPERATOR_CANONICAL_STEPS) {
    const row = selectMigrationSessionStep(steps, resolvedSessionId, stepName)
    if (row) stepsByName.set(stepName, row)
  }

  let completedStages = 0
  let waitingStages = 0
  let runningStage = '—'

  for (const stepName of MIGRATION_OPERATOR_CANONICAL_STEPS) {
    const step = stepsByName.get(stepName)
    const status = step ? asText(step.statusKey) : ''
    if (status === 'completed') completedStages += 1
    else if (status === 'waiting') waitingStages += 1
    else if (status === 'running') {
      runningStage = stageLabel(stepName)
    }
  }

  let passedStages = 0
  let attentionRequiredStages = 0
  for (const stepName of MIGRATION_OPERATOR_CANONICAL_STEPS) {
    const result = selectMigrationStepResult(results, resolvedSessionId, stepName)
    if (!result) continue
    const status = asText(result.resultStatus)
    if (status === 'passed') passedStages += 1
    if (status === 'attention_required') attentionRequiredStages += 1
  }

  const allCompleted = completedStages === MIGRATION_OPERATOR_CANONICAL_STEPS.length
  const currentStage = resolveCurrentStage(stepsByName)
  const status = resolveSessionStatus({
    sessionRunning: Boolean(sessionRunning),
    sessionId: resolvedSessionId,
    allCompleted,
  })

  const foundation = stepsByName.get('foundation')
  const postApply = stepsByName.get('post_apply_audit')
  const startedAt = displayValue(foundation?.startedAt)
  const completedAt = allCompleted ? displayValue(postApply?.completedAt) : '—'

  const startMs = tryParseTimestamp(foundation?.startedAt)
  const endMs = allCompleted ? tryParseTimestamp(postApply?.completedAt) : null
  const durationFromTimestamps = startMs != null && endMs != null
    ? formatDuration(startMs, endMs)
    : null

  let duration = 'In progress'
  if (durationFromTimestamps) {
    duration = durationFromTimestamps
  } else if (!resolvedSessionId) {
    duration = '—'
  } else if (allCompleted && !durationFromTimestamps) {
    duration = '—'
  }

  return {
    status,
    currentStage,
    startedAt,
    completedAt,
    totalStages: MIGRATION_OPERATOR_CANONICAL_STEPS.length,
    completedStages,
    waitingStages,
    runningStage,
    passedStages,
    attentionRequiredStages,
    acknowledgedAttentionItems: acknowledgements.length,
    duration,
  }
}

/**
 * Presentation-layer eligibility for Inventory Migration Operator commands.
 * SQL remains authoritative. Does not invoke RPCs.
 */

export const MIGRATION_OPERATOR_CANONICAL_STEPS = Object.freeze([
  'foundation',
  'persist',
  'auto_link',
  'auto_create',
  'integrity_audit',
  'preflight',
  'preview',
  'phase1',
  'phase2',
  'post_apply_audit',
])

export const MIGRATION_OPERATOR_STAGE_COMMANDS = Object.freeze({
  persist: Object.freeze({ stepName: 'persist', predecessor: 'foundation' }),
  'auto-link': Object.freeze({ stepName: 'auto_link', predecessor: 'persist' }),
  'auto-create': Object.freeze({ stepName: 'auto_create', predecessor: 'auto_link' }),
  'integrity-audit': Object.freeze({ stepName: 'integrity_audit', predecessor: 'auto_create' }),
  preflight: Object.freeze({
    stepName: 'preflight',
    predecessor: 'integrity_audit',
    attentionPriorStep: 'integrity_audit',
  }),
  preview: Object.freeze({ stepName: 'preview', predecessor: 'preflight' }),
  'phase-1': Object.freeze({
    stepName: 'phase1',
    predecessor: 'preview',
    attentionPriorStep: 'preview',
  }),
  'phase-2': Object.freeze({
    stepName: 'phase2',
    predecessor: 'phase1',
    attentionPriorStep: 'phase1',
    requiresMaintenanceConfirmation: true,
  }),
  'post-audit': Object.freeze({ stepName: 'post_apply_audit', predecessor: 'phase2' }),
})

export const MIGRATION_OPERATOR_ATTENTION_BOUNDARIES = Object.freeze([
  Object.freeze({ priorStepName: 'integrity_audit', nextStepName: 'preflight' }),
  Object.freeze({ priorStepName: 'preview', nextStepName: 'phase1' }),
  Object.freeze({ priorStepName: 'phase1', nextStepName: 'phase2' }),
])

function asText(value) {
  return `${value ?? ''}`.trim()
}

function isDash(value) {
  return !value || value === '—'
}

export function normalizeMigrationOperatorSessionId(sessionId) {
  const normalized = asText(sessionId)
  return isDash(normalized) ? '' : normalized
}

function matchesSessionId(rowSessionId, sessionId) {
  const resolved = normalizeMigrationOperatorSessionId(sessionId)
  const rowId = normalizeMigrationOperatorSessionId(rowSessionId)
  return Boolean(resolved) && rowId === resolved
}

/**
 * At most one result exists per (session_id, step_name) in SQL.
 * Select the unique matching row for the current session and step name.
 */
export function selectMigrationStepResult(results, sessionId, stepName) {
  const list = Array.isArray(results) ? results : []
  const targetStep = asText(stepName)
  if (!targetStep || isDash(targetStep)) return null

  return list.find((row) => (
    matchesSessionId(row?.sessionId, sessionId)
    && asText(row?.stepName) === targetStep
  )) ?? null
}

export function selectMigrationSessionStep(steps, sessionId, stepName) {
  const list = Array.isArray(steps) ? steps : []
  const targetStep = asText(stepName)
  if (!targetStep || isDash(targetStep)) return null

  return list.find((row) => (
    matchesSessionId(row?.sessionId, sessionId)
    && asText(row?.stepName) === targetStep
  )) ?? null
}

export function findMatchingAttentionAcknowledgement(
  acknowledgements,
  sessionId,
  priorResultId,
  nextStepName,
) {
  const list = Array.isArray(acknowledgements) ? acknowledgements : []
  const resultId = asText(priorResultId)
  const next = asText(nextStepName)
  if (!resultId || !next) return null

  return list.find((row) => (
    matchesSessionId(row?.sessionId, sessionId)
    && asText(row?.priorResultId) === resultId
    && asText(row?.nextStepName) === next
  )) ?? null
}

function attentionGateForNextStep(nextStepName, results, acknowledgements, sessionId) {
  const boundary = MIGRATION_OPERATOR_ATTENTION_BOUNDARIES.find(
    (item) => item.nextStepName === nextStepName,
  )
  if (!boundary) {
    return { ok: true, reason: '' }
  }

  const priorResult = selectMigrationStepResult(results, sessionId, boundary.priorStepName)
  if (!priorResult) {
    return { ok: false, reason: 'Prior stage result is missing' }
  }

  const status = asText(priorResult.resultStatus)
  if (status === 'passed') {
    return { ok: true, reason: '' }
  }

  if (status !== 'attention_required') {
    return { ok: false, reason: 'Prior stage result is not actionable' }
  }

  const ack = findMatchingAttentionAcknowledgement(
    acknowledgements,
    sessionId,
    priorResult.id,
    boundary.nextStepName,
  )
  if (!ack) {
    return { ok: false, reason: 'Attention acknowledgement required' }
  }

  return { ok: true, reason: '' }
}

/**
 * Resolve eligibility for one Operator command id.
 * Returns { enabled: boolean, reason: string }.
 */
export function resolveMigrationOperatorCommandEligibility(commandId, context = {}) {
  const {
    workspaceId = '',
    sessionId = '',
    sessionRunning = false,
    sessionStepRows = [],
    sessionStepResults = [],
    stageAttentionAcknowledgements = [],
    confirmMaintenanceWindow = false,
    ackPriorResultId = '',
    ackNextStepName = '',
    pendingCommandId = null,
  } = context

  const resolvedWorkspaceId = asText(workspaceId)
  const resolvedSessionId = normalizeMigrationOperatorSessionId(sessionId)
  const steps = Array.isArray(sessionStepRows) ? sessionStepRows : []
  const results = Array.isArray(sessionStepResults) ? sessionStepResults : []
  const acknowledgements = Array.isArray(stageAttentionAcknowledgements)
    ? stageAttentionAcknowledgements
    : []

  if (pendingCommandId && pendingCommandId === commandId) {
    return { enabled: false, reason: 'Command is running' }
  }

  if (!resolvedWorkspaceId) {
    return { enabled: false, reason: 'No active migration session' }
  }

  if (commandId === 'start-session') {
    if (sessionRunning) {
      return { enabled: false, reason: 'A migration session is already running' }
    }
    return { enabled: true, reason: '' }
  }

  if (!sessionRunning) {
    return { enabled: false, reason: 'No active migration session' }
  }

  if (!resolvedSessionId) {
    return { enabled: false, reason: 'No active migration session' }
  }

  if (commandId === 'cancel-session') {
    return { enabled: true, reason: '' }
  }

  if (commandId === 'complete-foundation') {
    const foundation = selectMigrationSessionStep(steps, resolvedSessionId, 'foundation')
    if (!foundation) {
      return { enabled: false, reason: 'Foundation step is missing' }
    }
    if (asText(foundation.statusKey) !== 'running') {
      return { enabled: false, reason: 'Foundation is not running' }
    }
    return { enabled: true, reason: '' }
  }

  if (commandId === 'acknowledge-attention') {
    const priorResultId = asText(ackPriorResultId)
    const nextStepName = asText(ackNextStepName)
    if (!priorResultId) {
      return { enabled: false, reason: 'Prior result ID is required' }
    }
    if (!['preflight', 'phase1', 'phase2'].includes(nextStepName)) {
      return { enabled: false, reason: 'Invalid next-step boundary' }
    }

    const priorResult = results.find((row) => (
      matchesSessionId(row?.sessionId, resolvedSessionId)
      && asText(row?.id) === priorResultId
    ))
    if (!priorResult) {
      return { enabled: false, reason: 'Prior stage result is missing' }
    }
    if (asText(priorResult.resultStatus) !== 'attention_required') {
      return { enabled: false, reason: 'Prior result is not attention_required' }
    }

    const boundary = MIGRATION_OPERATOR_ATTENTION_BOUNDARIES.find(
      (item) => (
        item.nextStepName === nextStepName
        && item.priorStepName === asText(priorResult.stepName)
      ),
    )
    if (!boundary) {
      return { enabled: false, reason: 'Invalid next-step boundary' }
    }

    const existing = findMatchingAttentionAcknowledgement(
      acknowledgements,
      resolvedSessionId,
      priorResultId,
      nextStepName,
    )
    if (existing) {
      return { enabled: false, reason: 'Already acknowledged' }
    }

    return { enabled: true, reason: '' }
  }

  if (commandId === 'finish-session') {
    for (const stepName of MIGRATION_OPERATOR_CANONICAL_STEPS) {
      const step = selectMigrationSessionStep(steps, resolvedSessionId, stepName)
      if (!step || asText(step.statusKey) !== 'completed') {
        return { enabled: false, reason: 'Previous stage is not completed' }
      }
    }

    const postApplyResult = selectMigrationStepResult(
      results,
      resolvedSessionId,
      'post_apply_audit',
    )
    if (!postApplyResult) {
      return { enabled: false, reason: 'Post-Apply Audit must pass' }
    }
    if (asText(postApplyResult.resultStatus) !== 'passed') {
      return { enabled: false, reason: 'Post-Apply Audit must pass' }
    }
    return { enabled: true, reason: '' }
  }

  const stage = MIGRATION_OPERATOR_STAGE_COMMANDS[commandId]
  if (!stage) {
    return { enabled: false, reason: 'Unknown migration command' }
  }

  const target = selectMigrationSessionStep(steps, resolvedSessionId, stage.stepName)
  if (!target) {
    return { enabled: false, reason: 'Stage is missing' }
  }

  const targetStatus = asText(target.statusKey)
  if (targetStatus === 'completed') {
    return { enabled: false, reason: 'Stage is already completed' }
  }
  if (targetStatus === 'running') {
    return { enabled: false, reason: 'Stage is already running' }
  }
  if (targetStatus !== 'waiting') {
    return { enabled: false, reason: 'Stage is not waiting' }
  }

  const predecessor = selectMigrationSessionStep(steps, resolvedSessionId, stage.predecessor)
  if (!predecessor || asText(predecessor.statusKey) !== 'completed') {
    return { enabled: false, reason: 'Previous stage is not completed' }
  }

  if (stage.attentionPriorStep) {
    const gate = attentionGateForNextStep(
      stage.stepName,
      results,
      acknowledgements,
      resolvedSessionId,
    )
    if (!gate.ok) {
      return { enabled: false, reason: gate.reason }
    }
  }

  if (stage.requiresMaintenanceConfirmation && confirmMaintenanceWindow !== true) {
    return { enabled: false, reason: 'Maintenance confirmation required' }
  }

  return { enabled: true, reason: '' }
}

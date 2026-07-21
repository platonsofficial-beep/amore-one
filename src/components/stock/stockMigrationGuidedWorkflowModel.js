/**
 * Feature-local presentation model for the guided migration workflow shell.
 * Read-only. Does not call services or RPCs.
 */

export const GUIDED_STAGE_VISUAL = Object.freeze({
  COMPLETED: 'completed',
  CURRENT: 'current',
  READY: 'ready',
  WAITING: 'waiting',
  ATTENTION: 'attention',
  UNAVAILABLE: 'unavailable',
  CANCELLED: 'cancelled',
})

export const GUIDED_STAGE_VISUAL_LABELS = Object.freeze({
  [GUIDED_STAGE_VISUAL.COMPLETED]: 'Completed',
  [GUIDED_STAGE_VISUAL.CURRENT]: 'Current',
  [GUIDED_STAGE_VISUAL.READY]: 'Ready',
  [GUIDED_STAGE_VISUAL.WAITING]: 'Waiting',
  [GUIDED_STAGE_VISUAL.ATTENTION]: 'Attention required',
  [GUIDED_STAGE_VISUAL.UNAVAILABLE]: 'Unavailable',
  [GUIDED_STAGE_VISUAL.CANCELLED]: 'Cancelled',
})

const NEUTRAL_NEXT_ACTION = 'Review migration status'

function asText(value) {
  return `${value ?? ''}`.trim()
}

function resolveManualCount({ metrics, metricsAvailable, manualReviewCount }) {
  if (Number.isFinite(Number(manualReviewCount))) {
    return Math.max(0, Number(manualReviewCount))
  }
  if (!metricsAvailable) return 0
  return Math.max(0, Number(metrics?.manualReview ?? 0) || 0)
}

function resolveAttentionCount(attentionCount) {
  if (!Number.isFinite(Number(attentionCount))) return 0
  return Math.max(0, Number(attentionCount) || 0)
}

function mapChecklistStatusToVisual(status, {
  isCurrent,
  sessionCancelled,
  attentionRequired,
}) {
  const normalized = asText(status)

  if (sessionCancelled && normalized !== 'Completed') {
    return GUIDED_STAGE_VISUAL.CANCELLED
  }

  if (normalized === 'Unknown' || !normalized) {
    return GUIDED_STAGE_VISUAL.UNAVAILABLE
  }

  if (normalized === 'Completed') {
    return GUIDED_STAGE_VISUAL.COMPLETED
  }

  if (attentionRequired && (isCurrent || normalized === 'Ready')) {
    return GUIDED_STAGE_VISUAL.ATTENTION
  }

  if (isCurrent || normalized === 'Ready') {
    return isCurrent ? GUIDED_STAGE_VISUAL.CURRENT : GUIDED_STAGE_VISUAL.READY
  }

  if (normalized === 'Waiting') {
    return GUIDED_STAGE_VISUAL.WAITING
  }

  return GUIDED_STAGE_VISUAL.WAITING
}

function refineRequiredAction(requiredAction, currentStep) {
  const raw = asText(requiredAction)
  if (!raw || raw === 'Migration cannot yet continue.') {
    return NEUTRAL_NEXT_ACTION
  }
  if (raw === 'Migration Complete.' || raw === 'Migration Complete') {
    return 'Migration complete'
  }

  const step = asText(currentStep)
  if (step === 'Foundation' || raw === 'Run Foundation.') {
    return 'Complete Foundation'
  }

  const withoutPeriod = raw.replace(/\.$/, '')
  if (withoutPeriod.startsWith('Run ')) {
    return withoutPeriod
  }
  return withoutPeriod || NEUTRAL_NEXT_ACTION
}

/**
 * Derive one display-only next-action string from existing read models.
 * Prefer safe neutral copy when data is insufficient. Never guesses mutations.
 */
export function deriveGuidedMigrationNextAction({
  operator = null,
  sessionSummary = null,
  metricsAvailable = false,
  manualReviewCount = 0,
  attentionCount = 0,
} = {}) {
  const sessionStatusKey = asText(sessionSummary?.statusKey)
  const sessionStatus = asText(sessionSummary?.status)
  const sessionId = asText(sessionSummary?.sessionId)
  const hasSession = Boolean(sessionId && sessionId !== '—')

  if (sessionStatusKey === 'Cancelled' || sessionStatus === 'Cancelled') {
    return NEUTRAL_NEXT_ACTION
  }

  if (!metricsAvailable) {
    return NEUTRAL_NEXT_ACTION
  }

  const currentStep = asText(operator?.currentStep)
  if (!currentStep || currentStep === 'Unknown') {
    return NEUTRAL_NEXT_ACTION
  }

  if (
    !hasSession
    || sessionStatusKey === 'NotStarted'
    || sessionStatus === 'Not Started'
  ) {
    return 'Start migration session'
  }

  const manual = resolveAttentionCount(manualReviewCount)
  if (manual > 0) {
    return manual === 1
      ? 'Review 1 manual item'
      : `Review ${manual} manual items`
  }

  const attention = resolveAttentionCount(attentionCount)
  if (attention > 0) {
    return 'Acknowledge attention'
  }

  if (currentStep === 'Completed') {
    return 'Migration complete'
  }

  return refineRequiredAction(operator?.requiredAction, currentStep)
}

/**
 * Build the guided workflow presentation model from props already available
 * on StockInventoryMigrationView. Presentation only.
 */
export function buildGuidedMigrationWorkflowModel({
  operator = null,
  sessionSummary = null,
  health = null,
  metrics = null,
  metricsAvailable = false,
  manualReviewCount = null,
  attentionCount = 0,
} = {}) {
  const checklist = Array.isArray(operator?.checklist) ? operator.checklist : []
  const currentStepTitle = asText(operator?.currentStep) || 'Unknown'
  const sessionStatusKey = asText(sessionSummary?.statusKey)
  const sessionStatusLabel = asText(sessionSummary?.status) || 'Unknown'
  const sessionCancelled = (
    sessionStatusKey === 'Cancelled'
    || sessionStatusLabel === 'Cancelled'
  )

  const manualCount = resolveManualCount({
    metrics,
    metricsAvailable,
    manualReviewCount,
  })
  const attention = resolveAttentionCount(attentionCount)

  const stages = checklist.map((step) => {
    const title = asText(step?.title) || '—'
    const isCurrent = title === currentStepTitle && currentStepTitle !== 'Unknown'
    const visualState = mapChecklistStatusToVisual(step?.status, {
      isCurrent,
      sessionCancelled,
      attentionRequired: attention > 0,
    })

    return {
      id: step?.id ?? title,
      title,
      description: asText(step?.description) || '—',
      statusLabel: GUIDED_STAGE_VISUAL_LABELS[visualState]
        ?? (asText(step?.status) || '—'),
      visualState,
      isCurrent,
      isCompleted: visualState === GUIDED_STAGE_VISUAL.COMPLETED,
    }
  })

  const completedStageCount = stages.filter((stage) => stage.isCompleted).length
  const totalStageCount = stages.length
  const progressPercent = totalStageCount > 0
    ? Math.round((completedStageCount / totalStageCount) * 100)
    : 0

  const nextAction = deriveGuidedMigrationNextAction({
    operator,
    sessionSummary,
    metricsAvailable,
    manualReviewCount: manualCount,
    attentionCount: attention,
  })

  return {
    sessionStatusLabel,
    currentStage: currentStepTitle,
    completedStageCount,
    totalStageCount,
    progressPercent,
    progressLabel: totalStageCount > 0
      ? `${completedStageCount} of ${totalStageCount} stages complete`
      : '—',
    readinessLabel: asText(health?.readiness) || 'Unknown',
    healthScore: health?.score ?? null,
    manualReviewCount: manualCount,
    showManualReviewCheckpoint: true,
    manualReviewNeedsAttention: manualCount > 0,
    attentionCount: attention,
    nextAction,
    stages,
  }
}

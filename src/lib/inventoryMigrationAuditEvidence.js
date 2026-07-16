/**
 * Pure audit-evidence helpers for Inventory Migration Operator.
 * Read-only. Never fabricates audit completion.
 *
 * Supported stages:
 *   Integrity Audit, Preflight, Preview, Post Audit
 *
 * Returns only: Completed | Waiting | Unknown
 * Never returns Failed.
 */

export const AUDIT_EVIDENCE_STATUS = {
  COMPLETED: 'Completed',
  WAITING: 'Waiting',
  UNKNOWN: 'Unknown',
}

export const AUDIT_EVIDENCE_STAGE_IDS = [
  'integrity-audit',
  'preflight',
  'preview',
  'post-audit',
]

function readMetricFlags(metrics = {}) {
  const total = Number(metrics?.total ?? 0)
  const classified = Number(metrics?.classified ?? 0)
  const manual = Number(metrics?.manualReview ?? 0)
  const skipped = Number(metrics?.skipped ?? 0)
  const completed = Number(metrics?.completed ?? 0)
  const migratedCompleted = Number(metrics?.migratedCompleted ?? 0)
  const remainingAutoLink = Number(metrics?.remainingClassifiedAutoLink ?? 0)
  const remainingAutoCreate = Number(metrics?.remainingClassifiedAutoCreate ?? 0)

  return {
    total,
    persistComplete: (classified + manual + skipped + completed) === total,
    autoLinkComplete: remainingAutoLink === 0,
    autoCreateComplete: remainingAutoCreate === 0,
    phase1Complete: total > 0 && completed === total,
    phase2Complete: completed > 0 && migratedCompleted === completed,
  }
}

/**
 * Live metrics do not currently persist Integrity / Preflight / Preview / Post Audit
 * completion. This helper never invents Completed — only returns Completed when a
 * future live proof field exists and is explicitly true.
 */
function hasLiveAuditCompletionProof(_stageId, _metrics) {
  return false
}

function resolveEvidenceStatus({
  metricsAvailable,
  prerequisitesMet,
  stageId,
  metrics,
}) {
  if (!metricsAvailable) return AUDIT_EVIDENCE_STATUS.UNKNOWN
  if (hasLiveAuditCompletionProof(stageId, metrics)) {
    return AUDIT_EVIDENCE_STATUS.COMPLETED
  }
  // Prerequisites met or not — without proof the stage remains Waiting.
  // Callers use prerequisites to order Current Step; status itself stays Waiting.
  void prerequisitesMet
  return AUDIT_EVIDENCE_STATUS.WAITING
}

export function resolveIntegrityAuditEvidence({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
} = {}) {
  const flags = readMetricFlags(metrics)
  const prerequisitesMet = Boolean(tableReachable)
    && flags.persistComplete
    && flags.autoLinkComplete
    && flags.autoCreateComplete

  return resolveEvidenceStatus({
    metricsAvailable,
    prerequisitesMet,
    stageId: 'integrity-audit',
    metrics,
  })
}

export function resolvePreflightEvidence({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
  integrityEvidence = null,
} = {}) {
  const integrity = integrityEvidence
    ?? resolveIntegrityAuditEvidence({ metrics, metricsAvailable, tableReachable })
  const prerequisitesMet = integrity === AUDIT_EVIDENCE_STATUS.COMPLETED

  return resolveEvidenceStatus({
    metricsAvailable,
    prerequisitesMet,
    stageId: 'preflight',
    metrics,
  })
}

export function resolvePreviewEvidence({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
  preflightEvidence = null,
} = {}) {
  const preflight = preflightEvidence
    ?? resolvePreflightEvidence({ metrics, metricsAvailable, tableReachable })
  const prerequisitesMet = preflight === AUDIT_EVIDENCE_STATUS.COMPLETED

  return resolveEvidenceStatus({
    metricsAvailable,
    prerequisitesMet,
    stageId: 'preview',
    metrics,
  })
}

export function resolvePostAuditEvidence({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
} = {}) {
  const flags = readMetricFlags(metrics)
  const prerequisitesMet = Boolean(tableReachable) && flags.phase2Complete

  return resolveEvidenceStatus({
    metricsAvailable,
    prerequisitesMet,
    stageId: 'post-audit',
    metrics,
  })
}

/**
 * Build the full audit-evidence map for operator + health consumers.
 */
export function buildInventoryMigrationAuditEvidence({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
} = {}) {
  const integrityAudit = resolveIntegrityAuditEvidence({
    metrics,
    metricsAvailable,
    tableReachable,
  })
  const preflight = resolvePreflightEvidence({
    metrics,
    metricsAvailable,
    tableReachable,
    integrityEvidence: integrityAudit,
  })
  const preview = resolvePreviewEvidence({
    metrics,
    metricsAvailable,
    tableReachable,
    preflightEvidence: preflight,
  })
  const postAudit = resolvePostAuditEvidence({
    metrics,
    metricsAvailable,
    tableReachable,
  })

  return {
    integrityAudit,
    preflight,
    preview,
    postAudit,
    hasUnknown: [integrityAudit, preflight, preview, postAudit]
      .some((status) => status === AUDIT_EVIDENCE_STATUS.UNKNOWN),
    allCompleted: [integrityAudit, preflight, preview, postAudit]
      .every((status) => status === AUDIT_EVIDENCE_STATUS.COMPLETED),
  }
}

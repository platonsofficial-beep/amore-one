/**
 * Pure helpers for Inventory Migration Operator panel.
 * Read-only workflow guidance only — no execution, no writes.
 */

import {
  AUDIT_EVIDENCE_STATUS,
  buildInventoryMigrationAuditEvidence,
} from './inventoryMigrationAuditEvidence'

export const OPERATOR_STATUS = {
  COMPLETED: 'Completed',
  READY: 'Ready',
  WAITING: 'Waiting',
  UNKNOWN: 'Unknown',
}

export const OPERATOR_NOTES = [
  'Maintenance window required before Phase 2',
  'Phase 2 should only follow Phase 1',
  'Dashboard never executes SQL',
  'SQL Editor remains authoritative',
  'Audit stages require operator confirmation before execution stages.',
]

export const OPERATOR_EXECUTION_BUTTONS = [
  'Persist',
  'Auto Link',
  'Auto Create',
  'Integrity Audit',
  'Preflight',
  'Preview',
  'Phase 1',
  'Phase 2',
  'Post Audit',
]

export const OPERATOR_EXECUTION_TOOLTIP =
  'Execution from ONE will be introduced in a future release.'

const OPERATOR_STEP_DEFS = [
  {
    id: 'foundation',
    title: 'Foundation',
    description: 'Migration map table readiness for this workspace.',
  },
  {
    id: 'persist',
    title: 'Persist',
    description: 'Classify and persist legacy rows into the migration map.',
  },
  {
    id: 'auto-link',
    title: 'Auto Link',
    description: 'Exact catalog matches linked to stock items.',
  },
  {
    id: 'auto-create',
    title: 'Auto Create',
    description: 'Missing catalog rows created from snapshots.',
  },
  {
    id: 'integrity-audit',
    title: 'Integrity Audit',
    description: 'Map integrity validation in the SQL editor.',
  },
  {
    id: 'preflight',
    title: 'Preflight',
    description: 'Quantity migration eligibility checks.',
  },
  {
    id: 'preview',
    title: 'Preview',
    description: 'Dry-run movement preview.',
  },
  {
    id: 'phase-1',
    title: 'Phase 1',
    description: 'Create INITIAL_IMPORT stock movements.',
  },
  {
    id: 'phase-2',
    title: 'Phase 2',
    description: 'Apply quantities using migrated_at.',
  },
  {
    id: 'post-audit',
    title: 'Post Audit',
    description: 'Read-only post-apply consistency audit.',
  },
  {
    id: 'completed',
    title: 'Completed',
    description: 'Full migration finished for this workspace.',
  },
]

const AUDIT_STEP_IDS = new Set([
  'integrity-audit',
  'preflight',
  'preview',
  'post-audit',
])

function requiredActionForStep(title) {
  if (!title || title === 'Unknown') return 'Migration cannot yet continue.'
  if (title === 'Completed') return 'Migration Complete.'
  return `Run ${title}.`
}

function auditStatusForStep(stepId, evidence) {
  if (stepId === 'integrity-audit') return evidence.integrityAudit
  if (stepId === 'preflight') return evidence.preflight
  if (stepId === 'preview') return evidence.preview
  if (stepId === 'post-audit') return evidence.postAudit
  return AUDIT_EVIDENCE_STATUS.UNKNOWN
}

/**
 * Derive operator checklist + current step + required action from live metrics
 * and audit evidence. Never skips audit stages without proof.
 */
export function buildInventoryMigrationOperator({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
  auditEvidence = null,
} = {}) {
  const evidence = auditEvidence ?? buildInventoryMigrationAuditEvidence({
    metrics,
    metricsAvailable,
    tableReachable,
  })

  if (!metricsAvailable || evidence.hasUnknown) {
    const checklist = OPERATOR_STEP_DEFS.map((step) => ({
      ...step,
      status: OPERATOR_STATUS.UNKNOWN,
    }))
    return {
      currentStep: 'Unknown',
      checklist,
      requiredAction: 'Migration cannot yet continue.',
      notes: OPERATOR_NOTES,
      buttons: OPERATOR_EXECUTION_BUTTONS,
      auditEvidence: evidence,
    }
  }

  const total = Number(metrics?.total ?? 0)
  const classified = Number(metrics?.classified ?? 0)
  const manual = Number(metrics?.manualReview ?? 0)
  const skipped = Number(metrics?.skipped ?? 0)
  const completed = Number(metrics?.completed ?? 0)
  const migratedCompleted = Number(metrics?.migratedCompleted ?? 0)
  const remainingAutoLink = Number(metrics?.remainingClassifiedAutoLink ?? 0)
  const remainingAutoCreate = Number(metrics?.remainingClassifiedAutoCreate ?? 0)

  const foundationComplete = Boolean(tableReachable)
  const persistComplete = (classified + manual + skipped + completed) === total
  const autoLinkComplete = remainingAutoLink === 0
  const autoCreateComplete = remainingAutoCreate === 0
  const integrityComplete = evidence.integrityAudit === AUDIT_EVIDENCE_STATUS.COMPLETED
  const preflightComplete = evidence.preflight === AUDIT_EVIDENCE_STATUS.COMPLETED
  const previewComplete = evidence.preview === AUDIT_EVIDENCE_STATUS.COMPLETED
  const metricsPhase1Complete = total > 0 && completed === total
  const metricsPhase2Complete = completed > 0 && migratedCompleted === completed
  // Execution stages only count as complete after prior audit evidence is proven.
  const phase1Complete = previewComplete && metricsPhase1Complete
  const phase2Complete = phase1Complete && metricsPhase2Complete
  const postAuditComplete = evidence.postAudit === AUDIT_EVIDENCE_STATUS.COMPLETED
  const migrationComplete = phase2Complete && postAuditComplete

  const provenComplete = {
    foundation: foundationComplete,
    persist: foundationComplete && persistComplete,
    'auto-link': foundationComplete && persistComplete && autoLinkComplete,
    'auto-create': foundationComplete && persistComplete && autoLinkComplete && autoCreateComplete,
    'integrity-audit': integrityComplete,
    preflight: preflightComplete,
    preview: previewComplete,
    'phase-1': phase1Complete,
    'phase-2': phase2Complete,
    'post-audit': postAuditComplete,
    completed: migrationComplete,
  }

  // Frontier: first step that is not proven complete. Never skip audits without proof.
  let frontierId = 'completed'
  for (const step of OPERATOR_STEP_DEFS) {
    if (!provenComplete[step.id]) {
      frontierId = step.id
      break
    }
  }

  const checklist = OPERATOR_STEP_DEFS.map((step) => {
    if (AUDIT_STEP_IDS.has(step.id)) {
      return {
        ...step,
        status: auditStatusForStep(step.id, evidence),
      }
    }

    if (provenComplete[step.id]) {
      return { ...step, status: OPERATOR_STATUS.COMPLETED }
    }

    if (!foundationComplete && step.id !== 'foundation') {
      return { ...step, status: OPERATOR_STATUS.WAITING }
    }

    if (step.id === frontierId) {
      return { ...step, status: OPERATOR_STATUS.READY }
    }

    return { ...step, status: OPERATOR_STATUS.WAITING }
  })

  const frontier = checklist.find((step) => step.id === frontierId)
  const currentStep = frontier?.title ?? 'Unknown'

  return {
    currentStep,
    checklist,
    requiredAction: requiredActionForStep(currentStep),
    notes: OPERATOR_NOTES,
    buttons: OPERATOR_EXECUTION_BUTTONS,
    auditEvidence: evidence,
  }
}

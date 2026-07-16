/**
 * Pure helpers for Inventory Migration Operator panel.
 * Read-only workflow guidance only — no execution, no writes.
 */

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

function requiredActionForStep(title) {
  if (!title || title === 'Unknown') return 'Migration cannot yet continue.'
  if (title === 'Completed') return 'Migration Complete.'
  return `Run ${title}.`
}

/**
 * Derive operator checklist + current step + required action from live metrics only.
 * Ops-only stages without map evidence never become Completed.
 */
export function buildInventoryMigrationOperator({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
} = {}) {
  if (!metricsAvailable) {
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
  const phase1Complete = total > 0 && completed === total
  const phase1InProgress = completed > 0 && completed < total
  const phase2Complete = completed > 0 && migratedCompleted === completed
  const phase2InProgress = migratedCompleted > 0 && migratedCompleted < completed
  const laterPhaseEvidence = phase1Complete || phase1InProgress || phase2Complete || phase2InProgress
  const migrationComplete = phase2Complete && phase1Complete

  const provenComplete = {
    foundation: foundationComplete,
    persist: foundationComplete && persistComplete,
    'auto-link': foundationComplete && persistComplete && autoLinkComplete,
    'auto-create': foundationComplete && persistComplete && autoLinkComplete && autoCreateComplete,
    'integrity-audit': false,
    preflight: false,
    preview: false,
    'phase-1': phase1Complete,
    'phase-2': phase2Complete,
    'post-audit': false,
    completed: migrationComplete,
  }

  // Frontier: first step that is not proven complete.
  let frontierId = 'completed'
  for (const step of OPERATOR_STEP_DEFS) {
    if (!provenComplete[step.id]) {
      frontierId = step.id
      break
    }
  }

  // If later phase evidence exists, skip unproven SQL-editor stages for current step.
  if (
    laterPhaseEvidence
    && (frontierId === 'integrity-audit' || frontierId === 'preflight' || frontierId === 'preview')
  ) {
    if (phase2InProgress) frontierId = 'phase-2'
    else if (!phase1Complete) frontierId = 'phase-1'
    else if (!phase2Complete) frontierId = 'phase-2'
    else frontierId = migrationComplete ? 'completed' : 'post-audit'
  }

  if (migrationComplete) {
    frontierId = 'completed'
  }

  const checklist = OPERATOR_STEP_DEFS.map((step) => {
    if (provenComplete[step.id]) {
      return { ...step, status: OPERATOR_STATUS.COMPLETED }
    }

    if (!foundationComplete && step.id !== 'foundation') {
      return { ...step, status: OPERATOR_STATUS.WAITING }
    }

    if (step.id === frontierId) {
      return { ...step, status: OPERATOR_STATUS.READY }
    }

    // Unproven ops stages after later phase evidence remain Waiting (not invented Completed).
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
  }
}

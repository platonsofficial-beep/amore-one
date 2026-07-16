/**
 * Pure helpers for Inventory Migration dashboard metrics and pipeline.
 * Read-only aggregation only — no writes.
 */

export const PIPELINE_STATE = {
  COMPLETE: 'Complete',
  IN_PROGRESS: 'In Progress',
  WAITING: 'Waiting',
  BLOCKED: 'Blocked',
  UNKNOWN: 'Unknown',
}

export function createEmptyInventoryMigrationMetrics() {
  return {
    legacyItems: 0,
    classified: 0,
    autoLink: 0,
    autoCreate: 0,
    manualReview: 0,
    skipped: 0,
    completed: 0,
    migratedCompleted: 0,
    remainingClassifiedAutoLink: 0,
    remainingClassifiedAutoCreate: 0,
    total: 0,
  }
}

export function aggregateInventoryMigrationMetrics(rows = []) {
  const metrics = createEmptyInventoryMigrationMetrics()
  const list = Array.isArray(rows) ? rows : []

  metrics.legacyItems = list.length
  metrics.total = list.length

  for (const row of list) {
    const status = `${row?.status ?? ''}`.trim()
    const resolutionType = `${row?.resolution_type ?? row?.resolutionType ?? ''}`.trim()
    const migratedAt = row?.migrated_at ?? row?.migratedAt ?? null

    if (status === 'classified') metrics.classified += 1
    if (resolutionType === 'auto_link') metrics.autoLink += 1
    if (resolutionType === 'auto_create') metrics.autoCreate += 1
    if (status === 'manual') metrics.manualReview += 1
    if (status === 'skipped') metrics.skipped += 1
    if (status === 'created' || status === 'linked') {
      metrics.completed += 1
      if (migratedAt) metrics.migratedCompleted += 1
    }
    if (status === 'classified' && resolutionType === 'auto_link') {
      metrics.remainingClassifiedAutoLink += 1
    }
    if (status === 'classified' && resolutionType === 'auto_create') {
      metrics.remainingClassifiedAutoCreate += 1
    }
  }

  return metrics
}

export function resolveInventoryMigrationStatus(metrics) {
  const completed = Number(metrics?.completed ?? 0)
  const total = Number(metrics?.total ?? metrics?.legacyItems ?? 0)

  if (completed === 0) return 'Not Started'
  if (total > 0 && completed === total) return 'Completed'
  if (completed > 0 && completed < total) return 'In Progress'
  return 'Not Started'
}

function stage(id, title, description, state) {
  return { id, title, description, state }
}

/**
 * Build live pipeline stages from metrics.
 * Returns Unknown for every stage when metrics are unavailable.
 */
export function buildInventoryMigrationPipeline({
  metrics,
  metricsAvailable = false,
  tableReachable = false,
} = {}) {
  const unknownAll = [
    stage('foundation', 'Foundation', 'Migration map table readiness.', PIPELINE_STATE.UNKNOWN),
    stage('classification', 'Classification', 'Legacy rows classified into map statuses.', PIPELINE_STATE.UNKNOWN),
    stage('auto-link', 'Auto Link', 'Exact catalog matches linked to stock items.', PIPELINE_STATE.UNKNOWN),
    stage('auto-create', 'Auto Create', 'Missing catalog rows created from snapshots.', PIPELINE_STATE.UNKNOWN),
    stage('integrity-audit', 'Integrity Audit', 'Map integrity validation.', PIPELINE_STATE.UNKNOWN),
    stage('preflight', 'Preflight', 'Quantity migration eligibility checks.', PIPELINE_STATE.UNKNOWN),
    stage('preview', 'Preview', 'Dry-run movement preview.', PIPELINE_STATE.UNKNOWN),
    stage('phase-1', 'Phase 1', 'Create INITIAL_IMPORT stock movements.', PIPELINE_STATE.UNKNOWN),
    stage('phase-2', 'Phase 2', 'Apply quantities using migrated_at.', PIPELINE_STATE.UNKNOWN),
    stage('completed', 'Completed', 'Full migration finished for this workspace.', PIPELINE_STATE.UNKNOWN),
  ]

  if (!metricsAvailable) return unknownAll

  const total = Number(metrics?.total ?? 0)
  const classified = Number(metrics?.classified ?? 0)
  const manual = Number(metrics?.manualReview ?? 0)
  const skipped = Number(metrics?.skipped ?? 0)
  const completed = Number(metrics?.completed ?? 0)
  const migratedCompleted = Number(metrics?.migratedCompleted ?? 0)
  const remainingAutoLink = Number(metrics?.remainingClassifiedAutoLink ?? 0)
  const remainingAutoCreate = Number(metrics?.remainingClassifiedAutoCreate ?? 0)
  const migrationStatus = resolveInventoryMigrationStatus(metrics)

  const classificationSettled = (classified + manual + skipped + completed) === total

  let classificationState = PIPELINE_STATE.WAITING
  if (classificationSettled) classificationState = PIPELINE_STATE.COMPLETE
  else if (classified + manual + skipped + completed > 0) classificationState = PIPELINE_STATE.IN_PROGRESS

  let autoLinkState = remainingAutoLink === 0
    ? PIPELINE_STATE.COMPLETE
    : PIPELINE_STATE.IN_PROGRESS

  let autoCreateState = remainingAutoCreate === 0
    ? PIPELINE_STATE.COMPLETE
    : PIPELINE_STATE.IN_PROGRESS

  let phase1State = PIPELINE_STATE.WAITING
  if (total > 0 && completed === total) phase1State = PIPELINE_STATE.COMPLETE
  else if (completed > 0) phase1State = PIPELINE_STATE.IN_PROGRESS

  let phase2State = PIPELINE_STATE.WAITING
  if (completed > 0 && migratedCompleted === completed) phase2State = PIPELINE_STATE.COMPLETE
  else if (migratedCompleted > 0 && migratedCompleted < completed) phase2State = PIPELINE_STATE.IN_PROGRESS

  const completedState = migrationStatus === 'Completed'
    ? PIPELINE_STATE.COMPLETE
    : PIPELINE_STATE.WAITING

  return [
    stage(
      'foundation',
      'Foundation',
      'Migration map table readiness.',
      tableReachable ? PIPELINE_STATE.COMPLETE : PIPELINE_STATE.UNKNOWN,
    ),
    stage(
      'classification',
      'Classification',
      'Legacy rows classified into map statuses.',
      classificationState,
    ),
    stage(
      'auto-link',
      'Auto Link',
      'Exact catalog matches linked to stock items.',
      autoLinkState,
    ),
    stage(
      'auto-create',
      'Auto Create',
      'Missing catalog rows created from snapshots.',
      autoCreateState,
    ),
    stage(
      'integrity-audit',
      'Integrity Audit',
      'Map integrity validation.',
      PIPELINE_STATE.WAITING,
    ),
    stage(
      'preflight',
      'Preflight',
      'Quantity migration eligibility checks.',
      PIPELINE_STATE.WAITING,
    ),
    stage(
      'preview',
      'Preview',
      'Dry-run movement preview.',
      PIPELINE_STATE.WAITING,
    ),
    stage(
      'phase-1',
      'Phase 1',
      'Create INITIAL_IMPORT stock movements.',
      phase1State,
    ),
    stage(
      'phase-2',
      'Phase 2',
      'Apply quantities using migrated_at.',
      phase2State,
    ),
    stage(
      'completed',
      'Completed',
      'Full migration finished for this workspace.',
      completedState,
    ),
  ]
}

export function resolveInventoryMigrationProgressPercent(metrics, metricsAvailable = false) {
  if (!metricsAvailable) return null
  const total = Number(metrics?.total ?? 0)
  const completed = Number(metrics?.completed ?? 0)
  if (total <= 0) return 0
  return Math.round((completed / total) * 100)
}

export function resolveInventoryMigrationCurrentStage(pipeline = []) {
  if (!Array.isArray(pipeline) || pipeline.length === 0) return 'Unknown'
  if (pipeline.every((item) => item.state === PIPELINE_STATE.UNKNOWN)) return 'Unknown'

  const active = pipeline.find((item) => (
    item.state === PIPELINE_STATE.IN_PROGRESS
    || item.state === PIPELINE_STATE.BLOCKED
    || item.state === PIPELINE_STATE.WAITING
  ))
  if (active) return active.title

  const allComplete = pipeline.every((item) => item.state === PIPELINE_STATE.COMPLETE)
  if (allComplete) return 'Completed'
  return 'Unknown'
}

function displayOrDash(value) {
  if (value === null || value === undefined) return '—'
  const text = `${value}`.trim()
  return text ? text : '—'
}

function readSnapshotField(snapshot, key) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = snapshot[key]
  if (value === null || value === undefined) return null
  const text = `${value}`.trim()
  return text ? text : null
}

/**
 * Map status=manual rows into read-only queue display records.
 * Missing fields become "—". Never invent values.
 */
export function mapManualReviewQueueRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []

  return list
    .filter((row) => `${row?.status ?? ''}`.trim() === 'manual')
    .map((row) => {
      const snapshot = row?.source_snapshot ?? row?.sourceSnapshot ?? null
      const createdAtRaw = row?.created_at ?? row?.createdAt ?? null
      let createdAt = '—'
      if (createdAtRaw) {
        const date = new Date(createdAtRaw)
        createdAt = Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
      }

      return {
        id: row?.id ?? null,
        legacyItemId: displayOrDash(row?.legacy_inventory_item_id ?? row?.legacyInventoryItemId),
        legacyName: displayOrDash(readSnapshotField(snapshot, 'item_name')),
        category: displayOrDash(readSnapshotField(snapshot, 'category')),
        conflictReason: displayOrDash(row?.conflict_reason ?? row?.conflictReason),
        currentResolution: displayOrDash(row?.resolution_type ?? row?.resolutionType),
        createdAt,
      }
    })
}

function formatCreatedAt(createdAtRaw) {
  if (!createdAtRaw) return '—'
  const date = new Date(createdAtRaw)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function hasNonEmptyConflictReason(row) {
  const raw = row?.conflict_reason ?? row?.conflictReason
  if (raw === null || raw === undefined) return false
  return `${raw}`.trim().length > 0
}

/**
 * Derive a single attention issue from existing map fields only.
 * Returns null when no safe attention signal is present.
 * Never invents classifications.
 */
export function classifyAttentionIssue(row) {
  if (!row || typeof row !== 'object') return null

  const status = `${row?.status ?? ''}`.trim()
  const snapshot = row?.source_snapshot ?? row?.sourceSnapshot ?? null
  const stockItemId = row?.stock_item_id ?? row?.stockItemId ?? null
  const hasStockRef = stockItemId !== null && stockItemId !== undefined && `${stockItemId}`.trim() !== ''

  if (hasNonEmptyConflictReason(row)) {
    return {
      issue: `${row?.conflict_reason ?? row?.conflictReason}`.trim(),
      severity: 'Attention',
    }
  }

  if ((status === 'created' || status === 'linked') && !hasStockRef) {
    return {
      issue: 'Missing stock reference',
      severity: 'Attention',
    }
  }

  if (status === 'failed') {
    return {
      issue: 'Failed',
      severity: 'Attention',
    }
  }

  if (snapshot === null || snapshot === undefined) {
    return {
      issue: 'Missing source snapshot',
      severity: 'Warning',
    }
  }

  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return {
      issue: 'Invalid source snapshot',
      severity: 'Warning',
    }
  }

  if (Object.keys(snapshot).length === 0) {
    return {
      issue: 'Empty source snapshot',
      severity: 'Warning',
    }
  }

  if (!readSnapshotField(snapshot, 'item_name')) {
    return {
      issue: 'Missing item name in source snapshot',
      severity: 'Warning',
    }
  }

  return null
}

/**
 * Map rows that require operator attention into read-only queue display records.
 * Only includes rows with a safe, field-backed attention signal.
 */
export function mapAttentionQueueRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []

  return list
    .map((row) => {
      const classification = classifyAttentionIssue(row)
      if (!classification) return null

      const snapshot = row?.source_snapshot ?? row?.sourceSnapshot ?? null
      return {
        id: row?.id ?? null,
        legacyItemId: displayOrDash(row?.legacy_inventory_item_id ?? row?.legacyInventoryItemId),
        legacyName: displayOrDash(readSnapshotField(snapshot, 'item_name')),
        issue: displayOrDash(classification.issue),
        currentStatus: displayOrDash(row?.status),
        resolutionType: displayOrDash(row?.resolution_type ?? row?.resolutionType),
        createdAt: formatCreatedAt(row?.created_at ?? row?.createdAt ?? null),
        severity: classification.severity === 'Warning' || classification.severity === 'Attention'
          ? classification.severity
          : 'Unknown',
      }
    })
    .filter(Boolean)
}

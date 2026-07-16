/**
 * Inventory Migration Session — pure in-memory domain model.
 *
 * No database table. No persistence. No writes. No RPC.
 *
 * Future contract:
 *   Future implementation will populate the session model from persisted
 *   migration session records. Do not implement persistence here.
 */

export const MIGRATION_SESSION_STATUS = {
  NOT_STARTED: 'NotStarted',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  UNKNOWN: 'Unknown',
}

export const MIGRATION_SESSION_STATUS_LABELS = {
  [MIGRATION_SESSION_STATUS.NOT_STARTED]: 'Not Started',
  [MIGRATION_SESSION_STATUS.RUNNING]: 'Running',
  [MIGRATION_SESSION_STATUS.COMPLETED]: 'Completed',
  [MIGRATION_SESSION_STATUS.CANCELLED]: 'Cancelled',
  [MIGRATION_SESSION_STATUS.UNKNOWN]: 'Unknown',
}

const EMPTY_DISPLAY = '—'

/**
 * Create an empty session placeholder.
 * Never fabricates ids, operators, or timestamps.
 */
export function createEmptyInventoryMigrationSession({
  workspaceId = null,
} = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  return {
    sessionId: null,
    workspaceId: normalizedWorkspaceId || null,
    operator: null,
    startedAt: null,
    finishedAt: null,
    status: MIGRATION_SESSION_STATUS.NOT_STARTED,
  }
}

/**
 * Normalize an unknown/partial session into the domain shape.
 * Missing values stay null — never invent data.
 */
export function normalizeInventoryMigrationSession(input = null) {
  if (!input || typeof input !== 'object') {
    return createEmptyInventoryMigrationSession()
  }

  const statusRaw = `${input.status ?? ''}`.trim()
  const knownStatuses = new Set(Object.values(MIGRATION_SESSION_STATUS))
  const status = knownStatuses.has(statusRaw)
    ? statusRaw
    : (statusRaw ? MIGRATION_SESSION_STATUS.UNKNOWN : MIGRATION_SESSION_STATUS.NOT_STARTED)

  const workspaceId = `${input.workspaceId ?? input.workspace_id ?? ''}`.trim() || null
  const sessionId = `${input.sessionId ?? input.session_id ?? ''}`.trim() || null
  const operator = `${input.operator ?? ''}`.trim() || null
  const startedAt = input.startedAt ?? input.started_at ?? null
  const finishedAt = input.finishedAt ?? input.finished_at ?? null

  return {
    sessionId,
    workspaceId,
    operator,
    startedAt: startedAt || null,
    finishedAt: finishedAt || null,
    status,
  }
}

export function formatMigrationSessionStatus(status) {
  const normalized = `${status ?? ''}`.trim()
  if (!normalized) return MIGRATION_SESSION_STATUS_LABELS[MIGRATION_SESSION_STATUS.NOT_STARTED]
  return MIGRATION_SESSION_STATUS_LABELS[normalized]
    ?? MIGRATION_SESSION_STATUS_LABELS[MIGRATION_SESSION_STATUS.UNKNOWN]
}

function formatSessionTimestamp(value) {
  if (value === null || value === undefined || value === '') return EMPTY_DISPLAY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return EMPTY_DISPLAY
  return date.toLocaleString()
}

/**
 * Map a session domain object into read-only summary display fields.
 * Unavailable values become "—". Status defaults to Not Started.
 */
export function mapInventoryMigrationSessionSummary(session = null) {
  const normalized = normalizeInventoryMigrationSession(session)

  return {
    sessionId: normalized.sessionId ? `${normalized.sessionId}` : EMPTY_DISPLAY,
    operator: normalized.operator ? `${normalized.operator}` : EMPTY_DISPLAY,
    startedAt: formatSessionTimestamp(normalized.startedAt),
    finishedAt: formatSessionTimestamp(normalized.finishedAt),
    status: formatMigrationSessionStatus(normalized.status),
    statusKey: normalized.status,
  }
}

/**
 * Placeholder summary used by the dashboard until persistence exists.
 * Always Not Started with empty identity fields.
 */
export function buildInventoryMigrationSessionPlaceholder({
  workspaceId = null,
} = {}) {
  const session = createEmptyInventoryMigrationSession({ workspaceId })
  return {
    session,
    summary: mapInventoryMigrationSessionSummary(session),
  }
}

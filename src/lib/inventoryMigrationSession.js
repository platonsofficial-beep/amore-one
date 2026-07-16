/**
 * Inventory Migration Session — pure domain model + display mapping.
 *
 * Persisted rows live in public.inventory_migration_sessions.
 * This module maps DB ↔ UI without fabricating session identity.
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

/** Map persisted DB status strings to domain status keys. */
export const MIGRATION_SESSION_DB_STATUS_TO_DOMAIN = {
  running: MIGRATION_SESSION_STATUS.RUNNING,
  completed: MIGRATION_SESSION_STATUS.COMPLETED,
  cancelled: MIGRATION_SESSION_STATUS.CANCELLED,
}

const EMPTY_DISPLAY = '—'

/**
 * Create an empty session placeholder (no persisted row).
 * Never fabricates ids, operators, or timestamps.
 */
export function createEmptyInventoryMigrationSession({
  workspaceId = null,
  status = MIGRATION_SESSION_STATUS.NOT_STARTED,
} = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const knownStatuses = new Set(Object.values(MIGRATION_SESSION_STATUS))
  const resolvedStatus = knownStatuses.has(status)
    ? status
    : MIGRATION_SESSION_STATUS.UNKNOWN

  return {
    sessionId: null,
    workspaceId: normalizedWorkspaceId || null,
    operator: null,
    startedAt: null,
    finishedAt: null,
    status: resolvedStatus,
  }
}

/**
 * Normalize DB or domain status into a domain status key.
 */
export function resolveInventoryMigrationSessionStatus(status) {
  const raw = `${status ?? ''}`.trim()
  if (!raw) return MIGRATION_SESSION_STATUS.NOT_STARTED

  if (Object.values(MIGRATION_SESSION_STATUS).includes(raw)) return raw

  const fromDb = MIGRATION_SESSION_DB_STATUS_TO_DOMAIN[raw.toLowerCase()]
  if (fromDb) return fromDb

  return MIGRATION_SESSION_STATUS.UNKNOWN
}

/**
 * Normalize an unknown/partial session into the domain shape.
 * Missing values stay null — never invent data.
 */
export function normalizeInventoryMigrationSession(input = null) {
  if (!input || typeof input !== 'object') {
    return createEmptyInventoryMigrationSession()
  }

  const workspaceId = `${input.workspaceId ?? input.workspace_id ?? ''}`.trim() || null
  const sessionId = `${input.sessionId ?? input.session_id ?? input.id ?? ''}`.trim() || null
  const operator = `${input.operator ?? input.operator_display_name ?? input.operatorDisplayName ?? ''}`.trim() || null
  const startedAt = input.startedAt ?? input.started_at ?? null
  const finishedAt = input.finishedAt ?? input.finished_at ?? null

  return {
    sessionId,
    workspaceId,
    operator,
    startedAt: startedAt || null,
    finishedAt: finishedAt || null,
    status: resolveInventoryMigrationSessionStatus(input.status),
  }
}

export function formatMigrationSessionStatus(status) {
  const resolved = resolveInventoryMigrationSessionStatus(status)
  return MIGRATION_SESSION_STATUS_LABELS[resolved]
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
 * Unavailable values become "—".
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
 * Empty-state summary when no session rows exist for the workspace.
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

/**
 * Unavailable / failed-fetch summary. Status is Unknown — never fabricate a session id.
 */
export function buildInventoryMigrationSessionUnavailable({
  workspaceId = null,
} = {}) {
  const session = createEmptyInventoryMigrationSession({
    workspaceId,
    status: MIGRATION_SESSION_STATUS.UNKNOWN,
  })
  return {
    session,
    summary: mapInventoryMigrationSessionSummary(session),
  }
}

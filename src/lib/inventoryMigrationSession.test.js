import { describe, expect, it } from 'vitest'
import {
  buildInventoryMigrationSessionPlaceholder,
  createEmptyInventoryMigrationSession,
  formatMigrationSessionStatus,
  mapInventoryMigrationSessionSummary,
  MIGRATION_SESSION_STATUS,
  normalizeInventoryMigrationSession,
} from './inventoryMigrationSession'

describe('inventoryMigrationSession', () => {
  it('exposes the session status enum', () => {
    expect(MIGRATION_SESSION_STATUS).toEqual({
      NOT_STARTED: 'NotStarted',
      RUNNING: 'Running',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      UNKNOWN: 'Unknown',
    })
  })

  it('creates empty session defaults without fabricating identity fields', () => {
    const session = createEmptyInventoryMigrationSession({
      workspaceId: 'ws-11111111-1111-1111-1111-111111111111',
    })

    expect(session).toEqual({
      sessionId: null,
      workspaceId: 'ws-11111111-1111-1111-1111-111111111111',
      operator: null,
      startedAt: null,
      finishedAt: null,
      status: MIGRATION_SESSION_STATUS.NOT_STARTED,
    })
  })

  it('maps summary placeholders to dashes and Not Started', () => {
    const summary = mapInventoryMigrationSessionSummary(
      createEmptyInventoryMigrationSession(),
    )

    expect(summary).toEqual({
      sessionId: '—',
      operator: '—',
      startedAt: '—',
      finishedAt: '—',
      status: 'Not Started',
      statusKey: MIGRATION_SESSION_STATUS.NOT_STARTED,
    })
  })

  it('normalizes unknown status values to Unknown', () => {
    const session = normalizeInventoryMigrationSession({
      sessionId: 'sess-1',
      workspaceId: 'ws-1',
      operator: 'Alex',
      startedAt: '2026-07-16T10:00:00.000Z',
      finishedAt: null,
      status: 'weird',
    })

    expect(session.status).toBe(MIGRATION_SESSION_STATUS.UNKNOWN)
    expect(formatMigrationSessionStatus(session.status)).toBe('Unknown')
    expect(mapInventoryMigrationSessionSummary(session).sessionId).toBe('sess-1')
    expect(mapInventoryMigrationSessionSummary(session).operator).toBe('Alex')
    expect(mapInventoryMigrationSessionSummary(session).startedAt).not.toBe('—')
    expect(mapInventoryMigrationSessionSummary(session).finishedAt).toBe('—')
  })

  it('builds a dashboard placeholder with Not Started status', () => {
    const placeholder = buildInventoryMigrationSessionPlaceholder({
      workspaceId: 'ws-2',
    })

    expect(placeholder.session.workspaceId).toBe('ws-2')
    expect(placeholder.session.sessionId).toBeNull()
    expect(placeholder.summary.status).toBe('Not Started')
    expect(placeholder.summary.sessionId).toBe('—')
  })

  it('handles null input as empty Not Started session', () => {
    expect(normalizeInventoryMigrationSession(null).status).toBe(
      MIGRATION_SESSION_STATUS.NOT_STARTED,
    )
    expect(mapInventoryMigrationSessionSummary(null).status).toBe('Not Started')
  })
})

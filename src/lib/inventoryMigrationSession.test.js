import { describe, expect, it } from 'vitest'
import {
  buildInventoryMigrationSessionPlaceholder,
  buildInventoryMigrationSessionUnavailable,
  createEmptyInventoryMigrationSession,
  formatMigrationSessionStatus,
  mapInventoryMigrationSessionSummary,
  MIGRATION_SESSION_STATUS,
  normalizeInventoryMigrationSession,
  resolveInventoryMigrationSessionStatus,
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

  it('maps database status strings to domain statuses', () => {
    expect(resolveInventoryMigrationSessionStatus('running')).toBe(MIGRATION_SESSION_STATUS.RUNNING)
    expect(resolveInventoryMigrationSessionStatus('completed')).toBe(MIGRATION_SESSION_STATUS.COMPLETED)
    expect(resolveInventoryMigrationSessionStatus('cancelled')).toBe(MIGRATION_SESSION_STATUS.CANCELLED)
    expect(resolveInventoryMigrationSessionStatus('')).toBe(MIGRATION_SESSION_STATUS.NOT_STARTED)
    expect(resolveInventoryMigrationSessionStatus('weird')).toBe(MIGRATION_SESSION_STATUS.UNKNOWN)
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

  it('normalizes persisted-shaped rows including snake_case fields', () => {
    const session = normalizeInventoryMigrationSession({
      id: 'sess-1',
      workspace_id: 'ws-1',
      operator_display_name: 'Alex',
      started_at: '2026-07-16T10:00:00.000Z',
      finished_at: null,
      status: 'completed',
    })

    expect(session).toMatchObject({
      sessionId: 'sess-1',
      workspaceId: 'ws-1',
      operator: 'Alex',
      status: MIGRATION_SESSION_STATUS.COMPLETED,
      finishedAt: null,
    })
    expect(mapInventoryMigrationSessionSummary(session).status).toBe('Completed')
    expect(mapInventoryMigrationSessionSummary(session).startedAt).not.toBe('—')
  })

  it('builds unavailable Unknown summary for fetch failures', () => {
    const unavailable = buildInventoryMigrationSessionUnavailable({ workspaceId: 'ws-2' })
    expect(unavailable.session.status).toBe(MIGRATION_SESSION_STATUS.UNKNOWN)
    expect(unavailable.summary.status).toBe('Unknown')
    expect(unavailable.summary.sessionId).toBe('—')
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
    expect(formatMigrationSessionStatus('running')).toBe('Running')
  })
})

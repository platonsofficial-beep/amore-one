// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATION_SESSION_STATUS } from '../src/lib/inventoryMigrationSession'

const supabaseMocks = vi.hoisted(() => {
  let rpcResult = { data: true, error: null }
  let queryQueue = []

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then(onFulfilled, onRejected) {
      const next = queryQueue.length > 0
        ? queryQueue.shift()
        : { data: [], error: null }
      return Promise.resolve(next).then(onFulfilled, onRejected)
    },
  }

  return {
    builder,
    enqueueQueryResult(result) {
      queryQueue.push(result)
    },
    setRpcResult(result) {
      rpcResult = result
    },
    reset() {
      queryQueue = []
      rpcResult = { data: true, error: null }
      Object.values(builder).forEach((mock) => {
        if (typeof mock?.mockReset === 'function') mock.mockReset()
      })
      builder.select.mockImplementation(() => builder)
      builder.eq.mockImplementation(() => builder)
      builder.order.mockImplementation(() => builder)
      builder.limit.mockImplementation(() => builder)
      this.from.mockClear()
      this.rpc.mockClear()
      this.rpc.mockImplementation(async () => rpcResult)
      this.from.mockImplementation(() => builder)
    },
    from: vi.fn(() => builder),
    rpc: vi.fn(async () => rpcResult),
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => supabaseMocks.from(...args),
    rpc: (...args) => supabaseMocks.rpc(...args),
  },
}))

import {
  getInventoryMigrationSessionSummary,
  mapPersistedInventoryMigrationSessionRow,
} from '../src/services/inventoryMigrationSessionService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const OTHER_WORKSPACE_ID = 'ws-22222222-2222-2222-2222-222222222222'

describe('inventoryMigrationSessionService live read', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  it('maps persisted rows into domain status without fabricating fields', () => {
    const session = mapPersistedInventoryMigrationSessionRow({
      id: 'sess-1',
      workspace_id: WORKSPACE_ID,
      status: 'running',
      operator_display_name: 'Alex',
      started_at: '2026-07-16T10:00:00.000Z',
      finished_at: null,
    })

    expect(session).toMatchObject({
      sessionId: 'sess-1',
      workspaceId: WORKSPACE_ID,
      operator: 'Alex',
      status: MIGRATION_SESSION_STATUS.RUNNING,
      finishedAt: null,
    })
  })

  it('returns Not Started placeholder when no session rows exist', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQueryResult({ data: [], error: null })
    supabaseMocks.enqueueQueryResult({ data: [], error: null })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(result.sessionAvailable).toBe(false)
    expect(result.summary.status).toBe('Not Started')
    expect(result.summary.sessionId).toBe('—')
    expect(result.error).toBeNull()
  })

  it('prefers the running session when present', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQueryResult({
      data: [{
        id: 'sess-running',
        workspace_id: WORKSPACE_ID,
        status: 'running',
        operator_display_name: 'Alex',
        started_at: '2026-07-16T12:00:00.000Z',
        finished_at: null,
      }],
      error: null,
    })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(result.sessionAvailable).toBe(true)
    expect(result.summary.sessionId).toBe('sess-running')
    expect(result.summary.status).toBe('Running')
    expect(result.summary.operator).toBe('Alex')
  })

  it('chooses latest completed session when no running session exists', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQueryResult({ data: [], error: null })
    supabaseMocks.enqueueQueryResult({
      data: [{
        id: 'sess-completed',
        workspace_id: WORKSPACE_ID,
        status: 'completed',
        operator_display_name: 'Blair',
        started_at: '2026-07-16T11:00:00.000Z',
        finished_at: '2026-07-16T12:00:00.000Z',
      }],
      error: null,
    })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(result.sessionAvailable).toBe(true)
    expect(result.summary.sessionId).toBe('sess-completed')
    expect(result.summary.status).toBe('Completed')
    expect(result.summary.finishedAt).not.toBe('—')
  })

  it('chooses latest cancelled session when no running session exists', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQueryResult({ data: [], error: null })
    supabaseMocks.enqueueQueryResult({
      data: [{
        id: 'sess-cancelled',
        workspace_id: WORKSPACE_ID,
        status: 'cancelled',
        operator_display_name: 'Casey',
        started_at: '2026-07-16T09:00:00.000Z',
        finished_at: '2026-07-16T09:30:00.000Z',
      }],
      error: null,
    })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(result.sessionAvailable).toBe(true)
    expect(result.summary.sessionId).toBe('sess-cancelled')
    expect(result.summary.status).toBe('Cancelled')
  })

  it('returns Unknown on fetch failure without fabricating a session id', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQueryResult({
      data: null,
      error: { message: 'relation does not exist', code: '42P01' },
    })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(result.sessionAvailable).toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.summary.status).toBe('Unknown')
    expect(result.summary.sessionId).toBe('—')
    expect(result.error).toMatch(/relation does not exist/i)
  })

  it('rejects mismatched workspace rows without fabricating data', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQueryResult({
      data: [{
        id: 'sess-other',
        workspace_id: OTHER_WORKSPACE_ID,
        status: 'running',
        operator_display_name: 'Other',
        started_at: '2026-07-16T12:00:00.000Z',
        finished_at: null,
      }],
      error: null,
    })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(result.sessionAvailable).toBe(false)
    expect(result.summary.status).toBe('Unknown')
    expect(result.summary.sessionId).toBe('—')
    expect(result.error).toMatch(/workspace mismatch/i)
  })

  it('denies unauthorized callers without fabricating a session', async () => {
    supabaseMocks.setRpcResult({ data: false, error: null })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.sessionAvailable).toBe(false)
    expect(result.summary.status).toBe('Unknown')
    expect(result.error).toMatch(/permission/i)
  })
})

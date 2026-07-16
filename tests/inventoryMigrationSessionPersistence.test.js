// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

describe('inventory_migration_sessions.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_sessions.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  it('defines table, CHECK status, and required columns', () => {
    expect(sql).toContain('create table if not exists public.inventory_migration_sessions')
    expect(sql).toContain("check (status in ('running', 'completed', 'cancelled'))")
    expect(sql).toContain('workspace_id uuid not null')
    expect(sql).toContain('references public.workspaces(id) on delete cascade')
    expect(sql).toContain('started_by uuid')
    expect(sql).toContain('references auth.users(id) on delete set null')
    expect(sql).toContain('operator_display_name text not null default')
    expect(sql).toContain('started_at timestamptz not null default now()')
    expect(sql).toContain('finished_at timestamptz')
  })

  it('creates indexes including one-running partial unique', () => {
    expect(sql).toContain('inventory_migration_sessions_workspace_idx')
    expect(sql).toContain('inventory_migration_sessions_status_idx')
    expect(sql).toContain('inventory_migration_sessions_started_at_idx')
    expect(sql).toContain('inventory_migration_sessions_one_running_per_workspace')
    expect(sql).toContain('where status = \'running\'')
  })

  it('creates updated_at trigger and SELECT-only RLS', () => {
    expect(sql).toContain('set_inventory_migration_sessions_updated_at')
    expect(sql).toContain('inventory_migration_sessions_set_updated_at')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('inventory_migration_sessions_select_managers')
    expect(sql).toContain('using (public.can_manage_workspace_stock(workspace_id))')
    expect(sql).toContain('grant select on table public.inventory_migration_sessions to authenticated')
    expect(sql).toContain('Intentionally no INSERT / UPDATE / DELETE policies')
    expect(sql).not.toMatch(/create policy[\s\S]*for insert/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for update/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for delete/i)
  })
})

describe('inventoryMigrationSessionService', () => {
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

  it('denies unauthorized callers without fabricating a session', async () => {
    supabaseMocks.setRpcResult({ data: false, error: null })

    const result = await getInventoryMigrationSessionSummary(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.sessionAvailable).toBe(false)
    expect(result.summary.status).toBe('Not Started')
    expect(result.error).toMatch(/permission/i)
  })
})

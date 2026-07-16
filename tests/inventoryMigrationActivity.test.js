// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  let rpcResult = { data: true, error: null }
  let queryResult = { data: [], error: null }

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then(onFulfilled, onRejected) {
      return Promise.resolve(queryResult).then(onFulfilled, onRejected)
    },
  }

  return {
    builder,
    setQueryResult(result) {
      queryResult = result
    },
    setRpcResult(result) {
      rpcResult = result
    },
    reset() {
      queryResult = { data: [], error: null }
      rpcResult = { data: true, error: null }
      Object.values(builder).forEach((mock) => {
        if (typeof mock?.mockReset === 'function') mock.mockReset()
      })
      builder.select.mockImplementation(() => builder)
      builder.eq.mockImplementation(() => builder)
      builder.order.mockImplementation(() => builder)
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
  getInventoryMigrationActivity,
  mapInventoryMigrationActivityRow,
} from '../src/services/inventoryMigrationActivityService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'

describe('inventory_migration_activity.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_activity.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  it('defines immutable activity table with required columns and CHECK', () => {
    const tableMatch = sql.match(
      /create table if not exists public\.inventory_migration_activity \(([\s\S]*?)\);/,
    )
    expect(tableMatch).toBeTruthy()
    const tableBody = tableMatch?.[1] ?? ''

    expect(sql).toContain('create table if not exists public.inventory_migration_activity')
    expect(tableBody).toContain('session_id uuid not null')
    expect(sql).toContain('references public.inventory_migration_sessions(id) on delete cascade')
    expect(tableBody).toContain('workspace_id uuid not null')
    expect(tableBody).toContain('check (activity_type in (')
    expect(tableBody).toContain("'session_started'")
    expect(tableBody).toContain("'session_completed'")
    expect(tableBody).toContain("'session_cancelled'")
    expect(tableBody).toContain("'note'")
    expect(tableBody).toContain('activity_text text not null default')
    expect(tableBody).toContain('operator_display_name text not null default')
    expect(tableBody).toContain('created_at timestamptz not null default now()')
    expect(tableBody).not.toMatch(/\bupdated_at\b/)
  })

  it('creates session, workspace, and created_at indexes', () => {
    expect(sql).toContain('inventory_migration_activity_session_idx')
    expect(sql).toContain('inventory_migration_activity_workspace_idx')
    expect(sql).toContain('inventory_migration_activity_created_at_idx')
    expect(sql).toContain('(created_at desc)')
  })

  it('enables RLS with SELECT-only manager policy and no write policies', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('inventory_migration_activity_select_managers')
    expect(sql).toContain('using (public.can_manage_workspace_stock(workspace_id))')
    expect(sql).toContain('grant select on table public.inventory_migration_activity to authenticated')
    expect(sql).toContain('Intentionally no INSERT / UPDATE / DELETE policies')
    expect(sql).not.toMatch(/create policy[\s\S]*for insert/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for update/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for delete/i)
  })
})

describe('inventoryMigrationActivityService', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  it('maps activity rows without fabricating values', () => {
    const mapped = mapInventoryMigrationActivityRow({
      id: 'act-1',
      session_id: 'sess-1',
      workspace_id: WORKSPACE_ID,
      activity_type: 'session_started',
      activity_text: '',
      operator_display_name: 'Alex',
      created_at: '2026-07-16T12:00:00.000Z',
    })

    expect(mapped).toMatchObject({
      id: 'act-1',
      sessionId: 'sess-1',
      operator: 'Alex',
      activity: 'Session started',
    })
    expect(mapped.createdAt).not.toBe('—')
  })

  it('returns empty activity when no rows exist', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({ data: [], error: null })

    const result = await getInventoryMigrationActivity(WORKSPACE_ID)

    expect(result.activityAvailable).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toBeNull()
  })

  it('returns newest-first mapped rows for the workspace', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({
      data: [
        {
          id: 'act-2',
          session_id: 'sess-1',
          workspace_id: WORKSPACE_ID,
          activity_type: 'session_completed',
          activity_text: 'Done',
          operator_display_name: 'Blair',
          created_at: '2026-07-16T13:00:00.000Z',
        },
        {
          id: 'act-1',
          session_id: 'sess-1',
          workspace_id: WORKSPACE_ID,
          activity_type: 'session_started',
          activity_text: '',
          operator_display_name: 'Alex',
          created_at: '2026-07-16T12:00:00.000Z',
        },
      ],
      error: null,
    })

    const result = await getInventoryMigrationActivity(WORKSPACE_ID)

    expect(result.activityAvailable).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].id).toBe('act-2')
    expect(result.rows[0].activity).toBe('Session completed: Done')
    expect(supabaseMocks.builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
  })

  it('returns unavailable on fetch failure without fabricating rows', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({
      data: null,
      error: { message: 'relation does not exist', code: '42P01' },
    })

    const result = await getInventoryMigrationActivity(WORKSPACE_ID)

    expect(result.activityAvailable).toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/relation does not exist/i)
  })

  it('denies unauthorized callers without fabricating rows', async () => {
    supabaseMocks.setRpcResult({ data: false, error: null })

    const result = await getInventoryMigrationActivity(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.activityAvailable).toBe(false)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/permission/i)
  })
})

describe('StockMigrationActivityLog UI source review', () => {
  const componentPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../src/components/stock/StockMigrationActivityLog.jsx',
  )
  const source = readFileSync(componentPath, 'utf8')

  it('covers loading, empty, and unavailable presentation without actions', () => {
    expect(source).toContain('Loading…')
    expect(source).toContain('No migration activity yet.')
    expect(source).toContain('Activity data is temporarily unavailable.')
    expect(source).toContain('Timestamp')
    expect(source).toContain('Operator')
    expect(source).toContain('Activity')
    expect(source).toContain('Session')
    expect(source).not.toMatch(/<button/i)
    expect(source).not.toMatch(/\bonClick\b/)
    expect(source).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i)
  })
})

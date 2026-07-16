// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  let rpcResult = { data: true, error: null }
  const queue = []

  const makeBuilder = () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then(onFulfilled, onRejected) {
        const next = queue.length > 0
          ? queue.shift()
          : { data: [], error: null }
        return Promise.resolve(next).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  return {
    queue,
    setRpcResult(result) {
      rpcResult = result
    },
    enqueueQuery(result) {
      queue.push(result)
    },
    reset() {
      queue.length = 0
      rpcResult = { data: true, error: null }
      this.from.mockClear()
      this.rpc.mockClear()
      this.rpc.mockImplementation(async () => rpcResult)
      this.from.mockImplementation(() => makeBuilder())
    },
    from: vi.fn(() => makeBuilder()),
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
  getInventoryMigrationSessionSteps,
  mapInventoryMigrationSessionStepRow,
  MIGRATION_SESSION_STEP_ORDER,
  sortInventoryMigrationSessionSteps,
} from '../src/services/inventoryMigrationSessionStepsService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'

describe('inventory_migration_session_steps.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_session_steps.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  it('defines immutable steps table with required columns and CHECKs', () => {
    const tableMatch = sql.match(
      /create table if not exists public\.inventory_migration_session_steps \(([\s\S]*?)\);/,
    )
    expect(tableMatch).toBeTruthy()
    const tableBody = tableMatch?.[1] ?? ''

    expect(sql).toContain('create table if not exists public.inventory_migration_session_steps')
    expect(tableBody).toContain('session_id uuid not null')
    expect(sql).toContain('references public.inventory_migration_sessions(id) on delete cascade')
    expect(tableBody).toContain('workspace_id uuid not null')
    expect(tableBody).toContain('check (step_name in (')
    expect(tableBody).toContain("'foundation'")
    expect(tableBody).toContain("'persist'")
    expect(tableBody).toContain("'auto_link'")
    expect(tableBody).toContain("'auto_create'")
    expect(tableBody).toContain("'integrity_audit'")
    expect(tableBody).toContain("'preflight'")
    expect(tableBody).toContain("'preview'")
    expect(tableBody).toContain("'phase1'")
    expect(tableBody).toContain("'phase2'")
    expect(tableBody).toContain("'post_apply_audit'")
    expect(tableBody).toContain('check (status in (')
    expect(tableBody).toContain("'waiting'")
    expect(tableBody).toContain("'running'")
    expect(tableBody).toContain("'completed'")
    expect(tableBody).toContain('started_at timestamptz null')
    expect(tableBody).toContain('completed_at timestamptz null')
    expect(tableBody).toContain('created_at timestamptz not null default now()')
    expect(tableBody).not.toMatch(/\bupdated_at\b/)
  })

  it('enforces unique (session_id, step_name) and required indexes', () => {
    expect(sql).toContain('inventory_migration_session_steps_session_step_uidx')
    expect(sql).toContain('unique (session_id, step_name)')
    expect(sql).toContain('inventory_migration_session_steps_session_idx')
    expect(sql).toContain('inventory_migration_session_steps_workspace_idx')
    expect(sql).toContain('inventory_migration_session_steps_status_idx')
    expect(sql).toContain('inventory_migration_session_steps_step_name_idx')
  })

  it('enables RLS with SELECT-only manager policy and no write policies', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('inventory_migration_session_steps_select_managers')
    expect(sql).toContain('using (public.can_manage_workspace_stock(workspace_id))')
    expect(sql).toContain('grant select on table public.inventory_migration_session_steps to authenticated')
    expect(sql).toContain('Intentionally no INSERT / UPDATE / DELETE policies')
    expect(sql).not.toMatch(/create policy[\s\S]*for insert/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for update/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for delete/i)
  })
})

describe('inventoryMigrationSessionStepsService', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  it('maps step rows without fabricating values', () => {
    const mapped = mapInventoryMigrationSessionStepRow({
      id: 'step-1',
      session_id: SESSION_ID,
      workspace_id: WORKSPACE_ID,
      step_name: 'preflight',
      status: 'waiting',
      started_at: null,
      completed_at: null,
    })

    expect(mapped).toMatchObject({
      id: 'step-1',
      sessionId: SESSION_ID,
      step: 'Preflight',
      status: 'Waiting',
      startedAt: '—',
      completedAt: '—',
    })
  })

  it('orders steps by the canonical migration stage list', () => {
    expect(MIGRATION_SESSION_STEP_ORDER).toEqual([
      'foundation',
      'persist',
      'auto_link',
      'auto_create',
      'integrity_audit',
      'preflight',
      'preview',
      'phase1',
      'phase2',
      'post_apply_audit',
    ])

    const sorted = sortInventoryMigrationSessionSteps([
      { step_name: 'phase2' },
      { step_name: 'foundation' },
      { step_name: 'preview' },
    ])

    expect(sorted.map((row) => row.step_name)).toEqual([
      'foundation',
      'preview',
      'phase2',
    ])
  })

  it('returns empty steps when no session exists', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQuery({ data: [], error: null })
    supabaseMocks.enqueueQuery({ data: [], error: null })

    const result = await getInventoryMigrationSessionSteps(WORKSPACE_ID)

    expect(result.stepsAvailable).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.sessionId).toBeNull()
    expect(result.error).toBeNull()
  })

  it('loads running session steps ordered canonically', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQuery({
      data: [{ id: SESSION_ID, workspace_id: WORKSPACE_ID, status: 'running', started_at: '2026-07-16T12:00:00.000Z' }],
      error: null,
    })
    supabaseMocks.enqueueQuery({
      data: [
        {
          id: 'step-2',
          session_id: SESSION_ID,
          workspace_id: WORKSPACE_ID,
          step_name: 'persist',
          status: 'waiting',
          started_at: null,
          completed_at: null,
          created_at: '2026-07-16T12:00:01.000Z',
        },
        {
          id: 'step-1',
          session_id: SESSION_ID,
          workspace_id: WORKSPACE_ID,
          step_name: 'foundation',
          status: 'completed',
          started_at: '2026-07-16T12:00:00.000Z',
          completed_at: '2026-07-16T12:00:01.000Z',
          created_at: '2026-07-16T12:00:00.000Z',
        },
      ],
      error: null,
    })

    const result = await getInventoryMigrationSessionSteps(WORKSPACE_ID)

    expect(result.stepsAvailable).toBe(true)
    expect(result.sessionId).toBe(SESSION_ID)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].step).toBe('Foundation')
    expect(result.rows[1].step).toBe('Persist')
  })

  it('falls back to latest session when none are running', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQuery({ data: [], error: null })
    supabaseMocks.enqueueQuery({
      data: [{ id: SESSION_ID, workspace_id: WORKSPACE_ID, status: 'completed', started_at: '2026-07-16T11:00:00.000Z' }],
      error: null,
    })
    supabaseMocks.enqueueQuery({ data: [], error: null })

    const result = await getInventoryMigrationSessionSteps(WORKSPACE_ID)

    expect(result.stepsAvailable).toBe(true)
    expect(result.sessionId).toBe(SESSION_ID)
    expect(result.rows).toEqual([])
  })

  it('returns unavailable on steps fetch failure without fabricating rows', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.enqueueQuery({
      data: [{ id: SESSION_ID, workspace_id: WORKSPACE_ID, status: 'running', started_at: '2026-07-16T12:00:00.000Z' }],
      error: null,
    })
    supabaseMocks.enqueueQuery({
      data: null,
      error: { message: 'relation does not exist', code: '42P01' },
    })

    const result = await getInventoryMigrationSessionSteps(WORKSPACE_ID)

    expect(result.stepsAvailable).toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/relation does not exist/i)
  })

  it('denies unauthorized callers without fabricating rows', async () => {
    supabaseMocks.setRpcResult({ data: false, error: null })

    const result = await getInventoryMigrationSessionSteps(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.stepsAvailable).toBe(false)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/permission/i)
  })
})

describe('StockMigrationSessionSteps UI source review', () => {
  const componentPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../src/components/stock/StockMigrationSessionSteps.jsx',
  )
  const source = readFileSync(componentPath, 'utf8')

  it('covers loading, empty, and unavailable presentation without actions', () => {
    expect(source).toContain('Migration Session Steps')
    expect(source).toContain('Loading…')
    expect(source).toContain('No migration session steps yet.')
    expect(source).toContain('Session steps data is temporarily unavailable.')
    expect(source).toContain('Step')
    expect(source).toContain('Status')
    expect(source).toContain('Started')
    expect(source).toContain('Completed')
    expect(source).not.toMatch(/<button/i)
    expect(source).not.toMatch(/\bonClick\b/)
  })
})

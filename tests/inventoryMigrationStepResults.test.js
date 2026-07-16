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
  getInventoryMigrationStepResults,
  mapInventoryMigrationStepResultRow,
  MIGRATION_STEP_RESULT_STATUS,
  sortInventoryMigrationStepResults,
} from '../src/services/inventoryMigrationStepResultsService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'

describe('inventory_migration_step_results.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_step_results.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  it('defines immutable results table with required columns and CHECKs', () => {
    const tableMatch = sql.match(
      /create table if not exists public\.inventory_migration_step_results \(([\s\S]*?)\);/,
    )
    expect(tableMatch).toBeTruthy()
    const tableBody = tableMatch?.[1] ?? ''

    expect(sql).toContain('create table if not exists public.inventory_migration_step_results')
    expect(tableBody).toContain('session_id uuid not null')
    expect(tableBody).toContain('step_id uuid not null')
    expect(tableBody).toContain('workspace_id uuid not null')
    expect(tableBody).toContain('check (step_name in (')
    expect(tableBody).toContain("'foundation'")
    expect(tableBody).toContain("'integrity_audit'")
    expect(tableBody).toContain("'post_apply_audit'")
    expect(tableBody).toContain('check (result_status in (')
    expect(tableBody).toContain("'passed'")
    expect(tableBody).toContain("'attention_required'")
    expect(tableBody).not.toContain("'unknown'")
    expect(tableBody).not.toContain("'failed'")
    expect(tableBody).toContain("jsonb_typeof(result_summary) = 'object'")
    expect(tableBody).toContain('critical_finding_count bigint not null default 0')
    expect(tableBody).toContain('attention_finding_count bigint not null default 0')
    expect(tableBody).toContain('check (critical_finding_count >= 0)')
    expect(tableBody).toContain('check (attention_finding_count >= 0)')
    expect(tableBody).toContain('executed_at timestamptz not null default now()')
    expect(tableBody).toContain('created_at timestamptz not null default now()')
    expect(tableBody).not.toMatch(/\bupdated_at\b/)
  })

  it('enforces foreign keys, unique identities, and cascade deletes', () => {
    expect(sql).toContain('references public.inventory_migration_sessions(id) on delete cascade')
    expect(sql).toContain('references public.inventory_migration_session_steps(id) on delete cascade')
    expect(sql).toContain('references public.workspaces(id) on delete cascade')
    expect(sql).toContain('inventory_migration_step_results_session_step_uidx')
    expect(sql).toContain('unique (session_id, step_name)')
    expect(sql).toContain('inventory_migration_step_results_step_id_uidx')
    expect(sql).toContain('unique (step_id)')
    expect(sql).toContain('inventory_migration_step_results_session_step_fkey')
    expect(sql).toContain(
      'references public.inventory_migration_session_steps (session_id, step_name)',
    )
  })

  it('creates expected read-path indexes without write policies', () => {
    expect(sql).toContain('inventory_migration_step_results_workspace_idx')
    expect(sql).toContain('inventory_migration_step_results_step_name_idx')
    expect(sql).toContain('inventory_migration_step_results_result_status_idx')
    expect(sql).toContain('inventory_migration_step_results_executed_at_idx')
    expect(sql).toContain('(executed_at desc)')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('inventory_migration_step_results_select_managers')
    expect(sql).toContain('using (public.can_manage_workspace_stock(workspace_id))')
    expect(sql).toContain('grant select on table public.inventory_migration_step_results to authenticated')
    expect(sql).toContain('Intentionally no INSERT / UPDATE / DELETE policies')
    expect(sql).not.toMatch(/create policy[\s\S]*for insert/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for update/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for delete/i)
    expect(sql).not.toMatch(/create or replace function public\.(?!is_workspace_member|can_manage_workspace_stock)/i)
  })

  it('documents that stage RPCs must populate identity from locked step rows', () => {
    expect(sql).toContain('stage-owned RPCs copying values from one locked')
    expect(sql).toContain('do not redesign session/step schemas')
  })
})

describe('inventoryMigrationStepResultsService', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  it('maps passed and attention_required rows without fabricating values', () => {
    const passed = mapInventoryMigrationStepResultRow({
      id: 'res-1',
      session_id: SESSION_ID,
      step_id: 'step-1',
      workspace_id: WORKSPACE_ID,
      step_name: 'integrity_audit',
      result_status: MIGRATION_STEP_RESULT_STATUS.PASSED,
      result_summary: { critical_finding_count: 0 },
      critical_finding_count: 0,
      attention_finding_count: 0,
      operator_display_name: 'Alex',
      executed_at: '2026-07-16T12:00:00.000Z',
    })

    expect(passed).toMatchObject({
      id: 'res-1',
      sessionId: SESSION_ID,
      stepId: 'step-1',
      workspaceId: WORKSPACE_ID,
      stepName: 'integrity_audit',
      resultStatus: 'passed',
      criticalFindingCount: 0,
      attentionFindingCount: 0,
      operator: 'Alex',
    })
    expect(passed.executedAt).not.toBe('—')

    const attention = mapInventoryMigrationStepResultRow({
      id: 'res-2',
      session_id: SESSION_ID,
      step_id: 'step-2',
      workspace_id: WORKSPACE_ID,
      step_name: 'integrity_audit',
      result_status: MIGRATION_STEP_RESULT_STATUS.ATTENTION_REQUIRED,
      result_summary: { orphan_stock_item_references: 2 },
      critical_finding_count: 2,
      attention_finding_count: 2,
      operator_display_name: 'Blair',
      executed_at: '2026-07-16T13:00:00.000Z',
    })

    expect(attention.resultStatus).toBe('attention_required')
    expect(attention.criticalFindingCount).toBe(2)
  })

  it('orders results by canonical step order', () => {
    const sorted = sortInventoryMigrationStepResults([
      { step_name: 'phase1', executed_at: '2026-07-16T12:00:00.000Z' },
      { step_name: 'foundation', executed_at: '2026-07-16T11:00:00.000Z' },
      { step_name: 'integrity_audit', executed_at: '2026-07-16T11:30:00.000Z' },
    ])

    expect(sorted.map((row) => row.step_name)).toEqual([
      'foundation',
      'integrity_audit',
      'phase1',
    ])
  })

  it('returns empty rows when no results exist for the workspace', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({ data: [], error: null })

    const result = await getInventoryMigrationStepResults(WORKSPACE_ID)

    expect(result.resultsAvailable).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toBeNull()
    expect(supabaseMocks.from).toHaveBeenCalledWith('inventory_migration_step_results')
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
    expect(supabaseMocks.builder.order).toHaveBeenCalledWith('executed_at', { ascending: true })
  })

  it('applies optional session filter and maps workspace-scoped rows', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({
      data: [
        {
          id: 'res-1',
          session_id: SESSION_ID,
          step_id: 'step-1',
          workspace_id: WORKSPACE_ID,
          step_name: 'integrity_audit',
          result_status: 'passed',
          result_summary: {},
          critical_finding_count: 0,
          attention_finding_count: 0,
          operator_display_name: 'Alex',
          executed_at: '2026-07-16T12:00:00.000Z',
          created_at: '2026-07-16T12:00:00.000Z',
        },
      ],
      error: null,
    })

    const result = await getInventoryMigrationStepResults(WORKSPACE_ID, {
      sessionId: SESSION_ID,
    })

    expect(result.resultsAvailable).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].resultStatus).toBe('passed')
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('session_id', SESSION_ID)
  })

  it('returns unavailable on fetch failure without fabricating evidence', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({
      data: null,
      error: { message: 'relation does not exist', code: '42P01' },
    })

    const result = await getInventoryMigrationStepResults(WORKSPACE_ID)

    expect(result.resultsAvailable).toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/relation does not exist/i)
  })

  it('denies unauthorized callers without fabricating evidence', async () => {
    supabaseMocks.setRpcResult({ data: false, error: null })

    const result = await getInventoryMigrationStepResults(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.resultsAvailable).toBe(false)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/permission/i)
  })

  it('does not expose write helpers from the read service module', async () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../src/services/inventoryMigrationStepResultsService.js',
      ),
      'utf8',
    )

    expect(source).not.toMatch(/\.insert\(/)
    expect(source).not.toMatch(/\.update\(/)
    expect(source).not.toMatch(/\.delete\(/)
    expect(source).not.toMatch(/transition_inventory_migration_step/)
    expect(source).not.toMatch(/inventory_stock_integrity_audit/)
  })
})

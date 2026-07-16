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
  getInventoryMigrationStageAttentionAcknowledgements,
  mapInventoryMigrationAttentionAckRow,
  MIGRATION_ATTENTION_ACK_BOUNDARIES,
  sortInventoryMigrationAttentionAcks,
} from '../src/services/inventoryMigrationStageAttentionAcknowledgementsService'

const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111'
const SESSION_ID = 'sess-22222222-2222-2222-2222-222222222222'

describe('inventory_migration_stage_attention_acknowledgements.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_stage_attention_acknowledgements.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const tableMatch = sql.match(
    /create table if not exists public\.inventory_migration_stage_attention_acknowledgements \(([\s\S]*?)\);/,
  )
  const tableBody = tableMatch?.[1] ?? ''

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.acknowledge_inventory_migration_stage_attention'),
    sql.indexOf('revoke all on function public.acknowledge_inventory_migration_stage_attention'),
  )

  it('defines immutable acknowledgement table with relational identity', () => {
    expect(tableMatch).toBeTruthy()
    expect(tableBody).toContain('workspace_id uuid not null')
    expect(tableBody).toContain('session_id uuid not null')
    expect(tableBody).toContain('prior_step_id uuid not null')
    expect(tableBody).toContain('prior_result_id uuid not null')
    expect(tableBody).toContain('prior_step_name text not null')
    expect(tableBody).toContain('next_step_id uuid not null')
    expect(tableBody).toContain('next_step_name text not null')
    expect(tableBody).toContain('acknowledged_by uuid')
    expect(tableBody).toContain('operator_display_name text not null default')
    expect(tableBody).toContain('note text null')
    expect(tableBody).toContain('acknowledged_at timestamptz not null')
    expect(tableBody).toContain('created_at timestamptz not null')
    expect(tableBody).not.toContain('updated_at')
  })

  it('restricts boundaries and uniqueness to one ack per prior result and next stage', () => {
    expect(tableBody).toContain('inventory_migration_ack_boundary_chk')
    expect(tableBody).toContain("prior_step_name = 'integrity_audit' and next_step_name = 'preflight'")
    expect(tableBody).toContain("prior_step_name = 'preview' and next_step_name = 'phase1'")
    expect(tableBody).toContain("prior_step_name = 'phase1' and next_step_name = 'phase2'")
    expect(tableBody).toContain('unique (prior_result_id, next_step_name)')
    expect(tableBody).not.toContain("'post_apply_audit'")
    expect(tableBody).not.toContain("'persist'")
  })

  it('enables SELECT-only RLS for stock managers with no direct write policies', () => {
    const rlsSection = sql.slice(
      sql.indexOf('-- Privileges + RLS'),
      sql.indexOf('-- Acknowledge RPC'),
    )

    expect(sql).toContain('enable row level security')
    expect(sql).toContain('grant select on table public.inventory_migration_stage_attention_acknowledgements to authenticated')
    expect(sql).toContain('revoke all on table public.inventory_migration_stage_attention_acknowledgements from public')
    expect(sql).toContain('revoke all on table public.inventory_migration_stage_attention_acknowledgements from anon')
    expect(rlsSection).toContain('can_manage_workspace_stock(workspace_id)')
    expect(rlsSection).toContain('Intentionally no INSERT / UPDATE / DELETE policies')
    expect(rlsSection).toContain('for select')
    expect(rlsSection).not.toMatch(/create policy[\s\S]*\n\s*for insert/i)
    expect(rlsSection).not.toMatch(/create policy[\s\S]*\n\s*for update/i)
    expect(rlsSection).not.toMatch(/create policy[\s\S]*\n\s*for delete/i)
  })

  it('defines SECURITY DEFINER acknowledge RPC with safe search_path and grants', () => {
    expect(sql).toContain('create or replace function public.acknowledge_inventory_migration_stage_attention(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('p_prior_result_id uuid')
    expect(sql).toContain('p_next_step_name text')
    expect(sql).toContain('p_note text default null')
    expect(functionBody).toContain('security definer')
    expect(functionBody).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.acknowledge_inventory_migration_stage_attention(\n  uuid, uuid, uuid, text, text\n) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.acknowledge_inventory_migration_stage_attention(\n  uuid, uuid, uuid, text, text\n) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.acknowledge_inventory_migration_stage_attention(\n  uuid, uuid, uuid, text, text\n) to authenticated',
    )
  })

  it('requires auth, stock permission, attention_required prior result, and V1 boundaries', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_ack_unauthenticated')
    expect(functionBody).toContain('inventory_migration_ack_forbidden')
    expect(functionBody).toContain("result_status is distinct from 'attention_required'")
    expect(functionBody).toContain('inventory_migration_ack_prior_result_not_attention')
    expect(functionBody).toContain("status is distinct from 'completed'")
    expect(functionBody).toContain('inventory_migration_ack_prior_step_not_completed')
    expect(functionBody).toContain('inventory_migration_ack_invalid_boundary')
    expect(functionBody).toContain("status = 'completed'")
    expect(functionBody).toContain('inventory_migration_ack_next_step_already_completed')
    expect(functionBody).not.toMatch(/\bp_force\b/)
    expect(functionBody).not.toMatch(/\bp_result_status\b/)
    expect(functionBody).not.toMatch(/\bp_acknowledged_by\b/)
  })

  it('locks session/steps, derives actor, trims note, and is idempotent', () => {
    expect(functionBody).toContain('Lock order 1: session')
    expect(functionBody).toContain('Lock order 2: all session steps')
    expect(functionBody).toContain('v_auth_user_id')
    expect(functionBody).toContain('v_operator_display_name')
    expect(functionBody).toContain("nullif(btrim(coalesce(p_note, '')), '')")
    expect(functionBody).toContain('Idempotent: return existing acknowledgement')
    expect(functionBody).toContain('return next v_existing')
  })

  it('writes one activity note and does not mutate stages or business data', () => {
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Attention acknowledged:')
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
    expect(functionBody.match(/insert into public\.inventory_migration_stage_attention_acknowledgements/g)?.length).toBe(1)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_session_steps/i)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_step_results/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_/i)
    expect(functionBody).not.toContain('run_inventory_migration_')
    expect(functionBody).not.toContain('transition_inventory_migration_step')
    expect(functionBody).not.toContain('complete_inventory_migration_session')
  })
})

describe('inventoryMigrationStageAttentionAcknowledgementsService read API', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  it('exports the three V1 acknowledgement boundaries', () => {
    expect(MIGRATION_ATTENTION_ACK_BOUNDARIES).toEqual([
      { priorStepName: 'integrity_audit', nextStepName: 'preflight' },
      { priorStepName: 'preview', nextStepName: 'phase1' },
      { priorStepName: 'phase1', nextStepName: 'phase2' },
    ])
  })

  it('maps acknowledgement rows without fabricating values', () => {
    const mapped = mapInventoryMigrationAttentionAckRow({
      id: 'ack-1',
      workspace_id: WORKSPACE_ID,
      session_id: SESSION_ID,
      prior_step_id: 'step-prior',
      prior_result_id: 'res-1',
      prior_step_name: 'preview',
      next_step_id: 'step-next',
      next_step_name: 'phase1',
      operator_display_name: 'Alex',
      note: '  reviewed  ',
      acknowledged_at: '2026-07-16T12:00:00.000Z',
    })

    expect(mapped.priorStepName).toBe('preview')
    expect(mapped.nextStepName).toBe('phase1')
    expect(mapped.note).toBe('reviewed')
    expect(mapped.operator).toBe('Alex')
  })

  it('sorts acknowledgements by acknowledged_at ascending', () => {
    const sorted = sortInventoryMigrationAttentionAcks([
      { id: 'b', acknowledged_at: '2026-07-16T13:00:00.000Z' },
      { id: 'a', acknowledged_at: '2026-07-16T12:00:00.000Z' },
    ])
    expect(sorted.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('loads session-scoped acknowledgements when authorized', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({
      data: [
        {
          id: 'ack-1',
          workspace_id: WORKSPACE_ID,
          session_id: SESSION_ID,
          prior_step_id: 'step-1',
          prior_result_id: 'res-1',
          prior_step_name: 'integrity_audit',
          next_step_id: 'step-2',
          next_step_name: 'preflight',
          operator_display_name: 'Alex',
          note: null,
          acknowledged_at: '2026-07-16T12:00:00.000Z',
          created_at: '2026-07-16T12:00:00.000Z',
        },
      ],
      error: null,
    })

    const result = await getInventoryMigrationStageAttentionAcknowledgements(WORKSPACE_ID, {
      sessionId: SESSION_ID,
    })

    expect(result.acknowledgementsAvailable).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].priorStepName).toBe('integrity_audit')
    expect(supabaseMocks.from).toHaveBeenCalledWith(
      'inventory_migration_stage_attention_acknowledgements',
    )
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
    expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('session_id', SESSION_ID)
    expect(supabaseMocks.builder.order).toHaveBeenCalledWith('acknowledged_at', {
      ascending: true,
    })
  })

  it('returns empty rows when no acknowledgements exist', async () => {
    supabaseMocks.setRpcResult({ data: true, error: null })
    supabaseMocks.setQueryResult({ data: [], error: null })

    const result = await getInventoryMigrationStageAttentionAcknowledgements(WORKSPACE_ID)

    expect(result.acknowledgementsAvailable).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toBeNull()
  })

  it('denies unauthorized callers without fabricating acknowledgements', async () => {
    supabaseMocks.setRpcResult({ data: false, error: null })

    const result = await getInventoryMigrationStageAttentionAcknowledgements(WORKSPACE_ID)

    expect(supabaseMocks.from).not.toHaveBeenCalled()
    expect(result.acknowledgementsAvailable).toBe(false)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/permission/i)
  })

  it('does not expose write helpers or stage execution from the read service', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../src/services/inventoryMigrationStageAttentionAcknowledgementsService.js',
      ),
      'utf8',
    )

    expect(source).not.toMatch(/\.insert\(/)
    expect(source).not.toMatch(/\.update\(/)
    expect(source).not.toMatch(/\.delete\(/)
    expect(source).not.toMatch(/acknowledge_inventory_migration_stage_attention/)
    expect(source).not.toMatch(/run_inventory_migration_/)
  })
})

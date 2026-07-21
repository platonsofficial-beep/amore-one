// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_auto_link_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_auto_link_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_auto_link'),
    sql.indexOf('revoke all on function public.run_inventory_migration_auto_link'),
  )

  const mapUpdate = functionBody.slice(
    functionBody.indexOf('update public.inventory_stock_item_map m'),
    functionBody.indexOf('returning m.id'),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_auto_link(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_auto_link(uuid, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_auto_link(uuid, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_auto_link(uuid, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_auto_link_unauthenticated')
    expect(functionBody).toContain('inventory_migration_auto_link_workspace_required')
    expect(functionBody).toContain('inventory_migration_auto_link_session_required')
    expect(functionBody).toContain('inventory_migration_auto_link_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_auto_link_forbidden')
  })

  it('locks session, steps, and eligible map rows before mutating', () => {
    expect(functionBody).toContain('for update')
    expect(functionBody).toContain('Lock order 1: session')
    expect(functionBody).toContain('Lock order 2: all session steps')
    expect(functionBody).toContain('for update of m')
    expect(functionBody).toContain("step_name = 'auto_link'")
    expect(functionBody).toContain('inventory_migration_auto_link_session_not_running')
  })

  it('requires foundation and persist completed only', () => {
    expect(functionBody).toContain("unnest(array['foundation', 'persist'])")
    expect(functionBody).toContain('inventory_migration_auto_link_prerequisite_incomplete')
    const predBlock = functionBody.slice(
      functionBody.indexOf("unnest(array['foundation', 'persist'])"),
      functionBody.indexOf('inventory_migration_auto_link_prerequisite_incomplete'),
    )
    expect(predBlock).not.toContain('auto_create')
    expect(predBlock).not.toContain('integrity_audit')
    expect(predBlock).not.toContain('preflight')
    expect(predBlock).not.toContain('preview')
  })

  it('does not accept caller-supplied targets, evidence, or status', () => {
    expect(functionBody).not.toMatch(/p_stock_item_id/)
    expect(functionBody).not.toMatch(/p_result_status/)
    expect(functionBody).not.toMatch(/p_result_summary/)
    expect(functionBody).not.toMatch(/p_step_name/)
    expect(functionBody).not.toMatch(/p_force/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('finalizes only classified+auto_link rows with valid same-workspace stock_item_id', () => {
    const setClause = mapUpdate.slice(
      mapUpdate.indexOf('set '),
      mapUpdate.indexOf('from public.stock_items'),
    )
    expect(setClause).toContain("status = 'linked'")
    expect(setClause).not.toContain('stock_item_id')
    expect(setClause).not.toContain('migrated_at')
    expect(setClause).not.toContain('resolution_type')
    expect(setClause).not.toContain('source_snapshot')
    expect(mapUpdate).toContain("m.status = 'classified'")
    expect(mapUpdate).toContain("m.resolution_type = 'auto_link'")
    expect(mapUpdate).toContain('m.stock_item_id is not null')
    expect(mapUpdate).toContain('s.workspace_id = m.workspace_id')
    expect(mapUpdate).toContain('m.workspace_id = p_workspace_id')
  })

  it('P8.6.1 uses persisted stock_item_id only and never discovers candidates', () => {
    expect(functionBody).not.toContain('candidate_stock_item_id')
    expect(functionBody).not.toContain('candidate_one')
    expect(functionBody).not.toContain('normalized_name')
    expect(functionBody).not.toMatch(/p_stock_item_id/)
    expect(functionBody).not.toMatch(/p_candidate/)
    // Status-only mutation; identity comes from Persist.
    expect(mapUpdate).toMatch(/set\s+status\s*=\s*'linked'/)
    expect(sql).toContain('Does not discover/write stock_item_id')
  })

  it('records null/missing/mismatch attention metrics without inventing matches', () => {
    expect(functionBody).toContain('v_null_stock_id')
    expect(functionBody).toContain('v_missing_stock')
    expect(functionBody).toContain('v_workspace_mismatch')
    expect(functionBody).toContain("'auto_link_version', 1")
    expect(functionBody).toContain("'successfully_linked'")
    expect(functionBody).toContain("'null_stock_item_id'")
    expect(functionBody).toMatch(/if v_attention_count > 0 then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/)
  })

  it('persists one step result, completes the step, and writes a note activity', () => {
    const resultInsertAt = functionBody.indexOf('insert into public.inventory_migration_step_results')
    const completeAt = functionBody.lastIndexOf("status = 'completed'")
    const activityAt = functionBody.indexOf('insert into public.inventory_migration_activity')

    expect(resultInsertAt).toBeGreaterThan(completeAt)
    expect(activityAt).toBeGreaterThan(resultInsertAt)
    expect(functionBody).toContain("'auto_link'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Auto link completed:')
    expect(functionBody).toContain('inventory_migration_auto_link_already_completed')
    expect(functionBody.match(/insert into public\.inventory_migration_step_results/g)?.length).toBe(1)
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
  })

  it('owns step transitions without calling the generic transition RPC', () => {
    expect(functionBody).not.toContain('transition_inventory_migration_step')
    expect(functionBody).toContain("status = 'running'")
    expect(functionBody).toContain('started_at = now()')
    expect(functionBody).toContain('completed_at = v_executed_at')
  })

  it('does not create stock items, run auto_create, or write movements', () => {
    expect(functionBody).not.toMatch(/insert into public\.stock_items/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toContain('inventory_stock_map_auto_create')
    expect(functionBody).not.toContain('run_inventory_migration_persist')
    expect(functionBody).not.toContain('inventory_movement_execute_phase1')
    expect(functionBody).not.toMatch(/update public\.inventory_migration_sessions/i)
  })

  it('returns structured summary without schema changes', () => {
    expect(functionBody).toContain('result_id uuid')
    expect(functionBody).toContain('result_status text')
    expect(functionBody).toContain('critical_finding_count bigint')
    expect(functionBody).toContain('attention_finding_count bigint')
    expect(functionBody).toContain('total_findings bigint')
    expect(functionBody).toContain('executed_at timestamptz')
    expect(sql).not.toMatch(/alter table public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_session_steps/i)
    expect(sql).not.toContain("step_name = 'dry_run'")
  })
})

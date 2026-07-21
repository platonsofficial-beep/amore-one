// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('inventory_migration_persist_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_persist_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const functionBody = sql.slice(
    sql.indexOf('create or replace function public.run_inventory_migration_persist'),
    sql.indexOf('revoke all on function public.run_inventory_migration_persist'),
  )

  const upsertBranch = functionBody.slice(
    functionBody.indexOf('do update set'),
    functionBody.indexOf('returning (xmax = 0)'),
  )

  it('defines SECURITY DEFINER RPC with safe search_path and authenticated-only execute', () => {
    expect(sql).toContain('create or replace function public.run_inventory_migration_persist(')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_persist(uuid, uuid) from public',
    )
    expect(sql).toContain(
      'revoke all on function public.run_inventory_migration_persist(uuid, uuid) from anon',
    )
    expect(sql).toContain(
      'grant execute on function public.run_inventory_migration_persist(uuid, uuid) to authenticated',
    )
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(1)
  })

  it('requires auth, workspace, session, and stock-manager authorization', () => {
    expect(functionBody).toContain('auth.uid()')
    expect(functionBody).toContain('inventory_migration_persist_unauthenticated')
    expect(functionBody).toContain('inventory_migration_persist_workspace_required')
    expect(functionBody).toContain('inventory_migration_persist_session_required')
    expect(functionBody).toContain('inventory_migration_persist_workspace_not_found')
    expect(functionBody).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(functionBody).toContain('inventory_migration_persist_forbidden')
  })

  it('locks the running session and all steps before mutating', () => {
    const sessionLockAt = functionBody.indexOf('from public.inventory_migration_sessions s')
    const sessionForUpdateAt = functionBody.indexOf('for update', sessionLockAt)
    const stepsLockAt = functionBody.indexOf('Lock order 2: all session steps')
    const runningUpdateAt = functionBody.indexOf("status = 'running',\n    started_at = now()")

    expect(sessionLockAt).toBeGreaterThan(-1)
    expect(sessionForUpdateAt).toBeGreaterThan(sessionLockAt)
    expect(stepsLockAt).toBeGreaterThan(sessionForUpdateAt)
    expect(runningUpdateAt).toBeGreaterThan(stepsLockAt)
    expect(functionBody).toContain('inventory_migration_persist_session_not_found')
    expect(functionBody).toContain('inventory_migration_persist_session_not_running')
    expect(functionBody).toContain("step_name = 'persist'")
  })

  it('requires only foundation completed as prerequisite (early pipeline)', () => {
    expect(functionBody).toContain('inventory_migration_persist_prerequisite_incomplete')
    expect(functionBody).toContain("unnest(array['foundation'])")
    const predBlock = functionBody.slice(
      functionBody.indexOf("unnest(array['foundation'])"),
      functionBody.indexOf('inventory_migration_persist_prerequisite_incomplete'),
    )
    expect(predBlock).toBe("unnest(array['foundation']) as pred(step_name)\n    where not exists (\n      select 1\n      from public.inventory_migration_session_steps st\n      where st.session_id = p_session_id\n        and st.workspace_id = p_workspace_id\n        and st.step_name = pred.step_name\n        and st.status = 'completed'\n    )\n  )\n  into v_pred_incomplete;\n\n  if v_pred_incomplete then\n    raise exception '")
    expect(predBlock).not.toContain('auto_link')
    expect(predBlock).not.toContain('auto_create')
    expect(predBlock).not.toContain('integrity_audit')
    expect(predBlock).not.toContain('preflight')
    expect(predBlock).not.toContain('preview')
  })

  it('does not accept caller-controlled classification, status, or evidence', () => {
    expect(functionBody).not.toMatch(/p_result_status/)
    expect(functionBody).not.toMatch(/p_result_summary/)
    expect(functionBody).not.toMatch(/p_step_name/)
    expect(functionBody).not.toMatch(/p_classification/)
    expect(functionBody).not.toMatch(/p_force/)
    expect(functionBody).toContain("v_result_status := 'attention_required'")
    expect(functionBody).toContain("v_result_status := 'passed'")
  })

  it('retains P7.4.2 classification precedence and P7.4.3 status mapping', () => {
    expect(functionBody).toContain("when c.map_status in ('created', 'linked') then 'skip'")
    expect(functionBody).toContain("then 'auto_link'")
    expect(functionBody).toContain("then 'auto_create'")
    expect(functionBody).toContain("when 'auto_create' then 'classified'")
    expect(functionBody).toContain("when 'auto_link' then 'classified'")
    expect(functionBody).toContain("when 'manual' then 'manual'")
    expect(functionBody).toContain("when 'skip' then 'skipped'")
    expect(functionBody).toContain("'persist_version', 1")
    expect(functionBody).toContain("'key', 'skip'")
    expect(functionBody).toContain("'key', 'manual'")
    expect(functionBody).toContain("'key', 'auto_link'")
    expect(functionBody).toContain("'key', 'auto_create'")
  })

  it('UPSERTs on (legacy_inventory_item_id, workspace_id) and protects finalized identity', () => {
    expect(functionBody).toContain('on conflict (legacy_inventory_item_id, workspace_id)')
    expect(functionBody).toContain('do update set')
    expect(functionBody).toContain("status not in ('created', 'linked')")
    expect(functionBody).toContain('migrated_at is null')
    expect(upsertBranch).toContain('status = excluded.status')
    expect(upsertBranch).toContain('resolution_type = excluded.resolution_type')
    expect(upsertBranch).toContain('conflict_reason = excluded.conflict_reason')
    expect(upsertBranch).toContain('source_snapshot = excluded.source_snapshot')
    expect(upsertBranch).toContain('source_hash = excluded.source_hash')
    expect(upsertBranch).toContain('stock_item_id = excluded.stock_item_id')
    expect(upsertBranch).not.toContain('migrated_at =')
    expect(functionBody).toContain('p_workspace_id as target_workspace_id')
  })

  it('P8.6.1 persists auto_link candidate_stock_item_id into map.stock_item_id only', () => {
    const finalRows = functionBody.slice(
      functionBody.indexOf('final_rows as ('),
      functionBody.indexOf('persist_rows as ('),
    )
    const persistRows = functionBody.slice(
      functionBody.indexOf('persist_rows as ('),
      functionBody.indexOf('class_counts as ('),
    )
    const insertCols = functionBody.slice(
      functionBody.indexOf('insert into public.inventory_stock_item_map ('),
      functionBody.indexOf('on conflict (legacy_inventory_item_id, workspace_id)'),
    )

    // Candidate derived from DB CTEs (candidate_one), not RPC params.
    expect(functionBody).toContain('candidate_one as (')
    expect(functionBody).toContain('as candidate_stock_item_id')
    expect(functionBody).not.toMatch(/\bp_candidate\b/)
    expect(functionBody).not.toMatch(/\bp_stock_item_id\b/)
    expect(functionBody).not.toMatch(/p_stock_item_id\s+uuid/)

    // auto_link with exactly one candidate writes identity; others null.
    expect(finalRows).toContain("when d.classification = 'auto_link'")
    expect(finalRows).toContain('d.candidate_count = 1')
    expect(finalRows).toContain('d.candidate_stock_item_id is not null')
    expect(finalRows).toContain('then d.candidate_stock_item_id')
    expect(finalRows).toContain('else null')
    expect(finalRows).toContain('end as stock_item_id')

    expect(persistRows).toContain('f.stock_item_id')
    expect(insertCols).toContain('stock_item_id')

    // Ambiguous / zero candidates cannot become auto_link (precedence unchanged).
    expect(functionBody).toContain('when c.candidate_count > 1 then \'manual\'')
    expect(functionBody).toContain("when c.candidate_count = 1")
    expect(functionBody).toContain("then 'auto_link'")

    // Workspace ownership proven via v1_items filter (same as classifier).
    expect(functionBody).toContain('and s.workspace_id = p.target_workspace_id')
  })

  it('P8.6.1 locks map rows before identity UPSERT and never mutates quantities/movements', () => {
    expect(functionBody).toContain('Lock order 3: existing map rows')
    expect(functionBody).toContain('order by m.id')
    expect(functionBody).toContain('for update')
    expect(functionBody).not.toMatch(/insert into public\.stock_items/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/set\s+current_quantity/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
  })

  it('derives attention_required from manual/other classifications only', () => {
    expect(functionBody).toContain('v_manual_count')
    expect(functionBody).toMatch(/if v_attention_count > 0 then[\s\S]*attention_required[\s\S]*else[\s\S]*passed/)
    expect(functionBody).toContain("'inserted', v_inserted")
    expect(functionBody).toContain("'updated', v_updated")
    expect(functionBody).toContain("'protected', v_protected")
  })

  it('persists one step result, completes the step, and writes a note activity', () => {
    const resultInsertAt = functionBody.indexOf('insert into public.inventory_migration_step_results')
    const completeAt = functionBody.lastIndexOf("status = 'completed'")
    const activityAt = functionBody.indexOf('insert into public.inventory_migration_activity')

    expect(completeAt).toBeGreaterThan(-1)
    expect(resultInsertAt).toBeGreaterThan(completeAt)
    expect(activityAt).toBeGreaterThan(resultInsertAt)
    expect(functionBody).toContain("'persist'")
    expect(functionBody).toContain("'note'")
    expect(functionBody).toContain('Persist completed:')
    expect(functionBody.match(/insert into public\.inventory_migration_step_results/g)?.length).toBe(1)
    expect(functionBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
    expect(functionBody).toContain('inventory_migration_persist_already_completed')
  })

  it('owns step transitions without calling the generic transition RPC', () => {
    expect(functionBody).not.toContain('transition_inventory_migration_step')
    expect(functionBody).toContain("status = 'running'")
    expect(functionBody).toContain("status = 'completed'")
    expect(functionBody).toContain('started_at = now()')
    expect(functionBody).toContain('completed_at = v_executed_at')
  })

  it('does not mutate stock items, movements, or execute later stages', () => {
    expect(functionBody).not.toMatch(/insert into public\.stock_items/i)
    expect(functionBody).not.toMatch(/update public\.stock_items/i)
    expect(functionBody).not.toMatch(/insert into public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.stock_movements/i)
    expect(functionBody).not.toMatch(/update public\.inventory_items/i)
    expect(functionBody).not.toMatch(/update public\.inventory_migration_sessions/i)
    expect(functionBody).not.toContain('inventory_stock_map_auto_link')
    expect(functionBody).not.toContain('inventory_stock_map_auto_create')
    expect(functionBody).not.toContain('run_inventory_migration_preflight')
    expect(functionBody).not.toContain('run_inventory_migration_preview')
    expect(functionBody).not.toContain('inventory_movement_execute_phase1')
    expect(functionBody).toContain('insert into public.inventory_stock_item_map')
  })

  it('returns a structured outcome row without schema changes', () => {
    expect(functionBody).toContain('result_id uuid')
    expect(functionBody).toContain('result_status text')
    expect(functionBody).toContain('critical_finding_count bigint')
    expect(functionBody).toContain('attention_finding_count bigint')
    expect(functionBody).toContain('total_findings bigint')
    expect(functionBody).toContain('executed_at timestamptz')
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/alter table public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/alter table public\.inventory_migration_session_steps/i)
    expect(sql).not.toContain("step_name = 'dry_run'")
  })
})

describe('inventory_stock_map_persist.sql P8.6.1 legacy parity', () => {
  const legacyPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_stock_map_persist.sql',
  )
  const legacySql = readFileSync(legacyPath, 'utf8')

  it('persists auto_link candidate identity with the same UPSERT protections', () => {
    expect(legacySql).toContain("when d.classification = 'auto_link'")
    expect(legacySql).toContain('d.candidate_count = 1')
    expect(legacySql).toContain('d.candidate_stock_item_id is not null')
    expect(legacySql).toContain('then d.candidate_stock_item_id')
    expect(legacySql).toContain('stock_item_id = excluded.stock_item_id')
    expect(legacySql).toContain("status not in ('created', 'linked')")
    expect(legacySql).toContain('migrated_at is null')
    expect(legacySql).toContain('order by m.id')
    expect(legacySql).toContain('for update')
    expect(legacySql).not.toMatch(/insert into public\.stock_items/i)
    expect(legacySql).not.toMatch(/insert into public\.stock_movements/i)
    expect(legacySql).not.toMatch(/set\s+current_quantity/i)
  })
})

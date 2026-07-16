// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CANONICAL_STEPS = [
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
]

describe('inventory_migration_finish_session_rpc.sql source review', () => {
  const sqlPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/inventory_migration_finish_session_rpc.sql',
  )
  const sql = readFileSync(sqlPath, 'utf8')

  const completeBody = sql.slice(
    sql.indexOf('create or replace function public.complete_inventory_migration_session'),
    sql.indexOf('create or replace function public.cancel_inventory_migration_session'),
  )
  const cancelBody = sql.slice(
    sql.indexOf('create or replace function public.cancel_inventory_migration_session'),
    sql.indexOf('revoke all on function public.complete_inventory_migration_session'),
  )

  it('defines both SECURITY DEFINER RPCs with locked search_path', () => {
    expect(sql).toContain('create or replace function public.complete_inventory_migration_session')
    expect(sql).toContain('create or replace function public.cancel_inventory_migration_session')
    expect(sql).toContain('p_workspace_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('returns setof public.inventory_migration_sessions')
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2)
    expect(sql.match(/set search_path = public/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('requires auth, workspace, session args, and stock-manager authorization', () => {
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('inventory_migration_session_unauthenticated')
    expect(sql).toContain('inventory_migration_session_workspace_required')
    expect(sql).toContain('inventory_migration_session_session_required')
    expect(sql).toContain('inventory_migration_session_workspace_not_found')
    expect(sql).toContain('can_manage_workspace_stock(p_workspace_id)')
    expect(sql).toContain('inventory_migration_session_forbidden')
    expect(sql).toContain('owner / general_manager / manager')
    expect(sql).toContain('host / staff')
    expect(sql).toContain('anonymous')
  })

  it('locks the session row with FOR UPDATE before transition checks', () => {
    expect(completeBody).toContain('Lock order 1: session')
    expect(completeBody).toContain('for update')
    expect(cancelBody).toContain('for update')
    expect(completeBody).toContain('inventory_migration_session_not_found')
    expect(cancelBody).toContain('inventory_migration_session_not_found')
    expect(completeBody).toContain('inventory_migration_session_not_running')
    expect(cancelBody).toContain('inventory_migration_session_not_running')
  })

  it('gates complete on exact canonical step set, all completed', () => {
    expect(completeBody).toContain('Lock order 2: all session steps')
    expect(completeBody).toContain('inventory_migration_session_canonical_steps_inconsistent')
    expect(completeBody).toContain('inventory_migration_session_steps_incomplete')
    expect(completeBody).toContain('v_step_count is distinct from 10')
    expect(completeBody).toContain("st.status is distinct from 'completed'")
    for (const step of CANONICAL_STEPS) {
      expect(completeBody).toContain(`'${step}'`)
    }
    expect(completeBody).toContain("step_name = 'post_apply_audit'")
  })

  it('requires matching passed post_apply_audit step result before session update', () => {
    const updateAt = completeBody.indexOf("status = 'completed'")
    const resultLoadAt = completeBody.indexOf('from public.inventory_migration_step_results r')
    const passedGateAt = completeBody.indexOf(
      "v_post_result.result_status is distinct from 'passed'",
    )

    expect(resultLoadAt).toBeGreaterThan(-1)
    expect(passedGateAt).toBeGreaterThan(resultLoadAt)
    expect(updateAt).toBeGreaterThan(passedGateAt)
    expect(completeBody).toContain('inventory_migration_session_post_apply_result_missing')
    expect(completeBody).toContain('inventory_migration_session_post_apply_result_inconsistent')
    expect(completeBody).toContain('inventory_migration_session_post_apply_attention_required')
    expect(completeBody).toContain('v_post_result.workspace_id is distinct from p_workspace_id')
    expect(completeBody).toContain('v_post_result.session_id is distinct from p_session_id')
    expect(completeBody).toContain('v_post_result.step_id is distinct from v_post_step.id')
    expect(completeBody).toContain("v_post_result.step_name is distinct from 'post_apply_audit'")
    expect(completeBody).not.toMatch(/\bp_force\b/)
    expect(completeBody).not.toMatch(/\bp_override\b/)
    expect(completeBody).not.toMatch(/\bp_confirm\b/)
    expect(completeBody).not.toMatch(/\bp_result_status\b/)
  })

  it('completes only running sessions and sets finished_at after gates', () => {
    expect(completeBody).toContain("status is distinct from 'running'")
    expect(completeBody).toContain("status = 'completed'")
    expect(completeBody).toContain('finished_at = now()')
    expect(completeBody).toContain('returning * into v_session')
    expect(completeBody).not.toContain('started_by =')
    expect(completeBody).not.toContain('operator_display_name =')
    expect(completeBody).not.toContain('started_at =')
  })

  it('cancels only running sessions and sets finished_at without step gates', () => {
    expect(cancelBody).toContain("status is distinct from 'running'")
    expect(cancelBody).toContain("status = 'cancelled'")
    expect(cancelBody).toContain('finished_at = now()')
    expect(cancelBody).toContain('returning * into v_session')
    expect(cancelBody).not.toContain('inventory_migration_session_steps_incomplete')
    expect(cancelBody).not.toContain('inventory_migration_session_post_apply')
    expect(cancelBody).not.toContain('started_by =')
    expect(cancelBody).not.toContain('operator_display_name =')
    expect(cancelBody).not.toContain('started_at =')
  })

  it('appends session_completed activity after successful complete update', () => {
    const updateAt = completeBody.indexOf("status = 'completed'")
    const activityAt = completeBody.indexOf('insert into public.inventory_migration_activity')

    expect(updateAt).toBeGreaterThan(-1)
    expect(activityAt).toBeGreaterThan(updateAt)
    expect(completeBody).toContain("'session_completed'")
    expect(completeBody).toContain("'Migration session completed.'")
    expect(completeBody).toContain('v_auth_user_id')
    expect(completeBody).toContain('v_operator_display_name')
    expect(completeBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
  })

  it('appends session_cancelled activity after successful cancel update', () => {
    const updateAt = cancelBody.indexOf("status = 'cancelled'")
    const activityAt = cancelBody.indexOf('insert into public.inventory_migration_activity')

    expect(updateAt).toBeGreaterThan(-1)
    expect(activityAt).toBeGreaterThan(updateAt)
    expect(cancelBody).toContain("'session_cancelled'")
    expect(cancelBody).toContain("'Migration session cancelled.'")
    expect(cancelBody).toContain('v_auth_user_id')
    expect(cancelBody).toContain('v_operator_display_name')
    expect(cancelBody.match(/insert into public\.inventory_migration_activity/g)?.length).toBe(1)
  })

  it('keeps activity writes atomic with status updates (same function, no commit)', () => {
    expect(completeBody).toMatch(/Same transaction: activity failure rolls back the status update/)
    expect(cancelBody).toMatch(/Same transaction: activity failure rolls back the status update/)
    expect(completeBody).not.toMatch(/\bcommit\b/i)
    expect(cancelBody).not.toMatch(/\bcommit\b/i)
    expect(sql).toContain('failed activity insert rolls back the session status update')
    expect(sql).not.toMatch(/create trigger/i)
    expect(sql.match(/create or replace function public\./gi)?.length).toBe(2)
    expect(sql).toContain('create or replace function public.complete_inventory_migration_session')
    expect(sql).toContain('create or replace function public.cancel_inventory_migration_session')
  })

  it('grants execute to authenticated only and revokes public/anon', () => {
    expect(sql).toContain('revoke all on function public.complete_inventory_migration_session(uuid, uuid) from public')
    expect(sql).toContain('revoke all on function public.complete_inventory_migration_session(uuid, uuid) from anon')
    expect(sql).toContain('grant execute on function public.complete_inventory_migration_session(uuid, uuid) to authenticated')
    expect(sql).toContain('revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from public')
    expect(sql).toContain('revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from anon')
    expect(sql).toContain('grant execute on function public.cancel_inventory_migration_session(uuid, uuid) to authenticated')
  })

  it('does not write migration map, stock, movements, or stage results', () => {
    expect(sql).not.toMatch(/insert into public\.inventory_migration_sessions/i)
    expect(sql).not.toMatch(/insert into public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/update public\.inventory_stock_item_map/i)
    expect(sql).not.toMatch(/insert into public\.stock_movements/i)
    expect(sql).not.toMatch(/update public\.stock_items/i)
    expect(sql).not.toMatch(/insert into public\.inventory_migration_step_results/i)
    expect(sql).not.toMatch(/update public\.inventory_migration_session_steps/i)
    expect(sql).not.toMatch(/create policy[\s\S]*for update/i)
    expect(completeBody).not.toContain('run_inventory_migration_')
    expect(completeBody).not.toContain('transition_inventory_migration_step')
  })

  it('documents concurrency, gates, and terminal-state immutability', () => {
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('complete then complete again')
    expect(sql).toContain('cancel then cancel again')
    expect(sql).toContain('complete then cancel')
    expect(sql).toContain('cancel then complete')
    expect(sql).toContain('inventory_migration_session_not_running')
    expect(sql).toContain('inventory_migration_session_steps_incomplete')
    expect(sql).toContain('inventory_migration_session_post_apply_attention_required')
    expect(sql).toContain('wrong workspace')
  })
})

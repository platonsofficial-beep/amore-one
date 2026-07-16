-- =============================================================================
-- P7.7.6 / P7.7.9 / P7.9.1 — Complete / Cancel Inventory Migration Session RPCs
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql (P7.7.4)
--   2. inventory_migration_start_session_rpc.sql (P7.7.5 / P7.8.1)
--   3. inventory_migration_activity.sql (P7.7.8)
--   4. inventory_migration_session_steps.sql (P7.8.0)
--   5. inventory_migration_step_results.sql (P7.8.5)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER transitions for a running migration session:
--     running → completed  (+ session_completed activity)  [P7.9.1 gated]
--     running → cancelled  (+ session_cancelled activity)    [unchanged]
--   Session status update and activity insert share one transaction.
--   Authenticated clients must not UPDATE/INSERT directly
--   (no client write policies on sessions or activity).
--
-- P7.9.1 complete gates (V1):
--   - exact 10 canonical steps, each present once, all completed
--   - post_apply_audit completed with exactly one matching step result
--   - result identity matches workspace / session / step_id / step_name
--   - result_status must be 'passed' (attention_required blocks completion)
--   - no force / override / confirmation parameters
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Denied:
--   host / staff / anonymous / wrong workspace
--
-- Does NOT:
--   - Start sessions
--   - Execute migration SQL
--   - Touch inventory_stock_item_map / stock_items / stock_movements
--   - Create migration-step rows
--   - Change UI, Operator, Health, or Audit Evidence
--   - Change signatures, grants, or RLS
--   - Modify cancel-session gates
--
-- Concurrency:
--   Complete locks session then all steps FOR UPDATE (canonical order) before
--   gates and status update. Cancel locks the session row only.
--   Concurrent complete/cancel races yield one winner and one
--   inventory_migration_session_not_running rejection.
-- =============================================================================

drop function if exists public.complete_inventory_migration_session(uuid, uuid);
drop function if exists public.cancel_inventory_migration_session(uuid, uuid);

-- -----------------------------------------------------------------------------
-- Complete: running → completed (+ activity)
-- -----------------------------------------------------------------------------
create or replace function public.complete_inventory_migration_session(
  p_workspace_id uuid,
  p_session_id uuid
)
returns setof public.inventory_migration_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_session public.inventory_migration_sessions%rowtype;
  v_post_step public.inventory_migration_session_steps%rowtype;
  v_post_result public.inventory_migration_step_results%rowtype;
  v_step_count bigint := 0;
  v_has_unknown boolean := false;
  v_has_duplicate boolean := false;
  v_missing_canonical boolean := false;
  v_incomplete boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_session_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_session_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_session_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_session_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_session_forbidden';
  end if;

  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  -- Lock order 1: session (session-level mutex).
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_session_not_running';
  end if;

  -- Lock order 2: all session steps in canonical order.
  perform 1
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
  order by
    case st.step_name
      when 'foundation' then 1
      when 'persist' then 2
      when 'auto_link' then 3
      when 'auto_create' then 4
      when 'integrity_audit' then 5
      when 'preflight' then 6
      when 'preview' then 7
      when 'phase1' then 8
      when 'phase2' then 9
      when 'post_apply_audit' then 10
      else 11
    end
  for update;

  select count(*)::bigint
  into v_step_count
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.step_name not in (
        'foundation',
        'persist',
        'auto_link',
        'auto_create',
        'integrity_audit',
        'preflight',
        'preview',
        'phase1',
        'phase2',
        'post_apply_audit'
      )
  )
  into v_has_unknown;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
    group by st.step_name
    having count(*) > 1
  )
  into v_has_duplicate;

  select exists (
    select 1
    from unnest(array[
      'foundation',
      'persist',
      'auto_link',
      'auto_create',
      'integrity_audit',
      'preflight',
      'preview',
      'phase1',
      'phase2',
      'post_apply_audit'
    ]) as expected(step_name)
    where not exists (
      select 1
      from public.inventory_migration_session_steps st
      where st.session_id = p_session_id
        and st.workspace_id = p_workspace_id
        and st.step_name = expected.step_name
    )
  )
  into v_missing_canonical;

  if v_step_count is distinct from 10
     or v_has_unknown
     or v_has_duplicate
     or v_missing_canonical then
    raise exception 'inventory_migration_session_canonical_steps_inconsistent';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status is distinct from 'completed'
  )
  into v_incomplete;

  if v_incomplete then
    raise exception 'inventory_migration_session_steps_incomplete';
  end if;

  select st.*
  into v_post_step
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
    and st.step_name = 'post_apply_audit';

  if not found or v_post_step.status is distinct from 'completed' then
    raise exception 'inventory_migration_session_steps_incomplete';
  end if;

  select r.*
  into v_post_result
  from public.inventory_migration_step_results r
  where r.step_id = v_post_step.id;

  if not found then
    raise exception 'inventory_migration_session_post_apply_result_missing';
  end if;

  if v_post_result.workspace_id is distinct from p_workspace_id
     or v_post_result.session_id is distinct from p_session_id
     or v_post_result.step_id is distinct from v_post_step.id
     or v_post_result.step_name is distinct from 'post_apply_audit' then
    raise exception 'inventory_migration_session_post_apply_result_inconsistent';
  end if;

  if v_post_result.result_status is distinct from 'passed' then
    raise exception 'inventory_migration_session_post_apply_attention_required';
  end if;

  update public.inventory_migration_sessions s
  set
    status = 'completed',
    finished_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning * into v_session;

  -- Same transaction: activity failure rolls back the status update.
  insert into public.inventory_migration_activity (
    session_id,
    workspace_id,
    activity_type,
    activity_text,
    created_by,
    operator_display_name
  )
  values (
    v_session.id,
    p_workspace_id,
    'session_completed',
    'Migration session completed.',
    v_auth_user_id,
    v_operator_display_name
  );

  return next v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancel: running → cancelled (+ activity)
-- -----------------------------------------------------------------------------
create or replace function public.cancel_inventory_migration_session(
  p_workspace_id uuid,
  p_session_id uuid
)
returns setof public.inventory_migration_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_session public.inventory_migration_sessions%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_session_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_session_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_session_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_session_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_session_forbidden';
  end if;

  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_session_not_running';
  end if;

  update public.inventory_migration_sessions s
  set
    status = 'cancelled',
    finished_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning * into v_session;

  -- Same transaction: activity failure rolls back the status update.
  insert into public.inventory_migration_activity (
    session_id,
    workspace_id,
    activity_type,
    activity_text,
    created_by,
    operator_display_name
  )
  values (
    v_session.id,
    p_workspace_id,
    'session_cancelled',
    'Migration session cancelled.',
    v_auth_user_id,
    v_operator_display_name
  );

  return next v_session;
end;
$$;

revoke all on function public.complete_inventory_migration_session(uuid, uuid) from public;
revoke all on function public.complete_inventory_migration_session(uuid, uuid) from anon;
grant execute on function public.complete_inventory_migration_session(uuid, uuid) to authenticated;

revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from public;
revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from anon;
grant execute on function public.cancel_inventory_migration_session(uuid, uuid) to authenticated;

comment on function public.complete_inventory_migration_session(uuid, uuid) is
  'P7.7.6/P7.7.9/P7.9.1 SECURITY DEFINER complete of a running inventory migration session. Requires all canonical steps completed and post_apply_audit result_status=passed. Writes session_completed activity. No migration execution.';

comment on function public.cancel_inventory_migration_session(uuid, uuid) is
  'P7.7.6/P7.7.9 SECURITY DEFINER cancel of a running inventory migration session with session_cancelled activity. No migration execution.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Functions present
-- select pg_get_functiondef('public.complete_inventory_migration_session(uuid,uuid)'::regprocedure);
-- select pg_get_functiondef('public.cancel_inventory_migration_session(uuid,uuid)'::regprocedure);

-- Grants (expect authenticated EXECUTE; no public / anon)
-- select routine_name, grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name in (
--     'complete_inventory_migration_session',
--     'cancel_inventory_migration_session'
--   )
-- order by routine_name, grantee;

-- Manual role matrix:
--   owner / general_manager / manager → complete (when gates pass) / cancel succeeds
--                                       (+ one matching activity row)
--   host / staff                     → inventory_migration_session_forbidden
--   anonymous                        → inventory_migration_session_unauthenticated
--   wrong workspace / wrong id       → inventory_migration_session_not_found
--                                     (or forbidden / workspace_not_found)
--   steps incomplete / waiting/running → inventory_migration_session_steps_incomplete
--   canonical set wrong              → inventory_migration_session_canonical_steps_inconsistent
--   post_apply result missing        → inventory_migration_session_post_apply_result_missing
--   post_apply result identity bad   → inventory_migration_session_post_apply_result_inconsistent
--   post_apply attention_required    → inventory_migration_session_post_apply_attention_required
--   complete then complete again     → inventory_migration_session_not_running
--   cancel then cancel again         → inventory_migration_session_not_running
--   complete then cancel             → inventory_migration_session_not_running
--   cancel then complete             → inventory_migration_session_not_running
-- Atomicity: failed activity insert rolls back the session status update.

-- Example:
--   select * from public.complete_inventory_migration_session('<workspace>', '<session>');
--   select * from public.cancel_inventory_migration_session('<workspace>', '<session>');

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.complete_inventory_migration_session(uuid, uuid);
-- drop function if exists public.cancel_inventory_migration_session(uuid, uuid);

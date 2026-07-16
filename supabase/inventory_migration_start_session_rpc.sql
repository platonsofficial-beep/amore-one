-- =============================================================================
-- P7.7.5 / P7.7.9 / P7.8.1 — Start Inventory Migration Session RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql (P7.7.4)
--   2. inventory_migration_activity.sql (P7.7.8)
--   3. inventory_migration_session_steps.sql (P7.8.0)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point to create one running migration session
--   for a workspace, append a session_started activity row, and bootstrap the
--   canonical session step rows in the same transaction.
--   Authenticated clients must not INSERT directly
--   (no client INSERT policy on sessions, activity, or steps).
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Does NOT:
--   - Complete or cancel sessions
--   - Execute migration SQL / progress steps beyond foundation=running bootstrap
--   - Touch inventory_stock_item_map
--   - Change UI or Operator logic
--   - Change signatures, grants, or RLS
--   - UPSERT / UPDATE / DELETE step rows
--
-- Prerequisites:
--   1. public.inventory_migration_sessions exists (P7.7.4)
--   2. public.inventory_migration_activity exists (P7.7.8)
--   3. public.inventory_migration_session_steps exists (P7.8.0)
--   4. public.can_manage_workspace_stock(uuid) exists
--   5. public.workspace_members exists (display_name source)
-- =============================================================================

drop function if exists public.start_inventory_migration_session(uuid);

create or replace function public.start_inventory_migration_session(
  p_workspace_id uuid
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
  v_running_count integer := 0;
  v_session public.inventory_migration_sessions%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_session_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_session_workspace_required';
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

  -- Display name from workspace_members (existing repository identity source).
  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  select count(*)::integer
  into v_running_count
  from public.inventory_migration_sessions s
  where s.workspace_id = p_workspace_id
    and s.status = 'running';

  if v_running_count > 0 then
    raise exception 'inventory_migration_session_already_running';
  end if;

  begin
    insert into public.inventory_migration_sessions (
      workspace_id,
      status,
      started_by,
      operator_display_name,
      started_at
    )
    values (
      p_workspace_id,
      'running',
      v_auth_user_id,
      v_operator_display_name,
      now()
    )
    returning * into v_session;
  exception
    when unique_violation then
      -- Partial unique index inventory_migration_sessions_one_running_per_workspace
      raise exception 'inventory_migration_session_already_running';
  end;

  -- Same transaction: activity failure rolls back the session insert.
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
    'session_started',
    'Migration session started.',
    v_auth_user_id,
    v_operator_display_name
  );

  -- Same transaction: step bootstrap failure rolls back session + activity.
  -- Exactly 10 rows. Insert only. No UPSERT / UPDATE / DELETE.
  -- foundation = running with started_at; all others waiting; completed_at NULL.
  insert into public.inventory_migration_session_steps (
    session_id,
    workspace_id,
    step_name,
    status,
    started_at,
    completed_at
  )
  values
    (v_session.id, p_workspace_id, 'foundation', 'running', now(), null),
    (v_session.id, p_workspace_id, 'persist', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'auto_link', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'auto_create', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'integrity_audit', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'preflight', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'preview', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'phase1', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'phase2', 'waiting', null, null),
    (v_session.id, p_workspace_id, 'post_apply_audit', 'waiting', null, null);

  return next v_session;
end;
$$;

revoke all on function public.start_inventory_migration_session(uuid) from public;
grant execute on function public.start_inventory_migration_session(uuid) to authenticated;

comment on function public.start_inventory_migration_session(uuid) is
  'P7.7.5/P7.7.9/P7.8.1 SECURITY DEFINER start session + activity + canonical step bootstrap. No migration execution.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Function present
-- select pg_get_functiondef('public.start_inventory_migration_session(uuid)'::regprocedure);

-- Grants (expect authenticated EXECUTE; no public)
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'start_inventory_migration_session';

-- Manual role matrix (authenticated client / SQL as that role):
--   owner / general_manager / manager → success:
--     one running session + one session_started activity + 10 step rows
--   host / staff                     → inventory_migration_session_forbidden
--   anonymous                        → inventory_migration_session_unauthenticated
--   second start while running       → inventory_migration_session_already_running
--   wrong workspace                  → inventory_migration_session_forbidden
--                                     (or workspace_not_found)
-- Atomicity: failed activity or step insert rolls back the session row
--            (same transaction; no orphan session / partial steps / activity-only).

-- Example:
--   select * from public.start_inventory_migration_session('<workspace_uuid>');
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.start_inventory_migration_session(uuid);

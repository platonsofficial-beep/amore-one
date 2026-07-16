-- =============================================================================
-- P7.7.5 — Start Inventory Migration Session RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after inventory_migration_sessions.sql.
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point to create one running migration session
--   for a workspace. Authenticated clients must not INSERT directly
--   (no client INSERT policy on inventory_migration_sessions).
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Does NOT:
--   - Complete or cancel sessions
--   - Execute migration SQL
--   - Touch inventory_stock_item_map
--   - Create activity / step rows
--   - Change UI or Operator logic
--
-- Prerequisites:
--   1. public.inventory_migration_sessions exists (P7.7.4)
--   2. public.can_manage_workspace_stock(uuid) exists
--   3. public.workspace_members exists (display_name source)
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
    return query
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
    returning *;
  exception
    when unique_violation then
      -- Partial unique index inventory_migration_sessions_one_running_per_workspace
      raise exception 'inventory_migration_session_already_running';
  end;
end;
$$;

revoke all on function public.start_inventory_migration_session(uuid) from public;
grant execute on function public.start_inventory_migration_session(uuid) to authenticated;

comment on function public.start_inventory_migration_session(uuid) is
  'P7.7.5 SECURITY DEFINER start of one running inventory migration session per workspace. No migration execution.';

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
--   owner / general_manager / manager → success, one running row
--   host / staff                     → inventory_migration_session_forbidden
--   anonymous                        → inventory_migration_session_unauthenticated
--   second start while running       → inventory_migration_session_already_running
--   wrong workspace                  → inventory_migration_session_forbidden
--                                     (or workspace_not_found)

-- Example:
--   select * from public.start_inventory_migration_session('<workspace_uuid>');
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.start_inventory_migration_session(uuid);

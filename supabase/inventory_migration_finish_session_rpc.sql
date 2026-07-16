-- =============================================================================
-- P7.7.6 — Complete / Cancel Inventory Migration Session RPCs
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql (P7.7.4)
--   2. inventory_migration_start_session_rpc.sql (P7.7.5)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER transitions for a running migration session:
--     running → completed
--     running → cancelled
--   Authenticated clients must not UPDATE directly (no client UPDATE policy).
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
--   - Create activity / step rows
--   - Change UI, Operator, Health, or Audit Evidence
--
-- Concurrency:
--   Both RPCs lock the target session row with FOR UPDATE before validating
--   status, so concurrent complete/cancel races yield one winner and one
--   inventory_migration_session_not_running rejection.
-- =============================================================================

drop function if exists public.complete_inventory_migration_session(uuid, uuid);
drop function if exists public.cancel_inventory_migration_session(uuid, uuid);

-- -----------------------------------------------------------------------------
-- Complete: running → completed
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

  return query
  update public.inventory_migration_sessions s
  set
    status = 'completed',
    finished_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning *;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancel: running → cancelled
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

  return query
  update public.inventory_migration_sessions s
  set
    status = 'cancelled',
    finished_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning *;
end;
$$;

revoke all on function public.complete_inventory_migration_session(uuid, uuid) from public;
revoke all on function public.complete_inventory_migration_session(uuid, uuid) from anon;
grant execute on function public.complete_inventory_migration_session(uuid, uuid) to authenticated;

revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from public;
revoke all on function public.cancel_inventory_migration_session(uuid, uuid) from anon;
grant execute on function public.cancel_inventory_migration_session(uuid, uuid) to authenticated;

comment on function public.complete_inventory_migration_session(uuid, uuid) is
  'P7.7.6 SECURITY DEFINER complete of a running inventory migration session. No migration execution.';

comment on function public.cancel_inventory_migration_session(uuid, uuid) is
  'P7.7.6 SECURITY DEFINER cancel of a running inventory migration session. No migration execution.';

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
--   owner / general_manager / manager → complete/cancel running session succeeds
--   host / staff                     → inventory_migration_session_forbidden
--   anonymous                        → inventory_migration_session_unauthenticated
--   wrong workspace / wrong id       → inventory_migration_session_not_found
--                                     (or forbidden / workspace_not_found)
--   complete then complete again     → inventory_migration_session_not_running
--   cancel then cancel again         → inventory_migration_session_not_running
--   complete then cancel             → inventory_migration_session_not_running
--   cancel then complete             → inventory_migration_session_not_running

-- Example:
--   select * from public.complete_inventory_migration_session('<workspace>', '<session>');
--   select * from public.cancel_inventory_migration_session('<workspace>', '<session>');

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.complete_inventory_migration_session(uuid, uuid);
-- drop function if exists public.cancel_inventory_migration_session(uuid, uuid);

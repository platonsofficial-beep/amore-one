-- =============================================================================
-- P8.3.8 — Set Inventory Count Session Pause State RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_create_session_rpc.sql (P8.3.1)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point that pauses or resumes an
--   inventory count session without altering locations, items, or stock.
--
-- Does NOT:
--   - Mutate stock_items or stock_movements
--   - Alter session locations or session items
--   - Rebuild snapshots
--   - Finish, post, or cancel the session
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Prerequisites:
--   1. public.inventory_count_sessions exists
--   2. public.can_manage_workspace_stock(uuid) exists
-- =============================================================================

drop function if exists public.set_inventory_count_session_pause_state(
  uuid,
  uuid,
  boolean
);

create or replace function public.set_inventory_count_session_pause_state(
  p_workspace_id uuid,
  p_session_id uuid,
  p_pause boolean
)
returns table (
  id uuid,
  workspace_id uuid,
  status text,
  paused_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_now timestamptz := now();
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_pause_unauthenticated';
  end if;

  -- Required ids
  if p_workspace_id is null then
    raise exception 'inventory_count_pause_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_pause_session_required';
  end if;

  if p_pause is null then
    raise exception 'inventory_count_pause_state_required';
  end if;

  -- Authorization (owner / general_manager / manager)
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_pause_forbidden';
  end if;

  -- Lock target session (must belong to workspace)
  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    -- Distinguish missing session vs workspace mismatch when possible
    if exists (
      select 1
      from public.inventory_count_sessions s
      where s.id = p_session_id
    ) then
      raise exception 'inventory_count_pause_workspace_mismatch';
    end if;

    raise exception 'inventory_count_pause_session_not_found';
  end if;

  if p_pause then
    -- Pause: in_progress → paused
    if v_session.status is distinct from 'in_progress' then
      raise exception 'inventory_count_pause_cannot_pause';
    end if;

    update public.inventory_count_sessions s
    set
      status = 'paused',
      paused_at = v_now,
      updated_at = v_now
    where s.id = p_session_id
      and s.workspace_id = p_workspace_id;

    return query
    select
      s.id,
      s.workspace_id,
      s.status,
      s.paused_at,
      s.updated_at
    from public.inventory_count_sessions s
    where s.id = p_session_id
      and s.workspace_id = p_workspace_id;

    return;
  end if;

  -- Resume: paused → in_progress
  if v_session.status is distinct from 'paused' then
    raise exception 'inventory_count_pause_cannot_resume';
  end if;

  update public.inventory_count_sessions s
  set
    status = 'in_progress',
    paused_at = null,
    updated_at = v_now
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id;

  return query
  select
    s.id,
    s.workspace_id,
    s.status,
    s.paused_at,
    s.updated_at
  from public.inventory_count_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.set_inventory_count_session_pause_state(uuid, uuid, boolean) from public;
grant execute on function public.set_inventory_count_session_pause_state(uuid, uuid, boolean) to authenticated;

-- =============================================================================
-- Contract notes
-- =============================================================================
-- Pause (p_pause = true):
--   requires status in_progress
--   sets status = paused, paused_at = now(), updated_at = now()
--   rejects paused / counting_complete / posted / cancelled
--
-- Resume (p_pause = false):
--   requires status paused
--   sets status = in_progress, paused_at = null, updated_at = now()
--   rejects in_progress / counting_complete / posted / cancelled
--
-- Never mutates:
--   session locations, session items, counted quantities, stock tables
--
-- Errors:
--   unauthenticated        → inventory_count_pause_unauthenticated
--   forbidden              → inventory_count_pause_forbidden
--   workspace required     → inventory_count_pause_workspace_required
--   session required       → inventory_count_pause_session_required
--   pause state required   → inventory_count_pause_state_required
--   session not found      → inventory_count_pause_session_not_found
--   workspace mismatch     → inventory_count_pause_workspace_mismatch
--   cannot pause           → inventory_count_pause_cannot_pause
--   cannot resume          → inventory_count_pause_cannot_resume
--
-- Example:
--   select * from public.set_inventory_count_session_pause_state(
--     '<workspace_uuid>',
--     '<session_uuid>',
--     true
--   );
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.set_inventory_count_session_pause_state(uuid, uuid, boolean);

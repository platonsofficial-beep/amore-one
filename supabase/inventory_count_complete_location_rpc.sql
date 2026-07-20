-- =============================================================================
-- P8.3.7 — Complete Inventory Count Location RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_create_session_rpc.sql (P8.3.1)
--   4. inventory_count_build_snapshot_rpc.sql (P8.3.2)
--   5. inventory_count_update_session_item_rpc.sql (P8.3.6a)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point that marks the current session location
--   completed, advances the next location to current, or marks the session
--   counting_complete when no locations remain.
--
-- Does NOT:
--   - Mutate stock_items or stock_movements
--   - Change counted quantities / expected_snapshot / posting fields
--   - Implement Pause / Finish / Post workflows
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Prerequisites:
--   1. public.inventory_count_sessions exists
--   2. public.inventory_count_session_locations exists
--   3. public.inventory_count_session_items exists
--   4. public.can_manage_workspace_stock(uuid) exists
-- =============================================================================

drop function if exists public.complete_inventory_count_location(
  uuid,
  uuid,
  uuid
);

create or replace function public.complete_inventory_count_location(
  p_workspace_id uuid,
  p_session_id uuid,
  p_location_id uuid
)
returns table (
  session_id uuid,
  completed_location_id uuid,
  next_location_id uuid,
  session_status text,
  all_locations_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_location public.inventory_count_session_locations%rowtype;
  v_next_location public.inventory_count_session_locations%rowtype;
  v_pending_item_count integer := 0;
  v_now timestamptz := now();
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_location_unauthenticated';
  end if;

  -- Required ids
  if p_workspace_id is null then
    raise exception 'inventory_count_location_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_location_session_required';
  end if;

  if p_location_id is null then
    raise exception 'inventory_count_location_location_required';
  end if;

  -- Authorization (owner / general_manager / manager)
  -- Operator identity is never accepted from the client.
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_location_forbidden';
  end if;

  -- Lock parent session and enforce lifecycle
  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'inventory_count_location_session_not_found';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_location_workspace_mismatch';
  end if;

  if v_session.status is distinct from 'in_progress' then
    raise exception 'inventory_count_location_session_not_in_progress';
  end if;

  -- Lock target location (identity is session location row id)
  select l.*
  into v_location
  from public.inventory_count_session_locations l
  where l.id = p_location_id
  for update;

  if not found then
    raise exception 'inventory_count_location_not_found';
  end if;

  if v_location.session_id is distinct from p_session_id
     or v_location.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_location_session_mismatch';
  end if;

  if v_location.status is distinct from 'current' then
    raise exception 'inventory_count_location_not_current';
  end if;

  -- All items for this location must be counted or skipped
  select count(*)::integer
  into v_pending_item_count
  from public.inventory_count_session_items i
  where i.session_id = p_session_id
    and i.workspace_id = p_workspace_id
    and i.storage_location = v_location.location_key
    and i.line_status not in ('counted', 'skipped');

  if v_pending_item_count > 0 then
    raise exception 'inventory_count_location_items_pending';
  end if;

  -- Mark current location completed
  update public.inventory_count_session_locations l
  set status = 'completed'
  where l.id = p_location_id;

  -- Find next not_started location by sort_order
  select l.*
  into v_next_location
  from public.inventory_count_session_locations l
  where l.session_id = p_session_id
    and l.workspace_id = p_workspace_id
    and l.status = 'not_started'
  order by l.sort_order asc, l.created_at asc, l.id asc
  limit 1
  for update;

  if found then
    update public.inventory_count_session_locations l
    set status = 'current'
    where l.id = v_next_location.id;

    return query
    select
      p_session_id,
      p_location_id,
      v_next_location.id,
      v_session.status,
      false;
    return;
  end if;

  -- No remaining locations: mark session counting_complete
  update public.inventory_count_sessions s
  set
    status = 'counting_complete',
    updated_at = v_now
  where s.id = p_session_id;

  return query
  select
    p_session_id,
    p_location_id,
    null::uuid,
    'counting_complete'::text,
    true;
end;
$$;

revoke all on function public.complete_inventory_count_location(
  uuid,
  uuid,
  uuid
) from public;

grant execute on function public.complete_inventory_count_location(
  uuid,
  uuid,
  uuid
) to authenticated;

-- =============================================================================
-- Verification checklist (run manually in SQL editor)
-- =============================================================================
-- select
--   p.proname,
--   p.prosecdef as is_security_definer,
--   pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname = 'complete_inventory_count_location';
--
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'complete_inventory_count_location';

-- Manual role matrix:
--   unauthenticated     → inventory_count_location_unauthenticated
--   staff / host        → inventory_count_location_forbidden
--   manager+            → success when location current and items done
--   paused/posted/etc.  → inventory_count_location_session_not_in_progress
--   location not current → inventory_count_location_not_current
--   pending items       → inventory_count_location_items_pending
--   last location       → session status counting_complete

-- Example:
--   select * from public.complete_inventory_count_location(
--     '<workspace_uuid>',
--     '<session_uuid>',
--     '<session_location_uuid>'
--   );
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.complete_inventory_count_location(uuid, uuid, uuid);

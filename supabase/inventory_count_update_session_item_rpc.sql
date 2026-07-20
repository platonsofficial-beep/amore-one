-- =============================================================================
-- P8.3.6a — Update Inventory Count Session Item RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_create_session_rpc.sql (P8.3.1)
--   4. inventory_count_build_snapshot_rpc.sql (P8.3.2)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point that updates one
--   inventory_count_session_items counted quantity for an in_progress session.
--
-- Does NOT:
--   - Mutate stock_items or stock_movements
--   - Change expected_snapshot or posting fields
--   - Accept counted_at / line_status from the client
--   - Implement Pause / Finish / Post workflows
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Prerequisites:
--   1. public.inventory_count_sessions exists
--   2. public.inventory_count_session_items exists
--   3. public.can_manage_workspace_stock(uuid) exists
-- =============================================================================

drop function if exists public.update_inventory_count_session_item(
  uuid,
  uuid,
  uuid,
  numeric
);

create or replace function public.update_inventory_count_session_item(
  p_workspace_id uuid,
  p_session_id uuid,
  p_session_item_id uuid,
  p_counted_quantity numeric
)
returns table (
  id uuid,
  session_id uuid,
  workspace_id uuid,
  item_id uuid,
  counted_quantity numeric,
  counted_at timestamptz,
  line_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_item public.inventory_count_session_items%rowtype;
  v_now timestamptz := now();
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_item_unauthenticated';
  end if;

  -- Required ids
  if p_workspace_id is null then
    raise exception 'inventory_count_item_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_item_session_required';
  end if;

  if p_session_item_id is null then
    raise exception 'inventory_count_item_session_item_required';
  end if;

  -- Authorization (owner / general_manager / manager)
  -- Operator identity is never accepted from the client.
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_item_forbidden';
  end if;

  -- Quantity validation (NULL clears the count)
  if p_counted_quantity is not null and p_counted_quantity < 0 then
    raise exception 'inventory_count_item_invalid_quantity';
  end if;

  -- Lock parent session and enforce lifecycle
  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'inventory_count_item_session_not_found';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_item_workspace_mismatch';
  end if;

  if v_session.status is distinct from 'in_progress' then
    raise exception 'inventory_count_item_session_not_in_progress';
  end if;

  -- Lock target session-item line (identity is session item row id)
  select i.*
  into v_item
  from public.inventory_count_session_items i
  where i.id = p_session_item_id
  for update;

  if not found then
    raise exception 'inventory_count_item_not_found';
  end if;

  if v_item.session_id is distinct from p_session_id
     or v_item.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_item_session_mismatch';
  end if;

  if p_counted_quantity is null then
    return query
    update public.inventory_count_session_items i
    set
      counted_quantity = null,
      counted_at = null,
      line_status = 'pending',
      updated_at = v_now
    where i.id = p_session_item_id
    returning
      i.id,
      i.session_id,
      i.workspace_id,
      i.item_id,
      i.counted_quantity,
      i.counted_at,
      i.line_status,
      i.updated_at;
  else
    return query
    update public.inventory_count_session_items i
    set
      counted_quantity = p_counted_quantity,
      counted_at = v_now,
      line_status = 'counted',
      updated_at = v_now
    where i.id = p_session_item_id
    returning
      i.id,
      i.session_id,
      i.workspace_id,
      i.item_id,
      i.counted_quantity,
      i.counted_at,
      i.line_status,
      i.updated_at;
  end if;
end;
$$;

revoke all on function public.update_inventory_count_session_item(
  uuid,
  uuid,
  uuid,
  numeric
) from public;

grant execute on function public.update_inventory_count_session_item(
  uuid,
  uuid,
  uuid,
  numeric
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
--   and p.proname = 'update_inventory_count_session_item';
--
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'update_inventory_count_session_item';

-- Manual role matrix:
--   unauthenticated     → inventory_count_item_unauthenticated
--   staff / host        → inventory_count_item_forbidden
--   manager+            → success when session in_progress
--   paused/complete/
--     posted/cancelled   → inventory_count_item_session_not_in_progress
--   wrong workspace     → inventory_count_item_workspace_mismatch
--   wrong session item  → inventory_count_item_session_mismatch
--   negative quantity   → inventory_count_item_invalid_quantity
--   NULL quantity       → clears count (pending)
--   zero / decimal      → counted with database-owned counted_at

-- Example:
--   select * from public.update_inventory_count_session_item(
--     '<workspace_uuid>',
--     '<session_uuid>',
--     '<session_item_uuid>',
--     12.5
--   );
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.update_inventory_count_session_item(
--   uuid, uuid, uuid, numeric
-- );

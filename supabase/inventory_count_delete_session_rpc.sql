-- =============================================================================
-- P8.20.3 — Delete Inventory Count Session RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Permanently delete one inventory_count_sessions row (and cascaded
--   session locations / session items) without mutating stock.
--
-- Does NOT:
--   - Delete or alter stock_items
--   - Delete or alter stock_movements (posted adjustments remain)
--   - Reverse posted inventory quantities
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.delete_inventory_count_session(uuid, uuid);

create or replace function public.delete_inventory_count_session(
  p_workspace_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_now timestamptz := now();
  v_deleted_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_count_delete_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_delete_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_delete_session_required'
      using hint = 'session_id is required.';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_delete_forbidden'
      using hint = 'owner / general_manager / manager required.';
  end if;

  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update of s;

  if not found then
    if exists (
      select 1
      from public.inventory_count_sessions s
      where s.id = p_session_id
    ) then
      raise exception 'inventory_count_delete_workspace_mismatch'
        using hint = 'Session belongs to a different workspace.';
    end if;

    raise exception 'inventory_count_delete_session_not_found'
      using hint = 'Inventory count session was not found.';
  end if;

  delete from public.inventory_count_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count is distinct from 1 then
    raise exception 'inventory_count_delete_failed'
      using hint = 'Inventory count session could not be deleted.';
  end if;

  -- Cascades remove session_locations + session_items.
  -- stock_items / stock_movements are intentionally untouched.

  return jsonb_build_object(
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'deleted', true,
    'previous_status', v_session.status,
    'deleted_at', v_now,
    'preserved', jsonb_build_object(
      'stock_items', true,
      'stock_movements', true
    ),
    'mutations', jsonb_build_object(
      'session_deleted', true,
      'session_locations_cascaded', true,
      'session_items_cascaded', true,
      'stock_quantity_changed', false,
      'stock_movements_deleted', false
    )
  );
end;
$$;

revoke all on function public.delete_inventory_count_session(uuid, uuid) from public;
grant execute on function public.delete_inventory_count_session(uuid, uuid) to authenticated;

comment on function public.delete_inventory_count_session(uuid, uuid) is
  'P8.20.3 SECURITY DEFINER permanent delete of inventory count session + cascaded locations/items. Does not mutate stock.';

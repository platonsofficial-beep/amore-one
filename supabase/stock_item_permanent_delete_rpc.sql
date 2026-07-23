-- =============================================================================
-- P8.16.24 — Single Product Permanent Delete RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/stock_item_permanent_delete_preview_rpc.sql (P8.16.23)
--   2. stock_items / stock_movements / stock_orders / inventory_count /
--      inventory_import / inventory_stock_item_map schemas
--   3. public.can_manage_workspace_stock(uuid) available
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER transactional permanent delete for ONE stock_items row.
--   Movements cascade via FK. Related snapshot FKs SET NULL and are preserved.
--
-- Does NOT:
--   - Manually DELETE stock_movements (CASCADE only)
--   - DELETE purchase orders / order lines
--   - DELETE inventory count sessions / session items
--   - DELETE import rows / migration map rows / suppliers
--   - Touch Legacy Inventory or Bar Refill
--   - Perform bulk / catalog reset
--
-- Blocks when:
--   - draft or sent Purchase Order lines reference the product
--   - open Inventory Count session lines reference the product
--     (status NOT in posted / cancelled)
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.delete_stock_item_permanently(uuid, uuid);

create or replace function public.delete_stock_item_permanently(
  p_workspace_id uuid,
  p_stock_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_item public.stock_items%rowtype;
  v_mov_receive integer := 0;
  v_mov_usage integer := 0;
  v_mov_adjustment integer := 0;
  v_mov_stock_count integer := 0;
  v_mov_total integer := 0;
  v_order_draft integer := 0;
  v_order_sent integer := 0;
  v_order_received integer := 0;
  v_order_cancelled integer := 0;
  v_count_posted integer := 0;
  v_count_open integer := 0;
  v_count_cancelled integer := 0;
  v_import_matched integer := 0;
  v_import_applied integer := 0;
  v_migration_map integer := 0;
  v_deleted_rows integer := 0;
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'stock_item_permanent_delete_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'stock_item_permanent_delete_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_stock_item_id is null then
    raise exception 'stock_item_permanent_delete_item_required'
      using hint = 'stock_item_id is required.';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  ) then
    raise exception 'stock_item_permanent_delete_workspace_not_found'
      using hint = 'Workspace does not exist.';
  end if;

  -- Authorization: owner / general_manager / manager only
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'stock_item_permanent_delete_forbidden'
      using hint = 'owner / general_manager / manager required. host / staff / anonymous denied.';
  end if;

  -- 1–2) Workspace-scoped lock
  select *
  into v_item
  from public.stock_items s
  where s.id = p_stock_item_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'stock_item_permanent_delete_item_not_found'
      using hint = 'Stock item was not found in this workspace.';
  end if;

  -- 3) Block draft / sent purchase order references
  select
    count(*) filter (where o.status = 'draft')::integer,
    count(*) filter (where o.status = 'sent')::integer,
    count(*) filter (where o.status = 'received')::integer,
    count(*) filter (where o.status = 'cancelled')::integer
  into
    v_order_draft,
    v_order_sent,
    v_order_received,
    v_order_cancelled
  from public.stock_order_items oi
  inner join public.stock_orders o on o.id = oi.order_id
  where o.workspace_id = p_workspace_id
    and oi.stock_item_id = p_stock_item_id;

  if coalesce(v_order_draft, 0) > 0 then
    raise exception 'stock_item_permanent_delete_blocked_draft_order'
      using hint = 'Remove the product from draft purchase orders before permanent delete.',
            detail = format('draft_order_refs=%s', v_order_draft);
  end if;

  if coalesce(v_order_sent, 0) > 0 then
    raise exception 'stock_item_permanent_delete_blocked_sent_order'
      using hint = 'Remove the product from sent purchase orders before permanent delete.',
            detail = format('sent_order_refs=%s', v_order_sent);
  end if;

  -- 4) Block open inventory count references (not posted / cancelled)
  select
    count(*) filter (where cs.status = 'posted')::integer,
    count(*) filter (
      where cs.status in ('in_progress', 'paused', 'counting_complete')
    )::integer,
    count(*) filter (where cs.status = 'cancelled')::integer
  into
    v_count_posted,
    v_count_open,
    v_count_cancelled
  from public.inventory_count_session_items csi
  inner join public.inventory_count_sessions cs on cs.id = csi.session_id
  where csi.workspace_id = p_workspace_id
    and csi.item_id = p_stock_item_id;

  if coalesce(v_count_open, 0) > 0 then
    raise exception 'stock_item_permanent_delete_blocked_open_count'
      using hint = 'Finish or cancel open inventory count sessions referencing this product first.',
            detail = format('open_count_refs=%s', v_count_open);
  end if;

  -- 5) Collect deletion statistics BEFORE delete
  select
    count(*) filter (where m.type = 'receive')::integer,
    count(*) filter (where m.type = 'usage')::integer,
    count(*) filter (where m.type = 'adjustment')::integer,
    count(*) filter (where m.type = 'stock_count')::integer,
    count(*)::integer
  into
    v_mov_receive,
    v_mov_usage,
    v_mov_adjustment,
    v_mov_stock_count,
    v_mov_total
  from public.stock_movements m
  where m.workspace_id = p_workspace_id
    and m.item_id = p_stock_item_id;

  select
    count(*) filter (where r.matched_stock_item_id = p_stock_item_id)::integer,
    count(*) filter (where r.applied_stock_item_id = p_stock_item_id)::integer
  into
    v_import_matched,
    v_import_applied
  from public.inventory_import_rows r
  where r.workspace_id = p_workspace_id
    and (
      r.matched_stock_item_id = p_stock_item_id
      or r.applied_stock_item_id = p_stock_item_id
    );

  select count(*)::integer
  into v_migration_map
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.stock_item_id = p_stock_item_id;

  -- 6) Delete ONLY stock_items (movements CASCADE; other FKs SET NULL)
  delete from public.stock_items s
  where s.id = p_stock_item_id
    and s.workspace_id = p_workspace_id;

  get diagnostics v_deleted_rows = row_count;

  if coalesce(v_deleted_rows, 0) <> 1 then
    raise exception 'stock_item_permanent_delete_failed'
      using hint = 'Stock item delete did not affect exactly one row.';
  end if;

  -- 7) Machine-readable result
  return jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'deleted', jsonb_build_object(
      'product', jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'active', v_item.active,
        'current_quantity', v_item.current_quantity,
        'unit', v_item.unit,
        'storage_location', v_item.storage_location
      ),
      'movements', jsonb_build_object(
        'receive', coalesce(v_mov_receive, 0),
        'usage', coalesce(v_mov_usage, 0),
        'adjustment', coalesce(v_mov_adjustment, 0),
        'stock_count', coalesce(v_mov_stock_count, 0),
        'total', coalesce(v_mov_total, 0)
      ),
      'stock_items_rows', 1
    ),
    'preserved', jsonb_build_object(
      'purchase_orders', jsonb_build_object(
        'received_line_refs', coalesce(v_order_received, 0),
        'cancelled_line_refs', coalesce(v_order_cancelled, 0)
      ),
      'inventory_count_snapshots', jsonb_build_object(
        'posted_refs', coalesce(v_count_posted, 0),
        'cancelled_refs', coalesce(v_count_cancelled, 0),
        'open_refs', 0
      ),
      'import_rows', jsonb_build_object(
        'matched_refs', coalesce(v_import_matched, 0),
        'applied_refs', coalesce(v_import_applied, 0)
      ),
      'migration_rows', jsonb_build_object(
        'map_refs', coalesce(v_migration_map, 0)
      ),
      'supplier', jsonb_build_object(
        'supplier_id', v_item.supplier_id
      )
    ),
    'cascade', jsonb_build_object(
      'stock_movements', true,
      'manual_movement_delete', false
    )
  );
end;
$$;

comment on function public.delete_stock_item_permanently(uuid, uuid) is
  'P8.16.24 Permanently delete one stock_items row. Movements CASCADE. Snapshot FKs SET NULL. Blocks draft/sent orders and open counts.';

revoke all on function public.delete_stock_item_permanently(uuid, uuid) from public;
grant execute on function public.delete_stock_item_permanently(uuid, uuid) to authenticated;

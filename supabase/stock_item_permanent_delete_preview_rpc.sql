-- =============================================================================
-- P8.16.23 — Permanent Stock Item Delete Preview Foundation (READ-ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/stock_items_schema.sql
--   2. supabase/stock_movements_schema.sql
--   3. supabase/stock_orders_schema.sql
--   4. supabase/inventory_count_schema.sql
--   5. supabase/inventory_import_schema.sql
--   6. supabase/inventory_stock_item_map.sql
--   7. public.can_manage_workspace_stock(uuid) available
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER read-only dependency preview for a single stock_items row.
--   Prepares the permanent-delete contract. Does NOT delete.
--
-- Does NOT:
--   - DELETE / UPDATE / INSERT any table
--   - Mutate stock_items, stock_movements, quantities, orders, counts,
--     import, migration, suppliers, or any other module
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--   Rejects host / staff / anonymous
-- =============================================================================

drop function if exists public.preview_stock_item_permanent_delete(uuid, uuid);

create or replace function public.preview_stock_item_permanent_delete(
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
  v_supplier_name text := null;
  v_mov_receive integer := 0;
  v_mov_usage integer := 0;
  v_mov_adjustment integer := 0;
  v_mov_stock_count integer := 0;
  v_mov_total integer := 0;
  v_order_draft integer := 0;
  v_order_sent integer := 0;
  v_order_received integer := 0;
  v_order_cancelled integer := 0;
  v_order_total integer := 0;
  v_count_posted integer := 0;
  v_count_open integer := 0;
  v_import_matched integer := 0;
  v_import_applied integer := 0;
  v_migration_map integer := 0;
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'stock_item_permanent_delete_preview_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  -- Required workspace
  if p_workspace_id is null then
    raise exception 'stock_item_permanent_delete_preview_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_stock_item_id is null then
    raise exception 'stock_item_permanent_delete_preview_item_required'
      using hint = 'stock_item_id is required.';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  ) then
    raise exception 'stock_item_permanent_delete_preview_workspace_not_found'
      using hint = 'Workspace does not exist.';
  end if;

  -- Authorization: owner / general_manager / manager only
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'stock_item_permanent_delete_preview_forbidden'
      using hint = 'owner / general_manager / manager required. host / staff / anonymous denied.';
  end if;

  -- Workspace-scoped item lookup (no cross-workspace leakage)
  select *
  into v_item
  from public.stock_items s
  where s.id = p_stock_item_id
    and s.workspace_id = p_workspace_id;

  if not found then
    raise exception 'stock_item_permanent_delete_preview_item_not_found'
      using hint = 'Stock item was not found in this workspace.';
  end if;

  -- Supplier (optional FK + text fallback name from suppliers.company_name)
  if v_item.supplier_id is not null then
    select sp.company_name
    into v_supplier_name
    from public.suppliers sp
    where sp.id = v_item.supplier_id
    limit 1;
  end if;

  if v_supplier_name is null and coalesce(v_item.supplier, '') <> '' then
    v_supplier_name := v_item.supplier;
  end if;

  -- Movement counts by type (workspace + item scoped)
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

  -- Order line references by parent order status
  select
    count(*) filter (where o.status = 'draft')::integer,
    count(*) filter (where o.status = 'sent')::integer,
    count(*) filter (where o.status = 'received')::integer,
    count(*) filter (where o.status = 'cancelled')::integer,
    count(*)::integer
  into
    v_order_draft,
    v_order_sent,
    v_order_received,
    v_order_cancelled,
    v_order_total
  from public.stock_order_items oi
  inner join public.stock_orders o on o.id = oi.order_id
  where o.workspace_id = p_workspace_id
    and oi.stock_item_id = p_stock_item_id;

  -- Inventory count session line references
  -- posted = session status posted
  -- open   = in_progress | paused | counting_complete
  select
    count(*) filter (where cs.status = 'posted')::integer,
    count(*) filter (
      where cs.status in ('in_progress', 'paused', 'counting_complete')
    )::integer
  into
    v_count_posted,
    v_count_open
  from public.inventory_count_session_items csi
  inner join public.inventory_count_sessions cs on cs.id = csi.session_id
  where csi.workspace_id = p_workspace_id
    and csi.item_id = p_stock_item_id;

  -- Import row references
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

  -- Migration map references
  select count(*)::integer
  into v_migration_map
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.stock_item_id = p_stock_item_id;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'preview_only', true,
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
    'orders', jsonb_build_object(
      'draft', coalesce(v_order_draft, 0),
      'sent', coalesce(v_order_sent, 0),
      'received', coalesce(v_order_received, 0),
      'cancelled', coalesce(v_order_cancelled, 0),
      'total', coalesce(v_order_total, 0)
    ),
    'inventory_count', jsonb_build_object(
      'posted_references', coalesce(v_count_posted, 0),
      'open_references', coalesce(v_count_open, 0)
    ),
    'import', jsonb_build_object(
      'matched_refs', coalesce(v_import_matched, 0),
      'applied_refs', coalesce(v_import_applied, 0)
    ),
    'migration', jsonb_build_object(
      'map_refs', coalesce(v_migration_map, 0)
    ),
    'supplier', jsonb_build_object(
      'supplier_id', v_item.supplier_id,
      'supplier_name', v_supplier_name
    ),
    'mutation', jsonb_build_object(
      'deletes_records', false,
      'updates_records', false,
      'inserts_records', false
    )
  );
end;
$$;

comment on function public.preview_stock_item_permanent_delete(uuid, uuid) is
  'P8.16.23 Read-only permanent-delete dependency preview for one stock_items row. Never mutates data.';

revoke all on function public.preview_stock_item_permanent_delete(uuid, uuid) from public;
grant execute on function public.preview_stock_item_permanent_delete(uuid, uuid) to authenticated;

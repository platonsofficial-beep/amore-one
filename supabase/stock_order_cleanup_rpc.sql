-- =============================================================================
-- P8.16.20 — Secure Purchase Order Document Cleanup Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/stock_orders_schema.sql
--   2. supabase/stock_orders_rls_policies.sql (or equivalent helpers)
--   3. public.can_manage_workspace_stock(uuid) available
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER preview + document-only cleanup for stock_orders.
--   Deletes ONLY stock_orders (stock_order_items cascade via FK).
--
-- Does NOT:
--   - UPDATE or DELETE stock_items
--   - UPDATE or DELETE stock_movements
--   - Modify current_quantity
--   - Modify suppliers
--   - Modify receive history on movements
--   - Touch Inventory Count / Import / Migration / Bar Refill tables
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--   Rejects host / staff / anonymous
--
-- Contract:
--   p_preview_only = true  → counts only, no deletes
--   p_preview_only = false → delete workspace orders in one transaction
-- =============================================================================

drop function if exists public.cleanup_purchase_order_documents(uuid, boolean);

create or replace function public.cleanup_purchase_order_documents(
  p_workspace_id uuid,
  p_preview_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_preview_only boolean := coalesce(p_preview_only, true);
  v_total_orders integer := 0;
  v_draft_orders integer := 0;
  v_sent_orders integer := 0;
  v_received_orders integer := 0;
  v_cancelled_orders integer := 0;
  v_total_order_items integer := 0;
  v_lines_with_receive integer := 0;
  v_orders_with_receive integer := 0;
  v_has_receive_footprint boolean := false;
  v_deleted_orders integer := 0;
  v_deleted_order_items integer := 0;
  v_result jsonb;
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'stock_order_cleanup_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  -- Required workspace
  if p_workspace_id is null then
    raise exception 'stock_order_cleanup_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  ) then
    raise exception 'stock_order_cleanup_workspace_not_found'
      using hint = 'Workspace does not exist.';
  end if;

  -- Authorization: owner / general_manager / manager only
  -- Operator identity is never accepted from the client.
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'stock_order_cleanup_forbidden'
      using hint = 'owner / general_manager / manager required. host / staff / anonymous denied.';
  end if;

  -- Workspace-scoped preview aggregates (document surface only)
  select
    count(*)::integer,
    count(*) filter (where so.status = 'draft')::integer,
    count(*) filter (where so.status = 'sent')::integer,
    count(*) filter (where so.status = 'received')::integer,
    count(*) filter (where so.status = 'cancelled')::integer
  into
    v_total_orders,
    v_draft_orders,
    v_sent_orders,
    v_received_orders,
    v_cancelled_orders
  from public.stock_orders so
  where so.workspace_id = p_workspace_id;

  select
    count(soi.id)::integer,
    count(soi.id) filter (where coalesce(soi.received_quantity, 0) > 0)::integer,
    count(distinct soi.order_id) filter (where coalesce(soi.received_quantity, 0) > 0)::integer
  into
    v_total_order_items,
    v_lines_with_receive,
    v_orders_with_receive
  from public.stock_order_items soi
  inner join public.stock_orders so on so.id = soi.order_id
  where so.workspace_id = p_workspace_id;

  v_has_receive_footprint := coalesce(v_lines_with_receive, 0) > 0;

  if not v_preview_only then
    -- Document-only delete. Items cascade via stock_order_items.order_id ON DELETE CASCADE.
    -- Explicitly scoped to p_workspace_id. Never touches stock_items / stock_movements.
    -- Status counts above remain as the pre-delete snapshot for the cleanup report.
    with doomed_items as (
      select soi.id
      from public.stock_order_items soi
      inner join public.stock_orders so on so.id = soi.order_id
      where so.workspace_id = p_workspace_id
    )
    select count(*)::integer into v_deleted_order_items from doomed_items;

    delete from public.stock_orders so
    where so.workspace_id = p_workspace_id;

    get diagnostics v_deleted_orders = row_count;
  end if;

  v_result := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'preview_only', v_preview_only,
    'total_orders', coalesce(v_total_orders, 0),
    'draft_orders', coalesce(v_draft_orders, 0),
    'sent_orders', coalesce(v_sent_orders, 0),
    'received_orders', coalesce(v_received_orders, 0),
    'cancelled_orders', coalesce(v_cancelled_orders, 0),
    'total_order_items', coalesce(v_total_order_items, 0),
    'lines_with_receive', coalesce(v_lines_with_receive, 0),
    'orders_with_receive', coalesce(v_orders_with_receive, 0),
    'has_receive_footprint', v_has_receive_footprint,
    'deleted_orders', coalesce(v_deleted_orders, 0),
    'deleted_order_items', coalesce(v_deleted_order_items, 0),
    'preserves_stock_movements', true,
    'preserves_stock_quantities', true
  );

  return v_result;
end;
$$;

comment on function public.cleanup_purchase_order_documents(uuid, boolean) is
  'P8.16.20 Document-only purchase order cleanup. Preview or delete stock_orders (+ cascaded items). Never mutates stock_items or stock_movements.';

revoke all on function public.cleanup_purchase_order_documents(uuid, boolean) from public;
grant execute on function public.cleanup_purchase_order_documents(uuid, boolean) to authenticated;

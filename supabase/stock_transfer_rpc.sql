-- =============================================================================
-- P8.29.6 — Transfer RPC Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/stock_item_location_balances_schema.sql (P8.29.2)
--   2. supabase/stock_movements_location_extension.sql (P8.29.3)
--   3. supabase/stock_location_balance_mutation_rpcs.sql (P8.29.5)
-- Prefer after stock_item_location_balances_backfill.sql (P8.29.4).
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Canonical SECURITY DEFINER transfer engine:
--     transfer_stock_between_locations
--   Moves quantity between two location balances of the SAME stock item
--   in one transaction with two ledger rows (transfer_out + transfer_in).
--
-- Does NOT:
--   - Wire services / UI / Count / Import / Dashboard
--   - Auto-create missing balance rows
--   - Change receive/usage/adjustment/stock_count RPCs
--   - Change existing movement writers
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.transfer_stock_between_locations(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
);

create or replace function public.transfer_stock_between_locations(
  p_workspace_id uuid,
  p_stock_item_id uuid,
  p_source_workspace_storage_id uuid,
  p_destination_workspace_storage_id uuid,
  p_quantity numeric,
  p_expected_source_quantity_version bigint,
  p_expected_destination_quantity_version bigint,
  p_note text default '',
  p_origin_ref_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_item_exists boolean := false;
  v_source_storage public.workspace_storages%rowtype;
  v_dest_storage public.workspace_storages%rowtype;
  v_source_balance public.stock_item_location_balances%rowtype;
  v_dest_balance public.stock_item_location_balances%rowtype;
  v_qty numeric(12, 3);
  v_note text := btrim(coalesce(p_note, ''));
  v_transfer_group_id uuid := gen_random_uuid();
  v_created_at timestamptz := clock_timestamp();
  v_source_before numeric(12, 3);
  v_dest_before numeric(12, 3);
  v_source_after numeric(12, 3);
  v_dest_after numeric(12, 3);
  v_aggregate_before numeric(12, 3);
  v_aggregate_after numeric(12, 3);
  v_out_movement_id uuid;
  v_in_movement_id uuid;
  v_row_count integer := 0;
  v_lock_first_storage_id uuid;
  v_lock_second_storage_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'stock_transfer_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'stock_transfer_workspace_required';
  end if;

  if p_stock_item_id is null then
    raise exception 'stock_transfer_item_required';
  end if;

  if p_source_workspace_storage_id is null
     or p_destination_workspace_storage_id is null then
    raise exception 'stock_transfer_storage_required';
  end if;

  if p_source_workspace_storage_id = p_destination_workspace_storage_id then
    raise exception 'stock_transfer_same_storage';
  end if;

  if p_expected_source_quantity_version is null
     or p_expected_source_quantity_version < 1
     or p_expected_destination_quantity_version is null
     or p_expected_destination_quantity_version < 1 then
    raise exception 'stock_transfer_version_required';
  end if;

  if p_quantity is null or p_quantity <> p_quantity then
    raise exception 'stock_transfer_quantity_invalid';
  end if;

  v_qty := p_quantity::numeric(12, 3);

  if v_qty = 0 then
    raise exception 'stock_transfer_quantity_zero';
  end if;

  if v_qty < 0 then
    raise exception 'stock_transfer_quantity_negative';
  end if;

  select exists (
    select 1 from public.workspaces w where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'stock_transfer_workspace_not_found';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'stock_transfer_forbidden';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'stock_transfer_forbidden';
  end if;

  select exists (
    select 1
    from public.stock_items si
    where si.id = p_stock_item_id
      and si.workspace_id = p_workspace_id
  )
  into v_item_exists;

  if not v_item_exists then
    raise exception 'stock_transfer_item_not_found';
  end if;

  -- Deterministic lock order on storages to reduce deadlock risk.
  if p_source_workspace_storage_id < p_destination_workspace_storage_id then
    v_lock_first_storage_id := p_source_workspace_storage_id;
    v_lock_second_storage_id := p_destination_workspace_storage_id;
  else
    v_lock_first_storage_id := p_destination_workspace_storage_id;
    v_lock_second_storage_id := p_source_workspace_storage_id;
  end if;

  -- Lock both storages (workspace-scoped).
  perform 1
  from public.workspace_storages ws
  where ws.id = v_lock_first_storage_id
    and ws.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'stock_transfer_storage_not_found';
  end if;

  perform 1
  from public.workspace_storages ws
  where ws.id = v_lock_second_storage_id
    and ws.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'stock_transfer_storage_not_found';
  end if;

  select *
  into v_source_storage
  from public.workspace_storages ws
  where ws.id = p_source_workspace_storage_id
    and ws.workspace_id = p_workspace_id;

  if not found then
    raise exception 'stock_transfer_storage_not_found';
  end if;

  select *
  into v_dest_storage
  from public.workspace_storages ws
  where ws.id = p_destination_workspace_storage_id
    and ws.workspace_id = p_workspace_id;

  if not found then
    raise exception 'stock_transfer_storage_not_found';
  end if;

  if not v_source_storage.active or not v_dest_storage.active then
    raise exception 'stock_transfer_storage_inactive';
  end if;

  -- Lock both balances in the same deterministic storage-id order.
  if p_source_workspace_storage_id < p_destination_workspace_storage_id then
    select *
    into v_source_balance
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = p_stock_item_id
      and b.workspace_storage_id = p_source_workspace_storage_id
    for update;

    if not found then
      raise exception 'stock_transfer_source_balance_not_found';
    end if;

    select *
    into v_dest_balance
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = p_stock_item_id
      and b.workspace_storage_id = p_destination_workspace_storage_id
    for update;

    if not found then
      raise exception 'stock_transfer_destination_balance_not_found';
    end if;
  else
    select *
    into v_dest_balance
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = p_stock_item_id
      and b.workspace_storage_id = p_destination_workspace_storage_id
    for update;

    if not found then
      raise exception 'stock_transfer_destination_balance_not_found';
    end if;

    select *
    into v_source_balance
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = p_stock_item_id
      and b.workspace_storage_id = p_source_workspace_storage_id
    for update;

    if not found then
      raise exception 'stock_transfer_source_balance_not_found';
    end if;
  end if;

  if v_source_balance.location_key is distinct from v_source_storage.location_key then
    raise exception 'stock_transfer_source_location_key_mismatch';
  end if;

  if v_dest_balance.location_key is distinct from v_dest_storage.location_key then
    raise exception 'stock_transfer_destination_location_key_mismatch';
  end if;

  if v_source_balance.quantity_version
       is distinct from p_expected_source_quantity_version then
    raise exception 'stock_transfer_source_version_mismatch'
      using hint = format(
        'expected=%s actual=%s',
        p_expected_source_quantity_version,
        v_source_balance.quantity_version
      );
  end if;

  if v_dest_balance.quantity_version
       is distinct from p_expected_destination_quantity_version then
    raise exception 'stock_transfer_destination_version_mismatch'
      using hint = format(
        'expected=%s actual=%s',
        p_expected_destination_quantity_version,
        v_dest_balance.quantity_version
      );
  end if;

  v_source_before := v_source_balance.quantity;
  v_dest_before := v_dest_balance.quantity;

  if v_source_before < v_qty then
    raise exception 'stock_transfer_insufficient_source';
  end if;

  v_source_after := v_source_before - v_qty;
  v_dest_after := v_dest_before + v_qty;

  if v_source_after < 0 then
    raise exception 'stock_transfer_negative_rejected';
  end if;

  select coalesce(sum(b.quantity), 0)::numeric(12, 3)
  into v_aggregate_before
  from public.stock_item_location_balances b
  where b.workspace_id = p_workspace_id
    and b.stock_item_id = p_stock_item_id;

  -- Movement A: transfer_out
  insert into public.stock_movements (
    workspace_id,
    item_id,
    type,
    quantity,
    note,
    created_by,
    created_at,
    source_workspace_storage_id,
    destination_workspace_storage_id,
    source_location_key,
    destination_location_key,
    transfer_group_id,
    origin_workflow,
    origin_ref_id
  )
  values (
    p_workspace_id,
    p_stock_item_id,
    'transfer_out',
    v_qty,
    v_note,
    v_auth_user_id,
    v_created_at,
    v_source_storage.id,
    v_dest_storage.id,
    v_source_storage.location_key,
    v_dest_storage.location_key,
    v_transfer_group_id,
    'transfer',
    p_origin_ref_id
  )
  returning id into v_out_movement_id;

  if v_out_movement_id is null then
    raise exception 'stock_transfer_movement_failed';
  end if;

  -- Movement B: transfer_in (same transfer_group_id, created_at, operator, origin)
  insert into public.stock_movements (
    workspace_id,
    item_id,
    type,
    quantity,
    note,
    created_by,
    created_at,
    source_workspace_storage_id,
    destination_workspace_storage_id,
    source_location_key,
    destination_location_key,
    transfer_group_id,
    origin_workflow,
    origin_ref_id
  )
  values (
    p_workspace_id,
    p_stock_item_id,
    'transfer_in',
    v_qty,
    v_note,
    v_auth_user_id,
    v_created_at,
    v_source_storage.id,
    v_dest_storage.id,
    v_source_storage.location_key,
    v_dest_storage.location_key,
    v_transfer_group_id,
    'transfer',
    p_origin_ref_id
  )
  returning id into v_in_movement_id;

  if v_in_movement_id is null then
    raise exception 'stock_transfer_movement_failed';
  end if;

  update public.stock_item_location_balances b
  set
    quantity = v_source_after,
    quantity_version = b.quantity_version + 1,
    updated_by = v_auth_user_id
  where b.id = v_source_balance.id
    and b.workspace_id = p_workspace_id
    and b.quantity_version = p_expected_source_quantity_version;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'stock_transfer_source_version_mismatch';
  end if;

  update public.stock_item_location_balances b
  set
    quantity = v_dest_after,
    quantity_version = b.quantity_version + 1,
    updated_by = v_auth_user_id
  where b.id = v_dest_balance.id
    and b.workspace_id = p_workspace_id
    and b.quantity_version = p_expected_destination_quantity_version;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'stock_transfer_destination_version_mismatch';
  end if;

  select coalesce(sum(b.quantity), 0)::numeric(12, 3)
  into v_aggregate_after
  from public.stock_item_location_balances b
  where b.workspace_id = p_workspace_id
    and b.stock_item_id = p_stock_item_id;

  if v_aggregate_after < 0 then
    raise exception 'stock_transfer_aggregate_drift';
  end if;

  -- Total quantity must remain identical across the transfer.
  if v_aggregate_after is distinct from v_aggregate_before then
    raise exception 'stock_transfer_aggregate_changed';
  end if;

  update public.stock_items si
  set current_quantity = v_aggregate_after
  where si.id = p_stock_item_id
    and si.workspace_id = p_workspace_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'stock_transfer_item_cache_update_failed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'transfer_group_id', v_transfer_group_id,
    'transfer_out_movement_id', v_out_movement_id,
    'transfer_in_movement_id', v_in_movement_id,
    'stock_item_id', p_stock_item_id,
    'source_workspace_storage_id', p_source_workspace_storage_id,
    'destination_workspace_storage_id', p_destination_workspace_storage_id,
    'source_location_key', v_source_storage.location_key,
    'destination_location_key', v_dest_storage.location_key,
    'quantity', v_qty,
    'source_quantity_before', v_source_before,
    'source_quantity_after', v_source_after,
    'destination_quantity_before', v_dest_before,
    'destination_quantity_after', v_dest_after,
    'source_quantity_version', p_expected_source_quantity_version + 1,
    'destination_quantity_version', p_expected_destination_quantity_version + 1,
    'current_quantity', v_aggregate_after,
    'origin_workflow', 'transfer',
    'origin_ref_id', p_origin_ref_id,
    'created_at', v_created_at
  );
end;
$$;

comment on function public.transfer_stock_between_locations(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) is
  'P8.29.6 SECURITY DEFINER atomic transfer between two location balances. Writes transfer_out + transfer_in with shared transfer_group_id; optimistic locks both versions; refreshes current_quantity = SUM(balances); total unchanged.';

revoke all on function public.transfer_stock_between_locations(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) from public;
revoke all on function public.transfer_stock_between_locations(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) from anon;
grant execute on function public.transfer_stock_between_locations(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) to authenticated;

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================
-- select pg_get_functiondef('public.transfer_stock_between_locations(uuid,uuid,uuid,uuid,numeric,bigint,bigint,text,uuid)'::regprocedure);
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.transfer_stock_between_locations(uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid);

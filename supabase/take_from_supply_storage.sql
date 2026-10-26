-- Run with explicit owner approval
-- =============================================================================
-- Staff take from supply (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Members who are not managers can move stock only from a supply storage
-- to a non-supply storage. Managers keep transfer_stock_between_locations
-- for every other move. This function does not replace that one.
--
-- A member must belong to the workspace. The source storage must be
-- is_supply. The destination must be active, in the same workspace, and
-- not a supply storage. Quantity, versions, and movement rows follow the
-- same rules as transfer_stock_between_locations. origin_workflow is
-- take_from_supply. No cost is read or returned.
--
-- EXECUTE is granted to authenticated only. anon and public stay revoked.
-- This script does not insert, update, or delete stock rows.
--
-- Prerequisite: workspace_storages.is_supply from workspace_departments.sql.
-- =============================================================================

begin;

create or replace function public.take_from_supply_storage(
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

  -- Serialize all location changes for a product before storage/balance locks.
  -- SUM(balances) must be read only after any concurrent product writer commits.
  perform 1 from public.stock_items si
  where si.id = p_stock_item_id and si.workspace_id = p_workspace_id
  for update;

  if not found then
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

  if coalesce(v_source_storage.is_supply, false) is distinct from true then
    raise exception 'take_from_supply_source_not_supply';
  end if;

  if coalesce(v_dest_storage.is_supply, false) is distinct from false then
    raise exception 'take_from_supply_destination_is_supply';
  end if;

  -- Lock both balances in the same deterministic storage-id order.
  -- P8.30.6a: destination missing → ensure zero-row (qty 0, version 1) then lock.
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

    v_dest_balance := public.ensure_stock_item_location_balance(
      p_workspace_id,
      p_stock_item_id,
      p_destination_workspace_storage_id,
      v_dest_storage.location_key,
      v_auth_user_id
    );
  else
    v_dest_balance := public.ensure_stock_item_location_balance(
      p_workspace_id,
      p_stock_item_id,
      p_destination_workspace_storage_id,
      v_dest_storage.location_key,
      v_auth_user_id
    );

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
    'take_from_supply',
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
    'take_from_supply',
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
    'origin_workflow', 'take_from_supply',
    'origin_ref_id', p_origin_ref_id,
    'created_at', v_created_at
  );
end;
$$;


comment on function public.take_from_supply_storage(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) is
  'Member move from a supply storage to a non-supply storage. Same balance and movement rules as transfer_stock_between_locations. Does not allow supply-to-supply or shelf-to-shelf.';

revoke all on function public.take_from_supply_storage(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) from public;
revoke all on function public.take_from_supply_storage(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) from anon;
revoke all on function public.take_from_supply_storage(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) from authenticated;
grant execute on function public.take_from_supply_storage(
  uuid, uuid, uuid, uuid, numeric, bigint, bigint, text, uuid
) to authenticated;

commit;

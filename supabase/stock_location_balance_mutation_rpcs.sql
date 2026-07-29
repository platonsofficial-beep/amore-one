-- =============================================================================
-- P8.29.5 — Balance Mutation RPC Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/stock_item_location_balances_schema.sql (P8.29.2)
--   2. supabase/stock_movements_location_extension.sql (P8.29.3)
--   3. Prefer after stock_item_location_balances_backfill.sql (P8.29.4)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Authoritative SECURITY DEFINER RPCs that mutate
--   public.stock_item_location_balances atomically with:
--     - optimistic quantity_version lock
--     - stock_movements ledger insert (location-aware)
--     - stock_items.current_quantity cache refresh = SUM(balances)
--
-- Public RPCs:
--   - record_location_receive
--   - record_location_usage
--   - record_location_adjustment
--   - record_location_stock_count
--
-- Shared core (not granted to clients):
--   - mutate_stock_item_location_balance_core
--
-- Does NOT:
--   - Implement transfer RPC (P8.29.6)
--   - Wire services / UI / Count / Import / Dashboard
--   - Change existing movement writers
--   - Auto-create missing balance rows
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared core (internal). Not granted to authenticated / anon.
-- -----------------------------------------------------------------------------
drop function if exists public.mutate_stock_item_location_balance_core(
  uuid, uuid, uuid, text, numeric, bigint, text, text, uuid
);

create or replace function public.mutate_stock_item_location_balance_core(
  p_workspace_id uuid,
  p_stock_item_id uuid,
  p_workspace_storage_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_quantity_version bigint,
  p_note text default '',
  p_origin_workflow text default 'manual',
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
  v_storage public.workspace_storages%rowtype;
  v_balance public.stock_item_location_balances%rowtype;
  v_movement_id uuid;
  v_qty numeric(12, 3);
  v_quantity_before numeric(12, 3);
  v_quantity_after numeric(12, 3);
  v_movement_quantity numeric(12, 3);
  v_source_storage_id uuid := null;
  v_source_location_key text := null;
  v_dest_storage_id uuid := null;
  v_dest_location_key text := null;
  v_origin_workflow text;
  v_note text := btrim(coalesce(p_note, ''));
  v_aggregate_sum numeric(12, 3);
  v_row_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'stock_location_balance_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'stock_location_balance_workspace_required';
  end if;

  if p_stock_item_id is null then
    raise exception 'stock_location_balance_item_required';
  end if;

  if p_workspace_storage_id is null then
    raise exception 'stock_location_balance_storage_required';
  end if;

  if p_expected_quantity_version is null or p_expected_quantity_version < 1 then
    raise exception 'stock_location_balance_version_required';
  end if;

  if p_movement_type is null
     or p_movement_type not in ('receive', 'usage', 'adjustment', 'stock_count') then
    raise exception 'stock_location_balance_movement_type_invalid';
  end if;

  -- Transfer types are intentionally rejected here (P8.29.6).
  if p_movement_type in ('transfer_out', 'transfer_in') then
    raise exception 'stock_location_balance_transfer_not_supported';
  end if;

  select exists (
    select 1 from public.workspaces w where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'stock_location_balance_workspace_not_found';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'stock_location_balance_forbidden';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'stock_location_balance_forbidden';
  end if;

  select exists (
    select 1
    from public.stock_items si
    where si.id = p_stock_item_id
      and si.workspace_id = p_workspace_id
  )
  into v_item_exists;

  if not v_item_exists then
    raise exception 'stock_location_balance_item_not_found';
  end if;

  select *
  into v_storage
  from public.workspace_storages ws
  where ws.id = p_workspace_storage_id
    and ws.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'stock_location_balance_storage_not_found';
  end if;

  if not v_storage.active then
    raise exception 'stock_location_balance_storage_inactive';
  end if;

  if p_origin_workflow is not null
     and p_origin_workflow is distinct from btrim(p_origin_workflow) then
    raise exception 'stock_location_balance_origin_workflow_invalid';
  end if;

  v_origin_workflow := btrim(coalesce(p_origin_workflow, 'manual'));

  if v_origin_workflow not in (
    'manual',
    'order_receive',
    'inventory_count_post',
    'inventory_count_correction',
    'inventory_count_reversal',
    'spreadsheet_import',
    'transfer',
    'migration',
    'repair'
  ) then
    raise exception 'stock_location_balance_origin_workflow_invalid';
  end if;

  if p_quantity is null or p_quantity <> p_quantity then -- null or NaN guard
    raise exception 'stock_location_balance_quantity_invalid';
  end if;

  v_qty := p_quantity::numeric(12, 3);

  if p_movement_type = 'receive' then
    if v_qty <= 0 then
      raise exception 'stock_location_balance_quantity_invalid';
    end if;
    v_movement_quantity := abs(v_qty);
  elsif p_movement_type = 'usage' then
    if v_qty <= 0 then
      raise exception 'stock_location_balance_quantity_invalid';
    end if;
    v_movement_quantity := abs(v_qty);
  elsif p_movement_type = 'adjustment' then
    if v_qty = 0 then
      raise exception 'stock_location_balance_quantity_invalid';
    end if;
    v_movement_quantity := v_qty; -- signed
  elsif p_movement_type = 'stock_count' then
    if v_qty < 0 then
      raise exception 'stock_location_balance_quantity_invalid';
    end if;
    v_movement_quantity := abs(v_qty); -- absolute counted quantity
  end if;

  select *
  into v_balance
  from public.stock_item_location_balances b
  where b.workspace_id = p_workspace_id
    and b.stock_item_id = p_stock_item_id
    and b.workspace_storage_id = p_workspace_storage_id
  for update;

  if not found then
    raise exception 'stock_location_balance_not_found';
  end if;

  -- Cross-check immutable location snapshot vs catalog key.
  if v_balance.location_key is distinct from v_storage.location_key then
    raise exception 'stock_location_balance_location_key_mismatch';
  end if;

  if v_balance.quantity_version is distinct from p_expected_quantity_version then
    raise exception 'stock_location_balance_version_mismatch'
      using hint = format(
        'expected=%s actual=%s',
        p_expected_quantity_version,
        v_balance.quantity_version
      );
  end if;

  v_quantity_before := v_balance.quantity;

  if p_movement_type = 'receive' then
    v_quantity_after := v_quantity_before + abs(v_qty);
    v_dest_storage_id := v_storage.id;
    v_dest_location_key := v_storage.location_key;
  elsif p_movement_type = 'usage' then
    v_quantity_after := v_quantity_before - abs(v_qty);
    v_source_storage_id := v_storage.id;
    v_source_location_key := v_storage.location_key;
  elsif p_movement_type = 'adjustment' then
    v_quantity_after := v_quantity_before + v_qty;
    if v_qty > 0 then
      v_dest_storage_id := v_storage.id;
      v_dest_location_key := v_storage.location_key;
    else
      v_source_storage_id := v_storage.id;
      v_source_location_key := v_storage.location_key;
    end if;
  else -- stock_count
    v_quantity_after := abs(v_qty);
    v_dest_storage_id := v_storage.id;
    v_dest_location_key := v_storage.location_key;
  end if;

  if v_quantity_after < 0 then
    raise exception 'stock_location_balance_negative_rejected';
  end if;

  insert into public.stock_movements (
    workspace_id,
    item_id,
    type,
    quantity,
    note,
    created_by,
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
    p_movement_type,
    v_movement_quantity,
    v_note,
    v_auth_user_id,
    v_source_storage_id,
    v_dest_storage_id,
    v_source_location_key,
    v_dest_location_key,
    null,
    v_origin_workflow,
    p_origin_ref_id
  )
  returning id into v_movement_id;

  if v_movement_id is null then
    raise exception 'stock_location_balance_movement_failed';
  end if;

  update public.stock_item_location_balances b
  set
    quantity = v_quantity_after,
    quantity_version = b.quantity_version + 1,
    updated_by = v_auth_user_id
  where b.id = v_balance.id
    and b.workspace_id = p_workspace_id
    and b.quantity_version = p_expected_quantity_version;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'stock_location_balance_version_mismatch';
  end if;

  select coalesce(sum(b.quantity), 0)::numeric(12, 3)
  into v_aggregate_sum
  from public.stock_item_location_balances b
  where b.workspace_id = p_workspace_id
    and b.stock_item_id = p_stock_item_id;

  -- Drift protection: aggregate must never be negative.
  if v_aggregate_sum < 0 then
    raise exception 'stock_location_balance_aggregate_drift';
  end if;

  update public.stock_items si
  set current_quantity = v_aggregate_sum
  where si.id = p_stock_item_id
    and si.workspace_id = p_workspace_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'stock_location_balance_item_cache_update_failed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'movement_id', v_movement_id,
    'balance_id', v_balance.id,
    'stock_item_id', p_stock_item_id,
    'workspace_storage_id', p_workspace_storage_id,
    'location_key', v_storage.location_key,
    'movement_type', p_movement_type,
    'quantity_before', v_quantity_before,
    'quantity_after', v_quantity_after,
    'quantity_version', p_expected_quantity_version + 1,
    'current_quantity', v_aggregate_sum,
    'origin_workflow', v_origin_workflow,
    'origin_ref_id', p_origin_ref_id
  );
end;
$$;

comment on function public.mutate_stock_item_location_balance_core(
  uuid, uuid, uuid, text, numeric, bigint, text, text, uuid
) is
  'P8.29.5 Internal atomic balance mutation core. Validates workspace/item/storage/balance/version; writes movement; updates balance + quantity_version; refreshes stock_items.current_quantity = SUM(balances). Not granted to clients.';

revoke all on function public.mutate_stock_item_location_balance_core(
  uuid, uuid, uuid, text, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.mutate_stock_item_location_balance_core(
  uuid, uuid, uuid, text, numeric, bigint, text, text, uuid
) from anon;
revoke all on function public.mutate_stock_item_location_balance_core(
  uuid, uuid, uuid, text, numeric, bigint, text, text, uuid
) from authenticated;

-- -----------------------------------------------------------------------------
-- record_location_receive
-- -----------------------------------------------------------------------------
drop function if exists public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
);

create or replace function public.record_location_receive(
  p_workspace_id uuid,
  p_stock_item_id uuid,
  p_workspace_storage_id uuid,
  p_quantity numeric,
  p_expected_quantity_version bigint,
  p_note text default '',
  p_origin_workflow text default 'manual',
  p_origin_ref_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.mutate_stock_item_location_balance_core(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    'receive',
    p_quantity,
    p_expected_quantity_version,
    p_note,
    p_origin_workflow,
    p_origin_ref_id
  );
end;
$$;

comment on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) is
  'P8.29.5 SECURITY DEFINER receive into one location balance. Optimistic lock via expected_quantity_version. Refreshes current_quantity cache in same transaction.';

revoke all on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from anon;
grant execute on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) to authenticated;

-- -----------------------------------------------------------------------------
-- record_location_usage
-- -----------------------------------------------------------------------------
drop function if exists public.record_location_usage(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
);

create or replace function public.record_location_usage(
  p_workspace_id uuid,
  p_stock_item_id uuid,
  p_workspace_storage_id uuid,
  p_quantity numeric,
  p_expected_quantity_version bigint,
  p_note text default '',
  p_origin_workflow text default 'manual',
  p_origin_ref_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.mutate_stock_item_location_balance_core(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    'usage',
    p_quantity,
    p_expected_quantity_version,
    p_note,
    p_origin_workflow,
    p_origin_ref_id
  );
end;
$$;

comment on function public.record_location_usage(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) is
  'P8.29.5 SECURITY DEFINER usage from one location balance. Rejects negative resulting balance. Optimistic lock + cache refresh in same transaction.';

revoke all on function public.record_location_usage(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.record_location_usage(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from anon;
grant execute on function public.record_location_usage(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) to authenticated;

-- -----------------------------------------------------------------------------
-- record_location_adjustment
-- -----------------------------------------------------------------------------
drop function if exists public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
);

create or replace function public.record_location_adjustment(
  p_workspace_id uuid,
  p_stock_item_id uuid,
  p_workspace_storage_id uuid,
  p_quantity numeric,
  p_expected_quantity_version bigint,
  p_note text default '',
  p_origin_workflow text default 'manual',
  p_origin_ref_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.mutate_stock_item_location_balance_core(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    'adjustment',
    p_quantity,
    p_expected_quantity_version,
    p_note,
    p_origin_workflow,
    p_origin_ref_id
  );
end;
$$;

comment on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) is
  'P8.29.5 SECURITY DEFINER signed adjustment at one location. Rejects negative resulting balance. Optimistic lock + cache refresh in same transaction.';

revoke all on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from anon;
grant execute on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) to authenticated;

-- -----------------------------------------------------------------------------
-- record_location_stock_count
-- -----------------------------------------------------------------------------
drop function if exists public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
);

create or replace function public.record_location_stock_count(
  p_workspace_id uuid,
  p_stock_item_id uuid,
  p_workspace_storage_id uuid,
  p_quantity numeric,
  p_expected_quantity_version bigint,
  p_note text default '',
  p_origin_workflow text default 'manual',
  p_origin_ref_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.mutate_stock_item_location_balance_core(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    'stock_count',
    p_quantity,
    p_expected_quantity_version,
    p_note,
    p_origin_workflow,
    p_origin_ref_id
  );
end;
$$;

comment on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) is
  'P8.29.5 SECURITY DEFINER absolute stock_count set at one location. Optimistic lock + cache refresh in same transaction.';

revoke all on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from anon;
grant execute on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) to authenticated;

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================
-- select proname from pg_proc
-- where pronamespace = 'public'::regnamespace
--   and proname like 'record_location_%'
-- order by proname;
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.record_location_stock_count(uuid, uuid, uuid, numeric, bigint, text, text, uuid);
-- drop function if exists public.record_location_adjustment(uuid, uuid, uuid, numeric, bigint, text, text, uuid);
-- drop function if exists public.record_location_usage(uuid, uuid, uuid, numeric, bigint, text, text, uuid);
-- drop function if exists public.record_location_receive(uuid, uuid, uuid, numeric, bigint, text, text, uuid);
-- drop function if exists public.mutate_stock_item_location_balance_core(uuid, uuid, uuid, text, numeric, bigint, text, text, uuid);

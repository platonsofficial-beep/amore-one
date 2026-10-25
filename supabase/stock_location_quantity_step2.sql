-- =============================================================================
-- Step 2 — Location quantity writers (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent: CREATE OR REPLACE. Wrapped in begin/commit.
--
-- Purpose:
--   1. record_location_receive, positive record_location_adjustment, and
--      record_location_stock_count create a missing balance row via internal
--      ensure_stock_item_location_balance ONLY when
--      stock_items.current_quantity = SUM(stock_item_location_balances)
--      for that item. Otherwise they raise
--      stock_location_balance_reconciliation_required.
--      Usage and negative/zero adjustments never auto-create.
--   2. apply_inventory_import_session legacy create + link write the balance
--      at the resolved storage, then set current_quantity = SUM(balances).
--      No location-blind stock_count.
--   3. run_inventory_migration_auto_create inserts the matching balance row
--      (location_key = the category storage) and sets the cache from that sum.
--   4. run_inventory_migration_phase2 adjusts that storage's balance, then
--      sets the cache from SUM(balances). Usage does not create a missing row.
--
-- Version contract (existing bigint argument, signature unchanged):
--   null or 0 means "expect no row". The new row is quantity 0, version 1.
--   The movement then locks version 1 and leaves version 2.
--   >= 1 is the existing optimistic lock. A missing row is still
--   stock_location_balance_not_found.
--
-- request_id:
--   record_location_* has no request_id parameter. Do not add one.
--   receive_stock_order keeps its request_id and its drift guard.
--   Import keeps apply_idempotency_key. Migration stage idempotency is unchanged.
--
-- Prerequisites (already applied in production; this file does not re-run them):
--   1. supabase/stock_item_location_balances_schema.sql
--   2. supabase/stock_location_balance_mutation_rpcs.sql
--   3. supabase/stock_transfer_rpc.sql (ensure_stock_item_location_balance)
--   4. supabase/inventory_import_apply_rpc.sql
--   5. supabase/inventory_migration_auto_create_rpc.sql
--   6. supabase/inventory_migration_phase2_rpc.sql
--   7. public.can_manage_workspace_stock(uuid)
--
-- How to verify:
--   After this file commits, run supabase/stock_location_quantity_step2_verify.sql.
--   That script is BEGIN … ROLLBACK and must not leave rows behind.
--
-- Rollback:
--   Run supabase/stock_location_quantity_step2_rollback.sql.
--   It restores the previous function bodies verbatim and drops
--   prepare_absent_location_balance.
--
-- Does NOT:
--   - Grant ensure_stock_item_location_balance or prepare_absent_location_balance
--     to authenticated
--   - Change record_location_usage
--   - Change mutate_stock_item_location_balance_core
--   - Change receive_stock_order
--   - Delete the legacy client quantity path
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Internal: create the missing shelf only when cache = SUM(balances).
-- Not granted to authenticated / anon / public.
-- Version contract for the three public RPCs below (signature unchanged):
--   null or 0  => expect no balance row. A new row is quantity 0 / version 1,
--                 then the movement runs against version 1 and leaves version 2.
--   >= 1       => existing optimistic lock. A missing row stays
--                 stock_location_balance_not_found (no auto-create).
-- Usage never calls this helper. A negative or zero adjustment never calls it.
-- These RPCs have no request_id. Version 0 is single-use: a second call sees
-- the row and raises stock_location_balance_version_mismatch.
-- receive_stock_order keeps its own request_id and its own drift guard.
-- -----------------------------------------------------------------------------
create or replace function public.prepare_absent_location_balance(
  p_workspace_id uuid,
  p_stock_item_id uuid,
  p_workspace_storage_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_storage public.workspace_storages%rowtype;
  v_balance public.stock_item_location_balances%rowtype;
  v_cache numeric(12, 3);
  v_sum numeric(12, 3);
begin
  if v_auth_user_id is null then
    raise exception 'stock_location_balance_unauthenticated';
  end if;

  if p_workspace_id is null or p_stock_item_id is null or p_workspace_storage_id is null then
    raise exception 'stock_location_balance_storage_required';
  end if;

  if not public.is_workspace_member(p_workspace_id)
     or not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'stock_location_balance_forbidden';
  end if;

  select si.current_quantity
  into v_cache
  from public.stock_items si
  where si.id = p_stock_item_id
    and si.workspace_id = p_workspace_id
  for update;

  if not found then
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

  select coalesce(sum(b.quantity), 0)::numeric(12, 3)
  into v_sum
  from public.stock_item_location_balances b
  where b.workspace_id = p_workspace_id
    and b.stock_item_id = p_stock_item_id;

  if v_cache is distinct from v_sum then
    raise exception 'stock_location_balance_reconciliation_required'
      using hint = format('current_quantity=%s sum_balances=%s', v_cache, v_sum);
  end if;

  select *
  into v_balance
  from public.stock_item_location_balances b
  where b.workspace_id = p_workspace_id
    and b.stock_item_id = p_stock_item_id
    and b.workspace_storage_id = p_workspace_storage_id
  for update;

  if found then
    raise exception 'stock_location_balance_version_mismatch'
      using hint = format('expected=0 actual=%s', v_balance.quantity_version);
  end if;

  v_balance := public.ensure_stock_item_location_balance(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    v_storage.location_key,
    v_auth_user_id
  );

  if v_balance.quantity is distinct from 0 or v_balance.quantity_version is distinct from 1 then
    raise exception 'stock_location_balance_version_mismatch'
      using hint = format('expected=0 actual=%s', v_balance.quantity_version);
  end if;

  return v_balance.quantity_version;
end;
$$;

comment on function public.prepare_absent_location_balance(uuid, uuid, uuid) is
  'Internal. Creates a 0/version-1 location balance only when stock_items.current_quantity equals SUM(balances). Returns 1 so the caller can run the existing mutation core. Not granted to clients.';

revoke all on function public.prepare_absent_location_balance(uuid, uuid, uuid) from public;
revoke all on function public.prepare_absent_location_balance(uuid, uuid, uuid) from anon;
revoke all on function public.prepare_absent_location_balance(uuid, uuid, uuid) from authenticated;

-- Restate the existing ensure revoke. This file does not grant it.
revoke all on function public.ensure_stock_item_location_balance(uuid, uuid, uuid, text, uuid) from public;
revoke all on function public.ensure_stock_item_location_balance(uuid, uuid, uuid, text, uuid) from anon;
revoke all on function public.ensure_stock_item_location_balance(uuid, uuid, uuid, text, uuid) from authenticated;

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
declare
  v_version bigint := p_expected_quantity_version;
begin
  if p_expected_quantity_version is null or p_expected_quantity_version = 0 then
    v_version := public.prepare_absent_location_balance(
      p_workspace_id,
      p_stock_item_id,
      p_workspace_storage_id
    );
  end if;

  return public.mutate_stock_item_location_balance_core(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    'receive',
    p_quantity,
    v_version,
    p_note,
    p_origin_workflow,
    p_origin_ref_id
  );
end;
$$;

comment on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) is
  'P8.29.5 SECURITY DEFINER receive into one location balance. Optimistic lock via expected_quantity_version. Null or 0 expects no row and creates it only when the cache already equals SUM(balances). Refreshes current_quantity cache in same transaction.';

revoke all on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from anon;
grant execute on function public.record_location_receive(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) to authenticated;

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
declare
  v_version bigint := p_expected_quantity_version;
begin
  -- Positive only. Zero and negative adjustments never auto-create a row.
  if (p_expected_quantity_version is null or p_expected_quantity_version = 0)
     and p_quantity is not null
     and p_quantity > 0 then
    v_version := public.prepare_absent_location_balance(
      p_workspace_id,
      p_stock_item_id,
      p_workspace_storage_id
    );
  end if;

  return public.mutate_stock_item_location_balance_core(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    'adjustment',
    p_quantity,
    v_version,
    p_note,
    p_origin_workflow,
    p_origin_ref_id
  );
end;
$$;

comment on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) is
  'P8.29.5 SECURITY DEFINER signed adjustment at one location. A positive adjustment with expected version null or 0 creates the missing row only when the cache already equals SUM(balances). Negative adjustments never auto-create. Rejects a negative resulting balance.';

revoke all on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from anon;
grant execute on function public.record_location_adjustment(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) to authenticated;

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
declare
  v_version bigint := p_expected_quantity_version;
begin
  if p_expected_quantity_version is null or p_expected_quantity_version = 0 then
    v_version := public.prepare_absent_location_balance(
      p_workspace_id,
      p_stock_item_id,
      p_workspace_storage_id
    );
  end if;

  return public.mutate_stock_item_location_balance_core(
    p_workspace_id,
    p_stock_item_id,
    p_workspace_storage_id,
    'stock_count',
    p_quantity,
    v_version,
    p_note,
    p_origin_workflow,
    p_origin_ref_id
  );
end;
$$;

comment on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) is
  'P8.29.5 SECURITY DEFINER absolute stock_count set at one location. Null or 0 expects no row and creates it only when the cache already equals SUM(balances). Optimistic lock + cache refresh in same transaction.';

revoke all on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from public;
revoke all on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) from anon;
grant execute on function public.record_location_stock_count(
  uuid, uuid, uuid, numeric, bigint, text, text, uuid
) to authenticated;

drop function if exists public.apply_inventory_import_session(uuid, uuid, text);

create or replace function public.apply_inventory_import_session(
  p_workspace_id uuid,
  p_session_id uuid,
  p_apply_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_session public.inventory_import_sessions%rowtype;
  v_prior public.inventory_import_sessions%rowtype;
  v_row public.inventory_import_rows%rowtype;
  v_item public.stock_items%rowtype;
  v_confirmations jsonb := '{}'::jsonb;
  v_quantity_policy text := null;
  v_idempotency_key text := null;
  v_has_supplier_id_column boolean := false;
  v_name text;
  v_category text;
  v_unit text;
  v_storage text;
  v_supplier text;
  v_supplier_id uuid;
  v_item_type text;
  v_active boolean;
  v_minimum numeric(12, 3);
  v_target numeric(12, 3);
  v_qty numeric(12, 3);
  v_qty_raw text;
  v_new_item_id uuid;
  v_movement_id uuid;
  v_created_ids uuid[] := array[]::uuid[];
  v_linked_ids uuid[] := array[]::uuid[];
  v_skipped_count integer := 0;
  v_created_count integer := 0;
  v_linked_count integer := 0;
  v_movement_count integer := 0;
  v_eligible_count integer := 0;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_result jsonb;
  v_row_result jsonb;
  -- Multi-location
  v_location_quantities jsonb;
  v_loc_entry jsonb;
  v_loc_dest_storage_id text;
  v_loc_dest_location_key text;
  v_loc_parsed_qty numeric(12, 3);
  v_loc_validation_state text;
  v_workspace_storage_id uuid;
  v_existing_balance_id uuid;
  v_loc_movement_ids uuid[] := array[]::uuid[];
  v_loc_movement_count integer := 0;
  v_aggregate_sum numeric(12, 3);
  v_row_count integer := 0;
  v_affected_item_id uuid;
  v_has_location_quantities boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_import_session_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_import_session_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_session_id is null then
    raise exception 'inventory_import_session_required'
      using hint = 'session_id is required.';
  end if;

  v_idempotency_key := nullif(btrim(coalesce(p_apply_idempotency_key, '')), '');
  if v_idempotency_key is null then
    raise exception 'inventory_import_apply_idempotency_key_required'
      using hint = 'apply_idempotency_key is required.';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_import_session_workspace_not_found'
      using hint = 'Workspace does not exist.';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_import_session_forbidden'
      using hint = 'owner / general_manager / manager required.';
  end if;

  -- Idempotent replay: completed session with same key returns prior evidence.
  select s.*
  into v_prior
  from public.inventory_import_sessions s
  where s.workspace_id = p_workspace_id
    and s.apply_idempotency_key = v_idempotency_key
    and s.status = 'completed'
  order by s.apply_completed_at desc nulls last
  limit 1
  for update;

  if found then
    return coalesce(v_prior.apply_result, '{}'::jsonb)
      || jsonb_build_object(
        'session_id', v_prior.id,
        'workspace_id', v_prior.workspace_id,
        'status', v_prior.status,
        'idempotency_key', v_prior.apply_idempotency_key,
        'idempotency_result', 'replayed',
        'apply_completed_at', v_prior.apply_completed_at,
        'completed_at', v_prior.completed_at
      );
  end if;

  select s.*
  into v_session
  from public.inventory_import_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    if exists (
      select 1
      from public.inventory_import_sessions s
      where s.id = p_session_id
    ) then
      raise exception 'inventory_import_session_workspace_mismatch'
        using hint = 'Session does not belong to this workspace.';
    end if;
    raise exception 'inventory_import_session_not_found'
      using hint = 'Import session was not found in this workspace.';
  end if;

  if v_session.status in ('draft', 'review', 'cancelled') then
    raise exception 'inventory_import_apply_not_ready'
      using hint = format('Session status %s cannot be applied.', v_session.status);
  end if;

  if v_session.status = 'completed' then
    raise exception 'inventory_import_apply_already_completed'
      using hint = 'Session is already completed.';
  end if;

  if v_session.status = 'applying' then
    raise exception 'inventory_import_apply_in_progress'
      using hint = 'Session apply is already in progress.';
  end if;

  if v_session.status is distinct from 'ready' then
    raise exception 'inventory_import_apply_not_ready'
      using hint = format('Session status %s cannot be applied.', v_session.status);
  end if;

  v_confirmations := coalesce(v_session.confirmations, '{}'::jsonb);
  v_quantity_policy := nullif(btrim(coalesce(v_confirmations->>'quantityPolicy', '')), '');
  if v_quantity_policy is null
    or v_quantity_policy not in ('no_change', 'opening_stock')
  then
    raise exception 'inventory_import_apply_quantity_policy_unset'
      using hint = 'quantityPolicy must be no_change or opening_stock.';
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'stock_items'
      and c.column_name = 'supplier_id'
      and c.udt_name = 'uuid'
  )
  into v_has_supplier_id_column;

  v_started_at := now();

  update public.inventory_import_sessions s
  set
    status = 'applying',
    apply_started_at = v_started_at,
    apply_started_by = v_auth_user_id,
    apply_idempotency_key = v_idempotency_key,
    updated_by = v_auth_user_id,
    updated_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning * into v_session;

  for v_row in
    select r.*
    from public.inventory_import_rows r
    where r.session_id = p_session_id
      and r.workspace_id = p_workspace_id
    order by r.source_row_number asc
    for update
  loop
    v_eligible_count := v_eligible_count + 1;

    if v_row.selected_action = 'update' or v_row.proposed_action = 'update' then
      raise exception 'inventory_import_apply_update_action_forbidden'
        using hint = format('Row %s update action is forbidden.', v_row.source_row_number);
    end if;

    if v_row.selected_action = 'skip' then
      update public.inventory_import_rows r
      set
        apply_state = 'skipped',
        apply_result = jsonb_build_object(
          'action', 'skip',
          'source_row_number', v_row.source_row_number
        ),
        apply_error_code = '',
        apply_error_message = '',
        applied_at = now(),
        updated_at = now()
      where r.id = v_row.id;

      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    if v_row.selected_action = 'create' then
      v_qty := null;
      v_movement_id := null;
      v_name := nullif(btrim(coalesce(v_row.normalized_payload->>'name', '')), '');
      v_category := coalesce(
        nullif(btrim(coalesce(v_row.normalized_payload->>'category', '')), ''),
        'Other'
      );
      v_unit := nullif(btrim(coalesce(v_row.normalized_payload->>'unit', '')), '');
      v_storage := nullif(btrim(coalesce(
        v_row.normalized_payload->>'locationKey',
        v_row.normalized_payload->>'storageLocation',
        ''
      )), '');
      v_supplier := coalesce(btrim(coalesce(v_row.normalized_payload->>'supplier', '')), '');
      v_item_type := coalesce(
        nullif(btrim(coalesce(v_row.normalized_payload->>'itemType', '')), ''),
        'Other'
      );
      v_active := coalesce((v_row.normalized_payload->>'active')::boolean, true);
      v_minimum := coalesce((v_row.normalized_payload->>'minimumQuantity')::numeric, 0);
      if (v_row.normalized_payload ? 'targetQuantity')
        and nullif(btrim(coalesce(v_row.normalized_payload->>'targetQuantity', '')), '') is not null
        and btrim(v_row.normalized_payload->>'targetQuantity') <> 'null'
      then
        v_target := (v_row.normalized_payload->>'targetQuantity')::numeric;
      else
        v_target := null;
      end if;

      if v_name is null then
        raise exception 'inventory_import_apply_missing_create_name'
          using hint = format('Row %s create requires name.', v_row.source_row_number);
      end if;
      if v_unit is null then
        raise exception 'inventory_import_apply_missing_create_unit'
          using hint = format('Row %s create requires unit.', v_row.source_row_number);
      end if;
      if v_storage is null or char_length(v_storage) > 80 then
        raise exception 'inventory_import_apply_missing_create_storage'
          using hint = format('Row %s create requires storage.', v_row.source_row_number);
      end if;
      if v_minimum < 0 then
        raise exception 'inventory_import_apply_invalid_minimum_quantity'
          using hint = format('Row %s minimumQuantity must be >= 0.', v_row.source_row_number);
      end if;
      if v_target is not null and v_target < 0 then
        raise exception 'inventory_import_apply_invalid_target_quantity'
          using hint = format('Row %s targetQuantity must be >= 0.', v_row.source_row_number);
      end if;

      v_supplier_id := null;
      if v_has_supplier_id_column
        and nullif(btrim(coalesce(v_row.normalized_payload->>'supplierId', '')), '') is not null
      then
        begin
          v_supplier_id := (v_row.normalized_payload->>'supplierId')::uuid;
        exception
          when others then
            raise exception 'inventory_import_apply_supplier_id_invalid'
              using hint = format('Row %s supplierId is not a uuid.', v_row.source_row_number);
        end;
      end if;

      -- Create always starts at quantity 0; opening stock uses balance inserts + stock_count movements afterward.
      if v_has_supplier_id_column then
        insert into public.stock_items (
          workspace_id,
          name,
          category,
          item_type,
          supplier,
          supplier_id,
          unit,
          current_quantity,
          minimum_quantity,
          target_quantity,
          cost_price,
          storage_location,
          active
        )
        values (
          p_workspace_id,
          v_name,
          v_category,
          v_item_type,
          v_supplier,
          v_supplier_id,
          v_unit,
          0,
          v_minimum,
          v_target,
          0,
          v_storage,
          v_active
        )
        returning id into v_new_item_id;
      else
        insert into public.stock_items (
          workspace_id,
          name,
          category,
          item_type,
          supplier,
          unit,
          current_quantity,
          minimum_quantity,
          target_quantity,
          cost_price,
          storage_location,
          active
        )
        values (
          p_workspace_id,
          v_name,
          v_category,
          v_item_type,
          v_supplier,
          v_unit,
          0,
          v_minimum,
          v_target,
          0,
          v_storage,
          v_active
        )
        returning id into v_new_item_id;
      end if;

      v_affected_item_id := v_new_item_id;
      v_loc_movement_ids := array[]::uuid[];
      v_loc_movement_count := 0;

      if v_quantity_policy = 'opening_stock' then
        -- P8.29.9: prefer locationQuantities[] for multi-location; fallback legacy resolvedQuantity.
        v_location_quantities := v_row.normalized_payload->'locationQuantities';
        v_has_location_quantities := jsonb_typeof(v_location_quantities) = 'array'
          and jsonb_array_length(v_location_quantities) > 0;

        if v_has_location_quantities then
          -- Multi-location: one balance + one stock_count per VALID location entry.
          for v_loc_entry in
            select value
            from jsonb_array_elements(v_location_quantities) as t(value)
          loop
            v_loc_validation_state := nullif(btrim(coalesce(v_loc_entry->>'validationState', '')), '');
            if v_loc_validation_state is distinct from 'valid' then
              continue; -- skip warning/blocker entries
            end if;

            v_loc_dest_storage_id := nullif(btrim(coalesce(v_loc_entry->>'destinationStorageId', '')), '');
            v_loc_dest_location_key := nullif(btrim(coalesce(v_loc_entry->>'destinationLocationKey', '')), '');
            v_loc_parsed_qty := (v_loc_entry->>'parsedQuantity')::numeric;

            if v_loc_dest_storage_id is null then
              raise exception 'inventory_import_apply_location_storage_id_missing'
                using hint = format('Row %s locationQuantity missing destinationStorageId.', v_row.source_row_number);
            end if;

            if v_loc_dest_location_key is null or char_length(v_loc_dest_location_key) > 80 then
              raise exception 'inventory_import_apply_location_key_invalid'
                using hint = format('Row %s locationQuantity destinationLocationKey invalid.', v_row.source_row_number);
            end if;

            if v_loc_parsed_qty is null or v_loc_parsed_qty < 0 then
              raise exception 'inventory_import_apply_location_quantity_invalid'
                using hint = format('Row %s locationQuantity parsedQuantity must be >= 0.', v_row.source_row_number);
            end if;

            -- Verify storage exists and belongs to workspace.
            v_workspace_storage_id := v_loc_dest_storage_id::uuid;
            if not exists (
              select 1
              from public.workspace_storages ws
              where ws.id = v_workspace_storage_id
                and ws.workspace_id = p_workspace_id
            ) then
              raise exception 'inventory_import_apply_location_storage_not_found'
                using hint = format('Row %s destinationStorageId not found in workspace.', v_row.source_row_number);
            end if;

            -- Upsert balance: idempotent ON CONFLICT DO NOTHING.
            insert into public.stock_item_location_balances (
              workspace_id,
              stock_item_id,
              workspace_storage_id,
              location_key,
              quantity,
              quantity_version,
              updated_by
            )
            values (
              p_workspace_id,
              v_affected_item_id,
              v_workspace_storage_id,
              v_loc_dest_location_key,
              v_loc_parsed_qty,
              1,
              v_auth_user_id
            )
            on conflict (workspace_id, stock_item_id, workspace_storage_id) do nothing;

            v_movement_id := null;
            insert into public.stock_movements (
              workspace_id,
              item_id,
              type,
              quantity,
              note,
              created_by,
              destination_workspace_storage_id,
              destination_location_key,
              origin_workflow,
              origin_ref_id
            )
            values (
              p_workspace_id,
              v_affected_item_id,
              'stock_count',
              v_loc_parsed_qty,
              format(
                'INVENTORY_IMPORT|session=%s|row=%s|action=create|location=%s',
                p_session_id,
                v_row.source_row_number,
                v_loc_dest_location_key
              ),
              v_auth_user_id,
              v_workspace_storage_id,
              v_loc_dest_location_key,
              'spreadsheet_import',
              p_session_id
            )
            returning id into v_movement_id;

            v_loc_movement_ids := array_append(v_loc_movement_ids, v_movement_id);
            v_loc_movement_count := v_loc_movement_count + 1;
          end loop;

          -- Refresh aggregate cache after all location balances written.
          select coalesce(sum(b.quantity), 0)::numeric(12, 3)
          into v_aggregate_sum
          from public.stock_item_location_balances b
          where b.workspace_id = p_workspace_id
            and b.stock_item_id = v_affected_item_id;

          update public.stock_items si
          set current_quantity = v_aggregate_sum
          where si.id = v_affected_item_id
            and si.workspace_id = p_workspace_id;

          get diagnostics v_row_count = row_count;
          if v_row_count <> 1 then
            raise exception 'inventory_import_apply_quantity_update_failed'
              using hint = format('Row %s aggregate cache refresh failed.', v_row.source_row_number);
          end if;

          v_movement_count := v_movement_count + v_loc_movement_count;

        else
          -- Legacy single-location fallback: resolvedQuantity + locationKey.
          v_qty_raw := nullif(btrim(coalesce(v_row.normalized_payload->>'resolvedQuantity', '')), '');
          if v_qty_raw is null then
            raise exception 'inventory_import_apply_missing_opening_quantity'
              using hint = format('Row %s opening_stock requires resolvedQuantity or locationQuantities.', v_row.source_row_number);
          end if;
          begin
            v_qty := v_qty_raw::numeric;
          exception
            when others then
              raise exception 'inventory_import_apply_invalid_opening_quantity'
                using hint = format('Row %s resolvedQuantity is not numeric.', v_row.source_row_number);
          end;
          if v_qty is null or v_qty < 0 then
            raise exception 'inventory_import_apply_invalid_opening_quantity'
              using hint = format('Row %s resolvedQuantity must be >= 0.', v_row.source_row_number);
          end if;

          -- Legacy single quantity: balance at locationKey, then cache = SUM(balances).
          select ws.id
          into v_workspace_storage_id
          from public.workspace_storages ws
          where ws.workspace_id = p_workspace_id
            and ws.location_key = v_storage
            and ws.active
          limit 1;

          if v_workspace_storage_id is null then
            raise exception 'inventory_import_apply_location_storage_not_found'
              using hint = format(
                'Row %s locationKey %s is not an active workspace storage.',
                v_row.source_row_number,
                coalesce(v_storage, '')
              );
          end if;

          insert into public.stock_item_location_balances (
            workspace_id,
            stock_item_id,
            workspace_storage_id,
            location_key,
            quantity,
            quantity_version,
            updated_by
          )
          values (
            p_workspace_id,
            v_affected_item_id,
            v_workspace_storage_id,
            v_storage,
            v_qty,
            1,
            v_auth_user_id
          )
          on conflict (workspace_id, stock_item_id, workspace_storage_id)
          do update set
            quantity = excluded.quantity,
            quantity_version = public.stock_item_location_balances.quantity_version + 1,
            updated_by = excluded.updated_by;

          v_movement_id := null;
          insert into public.stock_movements (
            workspace_id,
            item_id,
            type,
            quantity,
            note,
            created_by,
            destination_workspace_storage_id,
            destination_location_key,
            origin_workflow,
            origin_ref_id
          )
          values (
            p_workspace_id,
            v_affected_item_id,
            'stock_count',
            v_qty,
            format(
              'INVENTORY_IMPORT|session=%s|row=%s|action=create|location=%s',
              p_session_id,
              v_row.source_row_number,
              v_storage
            ),
            v_auth_user_id,
            v_workspace_storage_id,
            v_storage,
            'spreadsheet_import',
            p_session_id
          )
          returning id into v_movement_id;

          select coalesce(sum(b.quantity), 0)::numeric(12, 3)
          into v_aggregate_sum
          from public.stock_item_location_balances b
          where b.workspace_id = p_workspace_id
            and b.stock_item_id = v_affected_item_id;

          update public.stock_items si
          set current_quantity = v_aggregate_sum
          where si.id = v_affected_item_id
            and si.workspace_id = p_workspace_id;

          get diagnostics v_row_count = row_count;
          if v_row_count <> 1 then
            raise exception 'inventory_import_apply_quantity_update_failed'
              using hint = format('Row %s aggregate cache refresh failed.', v_row.source_row_number);
          end if;

          v_movement_count := v_movement_count + 1;
        end if; -- has_location_quantities
      end if; -- opening_stock policy

      v_row_result := jsonb_build_object(
        'action', 'create',
        'source_row_number', v_row.source_row_number,
        'stock_item_id', v_new_item_id,
        'movement_id', case when v_loc_movement_count > 0 then null else v_movement_id end,
        'location_movement_ids', to_jsonb(v_loc_movement_ids),
        'location_count', v_loc_movement_count,
        'opening_quantity', case when v_quantity_policy = 'opening_stock' then coalesce(v_aggregate_sum, v_qty) else null end
      );

      update public.inventory_import_rows r
      set
        apply_state = 'applied',
        applied_stock_item_id = v_new_item_id,
        apply_result = v_row_result,
        apply_error_code = '',
        apply_error_message = '',
        applied_at = now(),
        updated_at = now()
      where r.id = v_row.id;

      v_created_count := v_created_count + 1;
      v_created_ids := array_append(v_created_ids, v_new_item_id);
      continue;
    end if;

    if v_row.selected_action = 'link' then
      v_qty := null;
      v_movement_id := null;
      if v_row.matched_stock_item_id is null then
        raise exception 'inventory_import_apply_missing_link_target'
          using hint = format('Row %s link requires matched_stock_item_id.', v_row.source_row_number);
      end if;

      select si.*
      into v_item
      from public.stock_items si
      where si.id = v_row.matched_stock_item_id
        and si.workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception 'inventory_import_apply_matched_item_missing'
          using hint = format('Row %s matched stock item was not found.', v_row.source_row_number);
      end if;

      -- LINK never mutates metadata (name/category/unit/supplier/storage/cost/target/minimum).
      v_affected_item_id := v_item.id;
      v_loc_movement_ids := array[]::uuid[];
      v_loc_movement_count := 0;
      v_aggregate_sum := null;

      if v_quantity_policy = 'opening_stock' then
        v_location_quantities := v_row.normalized_payload->'locationQuantities';
        v_has_location_quantities := jsonb_typeof(v_location_quantities) = 'array'
          and jsonb_array_length(v_location_quantities) > 0;

        if v_has_location_quantities then
          for v_loc_entry in
            select value
            from jsonb_array_elements(v_location_quantities) as t(value)
          loop
            v_loc_validation_state := nullif(btrim(coalesce(v_loc_entry->>'validationState', '')), '');
            if v_loc_validation_state is distinct from 'valid' then
              continue;
            end if;

            v_loc_dest_storage_id := nullif(btrim(coalesce(v_loc_entry->>'destinationStorageId', '')), '');
            v_loc_dest_location_key := nullif(btrim(coalesce(v_loc_entry->>'destinationLocationKey', '')), '');
            v_loc_parsed_qty := (v_loc_entry->>'parsedQuantity')::numeric;

            if v_loc_dest_storage_id is null then
              raise exception 'inventory_import_apply_location_storage_id_missing'
                using hint = format('Row %s locationQuantity missing destinationStorageId.', v_row.source_row_number);
            end if;

            if v_loc_dest_location_key is null or char_length(v_loc_dest_location_key) > 80 then
              raise exception 'inventory_import_apply_location_key_invalid'
                using hint = format('Row %s locationQuantity destinationLocationKey invalid.', v_row.source_row_number);
            end if;

            if v_loc_parsed_qty is null or v_loc_parsed_qty < 0 then
              raise exception 'inventory_import_apply_location_quantity_invalid'
                using hint = format('Row %s locationQuantity parsedQuantity must be >= 0.', v_row.source_row_number);
            end if;

            v_workspace_storage_id := v_loc_dest_storage_id::uuid;
            if not exists (
              select 1
              from public.workspace_storages ws
              where ws.id = v_workspace_storage_id
                and ws.workspace_id = p_workspace_id
            ) then
              raise exception 'inventory_import_apply_location_storage_not_found'
                using hint = format('Row %s destinationStorageId not found in workspace.', v_row.source_row_number);
            end if;

            insert into public.stock_item_location_balances (
              workspace_id,
              stock_item_id,
              workspace_storage_id,
              location_key,
              quantity,
              quantity_version,
              updated_by
            )
            values (
              p_workspace_id,
              v_affected_item_id,
              v_workspace_storage_id,
              v_loc_dest_location_key,
              v_loc_parsed_qty,
              1,
              v_auth_user_id
            )
            on conflict (workspace_id, stock_item_id, workspace_storage_id) do nothing;

            v_movement_id := null;
            insert into public.stock_movements (
              workspace_id,
              item_id,
              type,
              quantity,
              note,
              created_by,
              destination_workspace_storage_id,
              destination_location_key,
              origin_workflow,
              origin_ref_id
            )
            values (
              p_workspace_id,
              v_affected_item_id,
              'stock_count',
              v_loc_parsed_qty,
              format(
                'INVENTORY_IMPORT|session=%s|row=%s|action=link|location=%s',
                p_session_id,
                v_row.source_row_number,
                v_loc_dest_location_key
              ),
              v_auth_user_id,
              v_workspace_storage_id,
              v_loc_dest_location_key,
              'spreadsheet_import',
              p_session_id
            )
            returning id into v_movement_id;

            v_loc_movement_ids := array_append(v_loc_movement_ids, v_movement_id);
            v_loc_movement_count := v_loc_movement_count + 1;
          end loop;

          select coalesce(sum(b.quantity), 0)::numeric(12, 3)
          into v_aggregate_sum
          from public.stock_item_location_balances b
          where b.workspace_id = p_workspace_id
            and b.stock_item_id = v_affected_item_id;

          update public.stock_items si
          set current_quantity = v_aggregate_sum
          where si.id = v_affected_item_id
            and si.workspace_id = p_workspace_id;

          get diagnostics v_row_count = row_count;
          if v_row_count <> 1 then
            raise exception 'inventory_import_apply_quantity_update_failed'
              using hint = format('Row %s aggregate cache refresh failed.', v_row.source_row_number);
          end if;

          v_movement_count := v_movement_count + v_loc_movement_count;

        else
          -- Legacy fallback for link.
          v_qty_raw := nullif(btrim(coalesce(v_row.normalized_payload->>'resolvedQuantity', '')), '');
          if v_qty_raw is null then
            raise exception 'inventory_import_apply_missing_opening_quantity'
              using hint = format('Row %s opening_stock requires resolvedQuantity.', v_row.source_row_number);
          end if;
          begin
            v_qty := v_qty_raw::numeric;
          exception
            when others then
              raise exception 'inventory_import_apply_invalid_opening_quantity'
                using hint = format('Row %s resolvedQuantity is not numeric.', v_row.source_row_number);
          end;
          if v_qty is null or v_qty < 0 then
            raise exception 'inventory_import_apply_invalid_opening_quantity'
              using hint = format('Row %s resolvedQuantity must be >= 0.', v_row.source_row_number);
          end if;

          v_storage := nullif(btrim(coalesce(
            v_row.normalized_payload->>'locationKey',
            v_row.normalized_payload->>'storageLocation',
            v_item.storage_location,
            ''
          )), '');
          if v_storage is null or char_length(v_storage) > 80 then
            raise exception 'inventory_import_apply_location_key_invalid'
              using hint = format('Row %s legacy opening stock needs a locationKey.', v_row.source_row_number);
          end if;

          select ws.id
          into v_workspace_storage_id
          from public.workspace_storages ws
          where ws.workspace_id = p_workspace_id
            and ws.location_key = v_storage
            and ws.active
          limit 1;

          if v_workspace_storage_id is null then
            raise exception 'inventory_import_apply_location_storage_not_found'
              using hint = format(
                'Row %s locationKey %s is not an active workspace storage.',
                v_row.source_row_number,
                v_storage
              );
          end if;

          insert into public.stock_item_location_balances (
            workspace_id,
            stock_item_id,
            workspace_storage_id,
            location_key,
            quantity,
            quantity_version,
            updated_by
          )
          values (
            p_workspace_id,
            v_affected_item_id,
            v_workspace_storage_id,
            v_storage,
            v_qty,
            1,
            v_auth_user_id
          )
          on conflict (workspace_id, stock_item_id, workspace_storage_id)
          do update set
            quantity = excluded.quantity,
            quantity_version = public.stock_item_location_balances.quantity_version + 1,
            updated_by = excluded.updated_by;

          v_movement_id := null;
          insert into public.stock_movements (
            workspace_id,
            item_id,
            type,
            quantity,
            note,
            created_by,
            destination_workspace_storage_id,
            destination_location_key,
            origin_workflow,
            origin_ref_id
          )
          values (
            p_workspace_id,
            v_affected_item_id,
            'stock_count',
            v_qty,
            format(
              'INVENTORY_IMPORT|session=%s|row=%s|action=link|location=%s',
              p_session_id,
              v_row.source_row_number,
              v_storage
            ),
            v_auth_user_id,
            v_workspace_storage_id,
            v_storage,
            'spreadsheet_import',
            p_session_id
          )
          returning id into v_movement_id;

          select coalesce(sum(b.quantity), 0)::numeric(12, 3)
          into v_aggregate_sum
          from public.stock_item_location_balances b
          where b.workspace_id = p_workspace_id
            and b.stock_item_id = v_affected_item_id;

          update public.stock_items si
          set current_quantity = v_aggregate_sum
          where si.id = v_affected_item_id
            and si.workspace_id = p_workspace_id;

          get diagnostics v_row_count = row_count;
          if v_row_count <> 1 then
            raise exception 'inventory_import_apply_quantity_update_failed'
              using hint = format('Row %s aggregate cache refresh failed.', v_row.source_row_number);
          end if;

          v_movement_count := v_movement_count + 1;
        end if; -- has_location_quantities
      end if; -- opening_stock policy

      v_row_result := jsonb_build_object(
        'action', 'link',
        'source_row_number', v_row.source_row_number,
        'stock_item_id', v_item.id,
        'movement_id', case when v_loc_movement_count > 0 then null else v_movement_id end,
        'location_movement_ids', to_jsonb(v_loc_movement_ids),
        'location_count', v_loc_movement_count,
        'opening_quantity', case when v_quantity_policy = 'opening_stock' then coalesce(v_aggregate_sum, v_qty) else null end
      );

      update public.inventory_import_rows r
      set
        apply_state = 'applied',
        applied_stock_item_id = v_item.id,
        apply_result = v_row_result,
        apply_error_code = '',
        apply_error_message = '',
        applied_at = now(),
        updated_at = now()
      where r.id = v_row.id;

      v_linked_count := v_linked_count + 1;
      v_linked_ids := array_append(v_linked_ids, v_item.id);
      continue;
    end if;

    raise exception 'inventory_import_apply_unsupported_action'
      using hint = format(
        'Row %s selected_action %s is unsupported.',
        v_row.source_row_number,
        coalesce(v_row.selected_action, '<null>')
      );
  end loop;

  v_completed_at := now();
  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'status', 'completed',
    'idempotency_key', v_idempotency_key,
    'idempotency_result', 'performed',
    'quantity_policy', v_quantity_policy,
    'eligible_row_count', v_eligible_count,
    'created_count', v_created_count,
    'linked_count', v_linked_count,
    'updated_count', 0,
    'skipped_count', v_skipped_count,
    'failed_count', 0,
    'movement_count', v_movement_count,
    'created_stock_item_ids', to_jsonb(v_created_ids),
    'linked_stock_item_ids', to_jsonb(v_linked_ids),
    'updated_stock_item_ids', '[]'::jsonb,
    'row_failures', '[]'::jsonb,
    'started_at', v_started_at,
    'completed_at', v_completed_at,
    'operator_user_id', v_auth_user_id
  );

  update public.inventory_import_sessions s
  set
    status = 'completed',
    apply_completed_at = v_completed_at,
    completed_at = v_completed_at,
    apply_result = v_result,
    applied_rows = v_created_count + v_linked_count + v_skipped_count,
    failed_rows = 0,
    updated_by = v_auth_user_id,
    updated_at = now()
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  returning * into v_session;

  return v_result;
end;
$$;

comment on function public.apply_inventory_import_session(uuid, uuid, text) is
  'P8.27.3/P8.29.9 SECURITY DEFINER transactional Import Apply. ready→applying→completed. Create/link/skip. Opening stock: locationQuantities[] multi-location (balance upsert + stock_count per location, SUM aggregate refresh) or legacy resolvedQuantity written to the resolved storage balance with cache = SUM(balances). No location-blind stock_count. No UI.';

revoke all on function public.apply_inventory_import_session(uuid, uuid, text) from public;
revoke all on function public.apply_inventory_import_session(uuid, uuid, text) from anon;
grant execute on function public.apply_inventory_import_session(uuid, uuid, text) to authenticated;

drop function if exists public.run_inventory_migration_auto_create(uuid, uuid);

create or replace function public.run_inventory_migration_auto_create(
  p_workspace_id uuid,
  p_session_id uuid
)
returns table (
  session_id uuid,
  step_id uuid,
  step_name text,
  step_status text,
  result_id uuid,
  result_status text,
  critical_finding_count bigint,
  attention_finding_count bigint,
  total_findings bigint,
  executed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_session public.inventory_migration_sessions%rowtype;
  v_step public.inventory_migration_session_steps%rowtype;
  v_existing_result_id uuid := null;
  v_pred_incomplete boolean := false;
  v_other_running boolean := false;

  cand record;
  locked record;
  v_new_stock_id uuid;
  v_name text;
  v_category text;
  v_item_type text;
  v_unit text;
  v_supplier text;
  v_qty numeric;
  v_par numeric;
  v_cost numeric;
  v_location text;
  v_storage_id uuid;

  v_created bigint := 0;
  v_skipped bigint := 0;
  v_invalid_snapshot bigint := 0;
  v_invalid_name bigint := 0;
  v_already_has_stock_id bigint := 0;
  v_race_skipped bigint := 0;
  v_errors bigint := 0;
  v_eligible bigint := 0;
  v_already_created bigint := 0;

  v_result_status text;
  v_critical_count bigint := 0;
  v_attention_count bigint := 0;
  v_total_findings bigint := 0;
  v_result_summary jsonb;
  v_result_id uuid;
  v_executed_at timestamptz;
  v_activity_text text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_auto_create_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_auto_create_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_auto_create_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_auto_create_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_auto_create_forbidden';
  end if;

  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  -- Lock order 1: session (session-level mutex).
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_auto_create_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_auto_create_session_not_running';
  end if;

  -- Lock order 2: all session steps in canonical order.
  perform 1
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
  order by
    case st.step_name
      when 'foundation' then 1
      when 'persist' then 2
      when 'auto_link' then 3
      when 'auto_create' then 4
      when 'integrity_audit' then 5
      when 'preflight' then 6
      when 'preview' then 7
      when 'phase1' then 8
      when 'phase2' then 9
      when 'post_apply_audit' then 10
      else 11
    end
  for update;

  select st.*
  into v_step
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
    and st.step_name = 'auto_create';

  if not found then
    raise exception 'inventory_migration_auto_create_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_auto_create_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_auto_create_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_auto_create_invalid_step_state';
  end if;

  -- Prerequisites: foundation → auto_link completed.
  select exists (
    select 1
    from unnest(array['foundation', 'persist', 'auto_link']) as pred(step_name)
    where not exists (
      select 1
      from public.inventory_migration_session_steps st
      where st.session_id = p_session_id
        and st.workspace_id = p_workspace_id
        and st.step_name = pred.step_name
        and st.status = 'completed'
    )
  )
  into v_pred_incomplete;

  if v_pred_incomplete then
    raise exception 'inventory_migration_auto_create_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'auto_create'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_auto_create_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- P7.4.5a Auto Create (workspace-scoped; meanings preserved)
  -- ---------------------------------------------------------------------------

  select count(*)::bigint into v_already_created
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'created'
    and m.resolution_type in ('auto_create', 'manual_create');

  select count(*)::bigint into v_eligible
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type in ('auto_create', 'manual_create')
    and m.stock_item_id is null
    and m.source_snapshot is not null
    and m.source_snapshot <> '{}'::jsonb;

  for cand in
    select m.id as map_id
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
      and m.status = 'classified'
      and m.resolution_type in ('auto_create', 'manual_create')
      and m.stock_item_id is null
      and m.source_snapshot is not null
      and m.source_snapshot <> '{}'::jsonb
    order by m.legacy_inventory_item_id, m.id
  loop
    begin
      -- Lock map row; re-check eligibility under lock
      select
        m.id,
        m.workspace_id,
        m.stock_item_id,
        m.status,
        m.resolution_type,
        m.source_snapshot
      into locked
      from public.inventory_stock_item_map m
      where m.id = cand.map_id
      for update;

      if not found then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.status is distinct from 'classified'
         or locked.resolution_type not in ('auto_create', 'manual_create') then
        v_race_skipped := v_race_skipped + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.stock_item_id is not null then
        v_already_has_stock_id := v_already_has_stock_id + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.source_snapshot is null
         or locked.source_snapshot = '{}'::jsonb then
        v_invalid_snapshot := v_invalid_snapshot + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Payload ONLY from source_snapshot; workspace_id ONLY from map row
      v_name := nullif(trim(coalesce(locked.source_snapshot ->> 'item_name', '')), '');
      if v_name is null then
        v_invalid_name := v_invalid_name + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_category := case trim(coalesce(locked.source_snapshot ->> 'category', ''))
        when 'Wines' then 'Wine'
        when 'Wine' then 'Wine'
        when 'Beers' then 'Beverages'
        when 'Beer' then 'Beverages'
        when 'Soft Drinks' then 'Beverages'
        when 'Coffee' then 'Beverages'
        when 'Kitchen' then 'Other'
        when 'Bar Supplies' then 'Consumables'
        when 'Housekeeping' then 'Consumables'
        when 'Spirits' then 'Spirits'
        when 'Syrups & Purées' then 'Syrups & Purées'
        when 'Beverages' then 'Beverages'
        when 'Fresh' then 'Fresh'
        when 'Consumables' then 'Consumables'
        when 'Other' then 'Other'
        when '' then 'Other'
        else 'Other'
      end;

      v_item_type := case
        when trim(coalesce(locked.source_snapshot ->> 'subcategory', '')) = '' then 'Other'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in (
          'vodka', 'gin', 'rum', 'whiskey', 'tequila', 'other'
        ) then initcap(lower(trim(locked.source_snapshot ->> 'subcategory')))
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'mezcal' then 'Tequila'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('liqueurs', 'liqueur', 'vermouth')
          then 'Vermouth & Liqueur'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'brandy' then 'Cognac'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('aperitifs', 'aperitif')
          then 'Aperitif'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'red wine' then 'Red Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'white wine' then 'White Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('rose wine', 'rosé wine')
          then 'Rosé Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('sparkling', 'sparkling wine')
          then 'Sparkling Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'champagne' then 'Champagne'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in (
          'lager', 'ipa', 'ale', 'stout', 'cider', 'alcohol free'
        ) then 'Beer'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('soda', 'tonic')
          then 'Soda / Tonic'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('cola', 'lemonade', 'orangeade')
          then 'Soft Drink'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('juices', 'juice') then 'Juice'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'energy drinks' then 'Energy Drink'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('napkins', 'straws', 'cleaning')
          then initcap(lower(trim(locked.source_snapshot ->> 'subcategory')))
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('purees', 'purées', 'purée')
          then 'Purée'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'syrups' then 'Syrup'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('fruits', 'fruit') then 'Fruit'
        else 'Other'
      end;

      v_unit := case trim(coalesce(locked.source_snapshot ->> 'unit', ''))
        when 'Bottle 0.7L' then 'Bottle 700ml'
        when 'Bottle 1L' then 'Bottle 1L'
        when 'Case 6' then 'Case 6 bottles'
        when 'Case 12' then 'Case 12 bottles'
        when 'Liter' then 'Litre'
        else trim(coalesce(locked.source_snapshot ->> 'unit', ''))
      end;

      -- Compatibility text only; no supplier_id / no suppliers write
      v_supplier := coalesce(locked.source_snapshot ->> 'supplier', '');
      v_qty := greatest(coalesce((locked.source_snapshot ->> 'quantity')::numeric, 0), 0);
      v_par := greatest(coalesce((locked.source_snapshot ->> 'minimum_quantity')::numeric, 0), 0);
      v_cost := greatest(coalesce((locked.source_snapshot ->> 'cost')::numeric, 0), 0);

      v_location := case v_category
        when 'Spirits' then 'Bar'
        when 'Syrups & Purées' then 'Bar'
        when 'Beverages' then 'Main Storage'
        when 'Wine' then 'Wine Storage'
        when 'Fresh' then 'Fridge'
        when 'Consumables' then 'Main Storage'
        else 'Main Storage'
      end;

      insert into public.stock_items (
        workspace_id,
        name,
        category,
        item_type,
        supplier,
        unit,
        current_quantity,
        minimum_quantity,
        target_quantity,
        order_quantity,
        cost_price,
        storage_location,
        active
      ) values (
        locked.workspace_id,
        v_name,
        v_category,
        v_item_type,
        v_supplier,
        v_unit,
        0,
        0,
        nullif(v_par, 0),
        null,
        v_cost,
        v_location,
        true
      )
      returning id into v_new_stock_id;

      select ws.id
      into v_storage_id
      from public.workspace_storages ws
      where ws.workspace_id = locked.workspace_id
        and ws.location_key = v_location
        and ws.active
      limit 1;

      if v_storage_id is null then
        raise exception 'inventory_migration_auto_create_storage_not_found'
          using hint = v_location;
      end if;

      insert into public.stock_item_location_balances (
        workspace_id,
        stock_item_id,
        workspace_storage_id,
        location_key,
        quantity,
        quantity_version,
        updated_by
      ) values (
        locked.workspace_id,
        v_new_stock_id,
        v_storage_id,
        v_location,
        v_qty,
        1,
        v_auth_user_id
      );

      update public.stock_items si
      set current_quantity = (
        select coalesce(sum(b.quantity), 0)::numeric(12, 3)
        from public.stock_item_location_balances b
        where b.workspace_id = si.workspace_id
          and b.stock_item_id = si.id
      )
      where si.id = v_new_stock_id
        and si.workspace_id = locked.workspace_id;

      if not found then
        raise exception 'inventory_migration_auto_create_cache_update_failed id=%', v_new_stock_id;
      end if;

      update public.inventory_stock_item_map m
      set
        stock_item_id = v_new_stock_id,
        status = 'created'
      where m.id = locked.id
        and m.status = 'classified'
        and m.resolution_type in ('auto_create', 'manual_create')
        and m.stock_item_id is null;

      if not found then
        raise exception 'map row % lost eligibility after insert', locked.id;
      end if;

      v_created := v_created + 1;

    exception
      when others then
        v_errors := v_errors + 1;
        -- subtransaction rolls back orphan stock insert for this row
    end;
  end loop;

  -- Remaining classified create-eligible rows + per-row errors require attention.
  v_critical_count := v_errors;
  select count(*)::bigint into v_attention_count
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type in ('auto_create', 'manual_create');

  v_attention_count := v_attention_count + v_errors;
  v_total_findings := v_attention_count;

  if v_attention_count > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'auto_create_version', 1,
    'groups', jsonb_build_array(
      jsonb_build_object(
        'key', 'eligible',
        'label', 'Eligible classified auto_create/manual_create rows',
        'count', v_eligible,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'created',
        'label', 'Stock items created',
        'count', v_created,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'already_created',
        'label', 'Already created map rows',
        'count', v_already_created,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'skipped',
        'label', 'Skipped rows',
        'count', v_skipped,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'invalid_snapshot',
        'label', 'Invalid or empty source_snapshot',
        'count', v_invalid_snapshot,
        'requires_attention', v_invalid_snapshot > 0
      ),
      jsonb_build_object(
        'key', 'invalid_name',
        'label', 'Invalid or blank item_name',
        'count', v_invalid_name,
        'requires_attention', v_invalid_name > 0
      ),
      jsonb_build_object(
        'key', 'already_had_stock_item_id',
        'label', 'Already had stock_item_id',
        'count', v_already_has_stock_id,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'race_skipped',
        'label', 'Race skipped (eligibility lost)',
        'count', v_race_skipped,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'errors',
        'label', 'Per-row errors',
        'count', v_errors,
        'requires_attention', v_errors > 0
      )
    ),
    'totals', jsonb_build_object(
      'eligible_rows', v_eligible,
      'created_rows', v_created,
      'already_created_rows', v_already_created,
      'attention_rows', v_attention_count,
      'skipped_rows', v_skipped,
      'error_rows', v_errors
    )
  );

  v_executed_at := now();

  update public.inventory_migration_session_steps st
  set
    status = 'completed',
    completed_at = v_executed_at
  where st.id = v_step.id
  returning * into v_step;

  insert into public.inventory_migration_step_results (
    session_id,
    step_id,
    workspace_id,
    step_name,
    result_status,
    result_summary,
    critical_finding_count,
    attention_finding_count,
    executed_by,
    operator_display_name,
    executed_at
  )
  values (
    v_session.id,
    v_step.id,
    p_workspace_id,
    'auto_create',
    v_result_status,
    v_result_summary,
    v_critical_count,
    v_attention_count,
    v_auth_user_id,
    v_operator_display_name,
    v_executed_at
  )
  returning id into v_result_id;

  v_activity_text := format(
    'Auto create completed: %s (result_id=%s, created=%s, skipped=%s, errors=%s, attention=%s).',
    v_result_status,
    v_result_id,
    v_created,
    v_skipped,
    v_errors,
    v_attention_count
  );

  insert into public.inventory_migration_activity (
    session_id,
    workspace_id,
    activity_type,
    activity_text,
    created_by,
    operator_display_name
  )
  values (
    v_session.id,
    p_workspace_id,
    'note',
    v_activity_text,
    v_auth_user_id,
    v_operator_display_name
  );

  session_id := v_session.id;
  step_id := v_step.id;
  step_name := v_step.step_name;
  step_status := v_step.status;
  result_id := v_result_id;
  result_status := v_result_status;
  critical_finding_count := v_critical_count;
  attention_finding_count := v_attention_count;
  total_findings := v_total_findings;
  executed_at := v_executed_at;
  return next;
end;
$$;

revoke all on function public.run_inventory_migration_auto_create(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_auto_create(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_auto_create(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_auto_create(uuid, uuid) is
  'P7.8.11/P8.6.2a stage-owned Auto Create: locks session/step, creates stock_items from map source_snapshot for classified+auto_create|manual_create rows, sets map stock_item_id+created. Preserves resolution_type. Inserts the matching location balance and sets current_quantity from SUM(balances). No migrated_at; no supplier_id; no movements.';

drop function if exists public.run_inventory_migration_phase2(uuid, uuid, boolean);

create or replace function public.run_inventory_migration_phase2(
  p_workspace_id uuid,
  p_session_id uuid,
  p_confirm_maintenance_window boolean
)
returns table (
  session_id uuid,
  step_id uuid,
  step_name text,
  step_status text,
  result_id uuid,
  result_status text,
  critical_finding_count bigint,
  attention_finding_count bigint,
  total_findings bigint,
  executed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_session public.inventory_migration_sessions%rowtype;
  v_step public.inventory_migration_session_steps%rowtype;
  v_existing_result_id uuid := null;
  v_pred_incomplete boolean := false;
  v_other_running boolean := false;
  v_prior_result_id uuid := null;
  v_prior_result_status text := null;
  v_ack_exists boolean := false;

  cand record;
  locked record;
  v_mov record;
  v_stock record;
  v_note text;
  v_mov_count bigint;
  v_new_qty numeric;
  v_storage_id uuid;
  v_location_key text;
  v_balance public.stock_item_location_balances%rowtype;
  v_balance_sum numeric(12, 3);
  v_aggregate numeric(12, 3);
  v_reconciliation_blocked bigint := 0;
  v_storage_unresolved bigint := 0;
  v_missing_location_balance bigint := 0;

  v_eligible bigint := 0;
  v_applied_receive bigint := 0;
  v_applied_usage bigint := 0;
  v_already_applied bigint := 0;
  v_missing_movement bigint := 0;
  v_duplicate_movement bigint := 0;
  v_missing_stock bigint := 0;
  v_workspace_mismatch bigint := 0;
  v_inactive_stock bigint := 0;
  v_invalid_movement_type bigint := 0;
  v_invalid_movement_qty bigint := 0;
  v_negative_result_blocked bigint := 0;
  v_revalidation_skipped bigint := 0;
  v_errors bigint := 0;
  v_total_applied bigint := 0;
  v_total_blocked bigint := 0;
  v_qty_delta_applied numeric := 0;

  v_result_status text;
  v_critical_count bigint := 0;
  v_attention_count bigint := 0;
  v_total_findings bigint := 0;
  v_result_summary jsonb;
  v_result_id uuid;
  v_executed_at timestamptz;
  v_activity_text text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_phase2_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_phase2_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_phase2_session_required';
  end if;

  -- SAFETY INTERLOCK (preserved): refuse before any quantity writes.
  if p_confirm_maintenance_window is distinct from true then
    raise exception 'inventory_migration_phase2_maintenance_window_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_phase2_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_phase2_forbidden';
  end if;

  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  -- Lock order 1: session (session-level mutex).
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_phase2_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_phase2_session_not_running';
  end if;

  -- Lock order 2: all session steps in canonical order.
  perform 1
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
  order by
    case st.step_name
      when 'foundation' then 1
      when 'persist' then 2
      when 'auto_link' then 3
      when 'auto_create' then 4
      when 'integrity_audit' then 5
      when 'preflight' then 6
      when 'preview' then 7
      when 'phase1' then 8
      when 'phase2' then 9
      when 'post_apply_audit' then 10
      else 11
    end
  for update;

  select st.*
  into v_step
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
    and st.step_name = 'phase2';

  if not found then
    raise exception 'inventory_migration_phase2_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_phase2_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_phase2_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_phase2_invalid_step_state';
  end if;

  -- Prerequisites: foundation → phase1 completed.
  select exists (
    select 1
    from unnest(array[
      'foundation',
      'persist',
      'auto_link',
      'auto_create',
      'integrity_audit',
      'preflight',
      'preview',
      'phase1'
    ]) as pred(step_name)
    where not exists (
      select 1
      from public.inventory_migration_session_steps st
      where st.session_id = p_session_id
        and st.workspace_id = p_workspace_id
        and st.step_name = pred.step_name
        and st.status = 'completed'
    )
  )
  into v_pred_incomplete;

  if v_pred_incomplete then
    raise exception 'inventory_migration_phase2_prerequisite_incomplete';
  end if;

  -- P7.9.5: phase1 attention_required requires acknowledgement for phase2.
  select r.id, r.result_status
  into v_prior_result_id, v_prior_result_status
  from public.inventory_migration_step_results r
  where r.session_id = p_session_id
    and r.workspace_id = p_workspace_id
    and r.step_name = 'phase1'
  limit 1;

  if v_prior_result_id is null then
    raise exception 'inventory_migration_phase2_prior_result_missing';
  end if;

  if v_prior_result_status = 'attention_required' then
    select exists (
      select 1
      from public.inventory_migration_stage_attention_acknowledgements a
      where a.prior_result_id = v_prior_result_id
        and a.next_step_name = 'phase2'
        and a.session_id = p_session_id
        and a.workspace_id = p_workspace_id
    )
    into v_ack_exists;

    if not v_ack_exists then
      raise exception 'inventory_migration_phase2_attention_acknowledgement_required';
    end if;
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'phase2'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_phase2_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- P7.4.10b Phase 2 quantity apply (workspace-scoped; meanings preserved)
  -- ---------------------------------------------------------------------------

  select count(*)::bigint into v_eligible
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and m.stock_item_id is not null
    and m.migrated_at is null;

  for cand in
    select m.id as map_id
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
      and m.status in ('created', 'linked')
      and m.stock_item_id is not null
      and m.migrated_at is null
    order by m.legacy_inventory_item_id, m.id
  loop
    begin
      -- 1) Lock map row first
      select
        m.id,
        m.workspace_id,
        m.legacy_inventory_item_id,
        m.stock_item_id,
        m.status,
        m.migrated_at
      into locked
      from public.inventory_stock_item_map m
      where m.id = cand.map_id
      for update;

      if not found then
        v_revalidation_skipped := v_revalidation_skipped + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 2) Re-check eligibility under lock
      if locked.migrated_at is not null then
        v_already_applied := v_already_applied + 1;
        continue;
      end if;

      if locked.status not in ('created', 'linked')
         or locked.stock_item_id is null then
        v_revalidation_skipped := v_revalidation_skipped + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      v_note := 'INITIAL_IMPORT|map_id=' || locked.id::text;

      select count(*)::bigint into v_mov_count
      from public.stock_movements sm
      where sm.note = v_note;

      if v_mov_count = 0 then
        v_missing_movement := v_missing_movement + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov_count > 1 then
        v_duplicate_movement := v_duplicate_movement + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 3) Lock the exact matching movement
      select
        sm.id,
        sm.workspace_id,
        sm.item_id,
        sm.type,
        sm.quantity,
        sm.note
      into v_mov
      from public.stock_movements sm
      where sm.note = v_note
      for update;

      if not found then
        v_missing_movement := v_missing_movement + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 4) Validate movement identity / payload
      if v_mov.workspace_id is distinct from locked.workspace_id then
        v_workspace_mismatch := v_workspace_mismatch + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov.item_id is distinct from locked.stock_item_id then
        v_revalidation_skipped := v_revalidation_skipped + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov.type is distinct from 'receive'
         and v_mov.type is distinct from 'usage' then
        v_invalid_movement_type := v_invalid_movement_type + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov.quantity is null or v_mov.quantity <= 0 then
        v_invalid_movement_qty := v_invalid_movement_qty + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 5) Lock stock item
      select
        s.id,
        s.workspace_id,
        s.active,
        s.current_quantity,
        s.storage_location
      into v_stock
      from public.stock_items s
      where s.id = locked.stock_item_id
      for update;

      if not found then
        v_missing_stock := v_missing_stock + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_stock.workspace_id is distinct from locked.workspace_id then
        v_workspace_mismatch := v_workspace_mismatch + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_stock.active is distinct from true then
        v_inactive_stock := v_inactive_stock + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 6) Location balance, then cache = SUM(balances).
      -- Refuse when the cache already disagrees with the balances.
      select coalesce(sum(b.quantity), 0)::numeric(12, 3)
      into v_balance_sum
      from public.stock_item_location_balances b
      where b.workspace_id = locked.workspace_id
        and b.stock_item_id = v_stock.id;

      if v_stock.current_quantity is distinct from v_balance_sum then
        v_reconciliation_blocked := v_reconciliation_blocked + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      select ws.id, ws.location_key
      into v_storage_id, v_location_key
      from public.workspace_storages ws
      where ws.workspace_id = locked.workspace_id
        and ws.location_key = v_stock.storage_location
        and ws.active
      limit 1;

      if v_storage_id is null then
        v_storage_unresolved := v_storage_unresolved + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      select *
      into v_balance
      from public.stock_item_location_balances b
      where b.workspace_id = locked.workspace_id
        and b.stock_item_id = v_stock.id
        and b.workspace_storage_id = v_storage_id
      for update;

      if not found then
        if v_mov.type = 'usage' then
          v_missing_location_balance := v_missing_location_balance + 1;
          v_total_blocked := v_total_blocked + 1;
          continue;
        end if;
        v_balance := public.ensure_stock_item_location_balance(
          locked.workspace_id,
          v_stock.id,
          v_storage_id,
          v_location_key,
          v_auth_user_id
        );
      end if;

      if v_mov.type = 'receive' then
        v_new_qty := v_balance.quantity + v_mov.quantity;
      else
        v_new_qty := v_balance.quantity - v_mov.quantity;
        if v_new_qty < 0 then
          v_negative_result_blocked := v_negative_result_blocked + 1;
          v_total_blocked := v_total_blocked + 1;
          continue;
        end if;
      end if;

      update public.stock_item_location_balances b
      set
        quantity = v_new_qty,
        quantity_version = b.quantity_version + 1,
        updated_by = v_auth_user_id
      where b.id = v_balance.id
        and b.workspace_id = locked.workspace_id
        and b.quantity_version = v_balance.quantity_version;

      if not found then
        raise exception 'inventory_migration_phase2_balance_version_conflict id=%', v_balance.id;
      end if;

      select coalesce(sum(b.quantity), 0)::numeric(12, 3)
      into v_aggregate
      from public.stock_item_location_balances b
      where b.workspace_id = locked.workspace_id
        and b.stock_item_id = v_stock.id;

      -- 7) Cache refresh + migrated_at (same exception block)
      update public.stock_items s
      set current_quantity = v_aggregate
      where s.id = v_stock.id
        and s.workspace_id = locked.workspace_id;

      if not found then
        raise exception 'stock update missed id=%', v_stock.id;
      end if;

      update public.inventory_stock_item_map m
      set migrated_at = now()
      where m.id = locked.id
        and m.migrated_at is null;

      if not found then
        raise exception 'map migrated_at race map_id=%', locked.id;
      end if;

      v_qty_delta_applied := v_qty_delta_applied + v_mov.quantity;

      if v_mov.type = 'receive' then
        v_applied_receive := v_applied_receive + 1;
      else
        v_applied_usage := v_applied_usage + 1;
      end if;
      v_total_applied := v_total_applied + 1;

    exception
      when others then
        v_errors := v_errors + 1;
        v_total_blocked := v_total_blocked + 1;
        -- subtransaction rolls back stock/map writes for this row
    end;
  end loop;

  v_critical_count := v_errors;
  v_attention_count := v_total_blocked;
  v_total_findings := v_attention_count;

  if v_attention_count > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'phase2_version', 1,
    'maintenance_window_confirmed', true,
    'groups', jsonb_build_array(
      jsonb_build_object(
        'key', 'eligible',
        'label', 'Eligible unapplied created/linked rows',
        'count', v_eligible,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'applied_receive',
        'label', 'Applied receive movements',
        'count', v_applied_receive,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'applied_usage',
        'label', 'Applied usage movements',
        'count', v_applied_usage,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'already_applied',
        'label', 'Already applied (migrated_at set)',
        'count', v_already_applied,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'missing_movement',
        'label', 'Missing INITIAL_IMPORT movement',
        'count', v_missing_movement,
        'requires_attention', v_missing_movement > 0
      ),
      jsonb_build_object(
        'key', 'duplicate_movement',
        'label', 'Duplicate INITIAL_IMPORT movements',
        'count', v_duplicate_movement,
        'requires_attention', v_duplicate_movement > 0
      ),
      jsonb_build_object(
        'key', 'missing_stock',
        'label', 'Missing stock item',
        'count', v_missing_stock,
        'requires_attention', v_missing_stock > 0
      ),
      jsonb_build_object(
        'key', 'workspace_mismatch',
        'label', 'Workspace mismatch',
        'count', v_workspace_mismatch,
        'requires_attention', v_workspace_mismatch > 0
      ),
      jsonb_build_object(
        'key', 'inactive_stock',
        'label', 'Inactive stock item',
        'count', v_inactive_stock,
        'requires_attention', v_inactive_stock > 0
      ),
      jsonb_build_object(
        'key', 'invalid_movement_type',
        'label', 'Invalid movement type',
        'count', v_invalid_movement_type,
        'requires_attention', v_invalid_movement_type > 0
      ),
      jsonb_build_object(
        'key', 'invalid_movement_qty',
        'label', 'Invalid movement quantity',
        'count', v_invalid_movement_qty,
        'requires_attention', v_invalid_movement_qty > 0
      ),
      jsonb_build_object(
        'key', 'negative_result_blocked',
        'label', 'Negative quantity result blocked',
        'count', v_negative_result_blocked,
        'requires_attention', v_negative_result_blocked > 0
      ),
      jsonb_build_object(
        'key', 'revalidation_skipped',
        'label', 'Revalidation skipped',
        'count', v_revalidation_skipped,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'reconciliation_blocked',
        'label', 'Cache does not equal SUM(balances)',
        'count', v_reconciliation_blocked,
        'requires_attention', v_reconciliation_blocked > 0
      ),
      jsonb_build_object(
        'key', 'storage_unresolved',
        'label', 'storage_location is not an active workspace storage',
        'count', v_storage_unresolved,
        'requires_attention', v_storage_unresolved > 0
      ),
      jsonb_build_object(
        'key', 'missing_location_balance',
        'label', 'Usage has no balance at storage_location',
        'count', v_missing_location_balance,
        'requires_attention', v_missing_location_balance > 0
      ),
      jsonb_build_object(
        'key', 'errors',
        'label', 'Per-row errors',
        'count', v_errors,
        'requires_attention', v_errors > 0
      )
    ),
    'totals', jsonb_build_object(
      'eligible_rows', v_eligible,
      'applied_rows', v_total_applied,
      'already_applied_rows', v_already_applied,
      'attention_rows', v_attention_count,
      'blocked_rows', v_total_blocked,
      'error_rows', v_errors,
      'quantity_delta_applied', v_qty_delta_applied
    )
  );

  v_executed_at := now();

  update public.inventory_migration_session_steps st
  set
    status = 'completed',
    completed_at = v_executed_at
  where st.id = v_step.id
  returning * into v_step;

  insert into public.inventory_migration_step_results (
    session_id,
    step_id,
    workspace_id,
    step_name,
    result_status,
    result_summary,
    critical_finding_count,
    attention_finding_count,
    executed_by,
    operator_display_name,
    executed_at
  )
  values (
    v_session.id,
    v_step.id,
    p_workspace_id,
    'phase2',
    v_result_status,
    v_result_summary,
    v_critical_count,
    v_attention_count,
    v_auth_user_id,
    v_operator_display_name,
    v_executed_at
  )
  returning id into v_result_id;

  v_activity_text := format(
    'Phase 2 completed: %s (result_id=%s, applied=%s, blocked=%s, already=%s).',
    v_result_status,
    v_result_id,
    v_total_applied,
    v_total_blocked,
    v_already_applied
  );

  insert into public.inventory_migration_activity (
    session_id,
    workspace_id,
    activity_type,
    activity_text,
    created_by,
    operator_display_name
  )
  values (
    v_session.id,
    p_workspace_id,
    'note',
    v_activity_text,
    v_auth_user_id,
    v_operator_display_name
  );

  session_id := v_session.id;
  step_id := v_step.id;
  step_name := v_step.step_name;
  step_status := v_step.status;
  result_id := v_result_id;
  result_status := v_result_status;
  critical_finding_count := v_critical_count;
  attention_finding_count := v_attention_count;
  total_findings := v_total_findings;
  executed_at := v_executed_at;
  return next;
end;
$$;

revoke all on function public.run_inventory_migration_phase2(uuid, uuid, boolean) from public;
revoke all on function public.run_inventory_migration_phase2(uuid, uuid, boolean) from anon;
grant execute on function public.run_inventory_migration_phase2(uuid, uuid, boolean) to authenticated;

comment on function public.run_inventory_migration_phase2(uuid, uuid, boolean) is
  'P7.8.13 stage-owned Phase 2: locks session/step, applies INITIAL_IMPORT movement deltas to the storage_location balance, then sets current_quantity = SUM(balances) and map.migrated_at. Requires p_confirm_maintenance_window=true. Usage does not create a missing balance. Does not mutate stock_movements.';

notify pgrst, 'reload schema';
commit;

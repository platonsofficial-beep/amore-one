-- =============================================================================
-- P8.29.9 — Spreadsheet Import Multi-Location Apply
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/inventory_import_schema.sql (P8.15.2)
--   2. supabase/inventory_import_session_staging_rpcs.sql (P8.27.1)
--   3. supabase/inventory_import_ready_rpc.sql (P8.27.2)
--   4. supabase/stock_item_location_balances_schema.sql (P8.29.2)
--   5. supabase/stock_movements_location_extension.sql (P8.29.3)
--   6. public.stock_items / public.stock_movements
--   7. public.can_manage_workspace_stock(uuid)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER transactional Apply with multi-location opening stock:
--     ready → applying → completed
--   Creates/links/skips from staged inventory_import_rows.
--
--   Opening stock (opening_stock quantity policy):
--     Reads locationQuantities[] from normalized_payload (P8.29.1 contract).
--     Falls back to single resolvedQuantity + locationKey for legacy payloads.
--     For each VALID location entry:
--       - Resolves workspace_storages.id via (workspace_id, location_key)
--       - Upserts stock_item_location_balances (ON CONFLICT DO NOTHING)
--       - Inserts one stock_count movement (location-aware, spreadsheet_import origin)
--       - Refreshes stock_items.current_quantity = SUM(balances)
--
-- Idempotency:
--   Session-level: same apply_idempotency_key replays completed result.
--   Balance-level: ON CONFLICT (workspace_id, stock_item_id, workspace_storage_id) DO NOTHING
--   Movement-level: each movement has idempotent note with session+row+location
--
-- Does NOT:
--   - Mutate linked-item metadata (name/category/unit/supplier/storage/…)
--   - Support update actions
--   - Background retries
--   - Change Wizard / Preview / Ready
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

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

          -- Legacy: one stock_count movement per item (location-blind).
          insert into public.stock_movements (
            workspace_id,
            item_id,
            type,
            quantity,
            note,
            created_by,
            origin_workflow,
            origin_ref_id
          )
          values (
            p_workspace_id,
            v_affected_item_id,
            'stock_count',
            v_qty,
            format(
              'INVENTORY_IMPORT|session=%s|row=%s|action=create',
              p_session_id,
              v_row.source_row_number
            ),
            v_auth_user_id,
            'spreadsheet_import',
            p_session_id
          )
          returning id into v_movement_id;

          update public.stock_items si
          set current_quantity = v_qty
          where si.id = v_affected_item_id
            and si.workspace_id = p_workspace_id;

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

          insert into public.stock_movements (
            workspace_id,
            item_id,
            type,
            quantity,
            note,
            created_by,
            origin_workflow,
            origin_ref_id
          )
          values (
            p_workspace_id,
            v_affected_item_id,
            'stock_count',
            v_qty,
            format(
              'INVENTORY_IMPORT|session=%s|row=%s|action=link',
              p_session_id,
              v_row.source_row_number
            ),
            v_auth_user_id,
            'spreadsheet_import',
            p_session_id
          )
          returning id into v_movement_id;

          update public.stock_items si
          set current_quantity = v_qty
          where si.id = v_affected_item_id
            and si.workspace_id = p_workspace_id;

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
  'P8.27.3/P8.29.9 SECURITY DEFINER transactional Import Apply. ready→applying→completed. Create/link/skip. Opening stock: locationQuantities[] multi-location (balance upsert + stock_count per location, SUM aggregate refresh) or legacy resolvedQuantity fallback. No UI.';

revoke all on function public.apply_inventory_import_session(uuid, uuid, text) from public;
revoke all on function public.apply_inventory_import_session(uuid, uuid, text) from anon;
grant execute on function public.apply_inventory_import_session(uuid, uuid, text) to authenticated;

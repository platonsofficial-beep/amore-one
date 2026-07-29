-- =============================================================================
-- P8.27.3 — Inventory Import Apply RPC Foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/inventory_import_schema.sql (P8.15.2)
--   2. supabase/inventory_import_session_staging_rpcs.sql (P8.27.1)
--   3. supabase/inventory_import_ready_rpc.sql (P8.27.2)
--   4. public.stock_items / public.stock_movements
--   5. public.can_manage_workspace_stock(uuid)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER transactional Apply:
--     ready → applying → completed
--   Creates/links/skips from staged inventory_import_rows.
--   Opening stock uses exactly one stock_count movement (absolute quantity).
--
-- Does NOT:
--   - Wire wizard UI / Apply button
--   - Mutate linked-item metadata (name/category/unit/supplier/storage/…)
--   - Support update actions
--   - Background retries
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

      -- Create always starts at quantity 0; opening stock uses stock_count afterward.
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

      v_movement_id := null;
      if v_quantity_policy = 'opening_stock' then
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

        -- Exactly one absolute stock_count movement per affected item.
        insert into public.stock_movements (
          workspace_id,
          item_id,
          type,
          quantity,
          note,
          created_by
        )
        values (
          p_workspace_id,
          v_new_item_id,
          'stock_count',
          v_qty,
          format(
            'INVENTORY_IMPORT|session=%s|row=%s|action=create',
            p_session_id,
            v_row.source_row_number
          ),
          v_auth_user_id
        )
        returning id into v_movement_id;

        update public.stock_items si
        set current_quantity = v_qty
        where si.id = v_new_item_id
          and si.workspace_id = p_workspace_id;

        v_movement_count := v_movement_count + 1;
      end if;

      v_row_result := jsonb_build_object(
        'action', 'create',
        'source_row_number', v_row.source_row_number,
        'stock_item_id', v_new_item_id,
        'movement_id', v_movement_id,
        'opening_quantity', case when v_quantity_policy = 'opening_stock' then v_qty else null end
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
      v_movement_id := null;
      if v_quantity_policy = 'opening_stock' then
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
          created_by
        )
        values (
          p_workspace_id,
          v_item.id,
          'stock_count',
          v_qty,
          format(
            'INVENTORY_IMPORT|session=%s|row=%s|action=link',
            p_session_id,
            v_row.source_row_number
          ),
          v_auth_user_id
        )
        returning id into v_movement_id;

        update public.stock_items si
        set current_quantity = v_qty
        where si.id = v_item.id
          and si.workspace_id = p_workspace_id;

        v_movement_count := v_movement_count + 1;
      end if;

      v_row_result := jsonb_build_object(
        'action', 'link',
        'source_row_number', v_row.source_row_number,
        'stock_item_id', v_item.id,
        'movement_id', v_movement_id,
        'opening_quantity', case when v_quantity_policy = 'opening_stock' then v_qty else null end
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
  'P8.27.3 SECURITY DEFINER transactional Import Apply. ready→applying→completed. Create/link/skip only. Opening stock = one absolute stock_count. No UI.';

revoke all on function public.apply_inventory_import_session(uuid, uuid, text) from public;
revoke all on function public.apply_inventory_import_session(uuid, uuid, text) from anon;
grant execute on function public.apply_inventory_import_session(uuid, uuid, text) to authenticated;

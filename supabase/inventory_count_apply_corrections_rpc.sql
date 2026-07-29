-- =============================================================================
-- P8.20.6 / P8.20.8 — Apply Inventory Count Corrections RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_corrections_schema.sql (P8.20.6 + P8.20.8 baseline_quantity)
--   2. stock_movements_schema.sql
--   3. inventory_count_rls_policies.sql (can_manage_workspace_stock)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Append-only corrections against a posted inventory count.
--   Creates new adjustment movements + updates live stock.
--   NEVER mutates original session / session item historical fields /
--   original posted movements.
--
-- P8.20.8 effective baseline (server source of truth):
--   effective_before = counted_quantity + sum(prior correction deltas)
--   applied_delta    = requested_corrected_quantity − effective_before
--   Client may preview; server ignores any client baseline/delta.
--
-- p_corrections jsonb array items:
--   { "session_item_id": uuid, "corrected_quantity": number }
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Lock order (deterministic, deadlock-safe):
--   1. session row FOR UPDATE
--   2. participating stock_items by ascending id
--   3. each session_item FOR UPDATE (loop ordered by session_item_id)
--   Session lock serializes concurrent applies for the same posted count so
--   prior-delta sums cannot share a stale effective baseline.
-- =============================================================================

drop function if exists public.apply_inventory_count_corrections(uuid, uuid, jsonb);

create or replace function public.apply_inventory_count_corrections(
  p_workspace_id uuid,
  p_session_id uuid,
  p_corrections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_correction_id uuid;
  v_now timestamptz := now();
  v_line jsonb;
  v_session_item_id uuid;
  v_corrected_quantity numeric(12, 3);
  v_original_quantity numeric(12, 3);
  v_previous_delta_sum numeric(12, 3);
  v_baseline_quantity numeric(12, 3);
  v_delta numeric(12, 3);
  v_effective_after numeric(12, 3);
  v_item_id uuid;
  v_item_name text;
  v_locked_qty numeric(12, 3);
  v_next_qty numeric(12, 3);
  v_movement_id uuid;
  v_row_count integer := 0;
  v_line_count integer := 0;
  v_movement_count integer := 0;
  v_lines jsonb := '[]'::jsonb;
  v_seen_session_item_ids uuid[] := array[]::uuid[];
  v_storage_location text;
  v_balance_id uuid;
  v_workspace_storage_id uuid;
  v_location_key text;
  v_aggregate_sum numeric(12, 3);
  v_source_storage_id uuid;
  v_dest_storage_id uuid;
  v_source_location_key text;
  v_dest_location_key text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_count_correction_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_correction_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_correction_session_required'
      using hint = 'session_id is required.';
  end if;

  if p_corrections is null or jsonb_typeof(p_corrections) is distinct from 'array' then
    raise exception 'inventory_count_correction_payload_required'
      using hint = 'corrections array is required.';
  end if;

  if jsonb_array_length(p_corrections) = 0 then
    raise exception 'inventory_count_correction_empty'
      using hint = 'At least one correction is required.';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_correction_forbidden'
      using hint = 'owner / general_manager / manager required.';
  end if;

  -- 1) Lock posted session (serializes concurrent applies for this session).
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
      raise exception 'inventory_count_correction_workspace_mismatch'
        using hint = 'Session belongs to a different workspace.';
    end if;

    raise exception 'inventory_count_correction_session_not_found'
      using hint = 'Inventory count session was not found.';
  end if;

  if v_session.status is distinct from 'posted' then
    raise exception 'inventory_count_correction_session_not_posted'
      using hint = 'Only posted inventory counts can receive corrections.';
  end if;

  -- 2) Lock participating stock items + location balances (deadlock-safe order).
  for v_item_id, v_storage_location in
    select distinct i.item_id, i.storage_location
    from public.inventory_count_session_items i
    where i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
      and i.item_id is not null
      and i.id in (
        select nullif(elem ->> 'session_item_id', '')::uuid
        from jsonb_array_elements(p_corrections) as t(elem)
      )
    order by i.item_id, i.storage_location
  loop
    perform 1
    from public.stock_items si
    where si.id = v_item_id
      and si.workspace_id = p_workspace_id
    for update of si;

    if not found then
      raise exception 'inventory_count_correction_stock_item_missing'
        using hint = 'A stock item referenced by a correction was not found.';
    end if;

    perform 1
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id
      and b.location_key = v_storage_location
    for update of b;

    if not found then
      raise exception 'inventory_count_correction_balance_missing'
        using hint = 'A location balance referenced by a correction was not found.';
    end if;
  end loop;

  insert into public.inventory_count_corrections (
    workspace_id,
    session_id,
    created_by,
    created_at,
    line_count,
    movement_count
  )
  values (
    p_workspace_id,
    p_session_id,
    v_auth_user_id,
    v_now,
    0,
    0
  )
  returning id into v_correction_id;

  -- 3) Process lines in deterministic session_item_id order.
  for v_line in
    select value
    from jsonb_array_elements(p_corrections) as t(value)
    order by (t.value ->> 'session_item_id')
  loop
    v_session_item_id := nullif(v_line ->> 'session_item_id', '')::uuid;
    -- Server trusts only corrected_quantity; ignore any client baseline/delta fields.
    v_corrected_quantity := nullif(v_line ->> 'corrected_quantity', '')::numeric;
    v_movement_id := null;
    v_previous_delta_sum := 0;
    v_baseline_quantity := null;
    v_delta := null;
    v_effective_after := null;

    if v_session_item_id is null or v_corrected_quantity is null then
      raise exception 'inventory_count_correction_invalid_line'
        using hint = 'Each correction requires session_item_id and corrected_quantity.';
    end if;

    select
      i.item_id,
      i.item_name,
      i.counted_quantity,
      i.storage_location
    into
      v_item_id,
      v_item_name,
      v_original_quantity,
      v_storage_location
    from public.inventory_count_session_items i
    where i.id = v_session_item_id
      and i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
    for update of i;

    if not found then
      raise exception 'inventory_count_correction_line_not_found'
        using hint = 'Correction line was not found on this posted session.';
    end if;

    if v_original_quantity is null then
      raise exception 'inventory_count_correction_original_missing'
        using hint = 'Original counted quantity is missing for this line.';
    end if;

    if v_item_id is null then
      raise exception 'inventory_count_correction_item_unlinked'
        using hint = 'Correction line is not linked to a stock item.';
    end if;

    if v_session_item_id = any (v_seen_session_item_ids) then
      raise exception 'inventory_count_correction_duplicate_item'
        using hint = 'Duplicate session item corrections are not allowed in one apply.';
    end if;
    v_seen_session_item_ids := array_append(v_seen_session_item_ids, v_session_item_id);

    -- Effective baseline = immutable posted counted + all previously applied deltas.
    select coalesce(sum(l.delta_quantity), 0)
      into v_previous_delta_sum
    from public.inventory_count_correction_lines l
    where l.session_item_id = v_session_item_id
      and l.session_id = p_session_id
      and l.workspace_id = p_workspace_id;

    v_baseline_quantity := v_original_quantity + v_previous_delta_sum;
    v_delta := v_corrected_quantity - v_baseline_quantity;
    v_effective_after := v_baseline_quantity + v_delta;

    -- Zero delta: skip movement and audit line.
    if v_delta = 0 then
      continue;
    end if;

    select b.id, b.quantity, b.workspace_storage_id, b.location_key
      into v_balance_id, v_locked_qty, v_workspace_storage_id, v_location_key
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id
      and b.location_key = v_storage_location;

    if not found then
      raise exception 'inventory_count_correction_balance_missing'
        using hint = 'A location balance referenced by a correction was not found.';
    end if;

    v_next_qty := v_locked_qty + v_delta;

    if v_next_qty < 0 then
      raise exception 'inventory_count_correction_negative_balance_rejected'
        using hint = 'Correction would make the location balance negative.';
    end if;

    v_source_storage_id := null;
    v_dest_storage_id := null;
    v_source_location_key := null;
    v_dest_location_key := null;

    if v_delta > 0 then
      v_dest_storage_id := v_workspace_storage_id;
      v_dest_location_key := v_location_key;
    else
      v_source_storage_id := v_workspace_storage_id;
      v_source_location_key := v_location_key;
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
      origin_workflow,
      origin_ref_id
    )
    values (
      p_workspace_id,
      v_item_id,
      'adjustment',
      v_delta,
      format(
        'Inventory count correction session %s line %s (effective %s → corrected %s)',
        p_session_id,
        v_session_item_id,
        v_baseline_quantity,
        v_corrected_quantity
      ),
      v_auth_user_id,
      v_source_storage_id,
      v_dest_storage_id,
      v_source_location_key,
      v_dest_location_key,
      'inventory_count_correction',
      p_session_id
    )
    returning id into v_movement_id;

    if v_movement_id is null then
      raise exception 'inventory_count_correction_movement_failed'
        using hint = 'Unable to create correction adjustment movement.';
    end if;

    update public.stock_item_location_balances b
    set
      quantity = v_next_qty,
      quantity_version = b.quantity_version + 1,
      updated_by = v_auth_user_id
    where b.id = v_balance_id
      and b.workspace_id = p_workspace_id
      and b.quantity is not distinct from v_locked_qty;

    get diagnostics v_row_count = row_count;
    if v_row_count is distinct from 1 then
      raise exception 'inventory_count_correction_quantity_update_failed'
        using hint = 'Live location balance changed while applying corrections. Retry.';
    end if;

    select coalesce(sum(b.quantity), 0)::numeric(12, 3)
    into v_aggregate_sum
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id;

    if v_aggregate_sum < 0 then
      raise exception 'inventory_count_correction_aggregate_drift';
    end if;

    update public.stock_items si
    set current_quantity = v_aggregate_sum
    where si.id = v_item_id
      and si.workspace_id = p_workspace_id;

    get diagnostics v_row_count = row_count;
    if v_row_count is distinct from 1 then
      raise exception 'inventory_count_correction_quantity_update_failed'
        using hint = 'Unable to refresh stock aggregate after correction.';
    end if;

    insert into public.inventory_count_correction_lines (
      correction_id,
      workspace_id,
      session_id,
      session_item_id,
      item_id,
      item_name,
      original_quantity,
      baseline_quantity,
      corrected_quantity,
      delta_quantity,
      movement_id,
      created_by,
      created_at
    )
    values (
      v_correction_id,
      p_workspace_id,
      p_session_id,
      v_session_item_id,
      v_item_id,
      coalesce(v_item_name, ''),
      v_original_quantity,
      v_baseline_quantity,
      v_corrected_quantity,
      v_delta,
      v_movement_id,
      v_auth_user_id,
      v_now
    );

    v_line_count := v_line_count + 1;
    v_movement_count := v_movement_count + 1;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'session_item_id', v_session_item_id,
        'item_id', v_item_id,
        'item_name', coalesce(v_item_name, ''),
        'original_quantity', v_original_quantity,
        'baseline_quantity', v_baseline_quantity,
        'effective_before_quantity', v_baseline_quantity,
        'corrected_quantity', v_corrected_quantity,
        'delta_quantity', v_delta,
        'effective_after_quantity', v_effective_after,
        'movement_id', v_movement_id
      )
    );
  end loop;

  if v_line_count = 0 then
    raise exception 'inventory_count_correction_no_changes'
      using hint = 'No non-zero correction deltas to apply.';
  end if;

  update public.inventory_count_corrections c
  set
    line_count = v_line_count,
    movement_count = v_movement_count
  where c.id = v_correction_id;

  -- Explicit immutability: never update session / session_items historical fields here.

  return jsonb_build_object(
    'correction_id', v_correction_id,
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'created_at', v_now,
    'created_by', v_auth_user_id,
    'line_count', v_line_count,
    'movement_count', v_movement_count,
    'lines', v_lines,
    'preserved', jsonb_build_object(
      'session_unchanged', true,
      'session_items_unchanged', true,
      'original_posted_movements_unchanged', true
    ),
    'message', 'Inventory count corrections applied successfully.'
  );
end;
$$;

revoke all on function public.apply_inventory_count_corrections(uuid, uuid, jsonb) from public;
grant execute on function public.apply_inventory_count_corrections(uuid, uuid, jsonb) to authenticated;

comment on function public.apply_inventory_count_corrections(uuid, uuid, jsonb) is
  'P8.20.8/P8.29.8 SECURITY DEFINER append-only corrections using effective baseline (counted + prior deltas). Updates same-location balances + SUM cache; never mutates posted session history.';

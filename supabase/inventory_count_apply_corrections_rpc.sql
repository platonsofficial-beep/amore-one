-- =============================================================================
-- P8.20.6 — Apply Inventory Count Corrections RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_corrections_schema.sql (P8.20.6)
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
-- p_corrections jsonb array items:
--   { "session_item_id": uuid, "corrected_quantity": number }
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
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
  v_delta numeric(12, 3);
  v_item_id uuid;
  v_item_name text;
  v_locked_qty numeric(12, 3);
  v_next_qty numeric(12, 3);
  v_movement_id uuid;
  v_row_count integer := 0;
  v_line_count integer := 0;
  v_movement_count integer := 0;
  v_lines jsonb := '[]'::jsonb;
  v_seen_item_ids uuid[] := array[]::uuid[];
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

  -- Lock participating stock items in ascending id order (deadlock avoidance).
  for v_item_id in
    select distinct i.item_id
    from public.inventory_count_session_items i
    where i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
      and i.item_id is not null
      and i.id in (
        select nullif(elem ->> 'session_item_id', '')::uuid
        from jsonb_array_elements(p_corrections) as t(elem)
      )
    order by i.item_id
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

  for v_line in
    select value
    from jsonb_array_elements(p_corrections) as t(value)
    order by (t.value ->> 'session_item_id')
  loop
    v_session_item_id := nullif(v_line ->> 'session_item_id', '')::uuid;
    v_corrected_quantity := nullif(v_line ->> 'corrected_quantity', '')::numeric;
    v_movement_id := null;

    if v_session_item_id is null or v_corrected_quantity is null then
      raise exception 'inventory_count_correction_invalid_line'
        using hint = 'Each correction requires session_item_id and corrected_quantity.';
    end if;

    select
      i.item_id,
      i.item_name,
      i.counted_quantity
    into
      v_item_id,
      v_item_name,
      v_original_quantity
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

    if v_item_id = any (v_seen_item_ids) then
      raise exception 'inventory_count_correction_duplicate_item'
        using hint = 'Duplicate stock item corrections are not allowed in one apply.';
    end if;
    v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);

    v_delta := v_corrected_quantity - v_original_quantity;

    -- Zero delta: skip movement and audit line.
    if v_delta = 0 then
      continue;
    end if;

    select si.current_quantity
      into v_locked_qty
    from public.stock_items si
    where si.id = v_item_id
      and si.workspace_id = p_workspace_id;

    if not found then
      raise exception 'inventory_count_correction_stock_item_missing'
        using hint = 'A stock item referenced by a correction was not found.';
    end if;

    v_next_qty := v_locked_qty + v_delta;

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
      v_item_id,
      'adjustment',
      v_delta,
      format(
        'Inventory count correction session %s line %s (original %s → corrected %s)',
        p_session_id,
        v_session_item_id,
        v_original_quantity,
        v_corrected_quantity
      ),
      v_auth_user_id
    )
    returning id into v_movement_id;

    if v_movement_id is null then
      raise exception 'inventory_count_correction_movement_failed'
        using hint = 'Unable to create correction adjustment movement.';
    end if;

    update public.stock_items si
    set current_quantity = v_next_qty
    where si.id = v_item_id
      and si.workspace_id = p_workspace_id
      and si.current_quantity is not distinct from v_locked_qty;

    get diagnostics v_row_count = row_count;
    if v_row_count is distinct from 1 then
      raise exception 'inventory_count_correction_quantity_update_failed'
        using hint = 'Live stock changed while applying corrections. Retry.';
    end if;

    insert into public.inventory_count_correction_lines (
      correction_id,
      workspace_id,
      session_id,
      session_item_id,
      item_id,
      item_name,
      original_quantity,
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
        'corrected_quantity', v_corrected_quantity,
        'delta_quantity', v_delta,
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
  'P8.20.6 SECURITY DEFINER append-only corrections: new adjustment movements + live qty updates + audit. Never mutates posted session history.';

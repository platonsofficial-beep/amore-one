-- =============================================================================
-- P8.22.6 / P8.22.6a — Transactional Inventory Count Reversal RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_reversal_foundation.sql (P8.22.2)
--   2. inventory_count_reversals_schema.sql (P8.22.3)
--   3. inventory_count_reversal_lineage_schema.sql (P8.22.5 / P8.22.5a)
--   4. stock_movements_schema.sql
--   5. inventory_count_rls_policies.sql (can_manage_workspace_stock)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER reversal of one posted inventory count.
--   Append-only: compensating adjustment movements + audit header/lines +
--   session reversed_* metadata. Status remains 'posted'.
--
-- P8.22.6a missing-source detection:
--   Permanent item delete CASCADEs stock_movements and SET NULLs
--   posted_movement_id / correction movement_id. Blindly skipping nulls would
--   treat destroyed ledger refs as zero-effect lines.
--   Contract:
--     - variance_quantity = 0  → null posted_movement_id is legitimate (skip)
--     - variance_quantity <> 0 → posted_movement_id required + row must exist
--       with matching workspace, item (when still linked), and quantity = variance
--     - correction lines exist only for non-zero deltas → movement_id always
--       required; delta_quantity must match movement.quantity
--   All source validation runs BEFORE reversal header / stock mutations.
--
-- Does NOT:
--   - Delete or mutate original post/correction movements
--   - Mutate session item historical fields
--   - Change session status away from posted
--   - Reconstruct movements from note text
--   - Wire UI / client services
--
-- Lock order (deterministic, deadlock-safe):
--   1. session row FOR UPDATE
--   2. validate required source movements (no writes)
--   3. participating stock_items by ascending item_id
--   Then: insert reversal header → compensate movements (created_at ASC, id ASC)
--         → insert reversal lines → update session reversed_* LAST
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.reverse_inventory_count_session(uuid, uuid, text, text);

create or replace function public.reverse_inventory_count_session(
  p_workspace_id uuid,
  p_session_id uuid,
  p_reason text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_reason text;
  v_note text;
  v_now timestamptz := now();
  v_reversal_id uuid;
  v_session_item public.inventory_count_session_items%rowtype;
  v_correction_line public.inventory_count_correction_lines%rowtype;
  v_orig public.stock_movements%rowtype;
  v_item_id uuid;
  v_expected_item_id uuid;
  v_expected_quantity numeric(12, 3);
  v_locked_qty numeric(12, 3);
  v_next_qty numeric(12, 3);
  v_reversal_quantity numeric(12, 3);
  v_reversal_movement_id uuid;
  v_row_count integer := 0;
  v_source_ids uuid[] := array[]::uuid[];
  v_source_movement_count integer := 0;
  v_reversal_movement_count integer := 0;
  v_line_count integer := 0;
  v_movements jsonb := '[]'::jsonb;
  v_balance_id uuid;
  v_workspace_storage_id uuid;
  v_location_key text;
  v_aggregate_sum numeric(12, 3);
  v_source_storage_id uuid;
  v_dest_storage_id uuid;
  v_source_location_key text;
  v_dest_location_key text;
  v_primary_location text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_count_reversal_unauthenticated'
      using hint = 'Sign in required.';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_reversal_workspace_required'
      using hint = 'workspace_id is required.';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_reversal_session_required'
      using hint = 'session_id is required.';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'inventory_count_reversal_reason_required'
      using hint = 'A non-empty reversal reason is required.';
  end if;

  v_note := coalesce(p_note, '');

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_reversal_forbidden'
      using hint = 'owner / general_manager / manager required.';
  end if;

  -- 1) Lock session FOR UPDATE (serializes concurrent reverse / correct / post).
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
      raise exception 'inventory_count_reversal_workspace_mismatch'
        using hint = 'Session belongs to a different workspace.';
    end if;

    raise exception 'inventory_count_reversal_session_not_found'
      using hint = 'Inventory count session was not found.';
  end if;

  if v_session.status is distinct from 'posted' then
    raise exception 'inventory_count_reversal_not_posted'
      using hint = 'Only posted inventory counts can be reversed.';
  end if;

  if v_session.reversed_at is not null then
    raise exception 'inventory_count_reversal_already_reversed'
      using hint = 'This inventory count has already been reversed.';
  end if;

  -- 2) P8.22.6a — Validate posted source movements BEFORE any writes.
  -- Legitimate null: variance_quantity = 0 (post created no movement).
  -- Required movement: variance_quantity <> 0 (must still resolve to a live row).
  for v_session_item in
    select i.*
    from public.inventory_count_session_items i
    where i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
    order by i.id
  loop
    if v_session_item.variance_quantity is null
       or v_session_item.variance_quantity = 0 then
      continue;
    end if;

    if v_session_item.posted_movement_id is null then
      raise exception 'inventory_count_reversal_movement_missing'
        using hint = 'Posted non-zero variance is missing its stock movement reference. Reverse aborted.';
    end if;

    select m.*
      into v_orig
    from public.stock_movements m
    where m.id = v_session_item.posted_movement_id;

    if not found then
      raise exception 'inventory_count_reversal_movement_missing'
        using hint = 'A posted inventory count movement no longer exists. Reverse aborted.';
    end if;

    if v_orig.workspace_id is distinct from p_workspace_id then
      raise exception 'inventory_count_reversal_movement_workspace_mismatch'
        using hint = 'Posted movement workspace does not match the session workspace.';
    end if;

    v_expected_item_id := v_session_item.item_id;
    if v_expected_item_id is not null
       and v_orig.item_id is distinct from v_expected_item_id then
      raise exception 'inventory_count_reversal_movement_item_mismatch'
        using hint = 'Posted movement item does not match the session item.';
    end if;

    v_expected_quantity := v_session_item.variance_quantity;
    if v_orig.quantity is distinct from v_expected_quantity then
      raise exception 'inventory_count_reversal_movement_quantity_mismatch'
        using hint = 'Posted movement quantity does not match stored variance.';
    end if;

    if not (v_session_item.posted_movement_id = any (v_source_ids)) then
      v_source_ids := array_append(v_source_ids, v_session_item.posted_movement_id);
    end if;
  end loop;

  -- 3) P8.22.6a — Validate correction source movements BEFORE any writes.
  -- Correction lines are inserted only for non-zero deltas; null movement_id is never legitimate.
  for v_correction_line in
    select l.*
    from public.inventory_count_correction_lines l
    where l.session_id = p_session_id
      and l.workspace_id = p_workspace_id
    order by l.id
  loop
    if v_correction_line.delta_quantity = 0 then
      continue;
    end if;

    if v_correction_line.movement_id is null then
      raise exception 'inventory_count_reversal_movement_missing'
        using hint = 'Correction line is missing its stock movement reference. Reverse aborted.';
    end if;

    select m.*
      into v_orig
    from public.stock_movements m
    where m.id = v_correction_line.movement_id;

    if not found then
      raise exception 'inventory_count_reversal_movement_missing'
        using hint = 'A correction movement no longer exists. Reverse aborted.';
    end if;

    if v_orig.workspace_id is distinct from p_workspace_id then
      raise exception 'inventory_count_reversal_movement_workspace_mismatch'
        using hint = 'Correction movement workspace does not match the session workspace.';
    end if;

    v_expected_item_id := v_correction_line.item_id;
    if v_expected_item_id is not null
       and v_orig.item_id is distinct from v_expected_item_id then
      raise exception 'inventory_count_reversal_movement_item_mismatch'
        using hint = 'Correction movement item does not match the correction line item.';
    end if;

    v_expected_quantity := v_correction_line.delta_quantity;
    if v_orig.quantity is distinct from v_expected_quantity then
      raise exception 'inventory_count_reversal_movement_quantity_mismatch'
        using hint = 'Correction movement quantity does not match stored delta.';
    end if;

    if not (v_correction_line.movement_id = any (v_source_ids)) then
      v_source_ids := array_append(v_source_ids, v_correction_line.movement_id);
    end if;
  end loop;

  v_source_movement_count := coalesce(cardinality(v_source_ids), 0);

  -- 4) Lock participating stock items + balances in ascending order (deadlock avoidance).
  for v_item_id in
    select distinct m.item_id
    from public.stock_movements m
    where m.id = any (v_source_ids)
    order by m.item_id
  loop
    perform 1
    from public.stock_items si
    where si.id = v_item_id
      and si.workspace_id = p_workspace_id
    for update of si;

    if not found then
      raise exception 'inventory_count_reversal_stock_item_missing'
        using hint = 'A stock item referenced by a reversal movement was not found.';
    end if;

    perform 1
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id
    for update of b;
  end loop;

  -- 5) Insert reversal audit header FIRST (before stock mutations).
  insert into public.inventory_count_reversals (
    workspace_id,
    session_id,
    reason,
    note,
    created_by,
    created_at
  )
  values (
    p_workspace_id,
    p_session_id,
    v_reason,
    v_note,
    v_auth_user_id,
    v_now
  )
  returning id into v_reversal_id;

  if v_reversal_id is null then
    raise exception 'inventory_count_reversal_audit_failed'
      using hint = 'Unable to create reversal audit header.';
  end if;

  -- 6–8) Process validated source movements in deterministic order; compensate; write lines.
  for v_orig in
    select m.*
    from public.stock_movements m
    where m.id = any (v_source_ids)
    order by m.created_at asc, m.id asc
  loop
    v_item_id := v_orig.item_id;
    v_reversal_quantity := -v_orig.quantity;
    v_reversal_movement_id := null;
    v_source_storage_id := null;
    v_dest_storage_id := null;
    v_source_location_key := null;
    v_dest_location_key := null;

    -- Resolve location from original movement (P8.29.8). Legacy null keys → item primary.
    v_workspace_storage_id := coalesce(
      v_orig.destination_workspace_storage_id,
      v_orig.source_workspace_storage_id
    );
    v_location_key := coalesce(
      v_orig.destination_location_key,
      v_orig.source_location_key
    );

    if v_location_key is null then
      select si.storage_location
        into v_primary_location
      from public.stock_items si
      where si.id = v_item_id
        and si.workspace_id = p_workspace_id;

      v_location_key := v_primary_location;
    end if;

    if v_location_key is null then
      raise exception 'inventory_count_reversal_balance_missing'
        using hint = 'Unable to resolve location for reversal movement.';
    end if;

    select b.id, b.quantity, b.workspace_storage_id, b.location_key
      into v_balance_id, v_locked_qty, v_workspace_storage_id, v_location_key
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id
      and b.location_key = v_location_key
    for update of b;

    if not found then
      raise exception 'inventory_count_reversal_balance_missing'
        using hint = 'A location balance referenced by a reversal was not found.';
    end if;

    v_next_qty := v_locked_qty + v_reversal_quantity;

    if v_next_qty < 0 then
      raise exception 'inventory_count_reversal_negative_balance_rejected'
        using hint = 'Reversal would make the location balance negative.';
    end if;

    if v_reversal_quantity > 0 then
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
      v_reversal_quantity,
      format(
        'Inventory count reversal session %s of movement %s reversal %s',
        p_session_id,
        v_orig.id,
        v_reversal_id
      ),
      v_auth_user_id,
      v_source_storage_id,
      v_dest_storage_id,
      v_source_location_key,
      v_dest_location_key,
      'inventory_count_reversal',
      p_session_id
    )
    returning id into v_reversal_movement_id;

    if v_reversal_movement_id is null then
      raise exception 'inventory_count_reversal_movement_failed'
        using hint = 'Unable to create compensating reversal adjustment.';
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
      raise exception 'inventory_count_reversal_quantity_update_failed'
        using hint = 'Live location balance changed while reversing. Retry.';
    end if;

    select coalesce(sum(b.quantity), 0)::numeric(12, 3)
    into v_aggregate_sum
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id;

    if v_aggregate_sum < 0 then
      raise exception 'inventory_count_reversal_aggregate_drift';
    end if;

    update public.stock_items si
    set current_quantity = v_aggregate_sum
    where si.id = v_item_id
      and si.workspace_id = p_workspace_id;

    get diagnostics v_row_count = row_count;
    if v_row_count is distinct from 1 then
      raise exception 'inventory_count_reversal_quantity_update_failed'
        using hint = 'Unable to refresh stock aggregate after reversal.';
    end if;

    insert into public.inventory_count_reversal_lines (
      reversal_id,
      workspace_id,
      session_id,
      item_id,
      original_movement_id,
      reversal_movement_id,
      original_quantity,
      reversal_quantity,
      created_at
    )
    values (
      v_reversal_id,
      p_workspace_id,
      p_session_id,
      v_item_id,
      v_orig.id,
      v_reversal_movement_id,
      v_orig.quantity,
      v_reversal_quantity,
      v_now
    );

    v_reversal_movement_count := v_reversal_movement_count + 1;
    v_line_count := v_line_count + 1;

    v_movements := v_movements || jsonb_build_array(
      jsonb_build_object(
        'original_movement_id', v_orig.id,
        'reversal_movement_id', v_reversal_movement_id,
        'item_id', v_item_id,
        'original_quantity', v_orig.quantity,
        'reversal_quantity', v_reversal_quantity
      )
    );
  end loop;

  if v_reversal_movement_count is distinct from v_source_movement_count then
    raise exception 'inventory_count_reversal_movement_count_mismatch'
      using hint = 'Reversal movement count does not match source movement count.';
  end if;

  -- 9) Session metadata LAST (status remains posted).
  update public.inventory_count_sessions s
  set
    reversed_at = v_now,
    reversed_by = v_auth_user_id,
    reversal_reason = v_reason,
    updated_at = v_now
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
    and s.status = 'posted'
    and s.reversed_at is null;

  get diagnostics v_row_count = row_count;
  if v_row_count is distinct from 1 then
    raise exception 'inventory_count_reversal_session_finalize_failed'
      using hint = 'Unable to finalize session reversal metadata.';
  end if;

  return jsonb_build_object(
    'reversal_id', v_reversal_id,
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'status', 'posted',
    'reversed_at', v_now,
    'reversed_by', v_auth_user_id,
    'reason', v_reason,
    'note', v_note,
    'source_movement_count', v_source_movement_count,
    'reversal_movement_count', v_reversal_movement_count,
    'line_count', v_line_count,
    'movements', v_movements,
    'preserved', jsonb_build_object(
      'session_status_unchanged', true,
      'session_items_unchanged', true,
      'original_posted_movements_unchanged', true,
      'original_correction_movements_unchanged', true
    ),
    'message', 'Inventory count reversed successfully.'
  );
end;
$$;

revoke all on function public.reverse_inventory_count_session(uuid, uuid, text, text) from public;
grant execute on function public.reverse_inventory_count_session(uuid, uuid, text, text) to authenticated;

comment on function public.reverse_inventory_count_session(uuid, uuid, text, text) is
  'P8.22.6/P8.22.6a Atomic SECURITY DEFINER posted inventory count reversal. Validates required post/correction movements before writes; compensating adjustments + audit; reversed_* last; status remains posted.';

-- =============================================================================
-- Errors:
--   unauthenticated           → inventory_count_reversal_unauthenticated
--   forbidden                 → inventory_count_reversal_forbidden
--   workspace required        → inventory_count_reversal_workspace_required
--   session required          → inventory_count_reversal_session_required
--   reason required           → inventory_count_reversal_reason_required
--   session not found         → inventory_count_reversal_session_not_found
--   workspace mismatch        → inventory_count_reversal_workspace_mismatch
--   not posted                → inventory_count_reversal_not_posted
--   already reversed          → inventory_count_reversal_already_reversed
--   movement missing          → inventory_count_reversal_movement_missing
--   movement workspace        → inventory_count_reversal_movement_workspace_mismatch
--   movement item             → inventory_count_reversal_movement_item_mismatch
--   movement quantity         → inventory_count_reversal_movement_quantity_mismatch
--   stock item missing        → inventory_count_reversal_stock_item_missing
--   qty update failed         → inventory_count_reversal_quantity_update_failed
--   movement failed           → inventory_count_reversal_movement_failed
--   audit failed              → inventory_count_reversal_audit_failed
--   count mismatch            → inventory_count_reversal_movement_count_mismatch
--   finalize failed           → inventory_count_reversal_session_finalize_failed
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.reverse_inventory_count_session(uuid, uuid, text, text);

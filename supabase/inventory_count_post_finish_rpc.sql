-- =============================================================================
-- P8.5.2 / P8.5.3 — Post Inventory Count Finish RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_snapshot_at_hardening.sql (P8.3.9c)
--   4. inventory_count_posted_by_foundation.sql (P8.5.2a)
--   5. inventory_count_reconcile_finish.sql (P8.5.1)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER posting transaction. Locks session + location
--   balances, reconciles via public.reconcile_inventory_count_finish (Strategy 4),
--   then applies location-aware adjustment movements, balance updates, item
--   aggregate cache refresh, line audit, and session finalization in one
--   transaction (P8.29.8).
--
-- Does NOT:
--   - Implement its own Strategy 4 formulas
--   - Use stock_count absolute-set movements
--   - Accept client quantities / reconciliation payloads
--   - Enable Confirm Finish Count / wire frontend
--   - Overwrite whole-item quantity except via SUM(balances) cache refresh
--
-- Idempotency (current signature: workspace + session only):
--   At-most-once per session via FOR UPDATE + reject if already posted.
--   On success sets post_idempotency_key = 'inventory_count_post:' || session_id
--   (deterministic; unique partial index). No client key argument yet.
--   Retry after success → inventory_count_post_already_posted.
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.post_inventory_count_finish(uuid, uuid);

create or replace function public.post_inventory_count_finish(
  p_workspace_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_reconcile jsonb;
  v_can_post boolean := false;
  v_blocker_count integer := 0;
  v_summary jsonb := '{}'::jsonb;
  v_blocking_issues jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_session_item_id uuid;
  v_item_id uuid;
  v_expected_at_count numeric(12, 3);
  v_variance_quantity numeric(12, 3);
  v_current_live_quantity numeric(12, 3);
  v_resulting_quantity_after_post numeric(12, 3);
  v_locked_qty numeric(12, 3);
  v_movement_id uuid;
  v_row_count integer := 0;
  v_counted_line_count integer := 0;
  v_adjusted_line_count integer := 0;
  v_zero_variance_line_count integer := 0;
  v_movement_count integer := 0;
  v_total_positive_variance numeric(12, 3) := 0;
  v_total_negative_variance numeric(12, 3) := 0;
  v_posted_at timestamptz;
  v_idempotency_key text;
  v_seen_line_keys text[] := array[]::text[];
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
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_post_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_post_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_post_session_required';
  end if;

  -- Authorization
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_post_forbidden';
  end if;

  -- STEP 1: Lock session FOR UPDATE
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
      raise exception 'inventory_count_post_workspace_mismatch';
    end if;

    raise exception 'inventory_count_post_session_not_found';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_post_workspace_mismatch';
  end if;

  -- Reject cancelled
  if v_session.status = 'cancelled'
     or v_session.cancelled_at is not null then
    raise exception 'inventory_count_post_session_cancelled';
  end if;

  -- Reject already posted (at-most-once)
  if v_session.status = 'posted'
     or v_session.posted_at is not null
     or v_session.posted_by is not null then
    raise exception 'inventory_count_post_already_posted';
  end if;

  -- Require counting_complete
  if v_session.status is distinct from 'counting_complete' then
    raise exception 'inventory_count_post_session_not_complete';
  end if;

  -- Require authoritative snapshot boundary
  if v_session.snapshot_at is null then
    raise exception 'inventory_count_post_snapshot_missing';
  end if;

  -- STEP 2: Idempotency — session-scoped at-most-once (signature has no client key).
  -- Deterministic key assigned only on successful finalization below.
  v_idempotency_key := 'inventory_count_post:' || p_session_id::text;

  -- STEP 3+4: Lock participating location balances (and parent items) in
  -- deterministic (item_id, location_key) order for deadlock avoidance.
  for v_item_id, v_storage_location in
    select distinct i.item_id, i.storage_location
    from public.inventory_count_session_items i
    where i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
      and i.line_status = 'counted'
      and i.counted_quantity is not null
      and i.item_id is not null
    order by i.item_id, i.storage_location
  loop
    perform 1
    from public.stock_items si
    where si.id = v_item_id
      and si.workspace_id = p_workspace_id
    for update of si;

    if not found then
      raise exception 'inventory_count_post_stock_item_missing';
    end if;

    perform 1
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id
      and b.location_key = v_storage_location
    for update of b;

    if not found then
      raise exception 'inventory_count_post_balance_missing';
    end if;
  end loop;

  -- STEP 5: Reconcile under lock (authoritative Strategy 4)
  begin
    v_reconcile := public.reconcile_inventory_count_finish(p_workspace_id, p_session_id);
  exception
    when others then
      if sqlerrm like '%inventory_count_reconcile_snapshot_missing%' then
        raise exception 'inventory_count_post_snapshot_missing';
      end if;
      raise;
  end;

  v_can_post := coalesce((v_reconcile ->> 'can_post')::boolean, false);
  v_summary := coalesce(v_reconcile -> 'summary', '{}'::jsonb);
  v_blocking_issues := coalesce(v_reconcile -> 'blocking_issues', '[]'::jsonb);
  v_lines := coalesce(v_reconcile -> 'lines', '[]'::jsonb);
  v_blocker_count := coalesce(
    (v_summary ->> 'blocking_issue_count')::integer,
    jsonb_array_length(v_blocking_issues),
    0
  );

  if not v_can_post
     or v_blocker_count > 0
     or jsonb_array_length(v_blocking_issues) > 0 then
    raise exception 'inventory_count_post_blocked';
  end if;

  v_counted_line_count := jsonb_array_length(v_lines);

  if v_counted_line_count is distinct from coalesce((v_summary ->> 'counted_lines')::integer, v_counted_line_count) then
    raise exception 'inventory_count_post_line_count_mismatch';
  end if;

  -- Apply each authoritative reconciled counted line
  for v_line in
    select value
    from jsonb_array_elements(v_lines) as t(value)
    order by (t.value ->> 'item_id')::uuid, (t.value ->> 'storage_location'), (t.value ->> 'session_item_id')::uuid
  loop
    v_session_item_id := nullif(v_line ->> 'session_item_id', '')::uuid;
    v_item_id := nullif(v_line ->> 'item_id', '')::uuid;
    v_storage_location := nullif(v_line ->> 'storage_location', '');
    v_expected_at_count := nullif(v_line ->> 'expected_at_count', '')::numeric;
    v_variance_quantity := nullif(v_line ->> 'variance_quantity', '')::numeric;
    v_current_live_quantity := nullif(v_line ->> 'current_live_quantity', '')::numeric;
    v_resulting_quantity_after_post := nullif(v_line ->> 'resulting_quantity_after_post', '')::numeric;
    v_movement_id := null;
    v_source_storage_id := null;
    v_dest_storage_id := null;
    v_source_location_key := null;
    v_dest_location_key := null;

    if v_session_item_id is null
       or v_item_id is null
       or v_storage_location is null
       or v_expected_at_count is null
       or v_variance_quantity is null
       or v_current_live_quantity is null
       or v_resulting_quantity_after_post is null then
      raise exception 'inventory_count_post_invalid_line';
    end if;

    -- Allow same product at multiple locations; reject duplicate line keys.
    if (v_item_id::text || chr(1) || v_storage_location) = any (v_seen_line_keys) then
      raise exception 'inventory_count_post_duplicate_item';
    end if;
    v_seen_line_keys := array_append(
      v_seen_line_keys,
      v_item_id::text || chr(1) || v_storage_location
    );

    -- Stale-state safety: locked location balance must match reconciliation
    select b.id, b.quantity, b.workspace_storage_id, b.location_key
    into v_balance_id, v_locked_qty, v_workspace_storage_id, v_location_key
    from public.stock_item_location_balances b
    where b.workspace_id = p_workspace_id
      and b.stock_item_id = v_item_id
      and b.location_key = v_storage_location;

    if not found then
      raise exception 'inventory_count_post_balance_missing';
    end if;

    if v_locked_qty is distinct from v_current_live_quantity then
      raise exception 'inventory_count_post_live_quantity_mismatch';
    end if;

    if v_resulting_quantity_after_post < 0 then
      raise exception 'inventory_count_post_negative_balance_rejected';
    end if;

    if v_variance_quantity <> 0 then
      -- Defensive equality: result must equal live + variance (Strategy 4).
      if v_resulting_quantity_after_post is distinct from (v_current_live_quantity + v_variance_quantity) then
        raise exception 'inventory_count_post_result_mismatch';
      end if;

      if v_variance_quantity > 0 then
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
        v_variance_quantity,
        format('Inventory count post session %s line %s', p_session_id, v_session_item_id),
        v_auth_user_id,
        v_source_storage_id,
        v_dest_storage_id,
        v_source_location_key,
        v_dest_location_key,
        'inventory_count_post',
        p_session_id
      )
      returning id into v_movement_id;

      if v_movement_id is null then
        raise exception 'inventory_count_post_movement_failed';
      end if;

      -- Update ONLY the affected location balance (not whole-item overwrite).
      update public.stock_item_location_balances b
      set
        quantity = v_resulting_quantity_after_post,
        quantity_version = b.quantity_version + 1,
        updated_by = v_auth_user_id
      where b.id = v_balance_id
        and b.workspace_id = p_workspace_id
        and b.quantity is not distinct from v_current_live_quantity;

      get diagnostics v_row_count = row_count;
      if v_row_count is distinct from 1 then
        raise exception 'inventory_count_post_quantity_update_failed';
      end if;

      -- Refresh cached aggregate from SUM(location balances).
      select coalesce(sum(b.quantity), 0)::numeric(12, 3)
      into v_aggregate_sum
      from public.stock_item_location_balances b
      where b.workspace_id = p_workspace_id
        and b.stock_item_id = v_item_id;

      if v_aggregate_sum < 0 then
        raise exception 'inventory_count_post_aggregate_drift';
      end if;

      update public.stock_items si
      set current_quantity = v_aggregate_sum
      where si.id = v_item_id
        and si.workspace_id = p_workspace_id;

      get diagnostics v_row_count = row_count;
      if v_row_count is distinct from 1 then
        raise exception 'inventory_count_post_quantity_update_failed';
      end if;

      v_adjusted_line_count := v_adjusted_line_count + 1;
      v_movement_count := v_movement_count + 1;

      if v_variance_quantity > 0 then
        v_total_positive_variance := v_total_positive_variance + v_variance_quantity;
      else
        v_total_negative_variance := v_total_negative_variance + v_variance_quantity;
      end if;
    else
      v_zero_variance_line_count := v_zero_variance_line_count + 1;
    end if;

    -- Line audit persistence (immutable snapshot fields untouched)
    update public.inventory_count_session_items i
    set
      expected_at_count = v_expected_at_count,
      variance_quantity = v_variance_quantity,
      live_quantity_at_post = v_current_live_quantity,
      posted_movement_id = v_movement_id,
      updated_at = now()
    where i.id = v_session_item_id
      and i.session_id = p_session_id
      and i.workspace_id = p_workspace_id
      and i.item_id = v_item_id
      and i.storage_location = v_storage_location
      and i.line_status = 'counted';

    get diagnostics v_row_count = row_count;
    if v_row_count is distinct from 1 then
      raise exception 'inventory_count_post_line_audit_failed';
    end if;
  end loop;

  if (v_adjusted_line_count + v_zero_variance_line_count) is distinct from v_counted_line_count then
    raise exception 'inventory_count_post_apply_count_mismatch';
  end if;

  if v_movement_count is distinct from v_adjusted_line_count then
    raise exception 'inventory_count_post_movement_count_mismatch';
  end if;

  -- Session finalization (only after all line mutations succeed)
  v_posted_at := now();

  update public.inventory_count_sessions s
  set
    status = 'posted',
    posted_at = v_posted_at,
    posted_by = v_auth_user_id,
    post_idempotency_key = v_idempotency_key,
    updated_at = v_posted_at
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
    and s.status = 'counting_complete'
    and s.posted_at is null
    and s.posted_by is null;

  get diagnostics v_row_count = row_count;
  if v_row_count is distinct from 1 then
    raise exception 'inventory_count_post_session_finalize_failed';
  end if;

  return jsonb_build_object(
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'status', 'posted',
    'posted_at', v_posted_at,
    'posted_by', v_auth_user_id,
    'can_post', true,
    'posting_enabled', true,
    'counted_line_count', v_counted_line_count,
    'adjusted_line_count', v_adjusted_line_count,
    'zero_variance_line_count', v_zero_variance_line_count,
    'movement_count', v_movement_count,
    'total_positive_variance', v_total_positive_variance,
    'total_negative_variance', v_total_negative_variance,
    'reconciliation_summary', v_summary,
    'message', 'Inventory count posted successfully.'
  );
end;
$$;

revoke all on function public.post_inventory_count_finish(uuid, uuid) from public;
grant execute on function public.post_inventory_count_finish(uuid, uuid) to authenticated;

comment on function public.post_inventory_count_finish(uuid, uuid) is
  'P8.5.3/P8.29.8 Atomic SECURITY DEFINER inventory count post. Locks session/balances, reconciles via Strategy 4, applies location-aware adjustment movements + balance qty + SUM cache, finalizes posted. Snapshot history immutable.';

-- =============================================================================
-- Errors:
--   unauthenticated           → inventory_count_post_unauthenticated
--   forbidden                 → inventory_count_post_forbidden
--   workspace required        → inventory_count_post_workspace_required
--   session required          → inventory_count_post_session_required
--   session not found         → inventory_count_post_session_not_found
--   workspace mismatch        → inventory_count_post_workspace_mismatch
--   cancelled                 → inventory_count_post_session_cancelled
--   already posted            → inventory_count_post_already_posted
--   not complete              → inventory_count_post_session_not_complete
--   snapshot missing          → inventory_count_post_snapshot_missing
--   blockers present          → inventory_count_post_blocked
--   invalid / mismatch        → inventory_count_post_*_mismatch / invalid_line / ...
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.post_inventory_count_finish(uuid, uuid);

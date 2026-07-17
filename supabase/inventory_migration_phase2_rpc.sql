-- =============================================================================
-- P7.8.13 — Inventory Migration Phase 2 stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql / session_steps / activity / step_results
--   2. inventory_migration_start_session_rpc.sql
--   3. inventory_migration_phase1_rpc.sql (prior stage; not modified)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `phase2`:
--     authorize → lock session/steps → waiting→running → P7.4.10b quantity apply
--     → persist step result → running→completed → activity note
--
-- Writes ONLY:
--   public.stock_items.current_quantity
--   public.inventory_stock_item_map.migrated_at
--
-- Does NOT:
--   - INSERT / UPDATE / DELETE stock_movements
--   - change map.status / stock_item_id / resolution_type
--   - recreate Phase 1 movements
--   - execute post_apply_audit
--   - Call the generic state-only step transition RPC
--
-- Safety interlock (preserved from P7.4.10b):
--   p_confirm_maintenance_window must be true or the RPC refuses with no writes.
--   This is not a force/overwrite flag; it is the maintenance-window confirmation.
--
-- Prerequisites: foundation → phase1 completed.
-- P7.9.5 attention gate (phase1 → phase2):
--   If phase1 result_status = attention_required, require acknowledgement
--   for next_step_name = phase2. passed needs no ack.
-- Idempotency (step): reject if already completed / result exists.
-- Idempotency (apply): migrated_at IS NULL gate under map row lock.
-- Lock order (do not change): map → movement → stock item.
-- =============================================================================

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
        s.current_quantity
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

      -- 6) Calculate new quantity (no silent clamp)
      if v_mov.type = 'receive' then
        v_new_qty := coalesce(v_stock.current_quantity, 0) + v_mov.quantity;
      else
        v_new_qty := coalesce(v_stock.current_quantity, 0) - v_mov.quantity;
        if v_new_qty < 0 then
          v_negative_result_blocked := v_negative_result_blocked + 1;
          v_total_blocked := v_total_blocked + 1;
          continue;
        end if;
      end if;

      -- 7) Atomic writes: quantity + migrated_at (same exception block)
      update public.stock_items s
      set current_quantity = v_new_qty
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
  'P7.8.13 stage-owned Phase 2: locks session/step, applies INITIAL_IMPORT movement deltas to stock current_quantity and sets map.migrated_at. Requires p_confirm_maintenance_window=true. Does not mutate stock_movements.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_phase2(uuid,uuid,boolean)'::regprocedure
-- );

-- Example (refuses when confirmation is false):
--   select * from public.run_inventory_migration_phase2(
--     '<workspace_uuid>',
--     '<session_uuid>',
--     false
--   );
--
-- Example (maintenance window confirmed):
--   select * from public.run_inventory_migration_phase2(
--     '<workspace_uuid>',
--     '<session_uuid>',
--     true
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_phase2(uuid, uuid, boolean);

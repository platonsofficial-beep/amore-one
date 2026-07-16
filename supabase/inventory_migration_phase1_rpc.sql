-- =============================================================================
-- P7.8.12 — Inventory Migration Phase 1 stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_activity.sql
--   4. inventory_migration_step_results.sql (P7.8.5)
--   5. inventory_migration_start_session_rpc.sql (bootstrap steps)
--   6. prior stage RPCs through preview (not modified here)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `phase1`:
--     authorize → lock session/steps → waiting→running → P7.4.9 Phase 1
--     movement creation → persist step result → running→completed → activity
--
-- Business writes ONLY:
--   public.stock_movements  (ledger; IN→receive, OUT→usage)
--   note = 'INITIAL_IMPORT|map_id=<inventory_stock_item_map.id>'
--
-- Does NOT:
--   - UPDATE stock_items.current_quantity
--   - UPDATE inventory_stock_item_map
--   - Execute Phase 2 / post_apply_audit
--   - Call the generic state-only step transition RPC
--
-- Prerequisites: foundation → preview completed (result_status not required).
-- Idempotency (step): reject if already completed / result exists.
-- Idempotency (movements): deterministic note; second run prevents duplicates.
-- Per-row unexpected errors counted via subtransaction (P7.4.9).
-- =============================================================================

drop function if exists public.run_inventory_migration_phase1(uuid, uuid);

create or replace function public.run_inventory_migration_phase1(
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
  v_stock record;
  v_snapshot_qty numeric;
  v_mapped_unit text;
  v_mapped_category text;
  v_delta numeric;
  v_note text;
  v_type text;
  v_dup_peers bigint;
  v_already boolean;

  v_eligible bigint := 0;
  v_inserted_in bigint := 0;
  v_inserted_out bigint := 0;
  v_skipped_unchanged bigint := 0;
  v_duplicate_prevented bigint := 0;
  v_blocked bigint := 0;
  v_errors bigint := 0;
  v_planned_qty numeric := 0;

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
    raise exception 'inventory_migration_phase1_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_phase1_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_phase1_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_phase1_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_phase1_forbidden';
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
    raise exception 'inventory_migration_phase1_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_phase1_session_not_running';
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
    and st.step_name = 'phase1';

  if not found then
    raise exception 'inventory_migration_phase1_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_phase1_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_phase1_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_phase1_invalid_step_state';
  end if;

  -- Prerequisites: foundation → preview completed (result_status not required).
  select exists (
    select 1
    from unnest(array[
      'foundation',
      'persist',
      'auto_link',
      'auto_create',
      'integrity_audit',
      'preflight',
      'preview'
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
    raise exception 'inventory_migration_phase1_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'phase1'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_phase1_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- P7.4.9 Phase 1 movement creation (workspace-scoped; meanings preserved)
  -- ---------------------------------------------------------------------------

  select count(*)::bigint into v_eligible
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked');

  for cand in
    select m.id as map_id
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
      and m.status in ('created', 'linked')
    order by m.legacy_inventory_item_id, m.id
  loop
    begin
      -- Lock map row (read + serialize); never UPDATE the map in this phase
      select
        m.id,
        m.workspace_id,
        m.legacy_inventory_item_id,
        m.stock_item_id,
        m.status,
        m.resolution_type,
        m.source_snapshot
      into locked
      from public.inventory_stock_item_map m
      where m.id = cand.map_id
      for update;

      if not found then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      if locked.status not in ('created', 'linked') then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Idempotency: one INITIAL_IMPORT per map row (deterministic note)
      v_note := 'INITIAL_IMPORT|map_id=' || locked.id::text;
      select exists (
        select 1
        from public.stock_movements sm
        where sm.note = v_note
      ) into v_already;

      if v_already then
        v_duplicate_prevented := v_duplicate_prevented + 1;
        continue;
      end if;

      -- Re-validate stock reference (A/B/C)
      if locked.stock_item_id is null then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      select
        s.id,
        s.workspace_id,
        s.active,
        coalesce(s.current_quantity, 0)::numeric as current_qty
      into v_stock
      from public.stock_items s
      where s.id = locked.stock_item_id;

      if not found then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      if v_stock.workspace_id is distinct from locked.workspace_id then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      if v_stock.active is distinct from true then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Snapshot + quantity (D/E/F)
      if locked.source_snapshot is null
         or locked.source_snapshot = '{}'::jsonb then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      v_snapshot_qty := case
        when jsonb_typeof(locked.source_snapshot -> 'quantity') = 'number'
          then (locked.source_snapshot ->> 'quantity')::numeric
        when jsonb_typeof(locked.source_snapshot -> 'quantity') = 'string'
          and trim(locked.source_snapshot ->> 'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then trim(locked.source_snapshot ->> 'quantity')::numeric
        else null
      end;

      if v_snapshot_qty is null or v_snapshot_qty < 0 then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Unit / category after normalization (G/H) — same rules as P7.4.7
      v_mapped_category := case trim(coalesce(locked.source_snapshot ->> 'category', ''))
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
        when '' then null
        else null
      end;

      v_mapped_unit := case trim(coalesce(locked.source_snapshot ->> 'unit', ''))
        when 'Bottle 0.7L' then 'Bottle 700ml'
        when 'Bottle 1L' then 'Bottle 1L'
        when 'Case 6' then 'Case 6 bottles'
        when 'Case 12' then 'Case 12 bottles'
        when 'Liter' then 'Litre'
        when 'Litre' then 'Litre'
        when 'Kg' then 'Kg'
        when 'Gram' then 'Gram'
        when 'Piece' then 'Piece'
        when 'Box' then 'Box'
        when 'Pack' then 'Pack'
        when 'Keg' then 'Keg'
        when 'Bottle' then 'Bottle'
        when 'Case' then 'Case'
        when 'Bottle 700ml' then 'Bottle 700ml'
        when 'Bottle 750ml' then 'Bottle 750ml'
        when 'Bottle 1.5L' then null
        when 'Bag' then trim(coalesce(locked.source_snapshot ->> 'unit', ''))
        when '' then null
        else nullif(trim(coalesce(locked.source_snapshot ->> 'unit', '')), '')
      end;

      if v_mapped_unit is null or trim(v_mapped_unit) = ''
         or v_mapped_category is null or trim(v_mapped_category) = '' then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Duplicate stock_item among other created/linked peers (I)
      select count(*)::bigint into v_dup_peers
      from public.inventory_stock_item_map m2
      where m2.stock_item_id = locked.stock_item_id
        and m2.status in ('created', 'linked')
        and m2.id is distinct from locked.id;

      if v_dup_peers > 0 then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Delta
      v_delta := v_snapshot_qty - v_stock.current_qty;

      if v_delta = 0 then
        v_skipped_unchanged := v_skipped_unchanged + 1;
        continue;
      end if;

      if v_delta > 0 then
        v_type := 'receive';  -- IN
      else
        v_type := 'usage';    -- OUT
      end if;

      -- Movement creation ONLY — no stock quantity / map updates
      insert into public.stock_movements (
        workspace_id,
        item_id,
        type,
        quantity,
        note,
        created_by
      ) values (
        locked.workspace_id,
        locked.stock_item_id,
        v_type,
        abs(v_delta),
        v_note,
        null
      );

      v_planned_qty := v_planned_qty + abs(v_delta);

      if v_delta > 0 then
        v_inserted_in := v_inserted_in + 1;
      else
        v_inserted_out := v_inserted_out + 1;
      end if;

    exception
      when others then
        v_errors := v_errors + 1;
        -- subtransaction rolls back orphan movement insert for this row
    end;
  end loop;

  v_critical_count := v_errors;
  v_attention_count := v_blocked + v_errors;
  v_total_findings := v_attention_count;

  if v_attention_count > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'phase1_version', 1,
    'groups', jsonb_build_array(
      jsonb_build_object(
        'key', 'eligible',
        'label', 'Eligible created/linked rows',
        'count', v_eligible,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'inserted_in',
        'label', 'Inserted IN movements (receive)',
        'count', v_inserted_in,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'inserted_out',
        'label', 'Inserted OUT movements (usage)',
        'count', v_inserted_out,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'skipped_unchanged',
        'label', 'Skipped unchanged (delta 0)',
        'count', v_skipped_unchanged,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'duplicate_prevented',
        'label', 'Duplicate prevented (already applied)',
        'count', v_duplicate_prevented,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'blocked',
        'label', 'Blocked rows',
        'count', v_blocked,
        'requires_attention', v_blocked > 0
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
      'applied_rows', v_inserted_in + v_inserted_out,
      'skipped_rows', v_skipped_unchanged,
      'already_applied_rows', v_duplicate_prevented,
      'attention_rows', v_attention_count,
      'error_rows', v_errors,
      'total_planned_movement_quantity', v_planned_qty
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
    'phase1',
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
    'Phase 1 completed: %s (result_id=%s, in=%s, out=%s, blocked=%s, dup=%s).',
    v_result_status,
    v_result_id,
    v_inserted_in,
    v_inserted_out,
    v_blocked,
    v_duplicate_prevented
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

revoke all on function public.run_inventory_migration_phase1(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_phase1(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_phase1(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_phase1(uuid, uuid) is
  'P7.8.12 stage-owned Phase 1: locks session/step, inserts INITIAL_IMPORT stock_movements for eligible created/linked rows. No stock quantity or map updates. No Phase 2.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_phase1(uuid,uuid)'::regprocedure
-- );

-- Example:
--   select * from public.run_inventory_migration_phase1(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_phase1(uuid, uuid);

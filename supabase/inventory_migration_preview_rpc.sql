-- =============================================================================
-- P7.8.8 — Inventory Migration Preview stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_activity.sql
--   4. inventory_migration_step_results.sql (P7.8.5)
--   5. inventory_migration_start_session_rpc.sql (bootstrap steps)
--   6. inventory_migration_preflight_rpc.sql (prior stage; not modified)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `preview`:
--     authorize → lock session/steps → waiting→running → workspace-scoped
--     movement preview (P7.4.8) → persist step result → running→completed
--     → activity note → return outcome
--
-- Business data (map / stock / inventory / movements): READ-ONLY.
-- Writes only: session_steps lifecycle, step_results, activity.
--
-- Does NOT:
--   - Call the generic state-only step transition RPC
--   - Accept caller-supplied metrics / result_status / evidence
--   - Mutate inventory_stock_item_map / stock_items / stock_movements
--   - Persist row-level preview dumps (summary evidence only)
--   - Execute phase1 / phase2
--   - Change UI, services, or other stage RPCs
--
-- Idempotency:
--   If preview is already completed or a result row exists → reject.
--   Retry after a committed result requires a new migration session.
--
-- Metrics:
--   Preserve P7.4.8 meanings from inventory_movement_preview.sql,
--   scoped to p_workspace_id for map/stock queries.
-- =============================================================================

drop function if exists public.run_inventory_migration_preview(uuid, uuid);

create or replace function public.run_inventory_migration_preview(
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

  v_eligible bigint := 0;
  v_blocked bigint := 0;
  v_skipped bigint := 0;
  v_in bigint := 0;
  v_out bigint := 0;
  v_unchanged bigint := 0;
  v_planned_qty numeric := 0;
  v_candidate_rows bigint := 0;

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
    raise exception 'inventory_migration_preview_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_preview_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_preview_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_preview_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_preview_forbidden';
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
    raise exception 'inventory_migration_preview_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_preview_session_not_running';
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
    and st.step_name = 'preview';

  if not found then
    raise exception 'inventory_migration_preview_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_preview_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_preview_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_preview_invalid_step_state';
  end if;

  -- Prerequisites: foundation → preflight must be completed
  -- (same predecessor set as the generic state-only transition rule for preview).
  -- Result status of prior stages is not required (attention_required is allowed).
  select exists (
    select 1
    from unnest(array[
      'foundation',
      'persist',
      'auto_link',
      'auto_create',
      'integrity_audit',
      'preflight'
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
    raise exception 'inventory_migration_preview_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'preview'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_preview_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- Workspace-scoped movement preview metrics (P7.4.8 meanings preserved)
  -- ---------------------------------------------------------------------------
  with candidates as (
    select
      m.id as map_id,
      m.workspace_id,
      m.legacy_inventory_item_id,
      m.stock_item_id,
      m.status,
      m.resolution_type,
      m.source_snapshot,
      s.id as stock_row_id,
      s.workspace_id as stock_workspace_id,
      s.active as stock_active,
      s.name as stock_name,
      coalesce(s.current_quantity, 0)::numeric as current_qty
    from public.inventory_stock_item_map m
    left join public.stock_items s on s.id = m.stock_item_id
    where m.status in ('created', 'linked')
      and m.workspace_id = p_workspace_id
  ),
  normalized as (
    select
      c.*,
      case
        when c.source_snapshot is null then null
        when jsonb_typeof(c.source_snapshot -> 'quantity') = 'number'
          then (c.source_snapshot ->> 'quantity')::numeric
        when jsonb_typeof(c.source_snapshot -> 'quantity') = 'string'
          and trim(c.source_snapshot ->> 'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then trim(c.source_snapshot ->> 'quantity')::numeric
        else null
      end as snapshot_qty,
      case trim(coalesce(c.source_snapshot ->> 'category', ''))
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
      end as mapped_category,
      case trim(coalesce(c.source_snapshot ->> 'unit', ''))
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
        when 'Bag' then trim(coalesce(c.source_snapshot ->> 'unit', ''))
        when '' then null
        else nullif(trim(coalesce(c.source_snapshot ->> 'unit', '')), '')
      end as mapped_unit
    from candidates c
  ),
  flags as (
    select
      n.*,
      (n.stock_item_id is not null and n.stock_row_id is not null) as ok_stock_exists,
      (
        n.stock_row_id is not null
        and n.stock_workspace_id is not distinct from n.workspace_id
      ) as ok_same_workspace,
      (n.stock_active is true) as ok_active,
      (
        n.source_snapshot is not null
        and n.source_snapshot <> '{}'::jsonb
      ) as ok_snapshot,
      (n.snapshot_qty is not null) as ok_numeric_qty,
      (n.snapshot_qty is not null and n.snapshot_qty >= 0) as ok_non_negative_qty,
      (n.mapped_unit is not null and trim(n.mapped_unit) <> '') as ok_unit,
      (n.mapped_category is not null and trim(n.mapped_category) <> '') as ok_category
    from normalized n
  ),
  base as (
    select
      f.*,
      (
        f.ok_stock_exists
        and f.ok_same_workspace
        and f.ok_active
        and f.ok_snapshot
        and f.ok_numeric_qty
        and f.ok_non_negative_qty
        and f.ok_unit
        and f.ok_category
      ) as base_eligible
    from flags f
  ),
  dup_stock as (
    select stock_item_id
    from base
    where base_eligible
      and stock_item_id is not null
    group by stock_item_id
    having count(*) > 1
  ),
  scored as (
    select
      b.*,
      (b.base_eligible and d.stock_item_id is not null) as has_duplicate_stock_ref,
      (b.base_eligible and d.stock_item_id is null) as fully_eligible
    from base b
    left join dup_stock d on d.stock_item_id = b.stock_item_id
  ),
  preview as (
    select
      s.*,
      (s.snapshot_qty - s.current_qty) as qty_delta,
      case
        when not s.fully_eligible then null
        when (s.snapshot_qty - s.current_qty) > 0 then 'IN'
        when (s.snapshot_qty - s.current_qty) < 0 then 'OUT'
        else 'UNCHANGED'
      end as movement_direction,
      case
        when not s.fully_eligible then null
        else abs(s.snapshot_qty - s.current_qty)
      end as planned_movement_qty,
      case
        when not s.fully_eligible then 'INVALID'
        when (s.snapshot_qty - s.current_qty) = 0 then 'NO_CHANGE'
        else 'INITIAL_IMPORT'
      end as reason,
      case
        when not s.fully_eligible then 'BLOCKED'
        when (s.snapshot_qty - s.current_qty) = 0 then 'SKIPPED'
        else 'ELIGIBLE'
      end as migration_status
    from scored s
  )
  select
    count(*) filter (
      where fully_eligible and migration_status = 'ELIGIBLE'
    )::bigint,
    count(*) filter (where migration_status = 'BLOCKED')::bigint,
    count(*) filter (
      where fully_eligible and migration_status = 'SKIPPED'
    )::bigint,
    count(*) filter (
      where fully_eligible and movement_direction = 'IN'
    )::bigint,
    count(*) filter (
      where fully_eligible and movement_direction = 'OUT'
    )::bigint,
    count(*) filter (
      where fully_eligible and movement_direction = 'UNCHANGED'
    )::bigint,
    coalesce(
      sum(planned_movement_qty) filter (
        where fully_eligible and movement_direction in ('IN', 'OUT')
      ),
      0
    ),
    count(*)::bigint
  into
    v_eligible,
    v_blocked,
    v_skipped,
    v_in,
    v_out,
    v_unchanged,
    v_planned_qty,
    v_candidate_rows
  from preview;

  -- Script always completes with NOTICE; findings do not abort the stage.
  -- Blocked rows require operator attention before treating preview as clean.
  -- Expected IN/OUT/skipped actionable rows are not failures.
  v_critical_count := v_blocked;
  v_attention_count := v_blocked;
  v_total_findings := v_blocked;

  if v_blocked > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'preview_version', 1,
    'groups', jsonb_build_array(
      jsonb_build_object(
        'key', 'eligible_rows',
        'label', 'Eligible movement rows (IN/OUT)',
        'count', v_eligible,
        'requires_attention', false,
        'severity', 'informational'
      ),
      jsonb_build_object(
        'key', 'blocked_rows',
        'label', 'Blocked rows (not fully eligible)',
        'count', v_blocked,
        'requires_attention', v_blocked > 0,
        'severity', 'attention'
      ),
      jsonb_build_object(
        'key', 'skipped_rows',
        'label', 'Skipped rows (no quantity change)',
        'count', v_skipped,
        'requires_attention', false,
        'severity', 'informational'
      ),
      jsonb_build_object(
        'key', 'in_movements',
        'label', 'Planned IN movements',
        'count', v_in,
        'requires_attention', false,
        'severity', 'informational'
      ),
      jsonb_build_object(
        'key', 'out_movements',
        'label', 'Planned OUT movements',
        'count', v_out,
        'requires_attention', false,
        'severity', 'informational'
      ),
      jsonb_build_object(
        'key', 'unchanged_rows',
        'label', 'Unchanged eligible rows',
        'count', v_unchanged,
        'requires_attention', false,
        'severity', 'informational'
      ),
      jsonb_build_object(
        'key', 'total_planned_movement_quantity',
        'label', 'Total planned movement quantity',
        'count', 0,
        'planned_quantity', v_planned_qty,
        'requires_attention', false,
        'severity', 'informational'
      )
    ),
    'totals', jsonb_build_object(
      'candidate_rows', v_candidate_rows,
      'ready_rows', v_eligible,
      'attention_rows', v_blocked,
      'blocking_rows', v_blocked,
      'skipped_rows', v_skipped,
      'in_movements', v_in,
      'out_movements', v_out,
      'unchanged_rows', v_unchanged,
      'total_planned_movement_quantity', v_planned_qty
    )
  );

  v_executed_at := now();

  -- running → completed (preserve started_at)
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
    'preview',
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
    'Preview completed: %s (result_id=%s, eligible=%s, blocked=%s, out=%s, planned_qty=%s).',
    v_result_status,
    v_result_id,
    v_eligible,
    v_blocked,
    v_out,
    v_planned_qty
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

revoke all on function public.run_inventory_migration_preview(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_preview(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_preview(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_preview(uuid, uuid) is
  'P7.8.8 stage-owned Preview: locks session/step, runs workspace-scoped P7.4.8 movement preview summary, persists step result, completes step, writes activity note. No map/stock/movement mutation.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_preview(uuid,uuid)'::regprocedure
-- );

-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'run_inventory_migration_preview';

-- Example:
--   select * from public.run_inventory_migration_preview(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_preview(uuid, uuid);

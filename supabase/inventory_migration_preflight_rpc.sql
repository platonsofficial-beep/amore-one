-- =============================================================================
-- P7.8.7 — Inventory Migration Preflight stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_activity.sql
--   4. inventory_migration_step_results.sql (P7.8.5)
--   5. inventory_migration_start_session_rpc.sql (bootstrap steps)
--   6. inventory_migration_integrity_audit_rpc.sql (prior stage; not modified)
--   7. inventory_migration_stage_attention_acknowledgements.sql (P7.9.4; read-only here)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `preflight`:
--     authorize → lock session/steps → waiting→running → workspace-scoped
--     movement preflight (P7.4.7) → persist step result → running→completed
--     → activity note → return outcome
--
-- Business data (map / stock / inventory / movements): READ-ONLY.
-- Writes only: session_steps lifecycle, step_results, activity.
--
-- P7.9.5 attention gate (integrity_audit → preflight):
--   If integrity_audit result_status = attention_required, require an
--   acknowledgement for next_step_name = preflight. passed needs no ack.
--
-- Does NOT:
--   - Call transition_inventory_migration_step
--   - Accept caller-supplied metrics / result_status / evidence
--   - Mutate inventory_stock_item_map / stock_items / stock_movements
--   - Execute preview / phase1 / phase2
--   - Change UI, services, or other stage RPCs
--   - Create acknowledgements
--
-- Idempotency:
--   If preflight is already completed or a result row exists → reject.
--   Retry after a committed result requires a new migration session.
--
-- Metrics:
--   Preserve P7.4.7 meanings from inventory_movement_preflight.sql,
--   scoped to p_workspace_id for map/stock queries.
-- =============================================================================

drop function if exists public.run_inventory_migration_preflight(uuid, uuid);

create or replace function public.run_inventory_migration_preflight(
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
  v_prior_result_id uuid := null;
  v_prior_result_status text := null;
  v_ack_exists boolean := false;

  v_total bigint := 0;
  v_missing_stock bigint := 0;
  v_orphan_stock bigint := 0;
  v_cross_workspace bigint := 0;
  v_inactive bigint := 0;
  v_no_snapshot bigint := 0;
  v_non_numeric_qty bigint := 0;
  v_negative_qty bigint := 0;
  v_bad_unit bigint := 0;
  v_bad_category bigint := 0;
  v_dup_stock bigint := 0;
  v_base_ok bigint := 0;
  v_eligible bigint := 0;
  v_ineligible bigint := 0;
  v_missing_stock_ref_total bigint := 0;
  v_created_count bigint := 0;
  v_linked_count bigint := 0;
  v_resolution_dist_count bigint := 0;
  v_coverage_pct numeric := 0;

  v_result_status text;
  v_critical_count bigint := 0;
  v_attention_count bigint := 0;
  v_total_findings bigint := 0;
  v_blocking_checks integer := 0;
  v_warning_checks integer := 0;
  v_passed_checks integer := 0;
  v_result_summary jsonb;
  v_result_id uuid;
  v_executed_at timestamptz;
  v_activity_text text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_preflight_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_preflight_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_preflight_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_preflight_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_preflight_forbidden';
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
    raise exception 'inventory_migration_preflight_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_preflight_session_not_running';
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
    and st.step_name = 'preflight';

  if not found then
    raise exception 'inventory_migration_preflight_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_preflight_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_preflight_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_preflight_invalid_step_state';
  end if;

  -- Prerequisites: foundation → integrity_audit must be completed
  -- (same predecessor set as the generic state-only transition rule for preflight).
  select exists (
    select 1
    from unnest(array[
      'foundation',
      'persist',
      'auto_link',
      'auto_create',
      'integrity_audit'
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
    raise exception 'inventory_migration_preflight_prerequisite_incomplete';
  end if;

  -- P7.9.5: integrity_audit attention_required requires acknowledgement for preflight.
  select r.id, r.result_status
  into v_prior_result_id, v_prior_result_status
  from public.inventory_migration_step_results r
  where r.session_id = p_session_id
    and r.workspace_id = p_workspace_id
    and r.step_name = 'integrity_audit'
  limit 1;

  if v_prior_result_id is null then
    raise exception 'inventory_migration_preflight_prior_result_missing';
  end if;

  if v_prior_result_status = 'attention_required' then
    select exists (
      select 1
      from public.inventory_migration_stage_attention_acknowledgements a
      where a.prior_result_id = v_prior_result_id
        and a.next_step_name = 'preflight'
        and a.session_id = p_session_id
        and a.workspace_id = p_workspace_id
    )
    into v_ack_exists;

    if not v_ack_exists then
      raise exception 'inventory_migration_preflight_attention_acknowledgement_required';
    end if;
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'preflight'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_preflight_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- Workspace-scoped movement preflight metrics (P7.4.7 meanings preserved)
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
      s.active as stock_active
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
  with_dups as (
    select
      b.*,
      (b.base_eligible and d.stock_item_id is not null) as has_duplicate_stock_ref
    from base b
    left join dup_stock d on d.stock_item_id = b.stock_item_id
  ),
  scored as (
    select
      d.*,
      (d.base_eligible and not d.has_duplicate_stock_ref) as fully_eligible
    from with_dups d
  )
  select
    count(*)::bigint,
    count(*) filter (where stock_item_id is null)::bigint,
    count(*) filter (
      where stock_item_id is not null and stock_row_id is null
    )::bigint,
    count(*) filter (where not ok_same_workspace and ok_stock_exists)::bigint,
    count(*) filter (where ok_stock_exists and not ok_active)::bigint,
    count(*) filter (where not ok_snapshot)::bigint,
    count(*) filter (where ok_snapshot and not ok_numeric_qty)::bigint,
    count(*) filter (
      where ok_numeric_qty and not ok_non_negative_qty
    )::bigint,
    count(*) filter (where not ok_unit)::bigint,
    count(*) filter (where not ok_category)::bigint,
    count(*) filter (where has_duplicate_stock_ref)::bigint,
    count(*) filter (where base_eligible)::bigint,
    count(*) filter (where fully_eligible)::bigint,
    count(*) filter (where not fully_eligible)::bigint
  into
    v_total,
    v_missing_stock,
    v_orphan_stock,
    v_cross_workspace,
    v_inactive,
    v_no_snapshot,
    v_non_numeric_qty,
    v_negative_qty,
    v_bad_unit,
    v_bad_category,
    v_dup_stock,
    v_base_ok,
    v_eligible,
    v_ineligible
  from scored;

  v_missing_stock_ref_total := v_missing_stock + v_orphan_stock;

  select count(*) filter (where m.status = 'created')::bigint,
         count(*) filter (where m.status = 'linked')::bigint
  into v_created_count, v_linked_count
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked');

  select count(*)::bigint
  into v_resolution_dist_count
  from (
    select m.resolution_type
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
      and m.status in ('created', 'linked')
    group by m.resolution_type
  ) r;

  if v_total = 0 then
    v_coverage_pct := 0;
  else
    v_coverage_pct := round((v_eligible::numeric / v_total::numeric) * 100, 2);
  end if;

  -- Blocking readiness = cannot_safely_migrate_quantity (K / ineligible).
  -- Script always completes with NOTICE; findings do not abort the stage.
  v_critical_count := v_ineligible;
  v_attention_count := v_ineligible;
  v_total_findings := v_ineligible;

  if v_ineligible > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_blocking_checks :=
    (case when v_missing_stock > 0 then 1 else 0 end)
    + (case when v_orphan_stock > 0 then 1 else 0 end)
    + (case when v_cross_workspace > 0 then 1 else 0 end)
    + (case when v_inactive > 0 then 1 else 0 end)
    + (case when v_no_snapshot > 0 then 1 else 0 end)
    + (case when v_non_numeric_qty > 0 then 1 else 0 end)
    + (case when v_negative_qty > 0 then 1 else 0 end)
    + (case when v_bad_unit > 0 then 1 else 0 end)
    + (case when v_bad_category > 0 then 1 else 0 end)
    + (case when v_dup_stock > 0 then 1 else 0 end)
    + (case when v_missing_stock_ref_total > 0 then 1 else 0 end)
    + (case when v_ineligible > 0 then 1 else 0 end);

  v_warning_checks := 0;
  v_passed_checks := 16 - v_blocking_checks;

  v_result_summary := jsonb_build_object(
    'preflight_version', 1,
    'checks', jsonb_build_array(
      jsonb_build_object(
        'id', 'A1',
        'key', 'missing_or_null_stock_item_id',
        'label', 'Missing or null stock_item_id',
        'severity', 'blocking',
        'count', v_missing_stock,
        'passed', v_missing_stock = 0
      ),
      jsonb_build_object(
        'id', 'A2',
        'key', 'orphan_stock_item_id',
        'label', 'Orphan stock_item_id',
        'severity', 'blocking',
        'count', v_orphan_stock,
        'passed', v_orphan_stock = 0
      ),
      jsonb_build_object(
        'id', 'B',
        'key', 'cross_workspace',
        'label', 'Cross-workspace map/stock references',
        'severity', 'blocking',
        'count', v_cross_workspace,
        'passed', v_cross_workspace = 0
      ),
      jsonb_build_object(
        'id', 'C',
        'key', 'inactive_stock',
        'label', 'Inactive stock items',
        'severity', 'blocking',
        'count', v_inactive,
        'passed', v_inactive = 0
      ),
      jsonb_build_object(
        'id', 'D',
        'key', 'missing_or_empty_source_snapshot',
        'label', 'Missing or empty source_snapshot',
        'severity', 'blocking',
        'count', v_no_snapshot,
        'passed', v_no_snapshot = 0
      ),
      jsonb_build_object(
        'id', 'E',
        'key', 'non_numeric_or_missing_quantity',
        'label', 'Non-numeric or missing snapshot quantity',
        'severity', 'blocking',
        'count', v_non_numeric_qty,
        'passed', v_non_numeric_qty = 0
      ),
      jsonb_build_object(
        'id', 'F',
        'key', 'negative_quantity',
        'label', 'Negative snapshot quantity',
        'severity', 'blocking',
        'count', v_negative_qty,
        'passed', v_negative_qty = 0
      ),
      jsonb_build_object(
        'id', 'G',
        'key', 'unit_missing_after_normalization',
        'label', 'Unit missing after normalization',
        'severity', 'blocking',
        'count', v_bad_unit,
        'passed', v_bad_unit = 0
      ),
      jsonb_build_object(
        'id', 'H',
        'key', 'category_missing_after_normalization',
        'label', 'Category missing after normalization',
        'severity', 'blocking',
        'count', v_bad_category,
        'passed', v_bad_category = 0
      ),
      jsonb_build_object(
        'id', 'I',
        'key', 'duplicate_stock_ref_among_base_eligible',
        'label', 'Duplicate stock_item_id among base-eligible',
        'severity', 'blocking',
        'count', v_dup_stock,
        'passed', v_dup_stock = 0
      ),
      jsonb_build_object(
        'id', 'J',
        'key', 'missing_stock_reference_total',
        'label', 'Missing stock reference total',
        'severity', 'blocking',
        'count', v_missing_stock_ref_total,
        'passed', v_missing_stock_ref_total = 0
      ),
      jsonb_build_object(
        'id', 'K',
        'key', 'cannot_safely_migrate_quantity',
        'label', 'Cannot safely migrate quantity (ineligible)',
        'severity', 'blocking',
        'count', v_ineligible,
        'passed', v_ineligible = 0
      ),
      jsonb_build_object(
        'id', 'L',
        'key', 'fully_eligible',
        'label', 'Fully eligible rows',
        'severity', 'informational',
        'count', v_eligible,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'M',
        'key', 'coverage',
        'label', 'Eligible coverage of created/linked',
        'severity', 'informational',
        'count', v_eligible,
        'passed', true,
        'created_linked_total', v_total,
        'coverage_pct', v_coverage_pct,
        'base_checks_passed_before_dup_gate', v_base_ok
      ),
      jsonb_build_object(
        'id', 'N',
        'key', 'status_distribution',
        'label', 'Status distribution (created/linked)',
        'severity', 'informational',
        'count', v_total,
        'passed', true,
        'created', v_created_count,
        'linked', v_linked_count
      ),
      jsonb_build_object(
        'id', 'O',
        'key', 'resolution_type_distribution',
        'label', 'Resolution type distribution group count',
        'severity', 'informational',
        'count', v_resolution_dist_count,
        'passed', true
      )
    ),
    'totals', jsonb_build_object(
      'check_count', 16,
      'passed_checks', v_passed_checks,
      'warning_checks', v_warning_checks,
      'blocking_checks', v_blocking_checks,
      'warning_findings', 0,
      'blocking_findings', v_ineligible,
      'created_linked_total', v_total,
      'fully_eligible', v_eligible,
      'ineligible', v_ineligible
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
    'preflight',
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
    'Preflight completed: %s (result_id=%s, eligible=%s, ineligible=%s, total_findings=%s).',
    v_result_status,
    v_result_id,
    v_eligible,
    v_ineligible,
    v_total_findings
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

revoke all on function public.run_inventory_migration_preflight(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_preflight(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_preflight(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_preflight(uuid, uuid) is
  'P7.8.7 stage-owned Preflight: locks session/step, runs workspace-scoped P7.4.7 movement readiness checks, persists step result, completes step, writes activity note. No map/stock/movement mutation.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_preflight(uuid,uuid)'::regprocedure
-- );

-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'run_inventory_migration_preflight';

-- Example:
--   select * from public.run_inventory_migration_preflight(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_preflight(uuid, uuid);

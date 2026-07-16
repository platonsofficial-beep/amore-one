-- =============================================================================
-- P7.8.6 — Inventory Migration Integrity Audit stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_activity.sql
--   4. inventory_migration_step_results.sql (P7.8.5)
--   5. inventory_migration_start_session_rpc.sql (bootstrap steps)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for integrity_audit:
--     authorize → lock session/steps → waiting→running → workspace-scoped audit
--     → persist step result → running→completed → activity note → return outcome
--
-- Business data (map / stock / inventory / movements): READ-ONLY.
-- Writes only: session_steps lifecycle, step_results, activity.
--
-- Does NOT:
--   - Call transition_inventory_migration_step
--   - Accept caller-supplied metrics / result_status / evidence
--   - Mutate inventory_stock_item_map / stock_items / stock_movements
--   - Change UI, services, or other stage RPCs
--
-- Idempotency:
--   If integrity_audit is already completed or a result row exists → reject.
--   Retry after a committed result requires a new migration session.
--
-- Metrics:
--   Categories A–R preserve P7.4.6 meanings from inventory_stock_integrity_audit.sql,
--   scoped to p_workspace_id for map/stock queries. Category Q legacy_total remains
--   global count(inventory_items) because inventory_items has no workspace_id.
-- =============================================================================

drop function if exists public.run_inventory_migration_integrity_audit(uuid, uuid);

create or replace function public.run_inventory_migration_integrity_audit(
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

  v_dup_map_keys bigint := 0;
  v_dup_stock_refs bigint := 0;
  v_created_null_stock bigint := 0;
  v_linked_null_stock bigint := 0;
  v_orphan_refs bigint := 0;
  v_cross_workspace bigint := 0;
  v_invalid_status bigint := 0;
  v_invalid_resolution bigint := 0;
  v_classified_auto_create bigint := 0;
  v_classified_auto_link bigint := 0;
  v_manual bigint := 0;
  v_skipped bigint := 0;
  v_created_inactive bigint := 0;
  v_empty_snapshot bigint := 0;
  v_map_total bigint := 0;
  v_legacy_total bigint := 0;
  v_stock_coverage bigint := 0;
  v_created_total bigint := 0;
  v_linked_total bigint := 0;
  v_coverage_gap bigint := 0;
  v_status_dist_count bigint := 0;
  v_resolution_dist_count bigint := 0;

  v_result_status text;
  v_critical_count bigint := 0;
  v_attention_count bigint := 0;
  v_total_findings bigint := 0;
  v_passed_categories integer := 0;
  v_attention_categories integer := 0;
  v_result_summary jsonb;
  v_result_id uuid;
  v_executed_at timestamptz;
  v_activity_text text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_integrity_audit_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_integrity_audit_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_integrity_audit_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_integrity_audit_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_integrity_audit_forbidden';
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
    raise exception 'inventory_migration_integrity_audit_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_integrity_audit_session_not_running';
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
    and st.step_name = 'integrity_audit';

  if not found then
    raise exception 'inventory_migration_integrity_audit_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_integrity_audit_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_integrity_audit_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_integrity_audit_invalid_step_state';
  end if;

  -- Prerequisites: foundation → auto_create must be completed.
  select exists (
    select 1
    from unnest(array[
      'foundation',
      'persist',
      'auto_link',
      'auto_create'
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
    raise exception 'inventory_migration_integrity_audit_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'integrity_audit'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_integrity_audit_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- Workspace-scoped Integrity Audit metrics (P7.4.6 category meanings preserved)
  -- ---------------------------------------------------------------------------

  -- A) Duplicate migration-map keys (extra rows)
  select coalesce(sum(n - 1), 0)::bigint into v_dup_map_keys
  from (
    select count(*)::bigint as n
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
    group by m.workspace_id, m.legacy_inventory_item_id
    having count(*) > 1
  ) d;

  -- B) Duplicate stock_item_id references within workspace map
  select coalesce(sum(n - 1), 0)::bigint into v_dup_stock_refs
  from (
    select count(*)::bigint as n
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
      and m.stock_item_id is not null
    group by m.stock_item_id
    having count(*) > 1
  ) d;

  -- C) Created with NULL stock_item_id
  select count(*)::bigint into v_created_null_stock
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'created'
    and m.stock_item_id is null;

  -- D) Linked with NULL stock_item_id
  select count(*)::bigint into v_linked_null_stock
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'linked'
    and m.stock_item_id is null;

  -- E) Orphan stock references
  select count(*)::bigint into v_orphan_refs
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.stock_item_id is not null
    and not exists (
      select 1 from public.stock_items s where s.id = m.stock_item_id
    );

  -- F) Cross-workspace references (map in workspace → stock elsewhere)
  select count(*)::bigint into v_cross_workspace
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = p_workspace_id
    and s.workspace_id is distinct from m.workspace_id;

  -- G) Invalid status
  select count(*)::bigint into v_invalid_status
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and (
      m.status is null
      or m.status not in (
        'pending', 'classified', 'created', 'linked', 'manual', 'skipped', 'failed'
      )
    );

  -- H) Invalid resolution_type
  select count(*)::bigint into v_invalid_resolution
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.resolution_type is not null
    and m.resolution_type not in (
      'auto_create', 'auto_link', 'manual_link', 'manual_create', 'skip'
    );

  -- I) Classified auto_create remaining
  select count(*)::bigint into v_classified_auto_create
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_create';

  -- J) Classified auto_link remaining
  select count(*)::bigint into v_classified_auto_link
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_link';

  -- K) Manual rows (informational)
  select count(*)::bigint into v_manual
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'manual';

  -- L) Skipped rows (informational)
  select count(*)::bigint into v_skipped
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'skipped';

  -- M) Created inactive stock items
  select count(*)::bigint into v_created_inactive
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = p_workspace_id
    and m.status = 'created'
    and m.resolution_type = 'auto_create'
    and s.active is distinct from true;

  -- N) Empty source_snapshot
  select count(*)::bigint into v_empty_snapshot
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and (
      m.source_snapshot is null
      or m.source_snapshot = '{}'::jsonb
    );

  select count(*)::bigint into v_map_total
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id;

  -- Q) Legacy catalog is global (inventory_items has no workspace_id).
  select count(*)::bigint into v_legacy_total
  from public.inventory_items;

  select count(*)::bigint into v_created_total
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'created';

  select count(*)::bigint into v_linked_total
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'linked';

  v_stock_coverage := v_created_total + v_linked_total;
  v_coverage_gap := greatest(v_legacy_total - v_map_total, 0);

  select count(*)::bigint into v_status_dist_count
  from (
    select m.status
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
    group by m.status
  ) s;

  select count(*)::bigint into v_resolution_dist_count
  from (
    select m.resolution_type
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
    group by m.resolution_type
  ) r;

  -- Critical (runbook): A–F (+ G/H/M as integrity attention). Pipeline attention: I/J/N/Q.
  v_critical_count :=
    v_dup_map_keys
    + v_dup_stock_refs
    + v_created_null_stock
    + v_linked_null_stock
    + v_orphan_refs
    + v_cross_workspace
    + v_invalid_status
    + v_invalid_resolution
    + v_created_inactive;

  v_attention_count :=
    v_critical_count
    + v_classified_auto_create
    + v_classified_auto_link
    + v_empty_snapshot
    + v_coverage_gap;

  v_total_findings := v_attention_count;

  if v_attention_count > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_attention_categories :=
    (case when v_dup_map_keys > 0 then 1 else 0 end)
    + (case when v_dup_stock_refs > 0 then 1 else 0 end)
    + (case when v_created_null_stock > 0 then 1 else 0 end)
    + (case when v_linked_null_stock > 0 then 1 else 0 end)
    + (case when v_orphan_refs > 0 then 1 else 0 end)
    + (case when v_cross_workspace > 0 then 1 else 0 end)
    + (case when v_invalid_status > 0 then 1 else 0 end)
    + (case when v_invalid_resolution > 0 then 1 else 0 end)
    + (case when v_classified_auto_create > 0 then 1 else 0 end)
    + (case when v_classified_auto_link > 0 then 1 else 0 end)
    + (case when v_created_inactive > 0 then 1 else 0 end)
    + (case when v_empty_snapshot > 0 then 1 else 0 end)
    + (case when v_coverage_gap > 0 then 1 else 0 end);

  v_passed_categories := 18 - v_attention_categories;

  v_result_summary := jsonb_build_object(
    'audit_version', 1,
    'categories', jsonb_build_array(
      jsonb_build_object(
        'id', 'A',
        'key', 'duplicate_map_key_extra_rows',
        'label', 'Duplicate map key extra rows',
        'severity', 'attention',
        'count', v_dup_map_keys,
        'passed', v_dup_map_keys = 0
      ),
      jsonb_build_object(
        'id', 'B',
        'key', 'duplicate_stock_item_id_extra_rows',
        'label', 'Duplicate stock_item_id extra rows',
        'severity', 'attention',
        'count', v_dup_stock_refs,
        'passed', v_dup_stock_refs = 0
      ),
      jsonb_build_object(
        'id', 'C',
        'key', 'created_with_null_stock_item_id',
        'label', 'Created rows with null stock_item_id',
        'severity', 'attention',
        'count', v_created_null_stock,
        'passed', v_created_null_stock = 0
      ),
      jsonb_build_object(
        'id', 'D',
        'key', 'linked_with_null_stock_item_id',
        'label', 'Linked rows with null stock_item_id',
        'severity', 'attention',
        'count', v_linked_null_stock,
        'passed', v_linked_null_stock = 0
      ),
      jsonb_build_object(
        'id', 'E',
        'key', 'orphan_stock_item_references',
        'label', 'Orphan stock_item references',
        'severity', 'attention',
        'count', v_orphan_refs,
        'passed', v_orphan_refs = 0
      ),
      jsonb_build_object(
        'id', 'F',
        'key', 'cross_workspace_references',
        'label', 'Cross-workspace map/stock references',
        'severity', 'attention',
        'count', v_cross_workspace,
        'passed', v_cross_workspace = 0
      ),
      jsonb_build_object(
        'id', 'G',
        'key', 'invalid_status_rows',
        'label', 'Invalid status rows',
        'severity', 'attention',
        'count', v_invalid_status,
        'passed', v_invalid_status = 0
      ),
      jsonb_build_object(
        'id', 'H',
        'key', 'invalid_resolution_type_rows',
        'label', 'Invalid resolution_type rows',
        'severity', 'attention',
        'count', v_invalid_resolution,
        'passed', v_invalid_resolution = 0
      ),
      jsonb_build_object(
        'id', 'I',
        'key', 'classified_auto_create',
        'label', 'Remaining classified auto_create rows',
        'severity', 'attention',
        'count', v_classified_auto_create,
        'passed', v_classified_auto_create = 0
      ),
      jsonb_build_object(
        'id', 'J',
        'key', 'classified_auto_link',
        'label', 'Remaining classified auto_link rows',
        'severity', 'attention',
        'count', v_classified_auto_link,
        'passed', v_classified_auto_link = 0
      ),
      jsonb_build_object(
        'id', 'K',
        'key', 'manual_rows',
        'label', 'Manual rows',
        'severity', 'informational',
        'count', v_manual,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'L',
        'key', 'skipped_rows',
        'label', 'Skipped rows',
        'severity', 'informational',
        'count', v_skipped,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'M',
        'key', 'created_inactive_stock_items',
        'label', 'Created inactive stock items',
        'severity', 'attention',
        'count', v_created_inactive,
        'passed', v_created_inactive = 0
      ),
      jsonb_build_object(
        'id', 'N',
        'key', 'null_or_empty_source_snapshot',
        'label', 'Null or empty source_snapshot',
        'severity', 'attention',
        'count', v_empty_snapshot,
        'passed', v_empty_snapshot = 0
      ),
      jsonb_build_object(
        'id', 'O',
        'key', 'status_distribution',
        'label', 'Status distribution group count',
        'severity', 'informational',
        'count', v_status_dist_count,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'P',
        'key', 'resolution_type_distribution',
        'label', 'Resolution type distribution group count',
        'severity', 'informational',
        'count', v_resolution_dist_count,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'Q',
        'key', 'coverage_gap',
        'label', 'Legacy vs map coverage gap',
        'severity', 'attention',
        'count', v_coverage_gap,
        'passed', v_coverage_gap = 0,
        'legacy_total', v_legacy_total,
        'map_total', v_map_total
      ),
      jsonb_build_object(
        'id', 'R',
        'key', 'stock_coverage_created_plus_linked',
        'label', 'Stock coverage (created + linked)',
        'severity', 'informational',
        'count', v_stock_coverage,
        'passed', true,
        'created', v_created_total,
        'linked', v_linked_total
      )
    ),
    'totals', jsonb_build_object(
      'category_count', 18,
      'passed_categories', v_passed_categories,
      'attention_categories', v_attention_categories,
      'total_findings', v_total_findings,
      'critical_finding_count', v_critical_count,
      'attention_finding_count', v_attention_count
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
    'integrity_audit',
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
    'Integrity audit completed: %s (result_id=%s, critical=%s, attention=%s, total_findings=%s).',
    v_result_status,
    v_result_id,
    v_critical_count,
    v_attention_count,
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

revoke all on function public.run_inventory_migration_integrity_audit(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_integrity_audit(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_integrity_audit(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_integrity_audit(uuid, uuid) is
  'P7.8.6 stage-owned Integrity Audit: locks session/step, runs workspace-scoped A–R metrics, persists step result, completes step, writes activity note. No map/stock mutation.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_integrity_audit(uuid,uuid)'::regprocedure
-- );

-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'run_inventory_migration_integrity_audit';

-- Example:
--   select * from public.run_inventory_migration_integrity_audit(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_integrity_audit(uuid, uuid);

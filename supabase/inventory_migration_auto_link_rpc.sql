-- =============================================================================
-- P7.8.10 — Inventory Migration Auto Link stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_activity.sql
--   4. inventory_migration_step_results.sql (P7.8.5)
--   5. inventory_migration_start_session_rpc.sql (bootstrap steps)
--   6. inventory_migration_persist_rpc.sql (prior stage; not modified)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `auto_link`:
--     authorize → lock session/steps → waiting→running → P7.4.4a status
--     finalization → persist step result → running→completed → activity note
--
-- Business writes: ONLY inventory_stock_item_map.status
--   classified + auto_link → linked
--   ONLY when stock_item_id is already set and valid in the same workspace.
--
-- Does NOT:
--   - Resolve / match / write stock_item_id
--   - Write migrated_at / snapshots / hashes / resolution_type
--   - Create/update stock_items
--   - Create stock_movements
--   - Execute auto_create / phase1 / phase2
--   - Call the generic state-only step transition RPC
--
-- Prerequisites: foundation + persist completed.
-- Idempotency (step): reject if already completed / result exists.
-- Idempotency (map): already-linked rows are not selected; second run links 0.
-- =============================================================================

drop function if exists public.run_inventory_migration_auto_link(uuid, uuid);

create or replace function public.run_inventory_migration_auto_link(
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

  v_linked bigint := 0;
  v_already_linked bigint := 0;
  v_null_stock_id bigint := 0;
  v_missing_stock bigint := 0;
  v_workspace_mismatch bigint := 0;
  v_skipped bigint := 0;
  v_errors bigint := 0;
  v_eligible_classified bigint := 0;

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
    raise exception 'inventory_migration_auto_link_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_auto_link_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_auto_link_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_auto_link_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_auto_link_forbidden';
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
    raise exception 'inventory_migration_auto_link_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_auto_link_session_not_running';
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
    and st.step_name = 'auto_link';

  if not found then
    raise exception 'inventory_migration_auto_link_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_auto_link_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_auto_link_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_auto_link_invalid_step_state';
  end if;

  -- Prerequisites: foundation + persist completed (early pipeline after persist).
  select exists (
    select 1
    from unnest(array['foundation', 'persist']) as pred(step_name)
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
    raise exception 'inventory_migration_auto_link_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'auto_link'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_auto_link_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- Lock eligible map rows (and matching stock rows) before mutation.
  perform 1
  from public.inventory_stock_item_map m
  left join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_link'
  order by m.id
  for update of m;

  -- ---------------------------------------------------------------------------
  -- P7.4.4a Auto Link status finalization (workspace-scoped; meanings preserved)
  -- ---------------------------------------------------------------------------

  select count(*)::bigint into v_already_linked
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'linked'
    and m.resolution_type = 'auto_link';

  select count(*)::bigint into v_eligible_classified
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_link';

  select count(*)::bigint into v_null_stock_id
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_link'
    and m.stock_item_id is null;

  select count(*)::bigint into v_missing_stock
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_link'
    and m.stock_item_id is not null
    and not exists (
      select 1 from public.stock_items s where s.id = m.stock_item_id
    );

  select count(*)::bigint into v_workspace_mismatch
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = p_workspace_id
    and m.status = 'classified'
    and m.resolution_type = 'auto_link'
    and m.stock_item_id is not null
    and s.workspace_id is distinct from m.workspace_id;

  -- Link ONLY valid persisted references: status column only.
  with linked_rows as (
    update public.inventory_stock_item_map m
    set status = 'linked'
    from public.stock_items s
    where m.workspace_id = p_workspace_id
      and m.status = 'classified'
      and m.resolution_type = 'auto_link'
      and m.stock_item_id is not null
      and s.id = m.stock_item_id
      and s.workspace_id = m.workspace_id
    returning m.id
  )
  select count(*)::bigint into v_linked from linked_rows;

  v_skipped := greatest(v_eligible_classified - v_linked, 0);
  v_errors := 0;

  -- Unresolved classified auto_link rows require attention (null / missing / mismatch).
  v_critical_count := v_missing_stock + v_workspace_mismatch;
  v_attention_count := v_null_stock_id + v_missing_stock + v_workspace_mismatch;
  v_total_findings := v_attention_count;

  if v_attention_count > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'auto_link_version', 1,
    'groups', jsonb_build_array(
      jsonb_build_object(
        'key', 'eligible_classified',
        'label', 'Eligible classified auto_link rows',
        'count', v_eligible_classified,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'successfully_linked',
        'label', 'Successfully linked',
        'count', v_linked,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'already_linked',
        'label', 'Already linked (not eligible)',
        'count', v_already_linked,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'null_stock_item_id',
        'label', 'Null stock_item_id among classified auto_link',
        'count', v_null_stock_id,
        'requires_attention', v_null_stock_id > 0
      ),
      jsonb_build_object(
        'key', 'missing_target_stock_item',
        'label', 'Missing target stock item',
        'count', v_missing_stock,
        'requires_attention', v_missing_stock > 0
      ),
      jsonb_build_object(
        'key', 'workspace_mismatch',
        'label', 'Cross-workspace stock references',
        'count', v_workspace_mismatch,
        'requires_attention', v_workspace_mismatch > 0
      ),
      jsonb_build_object(
        'key', 'skipped_total',
        'label', 'Skipped (not linked this run)',
        'count', v_skipped,
        'requires_attention', false
      ),
      jsonb_build_object(
        'key', 'errors',
        'label', 'Errors',
        'count', v_errors,
        'requires_attention', false
      )
    ),
    'totals', jsonb_build_object(
      'eligible_rows', v_eligible_classified,
      'linked_rows', v_linked,
      'unchanged_already_linked_rows', v_already_linked,
      'attention_rows', v_attention_count,
      'skipped_rows', v_skipped,
      'error_rows', v_errors
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
    'auto_link',
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
    'Auto link completed: %s (result_id=%s, linked=%s, skipped=%s, null_stock=%s, attention=%s).',
    v_result_status,
    v_result_id,
    v_linked,
    v_skipped,
    v_null_stock_id,
    v_attention_count
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

revoke all on function public.run_inventory_migration_auto_link(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_auto_link(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_auto_link(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_auto_link(uuid, uuid) is
  'P7.8.10 stage-owned Auto Link: locks session/step/map rows, finalizes classified+auto_link → linked when stock_item_id already valid in-workspace. Does not write stock_item_id or create stock items.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_auto_link(uuid,uuid)'::regprocedure
-- );

-- Example:
--   select * from public.run_inventory_migration_auto_link(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_auto_link(uuid, uuid);

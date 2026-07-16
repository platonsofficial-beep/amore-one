-- =============================================================================
-- P7.8.14 — Inventory Migration Post-Apply Audit stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql / session_steps / activity / step_results
--   2. inventory_migration_start_session_rpc.sql
--   3. inventory_migration_phase2_rpc.sql (prior stage; not modified)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `post_apply_audit`:
--     authorize → lock session/steps → waiting→running → P7.4.11 read-only audit
--     → persist step result → running→completed → activity note → return summary
--
-- Business data (map / stock / movements): READ-ONLY.
-- Writes only: session_steps lifecycle, step_results, activity.
--
-- Does NOT:
--   - Call transition_inventory_migration_step
--   - Mutate inventory_stock_item_map / stock_items / stock_movements
--   - Repair inconsistencies / execute Phase 1 or Phase 2
--   - Accept caller-supplied metrics / result_status / evidence
--
-- Prerequisites: foundation → phase2 completed (result_status not required).
-- Idempotency: reject if already completed / result exists.
-- Verdict rule preserved from P7.4.11 (A/G alone do not fail).
-- =============================================================================

drop function if exists public.run_inventory_migration_post_apply_audit(uuid, uuid);

create or replace function public.run_inventory_migration_post_apply_audit(
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

  v_a_unapplied bigint := 0;
  v_a_stuck_unapplied bigint := 0;
  v_b_migrated bigint := 0;
  v_c_migrated_null_stock bigint := 0;
  v_d_orphan_stock bigint := 0;
  v_e_cross_workspace bigint := 0;
  v_f_dup_notes bigint := 0;
  v_g_zero_movement bigint := 0;
  v_h_multi_movement bigint := 0;
  v_i_item_mismatch bigint := 0;
  v_j_workspace_mismatch bigint := 0;
  v_k_negative_qty bigint := 0;
  v_l_inactive_migrated bigint := 0;
  v_m_bad_type bigint := 0;
  v_created_linked bigint := 0;
  v_completion_pct numeric := 0;
  v_q_bad_coverage bigint := 0;
  v_status_dist jsonb := '[]'::jsonb;
  v_resolution_dist jsonb := '[]'::jsonb;
  v_status_dist_count bigint := 0;
  v_resolution_dist_count bigint := 0;
  v_attention boolean := false;

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
    raise exception 'inventory_migration_post_apply_audit_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_post_apply_audit_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_post_apply_audit_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_post_apply_audit_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_post_apply_audit_forbidden';
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
    raise exception 'inventory_migration_post_apply_audit_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_post_apply_audit_session_not_running';
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
    and st.step_name = 'post_apply_audit';

  if not found then
    raise exception 'inventory_migration_post_apply_audit_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_post_apply_audit_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_post_apply_audit_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_post_apply_audit_invalid_step_state';
  end if;

  -- Prerequisites: foundation → phase2 completed (result_status not required).
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
      'phase1',
      'phase2'
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
    raise exception 'inventory_migration_post_apply_audit_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'post_apply_audit'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_post_apply_audit_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- ---------------------------------------------------------------------------
  -- P7.4.11 Post-apply audit (workspace-scoped; category meanings preserved)
  -- ---------------------------------------------------------------------------

  select count(*)::bigint into v_created_linked
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked');

  -- A) created/linked with migrated_at IS NULL
  select count(*)::bigint into v_a_unapplied
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and m.migrated_at is null;

  -- A stuck: unapplied but Phase 1 movement exists (should have been applied)
  select count(*)::bigint into v_a_stuck_unapplied
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and m.migrated_at is null
    and (
      select count(*)::bigint
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    ) = 1;

  -- B) created/linked with migrated_at IS NOT NULL
  select count(*)::bigint into v_b_migrated
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and m.migrated_at is not null;

  -- C) migrated rows missing stock_item_id
  select count(*)::bigint into v_c_migrated_null_stock
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.migrated_at is not null
    and m.stock_item_id is null;

  -- D) migrated rows whose stock item no longer exists
  select count(*)::bigint into v_d_orphan_stock
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.migrated_at is not null
    and m.stock_item_id is not null
    and not exists (
      select 1 from public.stock_items s where s.id = m.stock_item_id
    );

  -- E) cross-workspace map ↔ stock
  select count(*)::bigint into v_e_cross_workspace
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and s.workspace_id is distinct from m.workspace_id;

  -- F) duplicate INITIAL_IMPORT notes (workspace-scoped)
  select coalesce(sum(n - 1), 0)::bigint into v_f_dup_notes
  from (
    select count(*)::bigint as n
    from public.stock_movements sm
    where sm.workspace_id = p_workspace_id
      and sm.note like 'INITIAL_IMPORT|map_id=%'
    group by sm.note
    having count(*) > 1
  ) d;

  -- G) created/linked with zero matching INITIAL_IMPORT
  select count(*)::bigint into v_g_zero_movement
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and not exists (
      select 1
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    );

  -- H) created/linked with more than one matching INITIAL_IMPORT
  select count(*)::bigint into v_h_multi_movement
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and (
      select count(*)::bigint
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    ) > 1;

  -- I) movement item mismatch
  select count(*)::bigint into v_i_item_mismatch
  from public.inventory_stock_item_map m
  join public.stock_movements sm
    on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and sm.item_id is distinct from m.stock_item_id;

  -- J) movement workspace mismatch
  select count(*)::bigint into v_j_workspace_mismatch
  from public.inventory_stock_item_map m
  join public.stock_movements sm
    on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked')
    and sm.workspace_id is distinct from m.workspace_id;

  -- K) negative stock quantities (workspace-scoped)
  select count(*)::bigint into v_k_negative_qty
  from public.stock_items s
  where s.workspace_id = p_workspace_id
    and s.current_quantity < 0;

  -- L) inactive stock items that were migrated
  select count(*)::bigint into v_l_inactive_migrated
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = p_workspace_id
    and m.migrated_at is not null
    and s.active is distinct from true;

  -- M) INITIAL_IMPORT movement type not receive/usage (workspace-scoped)
  select count(*)::bigint into v_m_bad_type
  from public.stock_movements sm
  where sm.workspace_id = p_workspace_id
    and sm.note like 'INITIAL_IMPORT|map_id=%'
    and sm.type not in ('receive', 'usage');

  -- N) status distribution
  select coalesce(
    jsonb_agg(
      jsonb_build_object('status', status, 'count', n)
      order by status
    ),
    '[]'::jsonb
  )
  into v_status_dist
  from (
    select m.status, count(*)::bigint as n
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
    group by m.status
  ) s;

  select count(*)::bigint into v_status_dist_count
  from jsonb_array_elements(v_status_dist);

  -- O) resolution_type distribution
  select coalesce(
    jsonb_agg(
      jsonb_build_object('resolution_type', resolution_type, 'count', n)
      order by resolution_type nulls first
    ),
    '[]'::jsonb
  )
  into v_resolution_dist
  from (
    select m.resolution_type, count(*)::bigint as n
    from public.inventory_stock_item_map m
    where m.workspace_id = p_workspace_id
    group by m.resolution_type
  ) r;

  select count(*)::bigint into v_resolution_dist_count
  from jsonb_array_elements(v_resolution_dist);

  -- P) completion percentage
  v_completion_pct := case
    when v_created_linked = 0 then 0
    else round((v_b_migrated::numeric / v_created_linked::numeric) * 100, 2)
  end;

  -- Q) migrated rows without exactly one INITIAL_IMPORT movement
  select count(*)::bigint into v_q_bad_coverage
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.migrated_at is not null
    and (
      select count(*)::bigint
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    ) is distinct from 1;

  -- R) verdict — hard integrity + stuck unapplied (movement exists, not applied)
  -- Note: A/G include Phase 1 delta=0 skips (no movement); those alone do not fail.
  v_attention := (
    v_a_stuck_unapplied > 0
    or v_c_migrated_null_stock > 0
    or v_d_orphan_stock > 0
    or v_e_cross_workspace > 0
    or v_f_dup_notes > 0
    or v_h_multi_movement > 0
    or v_i_item_mismatch > 0
    or v_j_workspace_mismatch > 0
    or v_k_negative_qty > 0
    or v_l_inactive_migrated > 0
    or v_m_bad_type > 0
    or v_q_bad_coverage > 0
  );

  v_attention_count :=
    v_a_stuck_unapplied
    + v_c_migrated_null_stock
    + v_d_orphan_stock
    + v_e_cross_workspace
    + v_f_dup_notes
    + v_h_multi_movement
    + v_i_item_mismatch
    + v_j_workspace_mismatch
    + v_k_negative_qty
    + v_l_inactive_migrated
    + v_m_bad_type
    + v_q_bad_coverage;

  v_critical_count := v_attention_count;
  v_total_findings := v_attention_count;

  if v_attention then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'post_apply_audit_version', 1,
    'categories', jsonb_build_array(
      jsonb_build_object(
        'id', 'A',
        'key', 'unapplied_created_linked',
        'label', 'Unapplied created/linked (migrated_at null)',
        'severity', 'informational',
        'count', v_a_unapplied,
        'stuck_with_movement', v_a_stuck_unapplied,
        'requires_attention', v_a_stuck_unapplied > 0,
        'passed', v_a_stuck_unapplied = 0
      ),
      jsonb_build_object(
        'id', 'B',
        'key', 'migrated_created_linked',
        'label', 'Migrated created/linked (migrated_at set)',
        'severity', 'informational',
        'count', v_b_migrated,
        'requires_attention', false,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'C',
        'key', 'migrated_missing_stock_item_id',
        'label', 'Migrated rows missing stock_item_id',
        'severity', 'attention',
        'count', v_c_migrated_null_stock,
        'requires_attention', v_c_migrated_null_stock > 0,
        'passed', v_c_migrated_null_stock = 0
      ),
      jsonb_build_object(
        'id', 'D',
        'key', 'migrated_orphan_stock_item',
        'label', 'Migrated orphan stock item',
        'severity', 'attention',
        'count', v_d_orphan_stock,
        'requires_attention', v_d_orphan_stock > 0,
        'passed', v_d_orphan_stock = 0
      ),
      jsonb_build_object(
        'id', 'E',
        'key', 'cross_workspace_map_stock',
        'label', 'Cross-workspace map/stock',
        'severity', 'attention',
        'count', v_e_cross_workspace,
        'requires_attention', v_e_cross_workspace > 0,
        'passed', v_e_cross_workspace = 0
      ),
      jsonb_build_object(
        'id', 'F',
        'key', 'duplicate_INITIAL_IMPORT_extra_rows',
        'label', 'Duplicate INITIAL_IMPORT extra rows',
        'severity', 'attention',
        'count', v_f_dup_notes,
        'requires_attention', v_f_dup_notes > 0,
        'passed', v_f_dup_notes = 0
      ),
      jsonb_build_object(
        'id', 'G',
        'key', 'created_linked_zero_INITIAL_IMPORT',
        'label', 'Created/linked with zero INITIAL_IMPORT (may include Phase1 delta=0 skips)',
        'severity', 'informational',
        'count', v_g_zero_movement,
        'requires_attention', false,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'H',
        'key', 'created_linked_multi_INITIAL_IMPORT',
        'label', 'Created/linked with multiple INITIAL_IMPORT',
        'severity', 'attention',
        'count', v_h_multi_movement,
        'requires_attention', v_h_multi_movement > 0,
        'passed', v_h_multi_movement = 0
      ),
      jsonb_build_object(
        'id', 'I',
        'key', 'movement_item_mismatch',
        'label', 'Movement item mismatch',
        'severity', 'attention',
        'count', v_i_item_mismatch,
        'requires_attention', v_i_item_mismatch > 0,
        'passed', v_i_item_mismatch = 0
      ),
      jsonb_build_object(
        'id', 'J',
        'key', 'movement_workspace_mismatch',
        'label', 'Movement workspace mismatch',
        'severity', 'attention',
        'count', v_j_workspace_mismatch,
        'requires_attention', v_j_workspace_mismatch > 0,
        'passed', v_j_workspace_mismatch = 0
      ),
      jsonb_build_object(
        'id', 'K',
        'key', 'negative_stock_quantities',
        'label', 'Negative stock quantities',
        'severity', 'attention',
        'count', v_k_negative_qty,
        'requires_attention', v_k_negative_qty > 0,
        'passed', v_k_negative_qty = 0
      ),
      jsonb_build_object(
        'id', 'L',
        'key', 'inactive_migrated_stock_items',
        'label', 'Inactive migrated stock items',
        'severity', 'attention',
        'count', v_l_inactive_migrated,
        'requires_attention', v_l_inactive_migrated > 0,
        'passed', v_l_inactive_migrated = 0
      ),
      jsonb_build_object(
        'id', 'M',
        'key', 'INITIAL_IMPORT_bad_movement_type',
        'label', 'INITIAL_IMPORT bad movement type',
        'severity', 'attention',
        'count', v_m_bad_type,
        'requires_attention', v_m_bad_type > 0,
        'passed', v_m_bad_type = 0
      ),
      jsonb_build_object(
        'id', 'N',
        'key', 'status_distribution',
        'label', 'Status distribution',
        'severity', 'informational',
        'count', v_status_dist_count,
        'distribution', v_status_dist,
        'requires_attention', false,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'O',
        'key', 'resolution_type_distribution',
        'label', 'Resolution type distribution',
        'severity', 'informational',
        'count', v_resolution_dist_count,
        'distribution', v_resolution_dist,
        'requires_attention', false,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'P',
        'key', 'completion_pct',
        'label', 'Completion percentage',
        'severity', 'informational',
        'count', v_b_migrated,
        'completion_pct', v_completion_pct,
        'created_linked', v_created_linked,
        'requires_attention', false,
        'passed', true
      ),
      jsonb_build_object(
        'id', 'Q',
        'key', 'migrated_without_exactly_one_INITIAL_IMPORT',
        'label', 'Migrated without exactly one INITIAL_IMPORT',
        'severity', 'attention',
        'count', v_q_bad_coverage,
        'requires_attention', v_q_bad_coverage > 0,
        'passed', v_q_bad_coverage = 0
      ),
      jsonb_build_object(
        'id', 'R',
        'key', 'verdict',
        'label', 'Post-apply audit verdict',
        'severity', case when v_attention then 'attention' else 'informational' end,
        'count', v_attention_count,
        'attention_required', v_attention,
        'requires_attention', v_attention,
        'passed', not v_attention
      )
    ),
    'totals', jsonb_build_object(
      'category_count', 18,
      'created_linked', v_created_linked,
      'migrated', v_b_migrated,
      'completion_pct', v_completion_pct,
      'total_findings', v_total_findings,
      'critical_finding_count', v_critical_count,
      'attention_finding_count', v_attention_count
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
    'post_apply_audit',
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
    'Post-apply audit completed: %s (result_id=%s, findings=%s, migrated=%s/%s).',
    v_result_status,
    v_result_id,
    v_attention_count,
    v_b_migrated,
    v_created_linked
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

revoke all on function public.run_inventory_migration_post_apply_audit(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_post_apply_audit(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_post_apply_audit(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_post_apply_audit(uuid, uuid) is
  'P7.8.14 stage-owned post-apply audit: locks session/step, runs read-only P7.4.11 consistency checks, persists immutable evidence. Does not mutate map, stock, or movements.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_post_apply_audit(uuid,uuid)'::regprocedure
-- );

-- Example:
--   select * from public.run_inventory_migration_post_apply_audit(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_post_apply_audit(uuid, uuid);

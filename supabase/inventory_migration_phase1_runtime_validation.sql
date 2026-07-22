-- =============================================================================
-- P8.13.0 — Phase 1 Production Verification (read-only)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
--
-- This file is NOT:
--   - a schema migration
--   - an RPC deployment
--   - Phase 1 execution
--
-- This file IS:
--   - read-only production verification + post–Phase 1 inspection
--   - safe to re-run anytime
--
-- Canonical production Phase 1 path (do NOT use legacy DO-block):
--   Operator Panel → runInventoryMigrationPhase1
--     → public.run_inventory_migration_phase1(p_workspace_id, p_session_id)
--
-- Legacy (DEPRECATED — not production):
--   supabase/inventory_movement_execute_phase1.sql
--
-- OPERATOR WORKFLOW
-- -----------------------------------------------------------------------------
-- 1. Optionally set session id below (leave NULL to auto-pick latest completed phase1).
-- 2. Paste/run this entire file in the SQL Editor.
-- 3. Review NOTICE / result sets.
-- 4. Confirm Part A PASS before relying on Operator Panel Phase 1 in production.
-- =============================================================================

-- Optional override: set to a specific migration session after Phase 1.
-- Leave NULL to resolve the latest session for AMORE.NICOSIA with phase1 completed.
-- \set is not used — edit the constant inside the DO block if needed.

do $p813_phase1_verify$
declare
  -- Set explicitly when inspecting a known session; otherwise leave null.
  v_session_override uuid := null;

  v_workspace_id uuid;
  v_workspace_match_count bigint := 0;
  v_session_id uuid;
  v_session_status text;
  v_step_id uuid;
  v_step_status text;
  v_step_completed_at timestamptz;
  v_result_id uuid;
  v_result_status text;
  v_result_summary jsonb;
  v_result_executed_at timestamptz;

  v_rpc_oid oid;
  v_grant_authenticated boolean := false;
  v_revoke_public boolean := false;
  v_revoke_anon boolean := false;

  v_eligible_map_rows bigint := 0;
  v_initial_import_movements bigint := 0;
  v_eligible_with_movement bigint := 0;
  v_eligible_missing_movement bigint := 0;
  v_eligible_delta_zero_candidates bigint := 0;
  v_duplicate_notes bigint := 0;

  v_summary_eligible bigint;
  v_summary_inserted_in bigint;
  v_summary_inserted_out bigint;
  v_summary_skipped bigint;
  v_summary_duplicate bigint;
  v_summary_blocked bigint;
  v_summary_errors bigint;
begin
  raise notice '================================================================';
  raise notice 'P8.13.0 Phase 1 production verification (READ-ONLY)';
  raise notice '================================================================';

  -- -------------------------------------------------------------------------
  -- PART A — Deployed RPC + grants
  -- -------------------------------------------------------------------------
  v_rpc_oid := to_regprocedure('public.run_inventory_migration_phase1(uuid,uuid)');

  if v_rpc_oid is null then
    raise exception
      'P8.13.0 FAIL Part A: public.run_inventory_migration_phase1(uuid,uuid) is not deployed. Apply supabase/inventory_migration_phase1_rpc.sql before production Phase 1.';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where p.oid = v_rpc_oid
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
  into v_grant_authenticated;

  select not has_function_privilege('public', v_rpc_oid, 'EXECUTE')
  into v_revoke_public;

  select not has_function_privilege('anon', v_rpc_oid, 'EXECUTE')
  into v_revoke_anon;

  if not coalesce(v_grant_authenticated, false) then
    raise exception
      'P8.13.0 FAIL Part A: authenticated lacks EXECUTE on run_inventory_migration_phase1(uuid,uuid)';
  end if;

  if not coalesce(v_revoke_public, false) then
    raise exception
      'P8.13.0 FAIL Part A: PUBLIC still has EXECUTE on run_inventory_migration_phase1(uuid,uuid) — revoke required';
  end if;

  if not coalesce(v_revoke_anon, false) then
    raise exception
      'P8.13.0 FAIL Part A: anon still has EXECUTE on run_inventory_migration_phase1(uuid,uuid) — revoke required';
  end if;

  raise notice 'Part A PASS: RPC exists; EXECUTE granted to authenticated; revoked from public/anon';
  raise notice 'Verify definition (optional): select pg_get_functiondef(%::regprocedure);',
    quote_literal('public.run_inventory_migration_phase1(uuid,uuid)');

  -- -------------------------------------------------------------------------
  -- PART B — Resolve workspace + session for post–Phase 1 inspection
  -- -------------------------------------------------------------------------
  select count(*)::bigint
  into v_workspace_match_count
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_workspace_match_count = 0 then
    raise notice 'Part B SKIP: no AMORE.NICOSIA workspace — RPC deploy verified only.';
    raise notice 'P8.13.0 COMPLETE — Part A PASS; Part B skipped (no workspace).';
    return;
  end if;

  if v_workspace_match_count > 1 then
    raise exception
      'P8.13.0 FAIL Part B: expected exactly one workspace for AMORE.NICOSIA / amore-nicosia, found %',
      v_workspace_match_count;
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_session_override is not null then
    v_session_id := v_session_override;
  else
    select s.id
    into v_session_id
    from public.inventory_migration_sessions s
    join public.inventory_migration_session_steps st
      on st.session_id = s.id
     and st.step_name = 'phase1'
     and st.status = 'completed'
    where s.workspace_id = v_workspace_id
    order by coalesce(st.completed_at, s.started_at) desc nulls last, s.id desc
    limit 1;
  end if;

  if v_session_id is null then
    raise notice 'Part B SKIP: no completed phase1 session found for workspace %.', v_workspace_id;
    raise notice 'Run Operator Panel Phase 1 first, then re-run this script.';
    raise notice 'P8.13.0 COMPLETE — Part A PASS; Part B skipped (no phase1 session).';
    return;
  end if;

  select s.status
  into v_session_status
  from public.inventory_migration_sessions s
  where s.id = v_session_id
    and s.workspace_id = v_workspace_id;

  if v_session_status is null then
    raise exception
      'P8.13.0 FAIL Part B: session % not found for workspace %',
      v_session_id, v_workspace_id;
  end if;

  select st.id, st.status, st.completed_at
  into v_step_id, v_step_status, v_step_completed_at
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id
    and st.step_name = 'phase1';

  if v_step_id is null then
    raise exception 'P8.13.0 FAIL Part B: phase1 step missing for session %', v_session_id;
  end if;

  select r.id, r.result_status, r.result_summary, r.executed_at
  into v_result_id, v_result_status, v_result_summary, v_result_executed_at
  from public.inventory_migration_step_results r
  where r.session_id = v_session_id
    and r.step_name = 'phase1'
  order by r.executed_at desc nulls last, r.id desc
  limit 1;

  -- Map / movement coverage (read-only)
  select count(*)::bigint
  into v_eligible_map_rows
  from public.inventory_stock_item_map m
  where m.workspace_id = v_workspace_id
    and m.status in ('created', 'linked');

  select count(*)::bigint
  into v_initial_import_movements
  from public.stock_movements sm
  where sm.workspace_id = v_workspace_id
    and sm.note like 'INITIAL_IMPORT|map_id=%';

  select count(*)::bigint
  into v_eligible_with_movement
  from public.inventory_stock_item_map m
  where m.workspace_id = v_workspace_id
    and m.status in ('created', 'linked')
    and exists (
      select 1
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    );

  select count(*)::bigint
  into v_eligible_missing_movement
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = v_workspace_id
    and m.status in ('created', 'linked')
    and m.stock_item_id is not null
    and not exists (
      select 1
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    )
    and coalesce((m.source_snapshot->>'quantity')::numeric, 0)
        is distinct from coalesce(s.current_quantity, 0);

  select count(*)::bigint
  into v_eligible_delta_zero_candidates
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.workspace_id = v_workspace_id
    and m.status in ('created', 'linked')
    and m.stock_item_id is not null
    and not exists (
      select 1
      from public.stock_movements sm
      where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
    )
    and coalesce((m.source_snapshot->>'quantity')::numeric, 0)
        = coalesce(s.current_quantity, 0);

  select count(*)::bigint
  into v_duplicate_notes
  from (
    select sm.note
    from public.stock_movements sm
    where sm.workspace_id = v_workspace_id
      and sm.note like 'INITIAL_IMPORT|map_id=%'
    group by sm.note
    having count(*) > 1
  ) d;

  v_summary_eligible := coalesce((v_result_summary->'totals'->>'eligible_rows')::bigint, null);
  v_summary_inserted_in := (
    select (g->>'count')::bigint
    from jsonb_array_elements(coalesce(v_result_summary->'groups', '[]'::jsonb)) g
    where g->>'key' = 'inserted_in'
    limit 1
  );
  v_summary_inserted_out := (
    select (g->>'count')::bigint
    from jsonb_array_elements(coalesce(v_result_summary->'groups', '[]'::jsonb)) g
    where g->>'key' = 'inserted_out'
    limit 1
  );
  v_summary_skipped := (
    select (g->>'count')::bigint
    from jsonb_array_elements(coalesce(v_result_summary->'groups', '[]'::jsonb)) g
    where g->>'key' = 'skipped_unchanged'
    limit 1
  );
  v_summary_duplicate := (
    select (g->>'count')::bigint
    from jsonb_array_elements(coalesce(v_result_summary->'groups', '[]'::jsonb)) g
    where g->>'key' = 'duplicate_prevented'
    limit 1
  );
  v_summary_blocked := (
    select (g->>'count')::bigint
    from jsonb_array_elements(coalesce(v_result_summary->'groups', '[]'::jsonb)) g
    where g->>'key' = 'blocked'
    limit 1
  );
  v_summary_errors := (
    select (g->>'count')::bigint
    from jsonb_array_elements(coalesce(v_result_summary->'groups', '[]'::jsonb)) g
    where g->>'key' = 'errors'
    limit 1
  );

  raise notice '----------------------------------------------------------------';
  raise notice 'Part B — Session / step / result';
  raise notice 'workspace_id=%', v_workspace_id;
  raise notice 'session_id=% status=%', v_session_id, v_session_status;
  raise notice 'phase1 step_id=% status=% completed_at=%',
    v_step_id, v_step_status, v_step_completed_at;
  raise notice 'phase1 result_id=% result_status=% executed_at=%',
    v_result_id, v_result_status, v_result_executed_at;
  raise notice 'step result totals: eligible=% inserted_in=% inserted_out=% skipped=% dup=% blocked=% errors=%',
    v_summary_eligible,
    v_summary_inserted_in,
    v_summary_inserted_out,
    v_summary_skipped,
    v_summary_duplicate,
    v_summary_blocked,
    v_summary_errors;
  raise notice '----------------------------------------------------------------';
  raise notice 'Part B — Movement coverage (live map)';
  raise notice 'eligible created/linked map rows=%', v_eligible_map_rows;
  raise notice 'INITIAL_IMPORT movements (workspace)=%', v_initial_import_movements;
  raise notice 'eligible rows with INITIAL_IMPORT=%', v_eligible_with_movement;
  raise notice 'eligible rows missing movement with non-zero delta=%', v_eligible_missing_movement;
  raise notice 'eligible rows with delta 0 and no movement (expected skip)=%',
    v_eligible_delta_zero_candidates;
  raise notice 'duplicate INITIAL_IMPORT notes=%', v_duplicate_notes;

  if v_step_status is distinct from 'completed' then
    raise exception
      'P8.13.0 FAIL Part B: phase1 step status is %, expected completed',
      v_step_status;
  end if;

  if v_result_id is null then
    raise exception
      'P8.13.0 FAIL Part B: phase1 step_results row missing for completed step';
  end if;

  if v_duplicate_notes > 0 then
    raise exception
      'P8.13.0 FAIL Part B: duplicate INITIAL_IMPORT notes detected (%) — investigate before Phase 2',
      v_duplicate_notes;
  end if;

  if v_eligible_missing_movement > 0 then
    raise notice
      'P8.13.0 ATTENTION Part B: % eligible row(s) still lack INITIAL_IMPORT with non-zero delta. Review blocked/errors in step result before Phase 2.',
      v_eligible_missing_movement;
  end if;

  raise notice 'Part B PASS: phase1 completed with step result; movement inspection emitted.';
  raise notice 'P8.13.0 COMPLETE — Part A PASS; Part B PASS (read-only).';
  raise notice 'Reminder: Phase 1 does not set migrated_at or update stock quantities (Phase 2).';
end;
$p813_phase1_verify$;

-- Optional tabular fingerprint (read-only) for the resolved workspace identity.
select
  'rpc_deployed' as check_key,
  case
    when to_regprocedure('public.run_inventory_migration_phase1(uuid,uuid)') is not null
      then 'yes'
    else 'no'
  end as check_value;

select
  'authenticated_execute' as check_key,
  case
    when to_regprocedure('public.run_inventory_migration_phase1(uuid,uuid)') is not null
     and has_function_privilege(
       'authenticated',
       'public.run_inventory_migration_phase1(uuid,uuid)'::regprocedure,
       'EXECUTE'
     )
      then 'yes'
    else 'no'
  end as check_value;

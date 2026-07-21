-- =============================================================================
-- P8.6.1b — Transaction-Rolled-Back Auto-link Runtime Validation Harness
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
--
-- This file is NOT:
--   - a schema migration
--   - an RPC deployment
--   - part of automated production schema deploy
--
-- This file IS:
--   - a one-shot PostgreSQL validation harness
--   - executed entirely inside BEGIN … ROLLBACK
--   - must NEVER be changed to COMMIT
--
-- OPERATOR INSTRUCTIONS
-- -----------------------------------------------------------------------------
-- 1. Replace v_target_workspace_id below with an approved controlled workspace UUID.
-- 2. Replace v_manager_auth_user_id below with an auth.users UUID that is
--    owner / general_manager / manager for that workspace.
-- 3. Confirm the workspace is approved for temporary transactional validation.
-- 4. Confirm no inventory migration session is already running for that workspace
--    (start RPC will raise if one exists).
-- 5. Run this entire file as ONE execution in the SQL Editor.
-- 6. Confirm the evidence SELECTs and the final summary row:
--      ALL P8.6.1B ASSERTIONS PASSED — TRANSACTION WILL ROLLBACK
-- 7. Confirm the final command is ROLLBACK (never COMMIT).
-- 8. After the transaction ends, run the post-run cleanup verification queries
--    at the bottom of this file (outside the harness transaction).
--
-- Do not automatically choose the first workspace.
-- Do not automatically choose the first manager.
-- Do not use AMORE.NICOSIA implicitly.
--
-- If an assertion raises mid-run, the transaction aborts. In the SQL Editor,
-- execute:  ROLLBACK;  if a failed transaction remains open.
--
-- NOTE: Persist classifies the full legacy inventory_items catalog for the
-- selected workspace. All writes in this script (including incidental map
-- UPSERTs for non-fixture rows) are rolled back with the transaction.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- OPERATOR INPUTS (required — do not leave placeholders)
-- ---------------------------------------------------------------------------
do $p861b_config$
declare
  -- >>> REPLACE THESE TWO UUIDS BEFORE RUNNING <<<
  v_target_workspace_id uuid := null; -- e.g. '________-____-____-____-____________'
  v_manager_auth_user_id uuid := null; -- e.g. '________-____-____-____-____________'

  v_nil uuid := '00000000-0000-0000-0000-000000000000';
  v_workspace_exists boolean := false;
  v_user_exists boolean := false;
  v_can_manage boolean := false;
  v_auth_uid uuid;
  v_run_marker text;
  v_collision bigint := 0;
  v_running_sessions bigint := 0;

  v_case_a_legacy_id bigint;
  v_case_b_legacy_id bigint;
  v_case_c_legacy_id bigint;
  v_case_a_stock_id uuid;
  v_case_c_stock_1 uuid;
  v_case_c_stock_2 uuid;

  v_qty_a_before numeric;
  v_qty_c1_before numeric;
  v_qty_c2_before numeric;
  v_movements_before bigint;
  v_marker_movements_before bigint;

  v_session_id uuid;
  v_case_a_map_id uuid;
  v_case_a_stock_after_persist uuid;

  v_map_status text;
  v_map_resolution text;
  v_map_stock_id uuid;
  v_map_migrated_at timestamptz;

  v_qty_a_after numeric;
  v_qty_c1_after numeric;
  v_qty_c2_after numeric;
  v_movements_after bigint;
  v_marker_movements_after bigint;

  v_phase1_status text;
  v_phase2_status text;
  v_auto_create_status text;

  v_case_a_passed boolean := false;
  v_case_b_passed boolean := false;
  v_case_c_passed boolean := false;
  v_quantities_unchanged boolean := false;
  v_movements_unchanged boolean := false;
begin
  -- Reject null / nil placeholder UUIDs before any fixtures.
  if v_target_workspace_id is null or v_target_workspace_id = v_nil then
    raise exception 'P8.6.1b: set v_target_workspace_id to a real workspace UUID (null/nil placeholder rejected)';
  end if;

  if v_manager_auth_user_id is null or v_manager_auth_user_id = v_nil then
    raise exception 'P8.6.1b: set v_manager_auth_user_id to a real auth.users UUID (null/nil placeholder rejected)';
  end if;

  select exists (
    select 1 from public.workspaces w where w.id = v_target_workspace_id
  ) into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'P8.6.1b: workspace % does not exist', v_target_workspace_id;
  end if;

  select exists (
    select 1 from auth.users u where u.id = v_manager_auth_user_id
  ) into v_user_exists;

  if not v_user_exists then
    raise exception 'P8.6.1b: auth.users % does not exist', v_manager_auth_user_id;
  end if;

  -- Authenticated RPC context (transaction-local). Mirrors Supabase/PostgREST
  -- claim wiring so auth.uid() resolves to the selected manager.
  perform set_config('request.jwt.claim.sub', v_manager_auth_user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_manager_auth_user_id::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );

  v_auth_uid := auth.uid();
  if v_auth_uid is distinct from v_manager_auth_user_id then
    raise exception
      'P8.6.1b: auth.uid()=% did not equal selected manager % after JWT claim setup',
      v_auth_uid,
      v_manager_auth_user_id;
  end if;

  select public.can_manage_workspace_stock(v_target_workspace_id)
  into v_can_manage;

  if v_can_manage is distinct from true then
    raise exception
      'P8.6.1b: can_manage_workspace_stock(%) is not true for manager %',
      v_target_workspace_id,
      v_manager_auth_user_id;
  end if;

  v_run_marker := 'P861B_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  -- Collision guard: marker must be absent from fixture-bearing tables.
  select
    (
      select count(*)::bigint from public.inventory_items i
      where i.item_name like (v_run_marker || '%')
         or i.notes like ('%' || v_run_marker || '%')
    )
    + (
      select count(*)::bigint from public.stock_items s
      where s.name like (v_run_marker || '%')
         or s.storage_location like ('%' || v_run_marker || '%')
    )
    + (
      select count(*)::bigint from public.inventory_stock_item_map m
      where m.conflict_reason like ('%' || v_run_marker || '%')
         or m.source_snapshot::text like ('%' || v_run_marker || '%')
    )
    + (
      select count(*)::bigint from public.stock_movements sm
      where sm.note like ('%' || v_run_marker || '%')
    )
    + (
      select count(*)::bigint from public.inventory_migration_activity a
      where a.activity_text like ('%' || v_run_marker || '%')
    )
  into v_collision;

  if v_collision > 0 then
    raise exception 'P8.6.1b: collision — marker % already present in data', v_run_marker;
  end if;

  select count(*)::bigint
  into v_running_sessions
  from public.inventory_migration_sessions s
  where s.workspace_id = v_target_workspace_id
    and s.status = 'running';

  if v_running_sessions > 0 then
    raise exception
      'P8.6.1b: workspace % already has a running migration session — aborting (no cancel)',
      v_target_workspace_id;
  end if;

  -- Evidence scratch tables (transaction-local).
  create temporary table p861b_meta (
    run_marker text,
    workspace_id uuid,
    manager_auth_user_id uuid,
    session_id uuid
  ) on commit drop;

  create temporary table p861b_map_results (
    test_case text,
    legacy_inventory_item_id bigint,
    map_status text,
    resolution_type text,
    stock_item_id uuid,
    expected_stock_item_id uuid,
    migrated_at timestamptz
  ) on commit drop;

  create temporary table p861b_steps (
    step_name text,
    status text
  ) on commit drop;

  create temporary table p861b_step_results (
    step_name text,
    result_status text,
    result_summary jsonb
  ) on commit drop;

  create temporary table p861b_qty_proof (
    stock_item_id uuid,
    label text,
    quantity_before numeric,
    quantity_after numeric
  ) on commit drop;

  create temporary table p861b_movement_proof (
    movement_count_before bigint,
    movement_count_after bigint,
    marker_movement_count_before bigint,
    marker_movement_count_after bigint
  ) on commit drop;

  create temporary table p861b_summary (
    case_a_passed boolean,
    case_b_passed boolean,
    case_c_passed boolean,
    quantities_unchanged boolean,
    movements_unchanged boolean,
    rollback_pending boolean,
    final_message text
  ) on commit drop;

  -- -------------------------------------------------------------------------
  -- Fixtures (collision-safe names include run marker)
  -- Case A: one legacy + one exact stock candidate (qty-equal auto_link path)
  -- Case B: one legacy with zero stock candidates (auto_create)
  -- Case C: one legacy + two identical stock candidates (manual)
  -- -------------------------------------------------------------------------
  insert into public.inventory_items (
    item_name, category, subcategory, supplier, unit,
    quantity, minimum_quantity, cost, status, notes
  ) values (
    v_run_marker || ' CaseA Match',
    'Other', '', '', 'Bottle 700ml',
    7, 0, 0, 'In Stock', v_run_marker || ' case_a'
  )
  returning id into v_case_a_legacy_id;

  insert into public.stock_items (
    workspace_id, name, category, item_type, supplier, unit,
    current_quantity, minimum_quantity, cost_price, storage_location, active
  ) values (
    v_target_workspace_id,
    v_run_marker || ' CaseA Match',
    'Other', 'Other', '', 'Bottle 700ml',
    7, 0, 0, v_run_marker || ' case_a', true
  )
  returning id into v_case_a_stock_id;

  insert into public.inventory_items (
    item_name, category, subcategory, supplier, unit,
    quantity, minimum_quantity, cost, status, notes
  ) values (
    v_run_marker || ' CaseB Solo',
    'Other', '', '', 'Bottle 700ml',
    3, 0, 0, 'In Stock', v_run_marker || ' case_b'
  )
  returning id into v_case_b_legacy_id;

  insert into public.inventory_items (
    item_name, category, subcategory, supplier, unit,
    quantity, minimum_quantity, cost, status, notes
  ) values (
    v_run_marker || ' CaseC Ambiguous',
    'Other', '', '', 'Bottle 700ml',
    4, 0, 0, 'In Stock', v_run_marker || ' case_c'
  )
  returning id into v_case_c_legacy_id;

  insert into public.stock_items (
    workspace_id, name, category, item_type, supplier, unit,
    current_quantity, minimum_quantity, cost_price, storage_location, active
  ) values (
    v_target_workspace_id,
    v_run_marker || ' CaseC Ambiguous',
    'Other', 'Other', '', 'Bottle 700ml',
    4, 0, 0, v_run_marker || ' case_c_1', true
  )
  returning id into v_case_c_stock_1;

  insert into public.stock_items (
    workspace_id, name, category, item_type, supplier, unit,
    current_quantity, minimum_quantity, cost_price, storage_location, active
  ) values (
    v_target_workspace_id,
    v_run_marker || ' CaseC Ambiguous',
    'Other', 'Other', '', 'Bottle 700ml',
    4, 0, 0, v_run_marker || ' case_c_2', true
  )
  returning id into v_case_c_stock_2;

  -- Baseline capture
  select s.current_quantity into v_qty_a_before
  from public.stock_items s where s.id = v_case_a_stock_id;

  select s.current_quantity into v_qty_c1_before
  from public.stock_items s where s.id = v_case_c_stock_1;

  select s.current_quantity into v_qty_c2_before
  from public.stock_items s where s.id = v_case_c_stock_2;

  select count(*)::bigint into v_movements_before
  from public.stock_movements sm
  where sm.workspace_id = v_target_workspace_id;

  select count(*)::bigint into v_marker_movements_before
  from public.stock_movements sm
  where sm.note like ('%' || v_run_marker || '%');

  if v_marker_movements_before <> 0 then
    raise exception 'P8.6.1b: unexpected pre-existing marker movements';
  end if;

  if exists (
    select 1
    from public.inventory_stock_item_map m
    where m.workspace_id = v_target_workspace_id
      and m.legacy_inventory_item_id in (
        v_case_a_legacy_id, v_case_b_legacy_id, v_case_c_legacy_id
      )
  ) then
    raise exception 'P8.6.1b: map rows already exist for fixture legacy ids';
  end if;

  -- -----------------------------------------------------------------------
  -- Product session path (actual deployed RPCs only)
  -- -----------------------------------------------------------------------
  select s.id
  into v_session_id
  from public.start_inventory_migration_session(v_target_workspace_id) s
  limit 1;

  if v_session_id is null then
    raise exception 'P8.6.1b: start_inventory_migration_session returned no session';
  end if;

  perform 1
  from public.transition_inventory_migration_step(
    v_target_workspace_id,
    v_session_id,
    'foundation',
    'completed'
  );

  perform 1
  from public.run_inventory_migration_persist(
    v_target_workspace_id,
    v_session_id
  );

  -- Case A after Persist
  select m.id, m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_case_a_map_id, v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.workspace_id = v_target_workspace_id
    and m.legacy_inventory_item_id = v_case_a_legacy_id;

  if not found then
    raise exception 'P8.6.1b Case A: map row missing after Persist';
  end if;

  if v_map_status is distinct from 'classified'
     or v_map_resolution is distinct from 'auto_link'
     or v_map_stock_id is null
     or v_map_stock_id is distinct from v_case_a_stock_id
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.1b Case A Persist failed: status=%, resolution=%, stock_item_id=%, expected=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_case_a_stock_id, v_map_migrated_at;
  end if;

  v_case_a_stock_after_persist := v_map_stock_id;

  insert into p861b_map_results
  values (
    'A_after_persist',
    v_case_a_legacy_id,
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    v_case_a_stock_id,
    v_map_migrated_at
  );

  -- Case B after Persist
  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.workspace_id = v_target_workspace_id
    and m.legacy_inventory_item_id = v_case_b_legacy_id;

  if not found then
    raise exception 'P8.6.1b Case B: map row missing after Persist';
  end if;

  if v_map_status is distinct from 'classified'
     or v_map_resolution is distinct from 'auto_create'
     or v_map_stock_id is not null
     or v_map_status = 'linked'
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.1b Case B Persist failed: status=%, resolution=%, stock_item_id=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at;
  end if;

  v_case_b_passed := true;

  insert into p861b_map_results
  values (
    'B_after_persist',
    v_case_b_legacy_id,
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    null,
    v_map_migrated_at
  );

  -- Case C after Persist
  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.workspace_id = v_target_workspace_id
    and m.legacy_inventory_item_id = v_case_c_legacy_id;

  if not found then
    raise exception 'P8.6.1b Case C: map row missing after Persist';
  end if;

  if v_map_status is distinct from 'manual'
     or v_map_resolution is not null
     or v_map_stock_id is not null
     or v_map_status = 'linked'
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.1b Case C Persist failed: status=%, resolution=%, stock_item_id=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at;
  end if;

  v_case_c_passed := true;

  insert into p861b_map_results
  values (
    'C_after_persist',
    v_case_c_legacy_id,
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    null,
    v_map_migrated_at
  );

  -- Auto-link (actual RPC). Do NOT call auto_create / phase1 / phase2.
  perform 1
  from public.run_inventory_migration_auto_link(
    v_target_workspace_id,
    v_session_id
  );

  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.id = v_case_a_map_id;

  if v_map_status is distinct from 'linked'
     or v_map_resolution is distinct from 'auto_link'
     or v_map_stock_id is distinct from v_case_a_stock_after_persist
     or v_map_stock_id is distinct from v_case_a_stock_id
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.1b Case A Auto-link failed: status=%, resolution=%, stock_item_id=%, expected=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_case_a_stock_id, v_map_migrated_at;
  end if;

  v_case_a_passed := true;

  insert into p861b_map_results
  values (
    'A_after_auto_link',
    v_case_a_legacy_id,
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    v_case_a_stock_id,
    v_map_migrated_at
  );

  -- B/C must remain unlinked after Auto-link
  if exists (
    select 1
    from public.inventory_stock_item_map m
    where m.workspace_id = v_target_workspace_id
      and m.legacy_inventory_item_id in (v_case_b_legacy_id, v_case_c_legacy_id)
      and (
        m.status = 'linked'
        or m.stock_item_id is not null
        or m.migrated_at is not null
      )
  ) then
    raise exception 'P8.6.1b: Case B/C unexpectedly linked or received stock_item_id/migrated_at';
  end if;

  -- Non-mutation proofs
  select s.current_quantity into v_qty_a_after
  from public.stock_items s where s.id = v_case_a_stock_id;
  select s.current_quantity into v_qty_c1_after
  from public.stock_items s where s.id = v_case_c_stock_1;
  select s.current_quantity into v_qty_c2_after
  from public.stock_items s where s.id = v_case_c_stock_2;

  if v_qty_a_after is distinct from v_qty_a_before
     or v_qty_c1_after is distinct from v_qty_c1_before
     or v_qty_c2_after is distinct from v_qty_c2_before then
    raise exception 'P8.6.1b: stock quantities changed during Persist/Auto-link';
  end if;

  v_quantities_unchanged := true;

  select count(*)::bigint into v_movements_after
  from public.stock_movements sm
  where sm.workspace_id = v_target_workspace_id;

  select count(*)::bigint into v_marker_movements_after
  from public.stock_movements sm
  where sm.note like ('%' || v_run_marker || '%');

  if v_movements_after is distinct from v_movements_before
     or v_marker_movements_after <> 0 then
    raise exception
      'P8.6.1b: stock_movements changed (before=%, after=%, marker=%)',
      v_movements_before, v_movements_after, v_marker_movements_after;
  end if;

  if exists (
    select 1
    from public.stock_movements sm
    where sm.workspace_id = v_target_workspace_id
      and sm.note like ('INITIAL_IMPORT|map_id=' || v_case_a_map_id::text)
  ) then
    raise exception 'P8.6.1b: unexpected INITIAL_IMPORT movement for Case A map';
  end if;

  v_movements_unchanged := true;

  if exists (
    select 1
    from public.inventory_stock_item_map m
    where m.workspace_id = v_target_workspace_id
      and m.legacy_inventory_item_id in (
        v_case_a_legacy_id, v_case_b_legacy_id, v_case_c_legacy_id
      )
      and m.migrated_at is not null
  ) then
    raise exception 'P8.6.1b: migrated_at set on fixture map rows';
  end if;

  select st.status into v_auto_create_status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id and st.step_name = 'auto_create';

  select st.status into v_phase1_status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id and st.step_name = 'phase1';

  select st.status into v_phase2_status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id and st.step_name = 'phase2';

  if v_auto_create_status is distinct from 'waiting'
     or v_phase1_status is distinct from 'waiting'
     or v_phase2_status is distinct from 'waiting' then
    raise exception
      'P8.6.1b: unexpected later-stage progress (auto_create=%, phase1=%, phase2=%)',
      v_auto_create_status, v_phase1_status, v_phase2_status;
  end if;

  insert into p861b_meta values (
    v_run_marker, v_target_workspace_id, v_manager_auth_user_id, v_session_id
  );

  insert into p861b_steps (step_name, status)
  select st.step_name, st.status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id
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
    end;

  insert into p861b_step_results (step_name, result_status, result_summary)
  select r.step_name, r.result_status, r.result_summary
  from public.inventory_migration_step_results r
  where r.session_id = v_session_id
  order by r.executed_at;

  insert into p861b_qty_proof values
    (v_case_a_stock_id, 'case_a', v_qty_a_before, v_qty_a_after),
    (v_case_c_stock_1, 'case_c_1', v_qty_c1_before, v_qty_c1_after),
    (v_case_c_stock_2, 'case_c_2', v_qty_c2_before, v_qty_c2_after);

  insert into p861b_movement_proof values (
    v_movements_before,
    v_movements_after,
    v_marker_movements_before,
    v_marker_movements_after
  );

  insert into p861b_summary values (
    v_case_a_passed,
    v_case_b_passed,
    v_case_c_passed,
    v_quantities_unchanged,
    v_movements_unchanged,
    true,
    'ALL P8.6.1B ASSERTIONS PASSED — TRANSACTION WILL ROLLBACK'
  );
end;
$p861b_config$;

-- ---------------------------------------------------------------------------
-- Evidence result sets (visible in SQL Editor before ROLLBACK)
-- ---------------------------------------------------------------------------
select '1_meta' as evidence, * from p861b_meta;
select '2_map_results' as evidence, * from p861b_map_results order by test_case;
select '3_session_steps' as evidence, * from p861b_steps;
select '4_step_results' as evidence, * from p861b_step_results;
select '5_quantity_proof' as evidence, * from p861b_qty_proof;
select '6_movement_proof' as evidence, * from p861b_movement_proof;
select '7_summary' as evidence, * from p861b_summary;

-- Guaranteed rollback — NEVER change this to COMMIT.
rollback;

-- =============================================================================
-- POST-RUN CLEANUP VERIFICATION (run AFTER the harness transaction ends)
-- Read-only. Do not DELETE. Expect zero rows for the run marker you observed.
-- Replace :run_marker with the run_marker from evidence set 1_meta.
-- =============================================================================

-- select count(*) as leftover_legacy
-- from public.inventory_items
-- where item_name like 'P861B_%' or notes like '%P861B_%';

-- select count(*) as leftover_stock
-- from public.stock_items
-- where name like 'P861B_%' or storage_location like '%P861B_%';

-- select count(*) as leftover_map
-- from public.inventory_stock_item_map
-- where source_snapshot::text like '%P861B_%'
--    or conflict_reason like '%P861B_%';

-- select count(*) as leftover_sessions
-- from public.inventory_migration_sessions s
-- join public.inventory_migration_activity a on a.session_id = s.id
-- where a.activity_text like '%P861B_%';

-- select count(*) as leftover_activity
-- from public.inventory_migration_activity
-- where activity_text like '%P861B_%';

-- select count(*) as leftover_step_results
-- from public.inventory_migration_step_results
-- where result_summary::text like '%P861B_%';

-- select count(*) as leftover_movements
-- from public.stock_movements
-- where note like '%P861B_%';

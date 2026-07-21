-- =============================================================================
-- P8.6.1c — One-Click Auto-link Runtime Validation Harness
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
-- ONE-CLICK OPERATOR WORKFLOW
-- -----------------------------------------------------------------------------
-- 1. Open this complete file.
-- 2. Confirm it starts with BEGIN.
-- 3. Confirm the final executable harness statement is ROLLBACK.
-- 4. Paste the full file into Supabase SQL Editor.
-- 5. Run it once.
-- 6. Confirm the final PASS result:
--      ALL P8.6.1C ASSERTIONS PASSED — TRANSACTION ROLLED BACK
--
-- No UUID lookup. No manual editing. No credential handling.
--
-- Auto-resolves:
--   - workspace by authoritative identity name=AMORE.NICOSIA / slug=amore-nicosia
--   - manager by role precedence owner → general_manager → manager
--
-- If an assertion raises mid-run, the transaction aborts. In the SQL Editor,
-- execute:  ROLLBACK;  if a failed transaction remains open.
--
-- NOTE: Persist classifies the full legacy inventory_items catalog for the
-- resolved workspace. All writes in this script (including incidental map
-- UPSERTs for non-fixture rows) are rolled back with the transaction.
-- =============================================================================

begin;

do $p861c_harness$
declare
  v_target_workspace_id uuid;
  v_workspace_name text;
  v_workspace_slug text;
  v_workspace_match_count bigint := 0;

  v_manager_auth_user_id uuid;
  v_manager_role text;
  v_manager_email text;

  v_can_manage boolean := false;
  v_auth_uid uuid;
  v_run_marker text;
  v_collision bigint := 0;

  v_running_session_id uuid;
  v_running_started_at timestamptz;
  v_running_started_by uuid;

  -- Live/authoritative inventory_items.id is uuid (bar_refills FK + runtime probe).
  -- Map legacy_inventory_item_id must also be uuid after P8.6.1g alignment.
  v_case_a_legacy_id uuid;
  v_case_b_legacy_id uuid;
  v_case_c_legacy_id uuid;
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
  v_post_apply_status text;

  v_case_a_passed boolean := false;
  v_case_b_passed boolean := false;
  v_case_c_passed boolean := false;
  v_quantities_unchanged boolean := false;
  v_movements_unchanged boolean := false;
  v_no_apply_stages_executed boolean := false;
begin
  -- -------------------------------------------------------------------------
  -- PART 1 — Resolve exactly one AMORE.NICOSIA workspace (no LIMIT 1 guess)
  -- Authoritative app identity: name='AMORE.NICOSIA', slug='amore-nicosia'
  -- -------------------------------------------------------------------------
  select count(*)::bigint
  into v_workspace_match_count
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_workspace_match_count = 0 then
    raise exception
      'P8.6.1c: no workspace matched authoritative identity name=AMORE.NICOSIA / slug=amore-nicosia';
  end if;

  if v_workspace_match_count > 1 then
    raise exception
      'P8.6.1c: % workspaces matched AMORE.NICOSIA / amore-nicosia — expected exactly one',
      v_workspace_match_count;
  end if;

  select w.id, w.name, w.slug
  into v_target_workspace_id, v_workspace_name, v_workspace_slug
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  -- -------------------------------------------------------------------------
  -- PART 2 — Deterministic authorized manager (owner → GM → manager)
  -- -------------------------------------------------------------------------
  select
    wm.auth_user_id,
    wm.role,
    coalesce(nullif(btrim(u.email), ''), nullif(btrim(wm.email), ''), '')
  into
    v_manager_auth_user_id,
    v_manager_role,
    v_manager_email
  from public.workspace_members wm
  join auth.users u on u.id = wm.auth_user_id
  where wm.workspace_id = v_target_workspace_id
    and wm.role in ('owner', 'general_manager', 'manager')
  order by
    case wm.role
      when 'owner' then 1
      when 'general_manager' then 2
      when 'manager' then 3
      else 99
    end,
    wm.created_at asc nulls last,
    wm.auth_user_id asc
  limit 1;

  if v_manager_auth_user_id is null then
    raise exception
      'P8.6.1c: no eligible owner/general_manager/manager found for workspace % (%)',
      v_target_workspace_id,
      v_workspace_slug;
  end if;

  -- -------------------------------------------------------------------------
  -- PART 3 — Authenticated RPC context (transaction-local JWT claims)
  -- -------------------------------------------------------------------------
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
      'P8.6.1c: auth.uid()=% did not equal selected manager % after JWT claim setup',
      v_auth_uid,
      v_manager_auth_user_id;
  end if;

  select public.can_manage_workspace_stock(v_target_workspace_id)
  into v_can_manage;

  if v_can_manage is distinct from true then
    raise exception
      'P8.6.1c: can_manage_workspace_stock(%) is not true for manager % (role=%)',
      v_target_workspace_id,
      v_manager_auth_user_id,
      v_manager_role;
  end if;

  -- -------------------------------------------------------------------------
  -- PART 5 — Running session safety (do not cancel/reuse)
  -- -------------------------------------------------------------------------
  select s.id, s.started_at, s.started_by
  into v_running_session_id, v_running_started_at, v_running_started_by
  from public.inventory_migration_sessions s
  where s.workspace_id = v_target_workspace_id
    and s.status = 'running'
  order by s.started_at asc nulls last, s.id asc
  limit 1;

  if v_running_session_id is not null then
    raise exception
      'P8.6.1c: workspace % already has a running migration session id=% started_at=% started_by=% — aborting (no cancel)',
      v_target_workspace_id,
      v_running_session_id,
      v_running_started_at,
      v_running_started_by;
  end if;

  v_run_marker := 'P861C_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

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
    raise exception 'P8.6.1c: collision — marker % already present in data', v_run_marker;
  end if;

  -- Evidence scratch tables (transaction-local).
  create temporary table p861c_environment (
    workspace_id uuid,
    workspace_name text,
    workspace_slug text,
    manager_auth_user_id uuid,
    manager_role text,
    manager_email text,
    run_marker text,
    session_id uuid
  ) on commit drop;

  create temporary table p861c_case_results (
    test_case text,
    map_status text,
    resolution_type text,
    stock_item_id uuid,
    expected_stock_item_id uuid,
    migrated_at timestamptz,
    passed boolean
  ) on commit drop;

  create temporary table p861c_steps (
    step_name text,
    status text
  ) on commit drop;

  create temporary table p861c_step_results (
    step_name text,
    result_status text,
    result_summary jsonb
  ) on commit drop;

  create temporary table p861c_qty_proof (
    stock_item_id uuid,
    label text,
    quantity_before numeric,
    quantity_after numeric
  ) on commit drop;

  create temporary table p861c_movement_proof (
    movement_count_before bigint,
    movement_count_after bigint,
    marker_movement_count_before bigint,
    marker_movement_count_after bigint
  ) on commit drop;

  create temporary table p861c_summary (
    case_a_passed boolean,
    case_b_passed boolean,
    case_c_passed boolean,
    quantities_unchanged boolean,
    movements_unchanged boolean,
    no_apply_stages_executed boolean,
    rollback_pending boolean,
    final_message text
  ) on commit drop;

  -- -------------------------------------------------------------------------
  -- Fixtures (P861C marker; new rows only)
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

  -- Baseline capture (before product RPCs)
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
    raise exception 'P8.6.1c: unexpected pre-existing marker movements';
  end if;

  if exists (
    select 1
    from public.inventory_stock_item_map m
    where m.workspace_id = v_target_workspace_id
      and m.legacy_inventory_item_id in (
        v_case_a_legacy_id, v_case_b_legacy_id, v_case_c_legacy_id
      )
  ) then
    raise exception 'P8.6.1c: map rows already exist for fixture legacy ids';
  end if;

  -- -----------------------------------------------------------------------
  -- Product session path (actual deployed RPCs only; stop after Auto-link)
  -- -----------------------------------------------------------------------
  select s.id
  into v_session_id
  from public.start_inventory_migration_session(v_target_workspace_id) s
  limit 1;

  if v_session_id is null then
    raise exception 'P8.6.1c: start_inventory_migration_session returned no session';
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
    raise exception 'P8.6.1c Case A: map row missing after Persist';
  end if;

  if v_map_status is distinct from 'classified'
     or v_map_resolution is distinct from 'auto_link'
     or v_map_stock_id is null
     or v_map_stock_id is distinct from v_case_a_stock_id
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.1c Case A Persist failed: status=%, resolution=%, stock_item_id=%, expected=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_case_a_stock_id, v_map_migrated_at;
  end if;

  v_case_a_stock_after_persist := v_map_stock_id;

  insert into p861c_case_results values (
    'A_after_persist',
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    v_case_a_stock_id,
    v_map_migrated_at,
    true
  );

  -- Case B after Persist
  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.workspace_id = v_target_workspace_id
    and m.legacy_inventory_item_id = v_case_b_legacy_id;

  if not found then
    raise exception 'P8.6.1c Case B: map row missing after Persist';
  end if;

  if v_map_status is distinct from 'classified'
     or v_map_resolution is distinct from 'auto_create'
     or v_map_stock_id is not null
     or v_map_status = 'linked'
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.1c Case B Persist failed: status=%, resolution=%, stock_item_id=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at;
  end if;

  v_case_b_passed := true;

  insert into p861c_case_results values (
    'B_after_persist',
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    null,
    v_map_migrated_at,
    true
  );

  -- Case C after Persist
  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.workspace_id = v_target_workspace_id
    and m.legacy_inventory_item_id = v_case_c_legacy_id;

  if not found then
    raise exception 'P8.6.1c Case C: map row missing after Persist';
  end if;

  if v_map_status is distinct from 'manual'
     or v_map_resolution is not null
     or v_map_stock_id is not null
     or v_map_status = 'linked'
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.1c Case C Persist failed: status=%, resolution=%, stock_item_id=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at;
  end if;

  v_case_c_passed := true;

  insert into p861c_case_results values (
    'C_after_persist',
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    null,
    v_map_migrated_at,
    true
  );

  -- Auto-link only (no auto_create / phase1 / phase2 / post_apply / complete)
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
      'P8.6.1c Case A Auto-link failed: status=%, resolution=%, stock_item_id=%, expected=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_case_a_stock_id, v_map_migrated_at;
  end if;

  v_case_a_passed := true;

  insert into p861c_case_results values (
    'A_after_auto_link',
    v_map_status,
    v_map_resolution,
    v_map_stock_id,
    v_case_a_stock_id,
    v_map_migrated_at,
    true
  );

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
    raise exception 'P8.6.1c: Case B/C unexpectedly linked or received stock_item_id/migrated_at';
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
    raise exception 'P8.6.1c: stock quantities changed during Persist/Auto-link';
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
      'P8.6.1c: stock_movements changed (before=%, after=%, marker=%)',
      v_movements_before, v_movements_after, v_marker_movements_after;
  end if;

  if exists (
    select 1
    from public.stock_movements sm
    where sm.workspace_id = v_target_workspace_id
      and sm.note like ('INITIAL_IMPORT|map_id=' || v_case_a_map_id::text)
  ) then
    raise exception 'P8.6.1c: unexpected INITIAL_IMPORT movement for Case A map';
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
    raise exception 'P8.6.1c: migrated_at set on fixture map rows';
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

  select st.status into v_post_apply_status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id and st.step_name = 'post_apply_audit';

  if v_auto_create_status is distinct from 'waiting'
     or v_phase1_status is distinct from 'waiting'
     or v_phase2_status is distinct from 'waiting'
     or v_post_apply_status is distinct from 'waiting' then
    raise exception
      'P8.6.1c: unexpected later-stage progress (auto_create=%, phase1=%, phase2=%, post_apply=%)',
      v_auto_create_status, v_phase1_status, v_phase2_status, v_post_apply_status;
  end if;

  v_no_apply_stages_executed := true;

  insert into p861c_environment values (
    v_target_workspace_id,
    v_workspace_name,
    v_workspace_slug,
    v_manager_auth_user_id,
    v_manager_role,
    v_manager_email,
    v_run_marker,
    v_session_id
  );

  insert into p861c_steps (step_name, status)
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

  insert into p861c_step_results (step_name, result_status, result_summary)
  select r.step_name, r.result_status, r.result_summary
  from public.inventory_migration_step_results r
  where r.session_id = v_session_id
  order by r.executed_at;

  insert into p861c_qty_proof values
    (v_case_a_stock_id, 'case_a', v_qty_a_before, v_qty_a_after),
    (v_case_c_stock_1, 'case_c_1', v_qty_c1_before, v_qty_c1_after),
    (v_case_c_stock_2, 'case_c_2', v_qty_c2_before, v_qty_c2_after);

  insert into p861c_movement_proof values (
    v_movements_before,
    v_movements_after,
    v_marker_movements_before,
    v_marker_movements_after
  );

  insert into p861c_summary values (
    v_case_a_passed,
    v_case_b_passed,
    v_case_c_passed,
    v_quantities_unchanged,
    v_movements_unchanged,
    v_no_apply_stages_executed,
    true,
    'ALL P8.6.1C ASSERTIONS PASSED — TRANSACTION ROLLED BACK'
  );
end;
$p861c_harness$;

-- ---------------------------------------------------------------------------
-- Evidence result sets (visible in SQL Editor before ROLLBACK)
-- ---------------------------------------------------------------------------
select '1_environment' as evidence, * from p861c_environment;
select '2_case_results' as evidence, * from p861c_case_results order by test_case;
select '3_session_steps' as evidence, * from p861c_steps;
select '4_step_results' as evidence, * from p861c_step_results;
select '5_quantity_proof' as evidence, * from p861c_qty_proof;
select '6_movement_proof' as evidence, * from p861c_movement_proof;
select '7_summary' as evidence, * from p861c_summary;

-- Guaranteed rollback — NEVER change this to COMMIT.
rollback;

-- =============================================================================
-- POST-RUN CLEANUP VERIFICATION (run AFTER the harness transaction ends)
-- Read-only. Do not DELETE. Expect zero leftover P861C rows.
-- =============================================================================

-- select count(*) as leftover_legacy
-- from public.inventory_items
-- where item_name like 'P861C_%' or notes like '%P861C_%';

-- select count(*) as leftover_stock
-- from public.stock_items
-- where name like 'P861C_%' or storage_location like '%P861C_%';

-- select count(*) as leftover_map
-- from public.inventory_stock_item_map
-- where source_snapshot::text like '%P861C_%'
--    or conflict_reason like '%P861C_%';

-- select count(*) as leftover_sessions
-- from public.inventory_migration_sessions s
-- join public.inventory_migration_activity a on a.session_id = s.id
-- where a.activity_text like '%P861C_%';

-- select count(*) as leftover_activity
-- from public.inventory_migration_activity
-- where activity_text like '%P861C_%';

-- select count(*) as leftover_step_results
-- from public.inventory_migration_step_results
-- where result_summary::text like '%P861C_%';

-- select count(*) as leftover_movements
-- from public.stock_movements
-- where note like '%P861C_%';

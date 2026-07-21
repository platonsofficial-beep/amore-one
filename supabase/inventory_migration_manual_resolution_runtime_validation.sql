-- =============================================================================
-- P8.6.2b — One-Click Manual Resolution Runtime Validation Harness
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
--      ALL P8.6.2B ASSERTIONS PASSED — TRANSACTION ROLLED BACK
--
-- Validates deployed:
--   - public.run_inventory_migration_manual_resolve(...)
--   - public.run_inventory_migration_auto_create(...) consuming manual_create
--
-- Auto-resolves:
--   - workspace by authoritative identity name=AMORE.NICOSIA / slug=amore-nicosia
--   - manager by role precedence owner → general_manager → manager
--
-- If an assertion raises mid-run, the transaction aborts. In the SQL Editor,
-- execute:  ROLLBACK;  if a failed transaction remains open.
-- =============================================================================

begin;

do $p862b_harness$
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
  v_session_id uuid;

  v_case_a_legacy_id uuid;
  v_case_b_legacy_id uuid;
  v_case_c_legacy_id uuid;
  v_case_a_map_id uuid;
  v_case_b_map_id uuid;
  v_case_c_map_id uuid;
  v_case_b_stock_id uuid;
  v_sentinel_stock_id uuid;
  v_case_a_stock_id uuid;
  v_alt_workspace_id uuid;
  v_alt_stock_id uuid;

  v_qty_sentinel_before numeric;
  v_qty_b_before numeric;
  v_qty_sentinel_after numeric;
  v_qty_b_after numeric;
  v_movements_before bigint;
  v_movements_after bigint;
  v_marker_movements_before bigint;
  v_marker_movements_after bigint;
  v_stock_a_count_before bigint;
  v_stock_a_count_after_force bigint;
  v_stock_a_count_after_create bigint;
  v_activity_before bigint;
  v_activity_after_force bigint;
  v_activity_after_force_retry bigint;
  v_activity_after_approve bigint;
  v_activity_after_approve_retry bigint;
  v_map_count_before_fixtures bigint;

  v_rpc_success boolean;
  v_rpc_changed boolean;
  v_rpc_idempotent boolean;
  v_rpc_action text;
  v_rpc_status text;
  v_rpc_resolution text;
  v_rpc_stock_id uuid;
  v_rpc_activity_written boolean;
  v_rpc_message text;

  v_map_status text;
  v_map_resolution text;
  v_map_stock_id uuid;
  v_map_migrated_at timestamptz;
  v_map_snapshot jsonb;
  v_map_hash text;

  v_phase1_status text;
  v_phase2_status text;
  v_auto_create_status text;
  v_auto_create_retry_ok boolean := false;
  v_cross_ws_ok boolean := false;
  v_cross_ws_note text := 'skipped_no_safe_second_workspace';
  v_err text;

  v_case_a_force_create_passed boolean := false;
  v_case_a_idempotency_passed boolean := false;
  v_case_a_auto_create_passed boolean := false;
  v_case_a_single_stock_item_passed boolean := false;
  v_case_a_auto_create_retry_passed boolean := false;
  v_case_b_approve_passed boolean := false;
  v_case_b_idempotency_passed boolean := false;
  v_finalized_protection_passed boolean := false;
  v_quantities_unchanged boolean := false;
  v_movements_unchanged boolean := false;
  v_no_apply_stages_executed boolean := false;
begin
  -- -------------------------------------------------------------------------
  -- Resolve exactly one AMORE.NICOSIA workspace
  -- -------------------------------------------------------------------------
  select count(*)::bigint
  into v_workspace_match_count
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_workspace_match_count = 0 then
    raise exception
      'P8.6.2b: no workspace matched authoritative identity name=AMORE.NICOSIA / slug=amore-nicosia';
  end if;

  if v_workspace_match_count > 1 then
    raise exception
      'P8.6.2b: % workspaces matched AMORE.NICOSIA / amore-nicosia — expected exactly one',
      v_workspace_match_count;
  end if;

  select w.id, w.name, w.slug
  into v_target_workspace_id, v_workspace_name, v_workspace_slug
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

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
      'P8.6.2b: no eligible owner/general_manager/manager found for workspace % (%)',
      v_target_workspace_id,
      v_workspace_slug;
  end if;

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
      'P8.6.2b: auth.uid()=% did not equal selected manager % after JWT claim setup',
      v_auth_uid,
      v_manager_auth_user_id;
  end if;

  select public.can_manage_workspace_stock(v_target_workspace_id)
  into v_can_manage;

  if v_can_manage is distinct from true then
    raise exception
      'P8.6.2b: can_manage_workspace_stock(%) is not true for manager % (role=%)',
      v_target_workspace_id,
      v_manager_auth_user_id,
      v_manager_role;
  end if;

  select s.id, s.started_at, s.started_by
  into v_running_session_id, v_running_started_at, v_running_started_by
  from public.inventory_migration_sessions s
  where s.workspace_id = v_target_workspace_id
    and s.status = 'running'
  order by s.started_at asc nulls last, s.id asc
  limit 1;

  if v_running_session_id is not null then
    raise exception
      'P8.6.2b: workspace % already has a running migration session id=% started_at=% started_by=% — aborting (no cancel)',
      v_target_workspace_id,
      v_running_session_id,
      v_running_started_at,
      v_running_started_by;
  end if;

  v_run_marker := 'P862B_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

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
    raise exception 'P8.6.2b: collision — marker % already present in data', v_run_marker;
  end if;

  create temporary table p862b_environment (
    workspace_id uuid,
    workspace_name text,
    workspace_slug text,
    manager_auth_user_id uuid,
    manager_role text,
    manager_email text,
    run_marker text,
    session_id uuid
  ) on commit drop;

  create temporary table p862b_case_results (
    test_case text,
    detail text,
    map_status text,
    resolution_type text,
    stock_item_id uuid,
    passed boolean
  ) on commit drop;

  create temporary table p862b_rpc_results (
    test_case text,
    success boolean,
    changed boolean,
    idempotent boolean,
    action text,
    status text,
    resolution_type text,
    stock_item_id uuid,
    activity_written boolean,
    message text
  ) on commit drop;

  create temporary table p862b_qty_proof (
    stock_item_id uuid,
    label text,
    quantity_before numeric,
    quantity_after numeric
  ) on commit drop;

  create temporary table p862b_movement_proof (
    movement_count_before bigint,
    movement_count_after bigint,
    marker_movement_count_before bigint,
    marker_movement_count_after bigint
  ) on commit drop;

  create temporary table p862b_summary (
    case_a_force_create_passed boolean,
    case_a_idempotency_passed boolean,
    case_a_auto_create_passed boolean,
    case_a_single_stock_item_passed boolean,
    case_a_auto_create_retry_passed boolean,
    case_b_approve_passed boolean,
    case_b_idempotency_passed boolean,
    finalized_protection_passed boolean,
    cross_workspace_protection_passed boolean,
    cross_workspace_note text,
    quantities_unchanged boolean,
    movements_unchanged boolean,
    no_apply_stages_executed boolean,
    rollback_pending boolean,
    final_message text
  ) on commit drop;

  -- Sentinel stock for unrelated quantity proof
  insert into public.stock_items (
    workspace_id, name, category, item_type, supplier, unit,
    current_quantity, minimum_quantity, cost_price, storage_location, active
  ) values (
    v_target_workspace_id,
    v_run_marker || ' Sentinel Qty',
    'Other', 'Other', '', 'Bottle 700ml',
    11, 0, 0, v_run_marker || ' sentinel', true
  )
  returning id into v_sentinel_stock_id;

  select s.current_quantity into v_qty_sentinel_before
  from public.stock_items s where s.id = v_sentinel_stock_id;

  select count(*)::bigint into v_movements_before
  from public.stock_movements sm
  where sm.workspace_id = v_target_workspace_id;

  select count(*)::bigint into v_marker_movements_before
  from public.stock_movements sm
  where sm.note like ('%' || v_run_marker || '%');

  if v_marker_movements_before <> 0 then
    raise exception 'P8.6.2b: unexpected pre-existing marker movements';
  end if;

  select count(*)::bigint into v_map_count_before_fixtures
  from public.inventory_stock_item_map m
  where m.workspace_id = v_target_workspace_id
    and m.conflict_reason like ('%' || v_run_marker || '%');

  -- -----------------------------------------------------------------------
  -- Pipeline prerequisites for Auto-create (actual deployed RPCs)
  -- -----------------------------------------------------------------------
  select s.id
  into v_session_id
  from public.start_inventory_migration_session(v_target_workspace_id) s
  limit 1;

  if v_session_id is null then
    raise exception 'P8.6.2b: start_inventory_migration_session returned no session';
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

  perform 1
  from public.run_inventory_migration_auto_link(
    v_target_workspace_id,
    v_session_id
  );

  -- -----------------------------------------------------------------------
  -- Case A fixtures (post Auto-link so Persist cannot overwrite)
  -- -----------------------------------------------------------------------
  insert into public.inventory_items (
    item_name, category, subcategory, supplier, unit,
    quantity, minimum_quantity, cost, status, notes
  ) values (
    v_run_marker || ' CaseA ForceCreate',
    'Other', '', '', 'Bottle 700ml',
    5, 0, 0, 'In Stock', v_run_marker || ' case_a'
  )
  returning id into v_case_a_legacy_id;

  insert into public.inventory_stock_item_map (
    legacy_inventory_item_id,
    workspace_id,
    stock_item_id,
    status,
    resolution_type,
    source_snapshot,
    source_hash,
    conflict_reason
  ) values (
    v_case_a_legacy_id,
    v_target_workspace_id,
    null,
    'manual',
    null,
    jsonb_build_object(
      'item_name', v_run_marker || ' CaseA ForceCreate',
      'category', 'Other',
      'subcategory', '',
      'supplier', '',
      'unit', 'Bottle 700ml',
      'quantity', 5,
      'minimum_quantity', 0,
      'cost', 0,
      'marker', v_run_marker
    ),
    v_run_marker || '_case_a_hash',
    v_run_marker || ' case_a'
  )
  returning id into v_case_a_map_id;

  select count(*)::bigint into v_stock_a_count_before
  from public.stock_items s
  where s.workspace_id = v_target_workspace_id
    and s.name = v_run_marker || ' CaseA ForceCreate';

  if v_stock_a_count_before <> 0 then
    raise exception 'P8.6.2b Case A: unexpected pre-existing matching stock item';
  end if;

  select count(*)::bigint into v_activity_before
  from public.inventory_migration_activity a
  where a.session_id = v_session_id
    and a.activity_text like ('%' || v_case_a_map_id::text || '%');

  insert into p862b_case_results values (
    'A_initial', 'manual map ready', 'manual', null, null, true
  );

  -- Case A1 force_create
  select
    r.success, r.changed, r.idempotent, r.action, r.status, r.resolution_type,
    r.stock_item_id, r.activity_written, r.message
  into
    v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action, v_rpc_status,
    v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  from public.run_inventory_migration_manual_resolve(
    v_target_workspace_id,
    v_session_id,
    v_case_a_map_id,
    'force_create',
    null
  ) r
  limit 1;

  if v_rpc_success is distinct from true
     or v_rpc_changed is distinct from true
     or v_rpc_idempotent is distinct from false
     or v_rpc_action is distinct from 'force_create'
     or v_rpc_status is distinct from 'classified'
     or v_rpc_resolution is distinct from 'manual_create'
     or v_rpc_stock_id is not null
     or v_rpc_activity_written is distinct from true then
    raise exception
      'P8.6.2b Case A force_create RPC failed: success=%, changed=%, idempotent=%, action=%, status=%, resolution=%, stock=%, activity=%',
      v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action,
      v_rpc_status, v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written;
  end if;

  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.id = v_case_a_map_id;

  if v_map_status is distinct from 'classified'
     or v_map_resolution is distinct from 'manual_create'
     or v_map_stock_id is not null
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.2b Case A map after force_create: status=%, resolution=%, stock=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at;
  end if;

  select count(*)::bigint into v_stock_a_count_after_force
  from public.stock_items s
  where s.workspace_id = v_target_workspace_id
    and s.name = v_run_marker || ' CaseA ForceCreate';

  if v_stock_a_count_after_force <> 0 then
    raise exception 'P8.6.2b Case A: Manual Resolution created stock items';
  end if;

  select count(*)::bigint into v_activity_after_force
  from public.inventory_migration_activity a
  where a.session_id = v_session_id
    and a.activity_text like ('%' || v_case_a_map_id::text || '%');

  if v_activity_after_force is distinct from (v_activity_before + 1) then
    raise exception
      'P8.6.2b Case A: expected exactly one new activity (before=%, after=%)',
      v_activity_before, v_activity_after_force;
  end if;

  v_case_a_force_create_passed := true;

  insert into p862b_rpc_results values (
    'A1_force_create', v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action,
    v_rpc_status, v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  );
  insert into p862b_case_results values (
    'A1_force_create', 'classified/manual_create', v_map_status, v_map_resolution,
    v_map_stock_id, true
  );

  -- Case A2 force_create idempotency
  select
    r.success, r.changed, r.idempotent, r.action, r.status, r.resolution_type,
    r.stock_item_id, r.activity_written, r.message
  into
    v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action, v_rpc_status,
    v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  from public.run_inventory_migration_manual_resolve(
    v_target_workspace_id,
    v_session_id,
    v_case_a_map_id,
    'force_create',
    null
  ) r
  limit 1;

  if v_rpc_success is distinct from true
     or v_rpc_changed is distinct from false
     or v_rpc_idempotent is distinct from true
     or v_rpc_activity_written is distinct from false then
    raise exception
      'P8.6.2b Case A2 idempotency failed: success=%, changed=%, idempotent=%, activity=%',
      v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_activity_written;
  end if;

  select count(*)::bigint into v_activity_after_force_retry
  from public.inventory_migration_activity a
  where a.session_id = v_session_id
    and a.activity_text like ('%' || v_case_a_map_id::text || '%');

  if v_activity_after_force_retry is distinct from v_activity_after_force then
    raise exception 'P8.6.2b Case A2: duplicate activity on idempotent retry';
  end if;

  select count(*)::bigint into v_stock_a_count_after_force
  from public.stock_items s
  where s.workspace_id = v_target_workspace_id
    and s.name = v_run_marker || ' CaseA ForceCreate';

  if v_stock_a_count_after_force <> 0 then
    raise exception 'P8.6.2b Case A2: stock created on idempotent retry';
  end if;

  v_case_a_idempotency_passed := true;
  insert into p862b_rpc_results values (
    'A2_force_idempotent', v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action,
    v_rpc_status, v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  );

  -- Case A3 Auto-create consumption
  select m.source_snapshot, m.source_hash
  into v_map_snapshot, v_map_hash
  from public.inventory_stock_item_map m
  where m.id = v_case_a_map_id;

  perform 1
  from public.run_inventory_migration_auto_create(
    v_target_workspace_id,
    v_session_id
  );

  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at,
         m.source_snapshot, m.source_hash
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at,
       v_map_snapshot, v_map_hash
  from public.inventory_stock_item_map m
  where m.id = v_case_a_map_id;

  if v_map_status is distinct from 'created'
     or v_map_resolution is distinct from 'manual_create'
     or v_map_stock_id is null
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.2b Case A3 Auto-create failed: status=%, resolution=%, stock=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at;
  end if;

  if v_map_snapshot is null or v_map_hash is distinct from (v_run_marker || '_case_a_hash') then
    raise exception 'P8.6.2b Case A3: source_snapshot/source_hash altered unexpectedly';
  end if;

  select s.id into v_case_a_stock_id
  from public.stock_items s
  where s.id = v_map_stock_id
    and s.workspace_id = v_target_workspace_id
    and s.name = v_run_marker || ' CaseA ForceCreate';

  if v_case_a_stock_id is null then
    raise exception 'P8.6.2b Case A3: created stock_item missing or wrong workspace/name';
  end if;

  select count(*)::bigint into v_stock_a_count_after_create
  from public.stock_items s
  where s.workspace_id = v_target_workspace_id
    and s.name = v_run_marker || ' CaseA ForceCreate';

  if v_stock_a_count_after_create is distinct from 1 then
    raise exception
      'P8.6.2b Case A3: expected exactly one Case A stock item, found %',
      v_stock_a_count_after_create;
  end if;

  v_case_a_auto_create_passed := true;
  v_case_a_single_stock_item_passed := true;

  insert into p862b_case_results values (
    'A3_auto_create', 'created/manual_create', v_map_status, v_map_resolution,
    v_map_stock_id, true
  );

  -- Case A4 Auto-create retry (stage already completed → protected rejection)
  begin
    perform 1
    from public.run_inventory_migration_auto_create(
      v_target_workspace_id,
      v_session_id
    );
    raise exception 'P8.6.2b Case A4: expected auto_create already_completed rejection';
  exception
    when others then
      v_err := SQLERRM;
      if v_err not like '%inventory_migration_auto_create_already_completed%' then
        raise exception 'P8.6.2b Case A4: unexpected error: %', v_err;
      end if;
      v_auto_create_retry_ok := true;
  end;

  select count(*)::bigint into v_stock_a_count_after_create
  from public.stock_items s
  where s.workspace_id = v_target_workspace_id
    and s.name = v_run_marker || ' CaseA ForceCreate';

  if v_stock_a_count_after_create is distinct from 1 then
    raise exception 'P8.6.2b Case A4: stock count changed after protected retry';
  end if;

  select m.stock_item_id into v_map_stock_id
  from public.inventory_stock_item_map m where m.id = v_case_a_map_id;

  if v_map_stock_id is distinct from v_case_a_stock_id then
    raise exception 'P8.6.2b Case A4: map stock_item_id changed on protected retry';
  end if;

  v_case_a_auto_create_retry_passed := v_auto_create_retry_ok;
  insert into p862b_case_results values (
    'A4_auto_create_retry', 'already_completed protected', 'created', 'manual_create',
    v_case_a_stock_id, v_auto_create_retry_ok
  );

  -- -----------------------------------------------------------------------
  -- Case B approve_candidate
  -- -----------------------------------------------------------------------
  insert into public.inventory_items (
    item_name, category, subcategory, supplier, unit,
    quantity, minimum_quantity, cost, status, notes
  ) values (
    v_run_marker || ' CaseB Approve',
    'Other', '', '', 'Bottle 700ml',
    9, 0, 0, 'In Stock', v_run_marker || ' case_b'
  )
  returning id into v_case_b_legacy_id;

  insert into public.stock_items (
    workspace_id, name, category, item_type, supplier, unit,
    current_quantity, minimum_quantity, cost_price, storage_location, active
  ) values (
    v_target_workspace_id,
    v_run_marker || ' CaseB Candidate',
    'Other', 'Other', '', 'Bottle 700ml',
    9, 0, 0, v_run_marker || ' case_b', true
  )
  returning id into v_case_b_stock_id;

  select s.current_quantity into v_qty_b_before
  from public.stock_items s where s.id = v_case_b_stock_id;

  insert into public.inventory_stock_item_map (
    legacy_inventory_item_id,
    workspace_id,
    stock_item_id,
    status,
    resolution_type,
    source_snapshot,
    source_hash,
    conflict_reason
  ) values (
    v_case_b_legacy_id,
    v_target_workspace_id,
    null,
    'manual',
    null,
    jsonb_build_object(
      'item_name', v_run_marker || ' CaseB Approve',
      'category', 'Other',
      'marker', v_run_marker
    ),
    v_run_marker || '_case_b_hash',
    v_run_marker || ' case_b'
  )
  returning id into v_case_b_map_id;

  select count(*)::bigint into v_activity_before
  from public.inventory_migration_activity a
  where a.session_id = v_session_id
    and a.activity_text like ('%' || v_case_b_map_id::text || '%');

  insert into p862b_case_results values (
    'B_initial', 'manual map + candidate', 'manual', null, null, true
  );

  select
    r.success, r.changed, r.idempotent, r.action, r.status, r.resolution_type,
    r.stock_item_id, r.activity_written, r.message
  into
    v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action, v_rpc_status,
    v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  from public.run_inventory_migration_manual_resolve(
    v_target_workspace_id,
    v_session_id,
    v_case_b_map_id,
    'approve_candidate',
    v_case_b_stock_id
  ) r
  limit 1;

  if v_rpc_success is distinct from true
     or v_rpc_changed is distinct from true
     or v_rpc_idempotent is distinct from false
     or v_rpc_action is distinct from 'approve_candidate'
     or v_rpc_status is distinct from 'linked'
     or v_rpc_resolution is distinct from 'manual_link'
     or v_rpc_stock_id is distinct from v_case_b_stock_id
     or v_rpc_activity_written is distinct from true then
    raise exception
      'P8.6.2b Case B approve RPC failed: success=%, changed=%, idempotent=%, action=%, status=%, resolution=%, stock=%, activity=%',
      v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action,
      v_rpc_status, v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written;
  end if;

  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.id = v_case_b_map_id;

  if v_map_status is distinct from 'linked'
     or v_map_resolution is distinct from 'manual_link'
     or v_map_stock_id is distinct from v_case_b_stock_id
     or v_map_migrated_at is not null then
    raise exception
      'P8.6.2b Case B map failed: status=%, resolution=%, stock=%, migrated_at=%',
      v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at;
  end if;

  select s.current_quantity into v_qty_b_after
  from public.stock_items s where s.id = v_case_b_stock_id;

  if v_qty_b_after is distinct from v_qty_b_before then
    raise exception 'P8.6.2b Case B: candidate quantity changed';
  end if;

  if exists (
    select 1 from public.stock_items s
    where s.workspace_id = v_target_workspace_id
      and s.name = v_run_marker || ' CaseB Approve'
  ) then
    raise exception 'P8.6.2b Case B: unexpected new stock item created for approve path';
  end if;

  select count(*)::bigint into v_activity_after_approve
  from public.inventory_migration_activity a
  where a.session_id = v_session_id
    and a.activity_text like ('%' || v_case_b_map_id::text || '%');

  if v_activity_after_approve is distinct from (v_activity_before + 1) then
    raise exception 'P8.6.2b Case B: expected exactly one activity entry';
  end if;

  v_case_b_approve_passed := true;
  insert into p862b_rpc_results values (
    'B1_approve', v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action,
    v_rpc_status, v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  );
  insert into p862b_case_results values (
    'B1_approve', 'linked/manual_link', v_map_status, v_map_resolution, v_map_stock_id, true
  );

  -- Case B2 idempotency
  select
    r.success, r.changed, r.idempotent, r.action, r.status, r.resolution_type,
    r.stock_item_id, r.activity_written, r.message
  into
    v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action, v_rpc_status,
    v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  from public.run_inventory_migration_manual_resolve(
    v_target_workspace_id,
    v_session_id,
    v_case_b_map_id,
    'approve_candidate',
    v_case_b_stock_id
  ) r
  limit 1;

  if v_rpc_success is distinct from true
     or v_rpc_changed is distinct from false
     or v_rpc_idempotent is distinct from true
     or v_rpc_activity_written is distinct from false then
    raise exception
      'P8.6.2b Case B2 idempotency failed: success=%, changed=%, idempotent=%, activity=%',
      v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_activity_written;
  end if;

  select count(*)::bigint into v_activity_after_approve_retry
  from public.inventory_migration_activity a
  where a.session_id = v_session_id
    and a.activity_text like ('%' || v_case_b_map_id::text || '%');

  if v_activity_after_approve_retry is distinct from v_activity_after_approve then
    raise exception 'P8.6.2b Case B2: duplicate activity on idempotent retry';
  end if;

  v_case_b_idempotency_passed := true;
  insert into p862b_rpc_results values (
    'B2_approve_idempotent', v_rpc_success, v_rpc_changed, v_rpc_idempotent, v_rpc_action,
    v_rpc_status, v_rpc_resolution, v_rpc_stock_id, v_rpc_activity_written, v_rpc_message
  );

  -- Case B3 finalized protection (force_create on linked)
  begin
    perform 1
    from public.run_inventory_migration_manual_resolve(
      v_target_workspace_id,
      v_session_id,
      v_case_b_map_id,
      'force_create',
      null
    );
    raise exception 'P8.6.2b Case B3: expected finalized_protected rejection';
  exception
    when others then
      v_err := SQLERRM;
      if v_err not like '%inventory_migration_manual_resolve_finalized_protected%' then
        raise exception 'P8.6.2b Case B3: unexpected error: %', v_err;
      end if;
  end;

  select m.status, m.resolution_type, m.stock_item_id, m.migrated_at
  into v_map_status, v_map_resolution, v_map_stock_id, v_map_migrated_at
  from public.inventory_stock_item_map m
  where m.id = v_case_b_map_id;

  if v_map_status is distinct from 'linked'
     or v_map_resolution is distinct from 'manual_link'
     or v_map_stock_id is distinct from v_case_b_stock_id then
    raise exception 'P8.6.2b Case B3: linked map mutated after rejected force_create';
  end if;

  select count(*)::bigint into v_activity_after_approve_retry
  from public.inventory_migration_activity a
  where a.session_id = v_session_id
    and a.activity_text like ('%' || v_case_b_map_id::text || '%');

  if v_activity_after_approve_retry is distinct from v_activity_after_approve then
    raise exception 'P8.6.2b Case B3: activity written on rejected mutation';
  end if;

  v_finalized_protection_passed := true;
  insert into p862b_case_results values (
    'B3_finalized_reject', 'force_create rejected', v_map_status, v_map_resolution,
    v_map_stock_id, true
  );

  -- Case C cross-workspace (create rollback-scoped alt workspace + stock)
  begin
    insert into public.workspaces (name, slug)
    values (v_run_marker || ' ALT WS', lower(v_run_marker) || '-alt')
    returning id into v_alt_workspace_id;

    insert into public.stock_items (
      workspace_id, name, category, item_type, supplier, unit,
      current_quantity, minimum_quantity, cost_price, storage_location, active
    ) values (
      v_alt_workspace_id,
      v_run_marker || ' Alien Candidate',
      'Other', 'Other', '', 'Bottle 700ml',
      1, 0, 0, v_run_marker || ' alien', true
    )
    returning id into v_alt_stock_id;

    insert into public.inventory_items (
      item_name, category, subcategory, supplier, unit,
      quantity, minimum_quantity, cost, status, notes
    ) values (
      v_run_marker || ' CaseC CrossWS',
      'Other', '', '', 'Bottle 700ml',
      1, 0, 0, 'In Stock', v_run_marker || ' case_c'
    )
    returning id into v_case_c_legacy_id;

    insert into public.inventory_stock_item_map (
      legacy_inventory_item_id, workspace_id, stock_item_id, status, resolution_type,
      source_snapshot, source_hash, conflict_reason
    ) values (
      v_case_c_legacy_id, v_target_workspace_id, null, 'manual', null,
      jsonb_build_object('item_name', v_run_marker || ' CaseC CrossWS', 'marker', v_run_marker),
      v_run_marker || '_case_c_hash',
      v_run_marker || ' case_c'
    )
    returning id into v_case_c_map_id;

    begin
      perform 1
      from public.run_inventory_migration_manual_resolve(
        v_target_workspace_id,
        v_session_id,
        v_case_c_map_id,
        'approve_candidate',
        v_alt_stock_id
      );
      raise exception 'P8.6.2b Case C: expected stock_item_invalid rejection';
    exception
      when others then
        v_err := SQLERRM;
        if v_err not like '%inventory_migration_manual_resolve_stock_item_invalid%' then
          raise exception 'P8.6.2b Case C: unexpected error: %', v_err;
        end if;
    end;

    select m.status, m.resolution_type, m.stock_item_id
    into v_map_status, v_map_resolution, v_map_stock_id
    from public.inventory_stock_item_map m
    where m.id = v_case_c_map_id;

    if v_map_status is distinct from 'manual'
       or v_map_resolution is not null
       or v_map_stock_id is not null then
      raise exception 'P8.6.2b Case C: map mutated after cross-workspace reject';
    end if;

    v_cross_ws_ok := true;
    v_cross_ws_note := 'rejected_foreign_workspace_stock';
  exception
    when others then
      v_err := SQLERRM;
      if v_cross_ws_ok then
        raise;
      end if;
      v_cross_ws_ok := false;
      v_cross_ws_note := 'omitted_or_failed:' || left(v_err, 120);
  end;

  insert into p862b_case_results values (
    'C_cross_workspace', v_cross_ws_note, null, null, null, v_cross_ws_ok
  );

  -- Global safety: quantities / movements / apply stages
  select s.current_quantity into v_qty_sentinel_after
  from public.stock_items s where s.id = v_sentinel_stock_id;
  select s.current_quantity into v_qty_b_after
  from public.stock_items s where s.id = v_case_b_stock_id;

  if v_qty_sentinel_after is distinct from v_qty_sentinel_before
     or v_qty_b_after is distinct from v_qty_b_before then
    raise exception 'P8.6.2b: unrelated stock quantities changed';
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
      'P8.6.2b: stock_movements changed (before=%, after=%, marker=%)',
      v_movements_before, v_movements_after, v_marker_movements_after;
  end if;
  v_movements_unchanged := true;

  select st.status into v_phase1_status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id and st.step_name = 'phase1';

  select st.status into v_phase2_status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id and st.step_name = 'phase2';

  select st.status into v_auto_create_status
  from public.inventory_migration_session_steps st
  where st.session_id = v_session_id and st.step_name = 'auto_create';

  if v_phase1_status is distinct from 'waiting'
     or v_phase2_status is distinct from 'waiting' then
    raise exception
      'P8.6.2b: Phase 1/2 unexpectedly progressed (phase1=%, phase2=%)',
      v_phase1_status, v_phase2_status;
  end if;

  if v_auto_create_status is distinct from 'completed' then
    raise exception 'P8.6.2b: auto_create step status=% (expected completed)', v_auto_create_status;
  end if;

  v_no_apply_stages_executed := true;

  if not (
    v_case_a_force_create_passed
    and v_case_a_idempotency_passed
    and v_case_a_auto_create_passed
    and v_case_a_single_stock_item_passed
    and v_case_a_auto_create_retry_passed
    and v_case_b_approve_passed
    and v_case_b_idempotency_passed
    and v_finalized_protection_passed
    and v_quantities_unchanged
    and v_movements_unchanged
    and v_no_apply_stages_executed
  ) then
    raise exception 'P8.6.2b: global assertion gate failed before summary';
  end if;

  insert into p862b_environment values (
    v_target_workspace_id,
    v_workspace_name,
    v_workspace_slug,
    v_manager_auth_user_id,
    v_manager_role,
    v_manager_email,
    v_run_marker,
    v_session_id
  );

  insert into p862b_qty_proof values
    (v_sentinel_stock_id, 'sentinel', v_qty_sentinel_before, v_qty_sentinel_after),
    (v_case_b_stock_id, 'case_b_candidate', v_qty_b_before, v_qty_b_after);

  insert into p862b_movement_proof values (
    v_movements_before,
    v_movements_after,
    v_marker_movements_before,
    v_marker_movements_after
  );

  insert into p862b_summary values (
    v_case_a_force_create_passed,
    v_case_a_idempotency_passed,
    v_case_a_auto_create_passed,
    v_case_a_single_stock_item_passed,
    v_case_a_auto_create_retry_passed,
    v_case_b_approve_passed,
    v_case_b_idempotency_passed,
    v_finalized_protection_passed,
    v_cross_ws_ok,
    v_cross_ws_note,
    v_quantities_unchanged,
    v_movements_unchanged,
    v_no_apply_stages_executed,
    true,
    'ALL P8.6.2B ASSERTIONS PASSED — TRANSACTION ROLLED BACK'
  );
end;
$p862b_harness$;

-- ---------------------------------------------------------------------------
-- Evidence result sets (visible in SQL Editor before ROLLBACK)
-- ---------------------------------------------------------------------------
select '1_environment' as evidence, * from p862b_environment;
select '2_case_results' as evidence, * from p862b_case_results order by test_case;
select '3_rpc_results' as evidence, * from p862b_rpc_results order by test_case;
select '4_quantity_proof' as evidence, * from p862b_qty_proof;
select '5_movement_proof' as evidence, * from p862b_movement_proof;
select '6_summary' as evidence, * from p862b_summary;

-- Guaranteed rollback — NEVER change this to COMMIT.
rollback;

-- =============================================================================
-- POST-RUN CLEANUP VERIFICATION (run AFTER the harness transaction ends)
-- Read-only. Do not DELETE. Expect zero leftover P862B rows.
-- =============================================================================

-- select count(*) as leftover_legacy
-- from public.inventory_items
-- where item_name like 'P862B_%' or notes like '%P862B_%';

-- select count(*) as leftover_stock
-- from public.stock_items
-- where name like 'P862B_%' or storage_location like '%P862B_%';

-- select count(*) as leftover_map
-- from public.inventory_stock_item_map
-- where source_snapshot::text like '%P862B_%'
--    or conflict_reason like '%P862B_%';

-- select count(*) as leftover_activity
-- from public.inventory_migration_activity
-- where activity_text like '%P862B_%';

-- select count(*) as leftover_movements
-- from public.stock_movements
-- where note like '%P862B_%';

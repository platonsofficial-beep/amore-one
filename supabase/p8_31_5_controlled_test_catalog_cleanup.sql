-- =============================================================================
-- P8.31.5 — Controlled Test Catalog Cleanup (OFFICIAL)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Do NOT auto-run from the app. Do NOT wire into migrations.
-- Do NOT use as a generic production wipe.
--
-- Scope (approved P8.31.4 gate):
--   Remove the complete official load-test fixture batch:
--     name prefix:  ONE_STOCK_LOAD_TEST_2026_07 |
--     item UUID:    a0172a00-2026-4000-8000-*
--     movement note / UUID: ONE_STOCK_LOAD_TEST_2026_07 / b0172a00-2026-4000-8000-*
--   Workspace: exact-one AMORE.NICOSIA / amore-nicosia
--   Expected batch size after live verification: 200
--
-- Deletes:
--   ✓ stock_item_location_balances for batch items (explicit)
--   ✓ stock_movements for batch items / batch marker (explicit)
--   ✓ stock_items in the official batch only
--   ✓ import / migration FKs pointing at batch items (detach; session shells kept)
--
-- Preserves:
--   ✓ workspace, workspace_storages, suppliers, users, roles, permissions, settings
--   ✓ every non-test stock_item (name not matching batch prefix)
--   ✓ Inventory Count session shells + snapshot columns (item_id SET NULL on delete
--     when P8.16.38 freeze-null reconcile is deployed)
--   ✓ import session rows (FKs nulled; sessions not wiped)
--
-- Does NOT:
--   - rewrite quantities / convert units / migrate or reseed catalog
--   - modify Inventory Count / Receive / Transfer / Adjustment / Orders / Dashboard app logic
--   - delete suppliers, storages, or non-batch products
--
-- Preconditions (abort if unmet):
--   1) Exactly one AMORE.NICOSIA workspace
--   2) Batch name ∩ UUID invariant holds
--   3) Exactly 200 official batch items present
--   4) No open inventory counts (in_progress|paused|counting_complete) on batch items
--   5) No draft/sent PO lines referencing batch items
--
-- Manual order:
--   1) Run stock_load_test_verification.sql (before-cleanup / blockers)
--   2) Run THIS file
--   3) Run stock_load_test_verification.sql (after-cleanup sections)
-- =============================================================================

begin;

do $p8_31_5_controlled_test_catalog_cleanup$
declare
  v_workspace_id uuid;
  v_match_count bigint := 0;
  v_name_prefix constant text := 'ONE_STOCK_LOAD_TEST_2026_07 | ';
  v_batch_marker constant text := 'ONE_STOCK_LOAD_TEST_2026_07';
  v_item_uuid_prefix constant text := 'a0172a00-2026-4000-8000-';
  v_movement_uuid_prefix constant text := 'b0172a00-2026-4000-8000-';
  v_expected_batch_items constant bigint := 200;
  v_target_items bigint := 0;
  v_target_by_uuid bigint := 0;
  v_unexpected bigint := 0;
  v_non_test_before bigint := 0;
  v_non_test_after bigint := 0;
  v_open_count_refs bigint := 0;
  v_draft_or_sent_order_refs bigint := 0;
  v_balances_before bigint := 0;
  v_balances_deleted bigint := 0;
  v_movements_deleted bigint := 0;
  v_import_fks_detached bigint := 0;
  v_map_fks_detached bigint := 0;
  v_deleted_items bigint := 0;
  v_remaining_items bigint := 0;
  v_remaining_movements bigint := 0;
  v_remaining_balances bigint := 0;
  v_remaining_import_fks bigint := 0;
  v_has_location_balances boolean := false;
  v_has_import_rows boolean := false;
  v_has_migration_map boolean := false;
begin
  -- ---------------------------------------------------------------------------
  -- 1) Exact workspace resolution
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_match_count
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_match_count = 0 then
    raise exception
      'P8.31.5 cleanup abort: no workspace matched name=AMORE.NICOSIA / slug=amore-nicosia';
  end if;

  if v_match_count > 1 then
    raise exception
      'P8.31.5 cleanup abort: % workspaces matched — expected exactly one',
      v_match_count;
  end if;

  select w.id into v_workspace_id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_item_location_balances'
  ) into v_has_location_balances;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inventory_import_rows'
  ) into v_has_import_rows;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inventory_stock_item_map'
  ) into v_has_migration_map;

  -- ---------------------------------------------------------------------------
  -- 2) Snapshot non-test baseline (must remain unchanged)
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_non_test_before
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name not like v_name_prefix || '%';

  -- ---------------------------------------------------------------------------
  -- 3) Identify official batch (name prefix ∩ deterministic UUID namespace)
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_target_items
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name like v_name_prefix || '%'
    and s.id::text like v_item_uuid_prefix || '%';

  select count(*)
  into v_target_by_uuid
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.id::text like v_item_uuid_prefix || '%';

  raise notice
    'P8.31.5 cleanup targets: batch_items=% uuid_namespace=% non_test_before=% expected=%',
    v_target_items, v_target_by_uuid, v_non_test_before, v_expected_batch_items;

  if v_target_items = 0 then
    raise exception 'P8.31.5 cleanup abort: no official batch rows found (nothing to delete)';
  end if;

  if v_target_items <> v_expected_batch_items then
    raise exception
      'P8.31.5 cleanup abort: expected exactly % official batch items, found % — manual review required',
      v_expected_batch_items, v_target_items;
  end if;

  if v_target_by_uuid <> v_target_items then
    raise exception
      'P8.31.5 cleanup abort: UUID-namespace count (%) disagrees with batch intersection (%)',
      v_target_by_uuid, v_target_items;
  end if;

  select count(*)
  into v_unexpected
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and (
      (s.name like v_name_prefix || '%' and s.id::text not like v_item_uuid_prefix || '%')
      or
      (s.id::text like v_item_uuid_prefix || '%' and s.name not like v_name_prefix || '%')
    );

  if v_unexpected > 0 then
    raise exception
      'P8.31.5 cleanup abort: % rows break name/UUID batch invariant — manual review required',
      v_unexpected;
  end if;

  -- ---------------------------------------------------------------------------
  -- 4) Blockers
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_open_count_refs
  from public.inventory_count_session_items csi
  inner join public.inventory_count_sessions cs
    on cs.id = csi.session_id
   and cs.workspace_id = csi.workspace_id
  where csi.workspace_id = v_workspace_id
    and csi.item_id in (
      select s.id
      from public.stock_items s
      where s.workspace_id = v_workspace_id
        and s.name like v_name_prefix || '%'
        and s.id::text like v_item_uuid_prefix || '%'
    )
    and cs.status in ('in_progress', 'paused', 'counting_complete');

  if v_open_count_refs > 0 then
    raise exception
      'P8.31.5 cleanup abort: % open inventory-count refs still point at batch items. Finish/cancel those sessions first.',
      v_open_count_refs;
  end if;

  select count(*)
  into v_draft_or_sent_order_refs
  from public.stock_order_items oi
  inner join public.stock_orders o
    on o.id = oi.order_id
  where o.workspace_id = v_workspace_id
    and oi.stock_item_id in (
      select s.id
      from public.stock_items s
      where s.workspace_id = v_workspace_id
        and s.name like v_name_prefix || '%'
        and s.id::text like v_item_uuid_prefix || '%'
    )
    and o.status in ('draft', 'sent');

  if v_draft_or_sent_order_refs > 0 then
    raise exception
      'P8.31.5 cleanup abort: % draft/sent order lines still reference batch items. Remove those lines first.',
      v_draft_or_sent_order_refs;
  end if;

  -- ---------------------------------------------------------------------------
  -- 5) Detach load-test-linked import / migration FKs (preserve session shells)
  -- ---------------------------------------------------------------------------
  if v_has_import_rows then
    update public.inventory_import_rows r
    set
      matched_stock_item_id = case
        when r.matched_stock_item_id in (
          select s.id
          from public.stock_items s
          where s.workspace_id = v_workspace_id
            and s.name like v_name_prefix || '%'
            and s.id::text like v_item_uuid_prefix || '%'
        ) then null
        else r.matched_stock_item_id
      end,
      applied_stock_item_id = case
        when r.applied_stock_item_id in (
          select s.id
          from public.stock_items s
          where s.workspace_id = v_workspace_id
            and s.name like v_name_prefix || '%'
            and s.id::text like v_item_uuid_prefix || '%'
        ) then null
        else r.applied_stock_item_id
      end
    where r.workspace_id = v_workspace_id
      and (
        r.matched_stock_item_id in (
          select s.id
          from public.stock_items s
          where s.workspace_id = v_workspace_id
            and s.name like v_name_prefix || '%'
            and s.id::text like v_item_uuid_prefix || '%'
        )
        or r.applied_stock_item_id in (
          select s.id
          from public.stock_items s
          where s.workspace_id = v_workspace_id
            and s.name like v_name_prefix || '%'
            and s.id::text like v_item_uuid_prefix || '%'
        )
      );

    get diagnostics v_import_fks_detached = row_count;
  end if;

  if v_has_migration_map then
    update public.inventory_stock_item_map m
    set stock_item_id = null
    where m.workspace_id = v_workspace_id
      and m.stock_item_id in (
        select s.id
        from public.stock_items s
        where s.workspace_id = v_workspace_id
          and s.name like v_name_prefix || '%'
          and s.id::text like v_item_uuid_prefix || '%'
      );

    get diagnostics v_map_fks_detached = row_count;
  end if;

  -- ---------------------------------------------------------------------------
  -- 6) Delete location balances for batch items (explicit; also CASCADE)
  -- ---------------------------------------------------------------------------
  if v_has_location_balances then
    select count(*)
    into v_balances_before
    from public.stock_item_location_balances b
    where b.workspace_id = v_workspace_id
      and b.stock_item_id in (
        select s.id
        from public.stock_items s
        where s.workspace_id = v_workspace_id
          and s.name like v_name_prefix || '%'
          and s.id::text like v_item_uuid_prefix || '%'
      );

    delete from public.stock_item_location_balances b
    where b.workspace_id = v_workspace_id
      and b.stock_item_id in (
        select s.id
        from public.stock_items s
        where s.workspace_id = v_workspace_id
          and s.name like v_name_prefix || '%'
          and s.id::text like v_item_uuid_prefix || '%'
      );

    get diagnostics v_balances_deleted = row_count;

    if v_balances_deleted <> v_balances_before then
      raise exception
        'P8.31.5 cleanup abort: balance delete mismatch (before=% deleted=%)',
        v_balances_before, v_balances_deleted;
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- 7) Delete batch movements (explicit; also CASCADE from stock_items)
  -- ---------------------------------------------------------------------------
  delete from public.stock_movements m
  where m.workspace_id = v_workspace_id
    and (
      m.note = v_batch_marker
      or m.id::text like v_movement_uuid_prefix || '%'
      or m.item_id in (
        select s.id
        from public.stock_items s
        where s.workspace_id = v_workspace_id
          and s.name like v_name_prefix || '%'
          and s.id::text like v_item_uuid_prefix || '%'
      )
    );

  get diagnostics v_movements_deleted = row_count;

  -- ---------------------------------------------------------------------------
  -- 8) Delete official batch stock_items only
  --    Posted/cancelled inventory_count_session_items.item_id SET NULL when
  --    P8.16.38 is deployed; otherwise transaction rolls back.
  -- ---------------------------------------------------------------------------
  delete from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name like v_name_prefix || '%'
    and s.id::text like v_item_uuid_prefix || '%';

  get diagnostics v_deleted_items = row_count;

  if v_deleted_items <> v_target_items then
    raise exception
      'P8.31.5 cleanup abort: deleted % rows but targeted %',
      v_deleted_items, v_target_items;
  end if;

  -- ---------------------------------------------------------------------------
  -- 9) Post-delete verification
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_remaining_items
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and (
      s.name like v_name_prefix || '%'
      or s.id::text like v_item_uuid_prefix || '%'
    );

  select count(*)
  into v_remaining_movements
  from public.stock_movements m
  where m.workspace_id = v_workspace_id
    and (
      m.note = v_batch_marker
      or m.id::text like v_movement_uuid_prefix || '%'
    );

  select count(*)
  into v_non_test_after
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name not like v_name_prefix || '%';

  if v_has_location_balances then
    select count(*)
    into v_remaining_balances
    from public.stock_item_location_balances b
    where b.workspace_id = v_workspace_id
      and b.stock_item_id::text like v_item_uuid_prefix || '%';
  end if;

  if v_has_import_rows then
    select count(*)
    into v_remaining_import_fks
    from public.inventory_import_rows r
    where r.workspace_id = v_workspace_id
      and (
        r.matched_stock_item_id::text like v_item_uuid_prefix || '%'
        or r.applied_stock_item_id::text like v_item_uuid_prefix || '%'
      );
  end if;

  if v_remaining_items <> 0 then
    raise exception 'P8.31.5 cleanup abort: % batch stock_items remain', v_remaining_items;
  end if;

  if v_remaining_movements <> 0 then
    raise exception 'P8.31.5 cleanup abort: % batch movements remain', v_remaining_movements;
  end if;

  if v_remaining_balances <> 0 then
    raise exception 'P8.31.5 cleanup abort: % batch location balances remain', v_remaining_balances;
  end if;

  if v_remaining_import_fks <> 0 then
    raise exception 'P8.31.5 cleanup abort: % import FKs still point at batch UUID namespace', v_remaining_import_fks;
  end if;

  if v_non_test_after <> v_non_test_before then
    raise exception
      'P8.31.5 cleanup abort: non-test stock count changed (% → %) — non-test products must never be touched',
      v_non_test_before, v_non_test_after;
  end if;

  raise notice
    'P8.31.5 cleanup OK: deleted_items=% balances_deleted=% movements_deleted=% import_rows_detached=% map_rows_detached=% non_test_unchanged=%',
    v_deleted_items,
    v_balances_deleted,
    v_movements_deleted,
    v_import_fks_detached,
    v_map_fks_detached,
    v_non_test_after;
end;
$p8_31_5_controlled_test_catalog_cleanup$;

commit;

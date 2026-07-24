-- =============================================================================
-- P8.17.2a — Stock Load-Test Dataset CLEANUP (AMORE.NICOSIA)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Do NOT auto-run from the app. Do NOT wire into migrations.
--
-- Safest cleanup method (chosen):
--   Direct SQL DELETE of batch-tagged stock_items (and their CASCADE movements).
--
-- Why NOT Permanent Delete RPC for 200 rows:
--   - Would require 200 authenticated RPC calls
--   - Would SET NULL inventory_count_session_items.item_id on any historical
--     count refs created during testing, depending on freeze reconcile deploy
--   - Creates operational noise without benefit for disposable test rows
--
-- Why direct DELETE is safe for THIS batch when preconditions hold:
--   - Seed creates no orders / imports / migration map / count sessions
--   - stock_movements.item_id ON DELETE CASCADE removes batch movements
--   - Batch is identified by immutable name prefix + deterministic UUIDs
--
-- HARD PRECONDITION before cleanup if operators used the batch in live flows:
--   1) Cancel/finish any OPEN inventory counts referencing batch items
--   2) Prefer removing test session items OR ensure P8.16.38 freeze nulling
--      is deployed if posted/cancelled snapshots reference batch item_ids
--   3) Remove draft/sent PO lines that still reference batch products
--
-- Manual order:
--   1) Run stock_load_test_verification.sql (before-cleanup section)
--   2) Run THIS file
--   3) Run stock_load_test_verification.sql (after-cleanup section)
-- =============================================================================

begin;

do $stock_load_test_cleanup$
declare
  v_workspace_id uuid;
  v_match_count bigint := 0;
  v_name_prefix constant text := 'ONE_STOCK_LOAD_TEST_2026_07 | ';
  v_batch_marker constant text := 'ONE_STOCK_LOAD_TEST_2026_07';
  v_target_items bigint := 0;
  v_target_by_uuid bigint := 0;
  v_unexpected bigint := 0;
  v_non_test_before bigint := 0;
  v_non_test_after bigint := 0;
  v_open_count_refs bigint := 0;
  v_draft_or_sent_order_refs bigint := 0;
  v_deleted_items bigint := 0;
  v_remaining_items bigint := 0;
  v_remaining_movements bigint := 0;
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
      'P8.17.2a cleanup abort: no workspace matched name=AMORE.NICOSIA / slug=amore-nicosia';
  end if;

  if v_match_count > 1 then
    raise exception
      'P8.17.2a cleanup abort: % workspaces matched — expected exactly one',
      v_match_count;
  end if;

  select w.id into v_workspace_id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  -- ---------------------------------------------------------------------------
  -- 2) Snapshot non-test baseline
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_non_test_before
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name not like v_name_prefix || '%';

  -- ---------------------------------------------------------------------------
  -- 3) Identify target batch (name prefix ∩ deterministic UUID namespace)
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_target_items
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name like v_name_prefix || '%';

  select count(*)
  into v_target_by_uuid
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.id::text like 'a0172a00-2026-4000-8000-%';

  raise notice 'P8.17.2a cleanup targets: name_prefix=% uuid_namespace=% non_test_before=%',
    v_target_items, v_target_by_uuid, v_non_test_before;

  if v_target_items = 0 then
    raise exception 'P8.17.2a cleanup abort: no batch rows found (nothing to delete)';
  end if;

  -- Abort if name-prefix set and UUID-namespace set disagree (unexpected contamination)
  select count(*)
  into v_unexpected
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and (
      (s.name like v_name_prefix || '%' and s.id::text not like 'a0172a00-2026-4000-8000-%')
      or
      (s.id::text like 'a0172a00-2026-4000-8000-%' and s.name not like v_name_prefix || '%')
    );

  if v_unexpected > 0 then
    raise exception
      'P8.17.2a cleanup abort: % rows break name/UUID batch invariant — manual review required',
      v_unexpected;
  end if;

  -- ---------------------------------------------------------------------------
  -- 4) Blockers that make direct DELETE unsafe / incomplete
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
    )
    and cs.status in ('in_progress', 'paused', 'counting_complete');

  if v_open_count_refs > 0 then
    raise exception
      'P8.17.2a cleanup abort: % open inventory-count refs still point at batch items. Finish/cancel those sessions first.',
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
    )
    and o.status in ('draft', 'sent');

  if v_draft_or_sent_order_refs > 0 then
    raise exception
      'P8.17.2a cleanup abort: % draft/sent order lines still reference batch items. Remove those lines first.',
      v_draft_or_sent_order_refs;
  end if;

  -- ---------------------------------------------------------------------------
  -- 5) Delete batch movements explicitly (also CASCADE from stock_items)
  -- ---------------------------------------------------------------------------
  delete from public.stock_movements m
  where m.workspace_id = v_workspace_id
    and (
      m.note = v_batch_marker
      or m.item_id in (
        select s.id
        from public.stock_items s
        where s.workspace_id = v_workspace_id
          and s.name like v_name_prefix || '%'
      )
    );

  -- ---------------------------------------------------------------------------
  -- 6) Delete batch stock_items
  --    Posted/cancelled inventory_count_session_items.item_id will SET NULL
  --    only if freeze reconcile (P8.16.38) is deployed; otherwise this DELETE
  --    raises inventory_count_item_frozen_field and the transaction rolls back.
  -- ---------------------------------------------------------------------------
  delete from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name like v_name_prefix || '%'
    and s.id::text like 'a0172a00-2026-4000-8000-%';

  get diagnostics v_deleted_items = row_count;

  if v_deleted_items <> v_target_items then
    raise exception
      'P8.17.2a cleanup abort: deleted % rows but targeted %',
      v_deleted_items, v_target_items;
  end if;

  -- ---------------------------------------------------------------------------
  -- 7) Post-delete verification
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_remaining_items
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and (
      s.name like v_name_prefix || '%'
      or s.id::text like 'a0172a00-2026-4000-8000-%'
    );

  select count(*)
  into v_remaining_movements
  from public.stock_movements m
  where m.workspace_id = v_workspace_id
    and (
      m.note = v_batch_marker
      or m.id::text like 'b0172a00-2026-4000-8000-%'
    );

  select count(*)
  into v_non_test_after
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name not like v_name_prefix || '%';

  if v_remaining_items <> 0 then
    raise exception 'P8.17.2a cleanup abort: % batch stock_items remain', v_remaining_items;
  end if;

  if v_remaining_movements <> 0 then
    raise exception 'P8.17.2a cleanup abort: % batch movements remain', v_remaining_movements;
  end if;

  if v_non_test_after <> v_non_test_before then
    raise exception
      'P8.17.2a cleanup abort: non-test stock count changed (% → %)',
      v_non_test_before, v_non_test_after;
  end if;

  raise notice
    'P8.17.2a cleanup OK: deleted_items=% non_test_unchanged=%',
    v_deleted_items, v_non_test_after;
end;
$stock_load_test_cleanup$;

commit;

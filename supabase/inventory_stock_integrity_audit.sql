-- =============================================================================
-- P7.4.6 — Safe validation & integrity audit after auto migration
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Guarantees (READ-ONLY):
--   - No INSERT / UPDATE / DELETE / TRUNCATE
--   - No ALTER / CREATE / DROP
--   - No temporary writes
--   - Completes even when integrity problems exist (NOTICE only; no RAISE)
--
-- Prerequisites:
--   public.inventory_stock_item_map
--   public.stock_items
--   public.inventory_items (for coverage comparison)
-- =============================================================================

do $$
declare
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
  r record;
begin
  -- A) Duplicate migration-map keys (workspace_id + legacy_inventory_item_id)
  select coalesce(sum(n - 1), 0)::bigint into v_dup_map_keys
  from (
    select count(*)::bigint as n
    from public.inventory_stock_item_map
    group by workspace_id, legacy_inventory_item_id
    having count(*) > 1
  ) d;

  -- B) Duplicate stock_item_id references
  select coalesce(sum(n - 1), 0)::bigint into v_dup_stock_refs
  from (
    select count(*)::bigint as n
    from public.inventory_stock_item_map
    where stock_item_id is not null
    group by stock_item_id
    having count(*) > 1
  ) d;

  -- C) Created rows with NULL stock_item_id
  select count(*)::bigint into v_created_null_stock
  from public.inventory_stock_item_map
  where status = 'created' and stock_item_id is null;

  -- D) Linked rows with NULL stock_item_id
  select count(*)::bigint into v_linked_null_stock
  from public.inventory_stock_item_map
  where status = 'linked' and stock_item_id is null;

  -- E) Orphan references (map points to missing stock_items)
  select count(*)::bigint into v_orphan_refs
  from public.inventory_stock_item_map m
  where m.stock_item_id is not null
    and not exists (
      select 1 from public.stock_items s where s.id = m.stock_item_id
    );

  -- F) Cross-workspace references
  select count(*)::bigint into v_cross_workspace
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where s.workspace_id is distinct from m.workspace_id;

  -- G) Invalid status values
  select count(*)::bigint into v_invalid_status
  from public.inventory_stock_item_map
  where status is null
     or status not in (
       'pending', 'classified', 'created', 'linked', 'manual', 'skipped', 'failed'
     );

  -- H) Invalid resolution_type values
  select count(*)::bigint into v_invalid_resolution
  from public.inventory_stock_item_map
  where resolution_type is not null
    and resolution_type not in (
      'auto_create', 'auto_link', 'manual_link', 'manual_create', 'skip'
    );

  -- I) Auto-create still classified
  select count(*)::bigint into v_classified_auto_create
  from public.inventory_stock_item_map
  where status = 'classified' and resolution_type = 'auto_create';

  -- J) Auto-link still classified
  select count(*)::bigint into v_classified_auto_link
  from public.inventory_stock_item_map
  where status = 'classified' and resolution_type = 'auto_link';

  -- K) Manual rows
  select count(*)::bigint into v_manual
  from public.inventory_stock_item_map
  where status = 'manual';

  -- L) Skipped rows
  select count(*)::bigint into v_skipped
  from public.inventory_stock_item_map
  where status = 'skipped';

  -- M) Created stock_items that are inactive
  select count(*)::bigint into v_created_inactive
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.status = 'created'
    and m.resolution_type = 'auto_create'
    and s.active is distinct from true;

  -- N) NULL or empty source_snapshot
  select count(*)::bigint into v_empty_snapshot
  from public.inventory_stock_item_map
  where source_snapshot is null
     or source_snapshot = '{}'::jsonb;

  -- Totals for coverage
  select count(*)::bigint into v_map_total
  from public.inventory_stock_item_map;

  select count(*)::bigint into v_legacy_total
  from public.inventory_items;

  select count(*)::bigint into v_created_total
  from public.inventory_stock_item_map
  where status = 'created';

  select count(*)::bigint into v_linked_total
  from public.inventory_stock_item_map
  where status = 'linked';

  v_stock_coverage := v_created_total + v_linked_total;

  -- NOTICE output
  raise notice '========== P7.4.6 INTEGRITY AUDIT ==========';
  raise notice 'A duplicate_map_key_extra_rows=%', v_dup_map_keys;
  raise notice 'B duplicate_stock_item_id_extra_rows=%', v_dup_stock_refs;
  raise notice 'C created_with_null_stock_item_id=%', v_created_null_stock;
  raise notice 'D linked_with_null_stock_item_id=%', v_linked_null_stock;
  raise notice 'E orphan_stock_item_references=%', v_orphan_refs;
  raise notice 'F cross_workspace_references=%', v_cross_workspace;
  raise notice 'G invalid_status_rows=%', v_invalid_status;
  raise notice 'H invalid_resolution_type_rows=%', v_invalid_resolution;
  raise notice 'I classified_auto_create=%', v_classified_auto_create;
  raise notice 'J classified_auto_link=%', v_classified_auto_link;
  raise notice 'K manual_rows=%', v_manual;
  raise notice 'L skipped_rows=%', v_skipped;
  raise notice 'M created_inactive_stock_items=%', v_created_inactive;
  raise notice 'N null_or_empty_source_snapshot=%', v_empty_snapshot;
  raise notice 'O/P status_resolution distribution follows:';

  for r in
    select status, resolution_type, count(*)::bigint as n
    from public.inventory_stock_item_map
    group by status, resolution_type
    order by status, resolution_type nulls first
  loop
    raise notice '  status=% resolution_type=% count=%',
      r.status, coalesce(r.resolution_type, '<null>'), r.n;
  end loop;

  raise notice 'Q legacy_inventory_items=% mapped_rows=% coverage_gap=%',
    v_legacy_total,
    v_map_total,
    greatest(v_legacy_total - v_map_total, 0);
  raise notice 'R stock_coverage_created_plus_linked=% (created=% linked=%)',
    v_stock_coverage, v_created_total, v_linked_total;
  raise notice '========== P7.4.6 AUDIT COMPLETE ==========';
end $$;

-- =============================================================================
-- VERIFICATION QUERIES (commented — SELECT only)
-- =============================================================================

-- A) Duplicate map keys
-- select workspace_id, legacy_inventory_item_id, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- group by 1, 2
-- having count(*) > 1;

-- B) Duplicate stock_item_id references
-- select stock_item_id, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- where stock_item_id is not null
-- group by 1
-- having count(*) > 1;

-- C) Created with null stock_item_id
-- select * from public.inventory_stock_item_map
-- where status = 'created' and stock_item_id is null;

-- D) Linked with null stock_item_id
-- select * from public.inventory_stock_item_map
-- where status = 'linked' and stock_item_id is null;

-- E) Orphan references
-- select m.*
-- from public.inventory_stock_item_map m
-- where m.stock_item_id is not null
--   and not exists (select 1 from public.stock_items s where s.id = m.stock_item_id);

-- F) Cross-workspace
-- select m.id, m.workspace_id as map_ws, s.workspace_id as stock_ws, m.stock_item_id
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where s.workspace_id is distinct from m.workspace_id;

-- G) Invalid status
-- select * from public.inventory_stock_item_map
-- where status is null
--    or status not in ('pending','classified','created','linked','manual','skipped','failed');

-- H) Invalid resolution_type
-- select * from public.inventory_stock_item_map
-- where resolution_type is not null
--   and resolution_type not in ('auto_create','auto_link','manual_link','manual_create','skip');

-- I / J / K / L counts
-- select count(*) from public.inventory_stock_item_map
-- where status='classified' and resolution_type='auto_create';
-- select count(*) from public.inventory_stock_item_map
-- where status='classified' and resolution_type='auto_link';
-- select count(*) from public.inventory_stock_item_map where status='manual';
-- select count(*) from public.inventory_stock_item_map where status='skipped';

-- M) Created inactive stock
-- select s.id, s.name, s.active
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.status='created' and m.resolution_type='auto_create' and s.active is distinct from true;

-- N) Empty snapshots
-- select count(*) from public.inventory_stock_item_map
-- where source_snapshot is null or source_snapshot = '{}'::jsonb;

-- O / P) Distributions
-- select status, count(*) from public.inventory_stock_item_map group by 1 order by 1;
-- select resolution_type, count(*) from public.inventory_stock_item_map group by 1 order by 1;

-- Q) Coverage
-- select
--   (select count(*) from public.inventory_items) as legacy_total,
--   (select count(*) from public.inventory_stock_item_map) as mapped_total;

-- R) Stock coverage
-- select
--   count(*) filter (where status='created')::bigint as created,
--   count(*) filter (where status='linked')::bigint as linked,
--   count(*) filter (where status in ('created','linked'))::bigint as coverage
-- from public.inventory_stock_item_map;

-- Prove read-only: re-run twice; notices identical; table counts unchanged.
-- select 'map' as t, count(*) from public.inventory_stock_item_map
-- union all select 'stock_items', count(*) from public.stock_items
-- union all select 'inventory_items', count(*) from public.inventory_items;
-- =============================================================================

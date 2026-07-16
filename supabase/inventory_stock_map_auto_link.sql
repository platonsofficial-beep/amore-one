-- =============================================================================
-- P7.4.4a — Safe AUTO-LINK status finalization (map table ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Scope (corrected):
--   - Finalize status classified + auto_link → linked
--   - ONLY when stock_item_id is already persisted and valid in the same workspace
--   - Does NOT resolve / match / write stock_item_id
--   - Does NOT write migrated_at / snapshots / hashes / resolution_type
--   - Does NOT touch stock_items, inventory_items, bar_refills, movements, orders
--
-- Idempotent: already-linked rows are not selected; second run links 0 rows.
-- =============================================================================

do $$
declare
  -- Optional: pin one workspace. NULL = all workspaces with eligible rows.
  v_target_workspace_id uuid := null;

  v_linked bigint := 0;
  v_already_linked bigint := 0;
  v_null_stock_id bigint := 0;
  v_missing_stock bigint := 0;
  v_workspace_mismatch bigint := 0;
  v_skipped bigint := 0;
  v_errors bigint := 0;
  v_eligible_classified bigint := 0;
begin
  -- Already linked (count only; do not mutate)
  select count(*)::bigint into v_already_linked
  from public.inventory_stock_item_map m
  where m.status = 'linked'
    and m.resolution_type = 'auto_link'
    and (v_target_workspace_id is null or m.workspace_id = v_target_workspace_id);

  -- Classified auto_link pool
  select count(*)::bigint into v_eligible_classified
  from public.inventory_stock_item_map m
  where m.status = 'classified'
    and m.resolution_type = 'auto_link'
    and (v_target_workspace_id is null or m.workspace_id = v_target_workspace_id);

  -- Null stock_item_id among classified auto_link
  select count(*)::bigint into v_null_stock_id
  from public.inventory_stock_item_map m
  where m.status = 'classified'
    and m.resolution_type = 'auto_link'
    and m.stock_item_id is null
    and (v_target_workspace_id is null or m.workspace_id = v_target_workspace_id);

  -- Missing target stock item (id set but row absent)
  select count(*)::bigint into v_missing_stock
  from public.inventory_stock_item_map m
  where m.status = 'classified'
    and m.resolution_type = 'auto_link'
    and m.stock_item_id is not null
    and (v_target_workspace_id is null or m.workspace_id = v_target_workspace_id)
    and not exists (
      select 1 from public.stock_items s where s.id = m.stock_item_id
    );

  -- Cross-workspace reference (stock exists but workspace differs)
  select count(*)::bigint into v_workspace_mismatch
  from public.inventory_stock_item_map m
  join public.stock_items s on s.id = m.stock_item_id
  where m.status = 'classified'
    and m.resolution_type = 'auto_link'
    and m.stock_item_id is not null
    and s.workspace_id is distinct from m.workspace_id
    and (v_target_workspace_id is null or m.workspace_id = v_target_workspace_id);

  -- Link ONLY valid persisted references: status column only
  with linked_rows as (
    update public.inventory_stock_item_map m
    set status = 'linked'
    from public.stock_items s
    where m.status = 'classified'
      and m.resolution_type = 'auto_link'
      and m.stock_item_id is not null
      and s.id = m.stock_item_id
      and s.workspace_id = m.workspace_id
      and (
        v_target_workspace_id is null
        or m.workspace_id = v_target_workspace_id
      )
    returning m.id
  )
  select count(*)::bigint into v_linked from linked_rows;

  v_skipped := greatest(
    v_eligible_classified - v_linked,
    0
  );
  v_errors := 0;

  raise notice 'P7.4.4a auto-link status finalization complete';
  raise notice 'successfully_linked=%', v_linked;
  raise notice 'already_linked_not_eligible=%', v_already_linked;
  raise notice 'null_stock_item_id=%', v_null_stock_id;
  raise notice 'missing_target_stock_item=%', v_missing_stock;
  raise notice 'workspace_mismatch=%', v_workspace_mismatch;
  raise notice 'skipped_total=%', v_skipped;
  raise notice 'errors=%', v_errors;
exception
  when others then
    raise notice 'P7.4.4a error: %', sqlerrm;
    raise;
end $$;

-- =============================================================================
-- VERIFICATION (commented — do not auto-execute)
-- =============================================================================

-- Linked rows (auto_link)
-- select count(*)::bigint as linked_auto_link
-- from public.inventory_stock_item_map
-- where status = 'linked' and resolution_type = 'auto_link';

-- Remaining classified + auto_link
-- select count(*)::bigint as remaining_classified_auto_link
-- from public.inventory_stock_item_map
-- where status = 'classified' and resolution_type = 'auto_link';

-- Remaining null stock_item_id among classified auto_link
-- select count(*)::bigint as remaining_null_stock_item_id
-- from public.inventory_stock_item_map
-- where status = 'classified'
--   and resolution_type = 'auto_link'
--   and stock_item_id is null;

-- Missing target references (classified auto_link)
-- select m.id, m.legacy_inventory_item_id, m.workspace_id, m.stock_item_id
-- from public.inventory_stock_item_map m
-- where m.status = 'classified'
--   and m.resolution_type = 'auto_link'
--   and m.stock_item_id is not null
--   and not exists (select 1 from public.stock_items s where s.id = m.stock_item_id);

-- Cross-workspace references
-- select m.id, m.workspace_id as map_workspace, s.workspace_id as stock_workspace, m.stock_item_id
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.status = 'classified'
--   and m.resolution_type = 'auto_link'
--   and s.workspace_id is distinct from m.workspace_id;

-- Duplicate migration-map keys (must be zero)
-- select legacy_inventory_item_id, workspace_id, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- group by 1, 2
-- having count(*) > 1;

-- Status distribution
-- select status, resolution_type, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- group by status, resolution_type
-- order by status, resolution_type;

-- Unchanged catalog counts (compare before/after manually)
-- select 'stock_items' as t, count(*)::bigint as n from public.stock_items
-- union all
-- select 'inventory_items', count(*)::bigint from public.inventory_items;

-- Protected states still present / unchanged after run:
-- select count(*) from public.inventory_stock_item_map
-- where status = 'classified' and resolution_type = 'auto_create';
-- select count(*) from public.inventory_stock_item_map where status = 'manual';
-- select count(*) from public.inventory_stock_item_map where status = 'skipped';
-- select count(*) from public.inventory_stock_item_map where status = 'created';

-- Idempotency: second run → successfully_linked=0

-- =============================================================================
-- ROLLBACK (map status only)
-- =============================================================================
-- update public.inventory_stock_item_map
-- set status = 'classified'
-- where status = 'linked'
--   and resolution_type = 'auto_link';
-- =============================================================================

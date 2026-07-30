-- =============================================================================
-- P8.31.11 — Temporary Real-Label Test Catalog VERIFICATION (read-only)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Do NOT modify data. Run before/after seed as needed.
-- Batch: ONE_REAL_LABEL_TEST_2026_07
-- =============================================================================

-- A) Workspace identity (exact one)
select
  count(*)::bigint as workspace_match_count,
  max(w.id::text) as workspace_id,
  max(w.name) as workspace_name,
  max(w.slug) as workspace_slug
from public.workspaces w
where w.slug = 'amore-nicosia'
   or w.name = 'AMORE.NICOSIA';

-- B) Temporary suppliers
select
  count(*)::bigint as temporary_suppliers,
  count(*) filter (where s.notes like '%ONE_REAL_LABEL_TEST_2026_07%')::bigint as suppliers_with_batch_note
from public.suppliers s
where s.id::text like 'c0318b00-2026-4000-8000-%';

-- C) Batch products + active/inactive
select
  count(*)::bigint as batch_products,
  count(*) filter (where s.active)::bigint as active_count,
  count(*) filter (where not s.active)::bigint as inactive_count,
  count(*) filter (
    where s.name like '%ONE_REAL_LABEL_TEST_2026_07%'
       or coalesce(s.brand, '') like '%ONE_REAL_LABEL_TEST_2026_07%'
  )::bigint as visible_batch_prefix_violations
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%';

-- D) Balances
select
  count(*)::bigint as balances_inserted,
  count(distinct b.stock_item_id)::bigint as distinct_products_with_balances,
  coalesce(sum(b.quantity), 0)::numeric as aggregate_balance_quantity
from public.stock_item_location_balances b
where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%';

-- E) Aggregate item quantity vs balances
select
  coalesce(sum(s.current_quantity), 0)::numeric as aggregate_item_quantity,
  (
    select coalesce(sum(b.quantity), 0)
    from public.stock_item_location_balances b
    where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%'
  )::numeric as aggregate_balance_quantity,
  (
    select count(*)::bigint
    from public.stock_items s
    where s.id::text like 'c0318a00-2026-4000-8000-%'
      and s.current_quantity is distinct from (
        select coalesce(sum(b.quantity), 0)
        from public.stock_item_location_balances b
        where b.stock_item_id = s.id
      )
  )::bigint as aggregate_mismatch_rows
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%';

-- F) Multi-location products
select count(*)::bigint as multi_location_product_count
from (
  select b.stock_item_id
  from public.stock_item_location_balances b
  where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%'
  group by b.stock_item_id
  having count(*) >= 2
) m;

-- G) Healthy / low / out (deterministic from qty vs minimum)
select
  count(*) filter (
    where s.current_quantity > 0 and s.current_quantity >= s.minimum_quantity
  )::bigint as healthy_count,
  count(*) filter (
    where s.current_quantity > 0 and s.current_quantity < s.minimum_quantity
  )::bigint as low_count,
  count(*) filter (where s.current_quantity <= 0)::bigint as out_count
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%';

-- H) Rows by category
select s.category, count(*)::bigint as product_count
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%'
group by s.category
order by s.category;

-- I) Rows by supplier
select s.supplier, count(*)::bigint as product_count
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%'
group by s.supplier
order by s.supplier;

-- J) Balance rows by storage
select b.location_key, count(*)::bigint as balance_rows, coalesce(sum(b.quantity), 0)::numeric as quantity_sum
from public.stock_item_location_balances b
where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%'
group by b.location_key
order by b.location_key;

-- K) Batch movements
select count(*)::bigint as batch_movement_rows
from public.stock_movements m
where m.id::text like 'd0318a00-2026-4000-8000-%'
   or m.note like '%ONE_REAL_LABEL_TEST_2026_07%';

-- L) Non-batch stock items in workspace
select count(*)::bigint as non_batch_stock_item_count
from public.stock_items s
join public.workspaces w on w.id = s.workspace_id
where (w.slug = 'amore-nicosia' or w.name = 'AMORE.NICOSIA')
  and s.id::text not like 'c0318a00-2026-4000-8000-%';

-- Expected after successful first seed (workspace previously empty):
--   temporary_suppliers = 7
--   batch_products = 180
--   active_count = 172
--   inactive_count = 8
--   balances_inserted = 336
--   distinct_products_with_balances = 180
--   multi_location_product_count = 156
--   aggregate_mismatch_rows = 0
--   batch_movement_rows = 336
--   non_batch_stock_item_count = 0
--   visible_batch_prefix_violations = 0

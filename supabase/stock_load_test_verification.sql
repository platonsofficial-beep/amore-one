-- =============================================================================
-- P8.17.2a / P8.31.5 — Stock Load-Test Dataset VERIFICATION (AMORE.NICOSIA)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Read-only queries. Safe to run before/after seed and cleanup.
-- Do NOT auto-run from the app.
--
-- Official cleanup (P8.31.5):
--   supabase/p8_31_5_controlled_test_catalog_cleanup.sql
--
-- Run sections independently as needed. All statements are SELECTs / notices.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Workspace identity
-- -----------------------------------------------------------------------------
select
  w.id,
  w.name,
  w.slug,
  count(*) over () as match_count
from public.workspaces w
where w.slug = 'amore-nicosia'
   or w.name = 'AMORE.NICOSIA';

-- Expect: exactly one row; name AMORE.NICOSIA; slug amore-nicosia

-- -----------------------------------------------------------------------------
-- B) Stock item totals (workspace)
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
)
select
  count(*) filter (
    where s.name like 'ONE_STOCK_LOAD_TEST_2026_07 | %'
  ) as batch_items,
  count(*) filter (
    where s.name not like 'ONE_STOCK_LOAD_TEST_2026_07 | %'
  ) as non_test_items,
  count(*) as total_items
from public.stock_items s
join ws on ws.id = s.workspace_id;

-- Before seed: batch_items = 0
-- After seed:  batch_items = 200
-- After cleanup: batch_items = 0; non_test_items unchanged vs pre-seed snapshot

-- -----------------------------------------------------------------------------
-- C) Category / location / active distribution (batch only)
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
),
batch as (
  select s.*
  from public.stock_items s
  join ws on ws.id = s.workspace_id
  where s.name like 'ONE_STOCK_LOAD_TEST_2026_07 | %'
)
select 'category' as dimension, category as value, count(*)::int as n
from batch
group by category
union all
select 'storage_location', coalesce(nullif(storage_location, ''), '(empty)'), count(*)::int
from batch
group by coalesce(nullif(storage_location, ''), '(empty)')
union all
select 'active', active::text, count(*)::int
from batch
group by active
order by 1, 2;

-- Expected categories after seed (from seed matrix):
--   Spirits 40 | Wine 35 | Beverages 30 | Syrups & Purées 20 | Fresh 25 | Consumables 25 | Other 25

-- -----------------------------------------------------------------------------
-- D) Status-like distribution (mirrors resolveStockItemStatus)
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
),
batch as (
  select
    s.*,
    case
      when s.active is not true then 'inactive'
      when s.current_quantity <= 0 then 'out'
      when s.current_quantity < s.minimum_quantity then 'low'
      else 'ok'
    end as derived_status
  from public.stock_items s
  join ws on ws.id = s.workspace_id
  where s.name like 'ONE_STOCK_LOAD_TEST_2026_07 | %'
)
select derived_status, count(*)::int as n
from batch
group by derived_status
order by derived_status;

-- -----------------------------------------------------------------------------
-- E) Needs Attention eligibility probes (batch)
--    Priority order matches stockInsights.getStockItemAttentionPriority:
--      inactive excluded → out → low → needs_count → missing_data
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
),
batch as (
  select s.*
  from public.stock_items s
  join ws on ws.id = s.workspace_id
  where s.name like 'ONE_STOCK_LOAD_TEST_2026_07 | %'
),
latest_count as (
  select distinct on (m.item_id)
    m.item_id,
    m.created_at
  from public.stock_movements m
  join ws on ws.id = m.workspace_id
  where m.type = 'stock_count'
    and (
      m.note = 'ONE_STOCK_LOAD_TEST_2026_07'
      or m.item_id in (select id from batch)
    )
  order by m.item_id, m.created_at desc
),
classified as (
  select
    b.id,
    b.name,
    b.active,
    b.current_quantity,
    b.minimum_quantity,
    b.supplier,
    b.cost_price,
    lc.created_at as last_count_at,
    case
      when b.active is not true then null
      when b.current_quantity <= 0 then 'out'
      when b.current_quantity < b.minimum_quantity then 'low'
      when lc.created_at is null
        or lc.created_at < (now() - interval '14 days') then 'count'
      when nullif(trim(b.supplier), '') is null
        or coalesce(b.cost_price, 0) <= 0 then 'data'
      else null
    end as attention_group
  from batch b
  left join latest_count lc on lc.item_id = b.id
)
select attention_group, count(*)::int as n
from classified
where attention_group is not null
group by attention_group
order by attention_group;

-- Expect non-zero counts for out, low, count, and data after seed.

-- -----------------------------------------------------------------------------
-- F) Batch movement counts
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
)
select
  count(*) filter (where m.note = 'ONE_STOCK_LOAD_TEST_2026_07') as batch_note_movements,
  count(*) filter (where m.id::text like 'b0172a00-2026-4000-8000-%') as batch_uuid_movements
from public.stock_movements m
join ws on ws.id = m.workspace_id;

-- After seed: both > 0 (fresh counts for indices 1..100)
-- After cleanup: both = 0

-- -----------------------------------------------------------------------------
-- G) Dependent refs that affect cleanup safety
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
),
batch_ids as (
  select s.id
  from public.stock_items s
  join ws on ws.id = s.workspace_id
  where s.name like 'ONE_STOCK_LOAD_TEST_2026_07 | %'
)
select
  (select count(*) from public.inventory_count_session_items csi
    join public.inventory_count_sessions cs on cs.id = csi.session_id
    where csi.item_id in (select id from batch_ids)
      and cs.status in ('in_progress', 'paused', 'counting_complete')) as open_count_item_refs,
  (select count(*) from public.inventory_count_session_items csi
    where csi.item_id in (select id from batch_ids)) as any_count_item_refs,
  (select count(*) from public.stock_order_items oi
    join public.stock_orders o on o.id = oi.order_id
    where o.workspace_id = (select id from ws)
      and oi.stock_item_id in (select id from batch_ids)
      and o.status in ('draft', 'sent')) as draft_sent_order_refs,
  (select count(*) from public.inventory_import_rows r
    where r.matched_stock_item_id in (select id from batch_ids)
       or r.applied_stock_item_id in (select id from batch_ids)) as import_refs,
  (select count(*) from public.inventory_stock_item_map m
    where m.stock_item_id in (select id from batch_ids)) as migration_map_refs;

-- Ideal after seed (unused in counts/orders): all zeros except possibly 0.
-- If operators used products during testing, open_count / draft_sent must be
-- cleared before cleanup.

-- -----------------------------------------------------------------------------
-- H) Name / UUID invariant
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
)
select count(*)::int as invariant_breakers
from public.stock_items s
join ws on ws.id = s.workspace_id
where (
  (s.name like 'ONE_STOCK_LOAD_TEST_2026_07 | %' and s.id::text not like 'a0172a00-2026-4000-8000-%')
  or
  (s.id::text like 'a0172a00-2026-4000-8000-%' and s.name not like 'ONE_STOCK_LOAD_TEST_2026_07 | %')
);

-- Expect: 0

-- -----------------------------------------------------------------------------
-- I) P8.31.5 after-cleanup gate (balances + import FKs + empty batch)
-- -----------------------------------------------------------------------------
with ws as (
  select w.id
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA'
)
select
  (select count(*) from public.stock_items s
    where s.workspace_id = (select id from ws)
      and (
        s.name like 'ONE_STOCK_LOAD_TEST_2026_07 | %'
        or s.id::text like 'a0172a00-2026-4000-8000-%'
      )) as remaining_batch_items,
  (select count(*) from public.stock_movements m
    where m.workspace_id = (select id from ws)
      and (
        m.note = 'ONE_STOCK_LOAD_TEST_2026_07'
        or m.id::text like 'b0172a00-2026-4000-8000-%'
      )) as remaining_batch_movements,
  (select count(*) from public.stock_item_location_balances b
    where b.workspace_id = (select id from ws)
      and b.stock_item_id::text like 'a0172a00-2026-4000-8000-%') as remaining_batch_balances,
  (select count(*) from public.inventory_import_rows r
    where r.workspace_id = (select id from ws)
      and (
        r.matched_stock_item_id::text like 'a0172a00-2026-4000-8000-%'
        or r.applied_stock_item_id::text like 'a0172a00-2026-4000-8000-%'
      )) as remaining_import_batch_fks,
  (select count(*) from public.stock_items s
    where s.workspace_id = (select id from ws)
      and s.name not like 'ONE_STOCK_LOAD_TEST_2026_07 | %') as non_test_items;

-- After successful P8.31.5 cleanup: all remaining_* = 0; non_test_items unchanged.

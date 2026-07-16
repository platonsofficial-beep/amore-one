-- =============================================================================
-- P7.3.3 — Supplier FK backfill (DATABASE PREPARATION ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Prerequisites:
--   1. public.suppliers exists (id bigint, company_name, workspace_id)
--   2. public.stock_items.supplier_id exists (P7.3.1)
--   3. public.stock_orders.supplier_id exists (P7.3.1)
--   4. Prefer suppliers already workspace-scoped (P7.2.4 backfill)
--
-- Matching rules (BOTH stock_items and stock_orders):
--   1. Update ONLY rows where supplier_id IS NULL
--   2. Match ONLY suppliers in the SAME workspace
--        stock_*.workspace_id = suppliers.workspace_id
--   3. Compare names with trim + case-insensitive:
--        lower(trim(stock_*.supplier)) = lower(trim(suppliers.company_name))
--   4. Empty / whitespace-only supplier text → leave NULL (no match)
--   5. Zero matches → leave supplier_id NULL
--   6. Two or more suppliers with the same normalized name in that
--      workspace → AMBIGUOUS → leave supplier_id NULL (do not pick)
--   7. Never overwrite a non-null supplier_id
--   8. Never modify supplier text columns
--
-- This script does NOT:
--   - change schema / indexes / FKs / RLS / triggers
--   - touch application code
--   - backfill inventory_items
-- =============================================================================

-- =============================================================================
-- 1) PRE-FLIGHT / VERIFICATION (run before UPDATE; review carefully)
-- =============================================================================

-- 1a. Totals
-- select count(*)::bigint as total_stock_items from public.stock_items;
-- select count(*)::bigint as total_stock_orders from public.stock_orders;

-- 1b. Current supplier_id population
-- select
--   count(*)::bigint as total_rows,
--   count(*) filter (where supplier_id is not null)::bigint as populated_supplier_id,
--   count(*) filter (where supplier_id is null)::bigint as null_supplier_id
-- from public.stock_items;
--
-- select
--   count(*)::bigint as total_rows,
--   count(*) filter (where supplier_id is not null)::bigint as populated_supplier_id,
--   count(*) filter (where supplier_id is null)::bigint as null_supplier_id
-- from public.stock_orders;

-- 1c. Duplicate supplier names per workspace (ambiguity sources)
-- select
--   s.workspace_id,
--   w.slug,
--   lower(trim(s.company_name)) as company_name_key,
--   count(*)::bigint as row_count,
--   array_agg(s.id order by s.id) as supplier_ids
-- from public.suppliers s
-- left join public.workspaces w on w.id = s.workspace_id
-- where s.workspace_id is not null
--   and trim(s.company_name) <> ''
-- group by s.workspace_id, w.slug, lower(trim(s.company_name))
-- having count(*) > 1
-- order by row_count desc, company_name_key asc;

-- 1d. Unmatched supplier names on stock_items (NULL supplier_id, non-empty text,
--     no unique workspace match)
-- with unique_suppliers as (
--   select
--     workspace_id,
--     lower(trim(company_name)) as name_key
--   from public.suppliers
--   where workspace_id is not null
--     and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) = 1
-- )
-- select
--   si.workspace_id,
--   trim(si.supplier) as supplier_text,
--   count(*)::bigint as item_count
-- from public.stock_items si
-- left join unique_suppliers us
--   on us.workspace_id = si.workspace_id
--  and us.name_key = lower(trim(si.supplier))
-- where si.supplier_id is null
--   and trim(si.supplier) <> ''
--   and us.name_key is null
-- group by si.workspace_id, trim(si.supplier)
-- order by item_count desc, supplier_text asc;

-- 1e. Rows that WOULD be skipped due to ambiguity (stock_items)
-- with ambiguous_suppliers as (
--   select
--     workspace_id,
--     lower(trim(company_name)) as name_key,
--     count(*)::bigint as supplier_count
--   from public.suppliers
--   where workspace_id is not null
--     and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) > 1
-- )
-- select
--   si.workspace_id,
--   trim(si.supplier) as supplier_text,
--   a.supplier_count,
--   count(*)::bigint as item_count
-- from public.stock_items si
-- join ambiguous_suppliers a
--   on a.workspace_id = si.workspace_id
--  and a.name_key = lower(trim(si.supplier))
-- where si.supplier_id is null
--   and trim(si.supplier) <> ''
-- group by si.workspace_id, trim(si.supplier), a.supplier_count
-- order by item_count desc, supplier_text asc;

-- 1f. Unmatched supplier names on stock_orders
-- with unique_suppliers as (
--   select
--     workspace_id,
--     lower(trim(company_name)) as name_key
--   from public.suppliers
--   where workspace_id is not null
--     and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) = 1
-- )
-- select
--   so.workspace_id,
--   trim(so.supplier) as supplier_text,
--   count(*)::bigint as order_count
-- from public.stock_orders so
-- left join unique_suppliers us
--   on us.workspace_id = so.workspace_id
--  and us.name_key = lower(trim(so.supplier))
-- where so.supplier_id is null
--   and trim(so.supplier) <> ''
--   and us.name_key is null
-- group by so.workspace_id, trim(so.supplier)
-- order by order_count desc, supplier_text asc;

-- 1g. Rows that WOULD be skipped due to ambiguity (stock_orders)
-- with ambiguous_suppliers as (
--   select
--     workspace_id,
--     lower(trim(company_name)) as name_key,
--     count(*)::bigint as supplier_count
--   from public.suppliers
--   where workspace_id is not null
--     and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) > 1
-- )
-- select
--   so.workspace_id,
--   trim(so.supplier) as supplier_text,
--   a.supplier_count,
--   count(*)::bigint as order_count
-- from public.stock_orders so
-- join ambiguous_suppliers a
--   on a.workspace_id = so.workspace_id
--  and a.name_key = lower(trim(so.supplier))
-- where so.supplier_id is null
--   and trim(so.supplier) <> ''
-- group by so.workspace_id, trim(so.supplier), a.supplier_count
-- order by order_count desc, supplier_text asc;

-- =============================================================================
-- 2) BACKFILL (idempotent; NULL supplier_id only; unique matches only)
-- =============================================================================
-- Review section 1, then run this block once.

do $$
declare
  v_items_before bigint;
  v_items_updated bigint;
  v_items_after bigint;
  v_orders_before bigint;
  v_orders_updated bigint;
  v_orders_after bigint;
begin
  -- Require supplier_id columns (from stock_supplier_id_columns.sql)
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_items'
      and column_name = 'supplier_id'
  ) then
    raise exception
      'public.stock_items.supplier_id is missing. Run supabase/stock_supplier_id_columns.sql first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_orders'
      and column_name = 'supplier_id'
  ) then
    raise exception
      'public.stock_orders.supplier_id is missing. Run supabase/stock_supplier_id_columns.sql first.';
  end if;

  select count(*) into v_items_before
  from public.stock_items
  where supplier_id is null;

  select count(*) into v_orders_before
  from public.stock_orders
  where supplier_id is null;

  raise notice 'stock_items with NULL supplier_id BEFORE = %', v_items_before;
  raise notice 'stock_orders with NULL supplier_id BEFORE = %', v_orders_before;

  -- Unique suppliers per workspace + normalized company name
  with unique_suppliers as (
    select
      workspace_id,
      lower(trim(company_name)) as name_key,
      (array_agg(id order by id))[1] as supplier_id
    from public.suppliers
    where workspace_id is not null
      and trim(company_name) <> ''
    group by workspace_id, lower(trim(company_name))
    having count(*) = 1
  )
  update public.stock_items si
  set supplier_id = us.supplier_id
  from unique_suppliers us
  where si.supplier_id is null
    and si.workspace_id = us.workspace_id
    and trim(si.supplier) <> ''
    and lower(trim(si.supplier)) = us.name_key;

  get diagnostics v_items_updated = row_count;

  with unique_suppliers as (
    select
      workspace_id,
      lower(trim(company_name)) as name_key,
      (array_agg(id order by id))[1] as supplier_id
    from public.suppliers
    where workspace_id is not null
      and trim(company_name) <> ''
    group by workspace_id, lower(trim(company_name))
    having count(*) = 1
  )
  update public.stock_orders so
  set supplier_id = us.supplier_id
  from unique_suppliers us
  where so.supplier_id is null
    and so.workspace_id = us.workspace_id
    and trim(so.supplier) <> ''
    and lower(trim(so.supplier)) = us.name_key;

  get diagnostics v_orders_updated = row_count;

  select count(*) into v_items_after
  from public.stock_items
  where supplier_id is null;

  select count(*) into v_orders_after
  from public.stock_orders
  where supplier_id is null;

  raise notice 'stock_items rows updated = %', v_items_updated;
  raise notice 'stock_orders rows updated = %', v_orders_updated;
  raise notice 'stock_items with NULL supplier_id AFTER = %', v_items_after;
  raise notice 'stock_orders with NULL supplier_id AFTER = %', v_orders_after;
  raise notice
    'Remaining NULLs are expected for empty text, unmatched names, or ambiguous duplicates.';
end $$;

-- =============================================================================
-- 3) POST-BACKFILL VERIFICATION (run after UPDATE)
-- =============================================================================

-- 3a. Population summary
-- select
--   'stock_items' as table_name,
--   count(*)::bigint as total_rows,
--   count(*) filter (where supplier_id is not null)::bigint as populated_supplier_id,
--   count(*) filter (where supplier_id is null)::bigint as null_supplier_id
-- from public.stock_items
-- union all
-- select
--   'stock_orders',
--   count(*)::bigint,
--   count(*) filter (where supplier_id is not null)::bigint,
--   count(*) filter (where supplier_id is null)::bigint
-- from public.stock_orders;

-- 3b. Remaining unmatched names (non-empty text, still NULL)
-- with unique_suppliers as (
--   select workspace_id, lower(trim(company_name)) as name_key
--   from public.suppliers
--   where workspace_id is not null and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) = 1
-- )
-- select 'stock_items' as table_name, trim(si.supplier) as supplier_text, count(*)::bigint as rows
-- from public.stock_items si
-- left join unique_suppliers us
--   on us.workspace_id = si.workspace_id
--  and us.name_key = lower(trim(si.supplier))
-- where si.supplier_id is null and trim(si.supplier) <> '' and us.name_key is null
-- group by trim(si.supplier)
-- union all
-- select 'stock_orders', trim(so.supplier), count(*)::bigint
-- from public.stock_orders so
-- left join unique_suppliers us
--   on us.workspace_id = so.workspace_id
--  and us.name_key = lower(trim(so.supplier))
-- where so.supplier_id is null and trim(so.supplier) <> '' and us.name_key is null
-- group by trim(so.supplier)
-- order by table_name, rows desc, supplier_text;

-- 3c. Still-skipped rows skipped for ambiguity
-- with ambiguous_suppliers as (
--   select workspace_id, lower(trim(company_name)) as name_key, count(*)::bigint as supplier_count
--   from public.suppliers
--   where workspace_id is not null and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) > 1
-- )
-- select 'stock_items' as table_name, trim(si.supplier) as supplier_text,
--        a.supplier_count, count(*)::bigint as rows
-- from public.stock_items si
-- join ambiguous_suppliers a
--   on a.workspace_id = si.workspace_id
--  and a.name_key = lower(trim(si.supplier))
-- where si.supplier_id is null and trim(si.supplier) <> ''
-- group by trim(si.supplier), a.supplier_count
-- union all
-- select 'stock_orders', trim(so.supplier), a.supplier_count, count(*)::bigint
-- from public.stock_orders so
-- join ambiguous_suppliers a
--   on a.workspace_id = so.workspace_id
--  and a.name_key = lower(trim(so.supplier))
-- where so.supplier_id is null and trim(so.supplier) <> ''
-- group by trim(so.supplier), a.supplier_count
-- order by table_name, rows desc, supplier_text;

-- =============================================================================
-- 4) ROLLBACK (manual; no DROP; no table recreation)
-- =============================================================================
-- Goal: reverse ONLY rows this migration would have written via the unique-match
-- join — i.e. clear supplier_id when it still equals that unique workspace match.
--
-- This does NOT touch:
--   - rows that remain NULL
--   - rows whose supplier_id points at a different supplier than the unique
--     text match (e.g. manual override)
--
-- Caveat: dual-write (P7.3.2) may assign the same unique match. Reversing the
-- unique-match join also clears those. Prefer running rollback soon after this
-- backfill, before relying on dual-write as the sole source of FK values.
--
-- Prefer: note the RAISE NOTICE "rows updated" counts, then run:

-- -- A) stock_items rollback (unique-match reverse only)
-- with unique_suppliers as (
--   select
--     workspace_id,
--     lower(trim(company_name)) as name_key,
--     (array_agg(id order by id))[1] as supplier_id
--   from public.suppliers
--   where workspace_id is not null
--     and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) = 1
-- )
-- update public.stock_items si
-- set supplier_id = null
-- from unique_suppliers us
-- where si.supplier_id is not null
--   and si.supplier_id = us.supplier_id
--   and si.workspace_id = us.workspace_id
--   and trim(si.supplier) <> ''
--   and lower(trim(si.supplier)) = us.name_key;
--
-- -- B) stock_orders rollback (unique-match reverse only)
-- with unique_suppliers as (
--   select
--     workspace_id,
--     lower(trim(company_name)) as name_key,
--     (array_agg(id order by id))[1] as supplier_id
--   from public.suppliers
--   where workspace_id is not null
--     and trim(company_name) <> ''
--   group by workspace_id, lower(trim(company_name))
--   having count(*) = 1
-- )
-- update public.stock_orders so
-- set supplier_id = null
-- from unique_suppliers us
-- where so.supplier_id is not null
--   and so.supplier_id = us.supplier_id
--   and so.workspace_id = us.workspace_id
--   and trim(so.supplier) <> ''
--   and lower(trim(so.supplier)) = us.name_key;
--
-- Do NOT DROP columns or recreate tables.
-- Do NOT blank supplier text.

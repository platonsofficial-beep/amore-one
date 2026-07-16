-- =============================================================================
-- P7.3.1 — Supplier FK columns (schema preparation ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Prerequisites:
--   1. public.suppliers exists (id bigint PK)
--   2. public.stock_items exists
--   3. public.stock_orders exists
--
-- Type compatibility:
--   suppliers.id              = bigint
--   stock_items.supplier_id   = bigint  (nullable)
--   stock_orders.supplier_id  = bigint  (nullable)
--
-- Guarantees:
--   - Columns are NULLABLE (no NOT NULL)
--   - No backfill
--   - No triggers
--   - No RLS changes
--   - Existing text `supplier` columns remain untouched (string authority until later phases)
--   - ON DELETE SET NULL (deleting a supplier clears FK; does not delete items/orders)
--
-- This script does NOT:
--   - change application reads/writes
--   - dual-write or dual-read
--   - touch inventory_items
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stock_items.supplier_id
-- -----------------------------------------------------------------------------
alter table public.stock_items
  add column if not exists supplier_id bigint
    references public.suppliers(id) on delete set null;

create index if not exists stock_items_supplier_id_idx
  on public.stock_items (supplier_id);

create index if not exists stock_items_workspace_supplier_id_idx
  on public.stock_items (workspace_id, supplier_id);

-- -----------------------------------------------------------------------------
-- stock_orders.supplier_id
-- -----------------------------------------------------------------------------
alter table public.stock_orders
  add column if not exists supplier_id bigint
    references public.suppliers(id) on delete set null;

create index if not exists stock_orders_supplier_id_idx
  on public.stock_orders (supplier_id);

create index if not exists stock_orders_workspace_supplier_id_idx
  on public.stock_orders (workspace_id, supplier_id);

-- =============================================================================
-- Verification queries (run after applying; do not auto-execute here)
-- =============================================================================

-- 1) Columns exist and are nullable
-- select
--   table_name,
--   column_name,
--   data_type,
--   is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('stock_items', 'stock_orders')
--   and column_name = 'supplier_id'
-- order by table_name;

-- Expect:
--   stock_items  | supplier_id | bigint | YES
--   stock_orders | supplier_id | bigint | YES

-- 2) Indexes exist
-- select
--   tablename,
--   indexname
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename in ('stock_items', 'stock_orders')
--   and indexname like '%supplier_id%'
-- order by tablename, indexname;

-- Expect indexes including:
--   stock_items_supplier_id_idx
--   stock_items_workspace_supplier_id_idx
--   stock_orders_supplier_id_idx
--   stock_orders_workspace_supplier_id_idx

-- 3) Foreign keys exist (ON DELETE SET NULL)
-- select
--   tc.table_name,
--   tc.constraint_name,
--   kcu.column_name,
--   ccu.table_name as foreign_table_name,
--   ccu.column_name as foreign_column_name,
--   rc.delete_rule
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu
--   on tc.constraint_name = kcu.constraint_name
--  and tc.table_schema = kcu.table_schema
-- join information_schema.constraint_column_usage ccu
--   on ccu.constraint_name = tc.constraint_name
--  and ccu.table_schema = tc.table_schema
-- join information_schema.referential_constraints rc
--   on rc.constraint_name = tc.constraint_name
--  and rc.constraint_schema = tc.table_schema
-- where tc.constraint_type = 'FOREIGN KEY'
--   and tc.table_schema = 'public'
--   and tc.table_name in ('stock_items', 'stock_orders')
--   and kcu.column_name = 'supplier_id';

-- Expect delete_rule = SET NULL for both tables.

-- 4) NULL values allowed (counts should equal total rows before any backfill)
-- select
--   count(*) filter (where supplier_id is null)::bigint as null_supplier_id,
--   count(*)::bigint as total_rows
-- from public.stock_items;
--
-- select
--   count(*) filter (where supplier_id is null)::bigint as null_supplier_id,
--   count(*)::bigint as total_rows
-- from public.stock_orders;

-- =============================================================================
-- Rollback (manual)
-- =============================================================================
-- alter table public.stock_items drop column if exists supplier_id;
-- alter table public.stock_orders drop column if exists supplier_id;
-- (indexes/FKs drop with the columns)

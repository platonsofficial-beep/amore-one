-- =============================================================================
-- P7.4.1 — Inventory → Stock migration identity-map foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Prerequisites:
--   1. public.workspaces exists (id uuid)
--   2. public.stock_items exists (id uuid)
--   3. public.inventory_items may exist (legacy catalog; NO FK from this map)
--
-- This script:
--   - Creates durable public.inventory_stock_item_map
--   - Does NOT insert map rows
--   - Does NOT create/update stock_items
--   - Does NOT create movements
--   - Does NOT alter inventory_items / bar_refills / stock_items
--
-- Type compatibility (repo schemas):
--   inventory_items.id                 = uuid
--   stock_items.id                     = uuid
--   workspaces.id                      = uuid
--   bar_refill_items.inventory_item_id = uuid in bar_refills_schema.sql
--   map.legacy_inventory_item_id       = uuid (aligned with inventory_items.id)
--
-- RLS:
--   Enabled with NO client policies → anon/authenticated cannot access.
--   Service role / SQL editor (bypass RLS) for ops migration only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Identity map table
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_stock_item_map (
  id uuid primary key default gen_random_uuid(),

  -- Legacy identity preserved as uuid (no FK → inventory_items; survives retirement)
  legacy_inventory_item_id uuid not null,

  -- Target workspace for this migration attempt (required)
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,

  -- Canonical stock item once created/linked (nullable until then)
  stock_item_id uuid
    references public.stock_items(id) on delete set null,

  status text not null default 'pending'
    check (status in (
      'pending',
      'classified',
      'created',
      'linked',
      'manual',
      'skipped',
      'failed'
    )),

  resolution_type text
    check (
      resolution_type is null
      or resolution_type in (
        'auto_create',
        'auto_link',
        'manual_link',
        'manual_create',
        'skip'
      )
    ),

  source_snapshot jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  conflict_reason text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  migrated_at timestamptz
);

-- One mapping per legacy item per workspace
create unique index if not exists inventory_stock_item_map_legacy_workspace_uidx
  on public.inventory_stock_item_map (legacy_inventory_item_id, workspace_id);

create index if not exists inventory_stock_item_map_workspace_status_idx
  on public.inventory_stock_item_map (workspace_id, status);

create index if not exists inventory_stock_item_map_stock_item_id_idx
  on public.inventory_stock_item_map (stock_item_id);

comment on table public.inventory_stock_item_map is
  'P7.4 durable audit map from legacy inventory_items into workspace stock_items. No FK to inventory_items so the map survives legacy retirement.';

comment on column public.inventory_stock_item_map.legacy_inventory_item_id is
  'Original inventory_items.id (uuid). Not FK-linked.';

comment on column public.inventory_stock_item_map.stock_item_id is
  'Nullable until auto/manual create or link completes.';

comment on column public.inventory_stock_item_map.source_snapshot is
  'JSONB copy of the legacy row at classify/migrate time.';

comment on column public.inventory_stock_item_map.source_hash is
  'md5(source_snapshot::text) for idempotency / change detection.';

-- Minimal updated_at trigger (repository-standard pattern)
create or replace function public.set_inventory_stock_item_map_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_stock_item_map_set_updated_at
  on public.inventory_stock_item_map;

create trigger inventory_stock_item_map_set_updated_at
  before update on public.inventory_stock_item_map
  for each row
  execute function public.set_inventory_stock_item_map_updated_at();

-- Ops/admin only: enable RLS, no policies for anon/authenticated
alter table public.inventory_stock_item_map enable row level security;

-- Intentionally no GRANT/policy for anon or authenticated.
-- Service role and SQL editor bypass RLS for migration operations.

-- =============================================================================
-- 2) VERIFICATION (commented — run after apply; do not auto-execute)
-- =============================================================================

-- 2a. Table exists
-- select to_regclass('public.inventory_stock_item_map') as map_table;

-- 2b. Columns / nullability
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'inventory_stock_item_map'
-- order by ordinal_position;

-- 2c. Check constraints (status / resolution_type)
-- select conname, pg_get_constraindef(oid)
-- from pg_constraint
-- where conrelid = 'public.inventory_stock_item_map'::regclass
--   and contype = 'c';

-- 2d. Indexes
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'inventory_stock_item_map'
-- order by indexname;

-- 2e. Foreign keys
-- select
--   tc.constraint_name,
--   kcu.column_name,
--   ccu.table_name as foreign_table,
--   ccu.column_name as foreign_column,
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
--   and tc.table_name = 'inventory_stock_item_map';

-- Expect:
--   workspace_id  → workspaces(id)   DELETE CASCADE
--   stock_item_id → stock_items(id)  DELETE SET NULL
--   NO FK on legacy_inventory_item_id

-- 2f. Map initially empty; no application data modified by this script
-- select count(*)::bigint as map_rows from public.inventory_stock_item_map;
-- Expect: 0

-- 2g. Duplicate map rows impossible
-- insert into public.inventory_stock_item_map (
--   legacy_inventory_item_id, workspace_id, source_snapshot, source_hash
-- ) values
--   (1, '<WORKSPACE_UUID>', '{}'::jsonb, ''),
--   (1, '<WORKSPACE_UUID>', '{}'::jsonb, '');
-- Expect: unique violation on (legacy_inventory_item_id, workspace_id)
-- Then delete test rows.

-- =============================================================================
-- 3) READ-ONLY PRODUCTION PROBE (commented — never writes)
-- =============================================================================
-- Uncomment and run in SQL editor. Replace <TARGET_WORKSPACE_UUID> when needed.
-- Do NOT INSERT/UPDATE/DELETE.

-- -----------------------------------------------------------------------------
-- A) Schema / type checks
-- -----------------------------------------------------------------------------
-- select
--   c.table_name,
--   c.column_name,
--   c.data_type,
--   c.udt_name
-- from information_schema.columns c
-- where c.table_schema = 'public'
--   and (
--     (c.table_name = 'inventory_items' and c.column_name = 'id')
--     or (c.table_name = 'stock_items' and c.column_name = 'id')
--     or (c.table_name = 'workspaces' and c.column_name = 'id')
--     or (c.table_name = 'bar_refill_items' and c.column_name = 'inventory_item_id')
--   )
-- order by c.table_name, c.column_name;
--
-- Repo expectation:
--   inventory_items.id                 → uuid
--   stock_items.id                     → uuid
--   workspaces.id                      → uuid
--   bar_refill_items.inventory_item_id → uuid in checked-in schema
--   inventory_stock_item_map.legacy_inventory_item_id → uuid
--     WARNING: if live map type is still bigint, run P8.6.1g alignment before Persist.

-- -----------------------------------------------------------------------------
-- B) Row counts
-- -----------------------------------------------------------------------------
-- select 'inventory_items' as entity, count(*)::bigint as n from public.inventory_items
-- union all
-- select 'stock_items', count(*)::bigint from public.stock_items
-- union all
-- select 'suppliers', count(*)::bigint from public.suppliers
-- union all
-- select 'bar_refills', count(*)::bigint from public.bar_refills
-- union all
-- select 'bar_refill_items', count(*)::bigint from public.bar_refill_items
-- union all
-- select 'bar_refills_draft', count(*)::bigint from public.bar_refills where status = 'draft'
-- union all
-- select 'inventory_stock_item_map', count(*)::bigint from public.inventory_stock_item_map;

-- -----------------------------------------------------------------------------
-- C) Workspace readiness
-- -----------------------------------------------------------------------------
-- select id, name, slug, created_at
-- from public.workspaces
-- order by created_at asc, name asc;
--
-- select count(*)::bigint as workspace_count from public.workspaces;
--
-- -- Guidance:
-- --   0 workspaces → cannot migrate (abort)
-- --   1 workspace  → safe default pin candidate
-- --   >1           → MUST set <TARGET_WORKSPACE_UUID> explicitly
-- --
-- -- WARNING when unpinned:
-- --   Do not classify or insert map rows without an explicit target workspace.

-- -----------------------------------------------------------------------------
-- D) Data-quality classification inputs (legacy)
-- -----------------------------------------------------------------------------
-- -- Blank names
-- select count(*)::bigint as blank_legacy_names
-- from public.inventory_items
-- where trim(item_name) = '';
--
-- -- Duplicate normalized names
-- select lower(trim(item_name)) as name_key, count(*)::bigint as row_count
-- from public.inventory_items
-- where trim(item_name) <> ''
-- group by lower(trim(item_name))
-- having count(*) > 1
-- order by row_count desc, name_key asc;
--
-- -- Categories / subcategories
-- select trim(category) as category, count(*)::bigint as n
-- from public.inventory_items
-- group by trim(category)
-- order by n desc, category;
--
-- select trim(category) as category, trim(subcategory) as subcategory, count(*)::bigint as n
-- from public.inventory_items
-- group by trim(category), trim(subcategory)
-- order by n desc, category, subcategory;
--
-- -- Units
-- select trim(unit) as unit, count(*)::bigint as n
-- from public.inventory_items
-- group by trim(unit)
-- order by n desc, unit;
--
-- -- Supplier names
-- select trim(supplier) as supplier, count(*)::bigint as n
-- from public.inventory_items
-- group by trim(supplier)
-- order by n desc, supplier;
--
-- -- Non-zero quantities
-- select count(*)::bigint as non_zero_qty_rows
-- from public.inventory_items
-- where quantity is not null and quantity <> 0;

-- -----------------------------------------------------------------------------
-- E) V1 collision candidates (caller-supplied target workspace)
-- -----------------------------------------------------------------------------
-- -- Set once per session:
-- --   select '<TARGET_WORKSPACE_UUID>'::uuid as target_workspace_id;
--
-- -- E1. Normalized name collisions (legacy ↔ V1 in target workspace)
-- -- with legacy as (
-- --   select
-- --     id as legacy_id,
-- --     lower(trim(item_name)) as name_key,
-- --     trim(unit) as unit,
-- --     trim(category) as category,
-- --     quantity
-- --   from public.inventory_items
-- --   where trim(item_name) <> ''
-- -- ),
-- -- v1 as (
-- --   select
-- --     id as stock_id,
-- --     lower(trim(name)) as name_key,
-- --     trim(unit) as unit,
-- --     trim(category) as category,
-- --     current_quantity
-- --   from public.stock_items
-- --   where workspace_id = '<TARGET_WORKSPACE_UUID>'::uuid
-- --     and trim(name) <> ''
-- -- )
-- -- select
-- --   l.legacy_id,
-- --   v.stock_id,
-- --   l.name_key,
-- --   l.unit as legacy_unit,
-- --   v.unit as stock_unit,
-- --   l.category as legacy_category,
-- --   v.category as stock_category,
-- --   l.quantity as legacy_qty,
-- --   v.current_quantity as stock_qty
-- -- from legacy l
-- -- join v1 v on v.name_key = l.name_key
-- -- order by l.name_key, l.legacy_id, v.stock_id;
--
-- -- E2. Name + unit matches
-- -- (same CTEs; join on name_key AND lower(unit))
--
-- -- E3. Name + unit + category matches
-- -- (same CTEs; join on name_key AND lower(unit) AND lower(category)
-- --  NOTE: category may need LEGACY_STOCK_CATEGORY_MAP before equality is meaningful)
--
-- -- E4. Multiple V1 matches for one legacy name_key
-- -- select l.name_key, count(distinct v.stock_id)::bigint as v1_matches
-- -- from legacy l
-- -- join v1 v on v.name_key = l.name_key
-- -- group by l.name_key
-- -- having count(distinct v.stock_id) > 1
-- -- order by v1_matches desc, l.name_key;
--
-- -- E5. Both sides non-zero quantity
-- -- select ...
-- -- where coalesce(l.quantity, 0) <> 0
-- --   and coalesce(v.current_quantity, 0) <> 0;
--
-- -- E6. V1 rows with movement history (target workspace)
-- -- select si.id, si.name, count(sm.id)::bigint as movement_count
-- -- from public.stock_items si
-- -- join public.stock_movements sm
-- --   on sm.item_id = si.id
-- --  and sm.workspace_id = si.workspace_id
-- -- where si.workspace_id = '<TARGET_WORKSPACE_UUID>'::uuid
-- -- group by si.id, si.name
-- -- order by movement_count desc, si.name;

-- -----------------------------------------------------------------------------
-- F) Bar Refill dependency probe
-- -----------------------------------------------------------------------------
-- -- Statuses
-- select status, count(*)::bigint as n
-- from public.bar_refills
-- group by status
-- order by status;
--
-- -- Legacy IDs referenced by open (draft) refill lines
-- select
--   bri.inventory_item_id,
--   count(*)::bigint as open_line_count
-- from public.bar_refill_items bri
-- join public.bar_refills br on br.id = bri.refill_id
-- where br.status = 'draft'
--   and bri.inventory_item_id is not null
-- group by bri.inventory_item_id
-- order by open_line_count desc;
--
-- -- Orphan refill line IDs (no matching inventory_items.id)
-- -- NOTE: cast carefully after confirming live types in section A.
-- -- If both are numeric/text-compatible:
-- -- select bri.id as refill_line_id, bri.inventory_item_id, bri.item_name
-- -- from public.bar_refill_items bri
-- -- left join public.inventory_items ii
-- --   on ii.id::text = bri.inventory_item_id::text
-- -- where bri.inventory_item_id is not null
-- --   and ii.id is null;
--
-- -- Distinct inventory_item_id values used historically
-- select count(distinct inventory_item_id)::bigint as distinct_ref_ids
-- from public.bar_refill_items
-- where inventory_item_id is not null;

-- =============================================================================
-- 4) ROLLBACK (map foundation only)
-- =============================================================================
-- drop trigger if exists inventory_stock_item_map_set_updated_at
--   on public.inventory_stock_item_map;
-- drop function if exists public.set_inventory_stock_item_map_updated_at();
-- drop table if exists public.inventory_stock_item_map;
--
-- Does NOT touch inventory_items, stock_items, stock_movements, or bar_refills.

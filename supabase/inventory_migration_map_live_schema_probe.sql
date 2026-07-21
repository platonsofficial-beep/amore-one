-- =============================================================================
-- P8.6.1f — One-Click Live Migration Map Schema and Data Probe
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
--
-- This file is:
--   - READ-ONLY (SELECT / catalog inspection only)
--   - safe to run against production for inspection
--   - NOT a schema migration
--   - NOT a data mutation
--   - NOT an RPC deployment
--
-- OPERATOR WORKFLOW
-- -----------------------------------------------------------------------------
-- 1. Open this complete file.
-- 2. Copy the entire contents.
-- 3. Paste into Supabase SQL Editor.
-- 4. Press Run once.
-- 5. Review every result set in order.
--
-- No UUID editing. No workspace editing. No credentials.
-- No BEGIN / COMMIT / ROLLBACK (no writes are performed).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Live column type probe (catalog)
-- ---------------------------------------------------------------------------
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation
from information_schema.columns c
where c.table_schema = 'public'
  and (
    (c.table_name = 'inventory_items' and c.column_name = 'id')
    or (
      c.table_name = 'inventory_stock_item_map'
      and c.column_name in (
        'id',
        'legacy_inventory_item_id',
        'workspace_id',
        'stock_item_id'
      )
    )
    or (
      c.table_name = 'bar_refill_items'
      and c.column_name = 'inventory_item_id'
    )
  )
order by c.table_name, c.column_name;

-- ---------------------------------------------------------------------------
-- 2) Map total row count
-- ---------------------------------------------------------------------------
select count(*)::bigint as map_total_rows
from public.inventory_stock_item_map;

-- ---------------------------------------------------------------------------
-- 3) Counts by workspace_id / status / resolution_type
-- ---------------------------------------------------------------------------
select
  workspace_id,
  status,
  resolution_type,
  count(*)::bigint as row_count
from public.inventory_stock_item_map
group by workspace_id, status, resolution_type
order by workspace_id, status, resolution_type nulls first;

-- ---------------------------------------------------------------------------
-- 4) Null / non-null stock_item_id and migrated_at counts
-- ---------------------------------------------------------------------------
select
  count(*) filter (where stock_item_id is null)::bigint as stock_item_id_null,
  count(*) filter (where stock_item_id is not null)::bigint as stock_item_id_present,
  count(*) filter (where migrated_at is null)::bigint as migrated_at_null,
  count(*) filter (where migrated_at is not null)::bigint as migrated_at_present
from public.inventory_stock_item_map;

-- ---------------------------------------------------------------------------
-- 5) Earliest / latest timestamps
-- ---------------------------------------------------------------------------
select
  min(created_at) as earliest_created_at,
  max(created_at) as latest_created_at,
  min(updated_at) as earliest_updated_at,
  max(updated_at) as latest_updated_at,
  min(migrated_at) as earliest_migrated_at,
  max(migrated_at) as latest_migrated_at
from public.inventory_stock_item_map;

-- ---------------------------------------------------------------------------
-- 6) Deterministic bounded sample (up to 50 rows)
-- ---------------------------------------------------------------------------
select
  id,
  workspace_id,
  legacy_inventory_item_id,
  stock_item_id,
  status,
  resolution_type,
  migrated_at,
  created_at,
  updated_at,
  conflict_reason,
  source_snapshot
from public.inventory_stock_item_map
order by created_at asc nulls last, id asc
limit 50;

-- ---------------------------------------------------------------------------
-- 7) Legacy key quality — distinct keys, min/max, cross-workspace duplicates
-- ---------------------------------------------------------------------------
select
  count(distinct legacy_inventory_item_id)::bigint as distinct_legacy_keys,
  min(legacy_inventory_item_id) as min_legacy_key,
  max(legacy_inventory_item_id) as max_legacy_key
from public.inventory_stock_item_map;

select
  legacy_inventory_item_id,
  count(*)::bigint as row_count,
  count(distinct workspace_id)::bigint as workspace_count
from public.inventory_stock_item_map
group by legacy_inventory_item_id
having count(*) > 1
    or count(distinct workspace_id) > 1
order by workspace_count desc, row_count desc, legacy_inventory_item_id
limit 100;

-- ---------------------------------------------------------------------------
-- 8) Source snapshot identity signals (no bigint→uuid cast / remap)
-- ---------------------------------------------------------------------------
select
  count(*)::bigint as map_rows,
  count(*) filter (
    where source_snapshot is not null
      and source_snapshot <> '{}'::jsonb
  )::bigint as rows_with_nonempty_source_snapshot,
  count(*) filter (
    where coalesce(source_snapshot ? 'id', false)
  )::bigint as snapshot_has_id_key,
  count(*) filter (
    where coalesce(
      source_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      false
    )
  )::bigint as snapshot_id_looks_like_uuid,
  count(*) filter (
    where coalesce(nullif(btrim(source_snapshot->>'item_name'), ''), '') <> ''
       or coalesce(nullif(btrim(source_snapshot->>'name'), ''), '') <> ''
  )::bigint as snapshot_has_item_name,
  count(*) filter (
    where coalesce(nullif(btrim(source_snapshot->>'category'), ''), '') <> ''
  )::bigint as snapshot_has_category,
  count(*) filter (
    where coalesce(nullif(btrim(source_snapshot->>'unit'), ''), '') <> ''
  )::bigint as snapshot_has_unit
from public.inventory_stock_item_map;

select
  legacy_inventory_item_id,
  status,
  resolution_type,
  stock_item_id,
  source_snapshot->>'id' as snapshot_id,
  coalesce(
    nullif(btrim(source_snapshot->>'item_name'), ''),
    nullif(btrim(source_snapshot->>'name'), '')
  ) as snapshot_item_name,
  source_snapshot->>'category' as snapshot_category,
  source_snapshot->>'unit' as snapshot_unit,
  source_snapshot
from public.inventory_stock_item_map
order by created_at asc nulls last, id asc
limit 50;

-- ---------------------------------------------------------------------------
-- 9) Indexes on inventory_stock_item_map (incl. legacy_inventory_item_id)
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  t.relname as table_name,
  i.relname as index_name,
  ix.indisunique as is_unique,
  ix.indisprimary as is_primary,
  ix.indisvalid as is_valid,
  pg_get_indexdef(ix.indexrelid) as index_definition
from pg_index ix
join pg_class t on t.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'inventory_stock_item_map'
order by i.relname;

-- ---------------------------------------------------------------------------
-- 10) Constraints (PK / UNIQUE / CHECK / FK)
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  t.relname as table_name,
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'inventory_stock_item_map'
order by c.contype, c.conname;

-- ---------------------------------------------------------------------------
-- 11) Triggers
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  t.relname as table_name,
  tr.tgname as trigger_name,
  pg_get_triggerdef(tr.oid) as trigger_definition
from pg_trigger tr
join pg_class t on t.oid = tr.tgrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'inventory_stock_item_map'
  and not tr.tgisinternal
order by tr.tgname;

-- ---------------------------------------------------------------------------
-- 12) RLS policies
-- ---------------------------------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'inventory_stock_item_map'
order by policyname;

-- ---------------------------------------------------------------------------
-- 13) Views / materialized views referencing the map table
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  c.relname as view_name,
  c.relkind as relkind,
  pg_get_viewdef(c.oid, true) as view_definition
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class c on c.oid = r.ev_class
join pg_namespace n on n.oid = c.relnamespace
join pg_class t on t.oid = d.refobjid
join pg_namespace tn on tn.oid = t.relnamespace
where d.deptype = 'n'
  and tn.nspname = 'public'
  and t.relname = 'inventory_stock_item_map'
  and c.relkind in ('v', 'm')
order by n.nspname, c.relname;

-- ---------------------------------------------------------------------------
-- 14) Functions / procedures referencing map or legacy_inventory_item_id
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  l.lanname as language,
  left(pg_get_functiondef(p.oid), 4000) as definition_excerpt
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and (
    pg_get_functiondef(p.oid) ilike '%inventory_stock_item_map%'
    or pg_get_functiondef(p.oid) ilike '%legacy_inventory_item_id%'
  )
order by
  case p.proname
    when 'run_inventory_migration_persist' then 1
    when 'run_inventory_migration_auto_link' then 2
    when 'run_inventory_migration_phase1' then 3
    when 'run_inventory_migration_phase2' then 4
    when 'run_inventory_migration_preview' then 5
    when 'run_inventory_migration_post_apply_audit' then 6
    when 'run_inventory_migration_integrity_audit' then 7
    when 'run_inventory_migration_preflight' then 8
    when 'complete_inventory_migration_session' then 9
    when 'cancel_inventory_migration_session' then 10
    when 'start_inventory_migration_session' then 11
    else 100
  end,
  p.proname,
  pg_get_function_identity_arguments(p.oid);

-- Explicit presence check for critical product RPCs (empty if not deployed)
select
  expected.function_name,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = expected.function_name
  ) as is_present
from (
  values
    ('run_inventory_migration_persist'),
    ('run_inventory_migration_auto_link'),
    ('run_inventory_migration_auto_create'),
    ('run_inventory_migration_phase1'),
    ('run_inventory_migration_phase2'),
    ('run_inventory_migration_preview'),
    ('run_inventory_migration_post_apply_audit'),
    ('run_inventory_migration_integrity_audit'),
    ('run_inventory_migration_preflight'),
    ('complete_inventory_migration_session'),
    ('cancel_inventory_migration_session'),
    ('start_inventory_migration_session')
) as expected(function_name)
order by expected.function_name;

-- ---------------------------------------------------------------------------
-- 15) Final factual classification summary
-- ---------------------------------------------------------------------------
select
  (
    select c.udt_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'inventory_items'
      and c.column_name = 'id'
  ) as inventory_items_id_type,
  (
    select c.udt_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'inventory_stock_item_map'
      and c.column_name = 'legacy_inventory_item_id'
  ) as map_legacy_id_type,
  (select count(*)::bigint from public.inventory_stock_item_map) as map_total_rows,
  (
    select count(*)::bigint
    from public.inventory_stock_item_map
    where stock_item_id is not null
  ) as map_rows_with_stock_item,
  (
    select count(*)::bigint
    from public.inventory_stock_item_map
    where migrated_at is not null
  ) as map_rows_migrated,
  (
    select count(*)::bigint
    from public.inventory_stock_item_map
    where source_snapshot is not null
      and source_snapshot <> '{}'::jsonb
  ) as map_rows_with_source_snapshot,
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        pg_get_functiondef(p.oid) ilike '%inventory_stock_item_map%'
        or pg_get_functiondef(p.oid) ilike '%legacy_inventory_item_id%'
      )
  ) as dependency_count,
  (
    (select count(*)::bigint from public.inventory_stock_item_map) = 0
  ) as can_use_simple_empty_table_alignment,
  (
    (select count(*)::bigint from public.inventory_stock_item_map) > 0
  ) as requires_existing_row_remap_review,
  case
    when (select count(*)::bigint from public.inventory_stock_item_map) = 0 then
      'MAP EMPTY — UUID ALIGNMENT CAN BE DESIGNED AS AN EMPTY-TABLE SCHEMA MIGRATION'
    else
      'MAP CONTAINS DATA — REVIEW AND REMAP STRATEGY REQUIRED BEFORE UUID ALIGNMENT'
  end as final_probe_message;

-- =============================================================================
-- P8.26.4 — Workspace Storage Backfill & Verification
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/workspace_storages_schema.sql (P8.26.1)
--   2. public.stock_items exists with storage_location
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Populate public.workspace_storages from DISTINCT stock_items.storage_location
--   values per workspace, preserving exact operational strings.
--
-- Architecture (P8.26.0):
--   stock_items.storage_location remains the Count exact-match key.
--   This script NEVER rewrites stock_items or Inventory Count tables.
--
-- Rules:
--   - ignore NULL / empty-after-trim keys
--   - preserve exact casing, punctuation, and inner spacing
--   - do NOT lowercase / fuzzy-merge / rename
--   - case-only collisions and outer-whitespace variants are reported only
--   - insert only schema-safe keys that are unique on lower(btrim(key))
--   - idempotent: ON CONFLICT DO NOTHING
--
-- Optional default seed:
--   STOCK_LOCATIONS templates are inserted ONLY for workspaces that still have
--   zero workspace_storages rows after the stock_items backfill.
--   Never overwrites existing catalog rows.
-- =============================================================================

-- =============================================================================
-- 1) PRE-FLIGHT VERIFICATION (review before insert; no writes)
-- =============================================================================

-- 1a. Distinct exact storage keys per workspace (source inventory)
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.storage_location as location_key,
  count(*)::bigint as stock_item_rows
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.storage_location is not null
  and length(btrim(si.storage_location)) > 0
group by si.workspace_id, w.slug, si.storage_location
order by w.slug nulls last, si.storage_location;

-- 1b. Case-only collisions (same lower(btrim), different exact keys)
--     Manual review required — do NOT auto-merge.
select
  si.workspace_id,
  w.slug as workspace_slug,
  lower(btrim(si.storage_location)) as name_normalized,
  count(distinct si.storage_location)::bigint as distinct_exact_keys,
  array_agg(distinct si.storage_location order by si.storage_location) as exact_keys
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.storage_location is not null
  and length(btrim(si.storage_location)) > 0
group by si.workspace_id, w.slug, lower(btrim(si.storage_location))
having count(distinct si.storage_location) > 1
order by distinct_exact_keys desc, name_normalized asc;

-- 1c. Outer-whitespace variants (exact key != btrim(exact key))
--     Cannot insert into workspace_storages (CHECK rejects outer pad).
--     stock_items rows are left unchanged for manual cleanup.
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.storage_location as exact_key,
  btrim(si.storage_location) as trimmed_key,
  count(*)::bigint as stock_item_rows
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.storage_location is not null
  and length(btrim(si.storage_location)) > 0
  and si.storage_location is distinct from btrim(si.storage_location)
group by si.workspace_id, w.slug, si.storage_location
order by w.slug nulls last, exact_key;

-- 1d. Over-length keys (>80) — skipped by insert; report only
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.storage_location as location_key,
  char_length(si.storage_location) as key_length,
  count(*)::bigint as stock_item_rows
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.storage_location is not null
  and length(btrim(si.storage_location)) > 0
  and char_length(si.storage_location) > 80
group by si.workspace_id, w.slug, si.storage_location
order by key_length desc, location_key asc;

-- 1e. Current workspace_storages population
select
  ws.workspace_id,
  w.slug as workspace_slug,
  count(*)::bigint as storage_count,
  count(*) filter (where ws.active)::bigint as active_count
from public.workspace_storages ws
left join public.workspaces w on w.id = ws.workspace_id
group by ws.workspace_id, w.slug
order by w.slug nulls last;

-- =============================================================================
-- 2) BACKFILL FROM stock_items (idempotent insert only)
-- =============================================================================
-- Inserts schema-safe exact keys that are the sole representative of their
-- name_normalized group inside the workspace. Collision groups are skipped
-- (see section 1b) until an operator resolves them manually.
-- Does NOT UPDATE/DELETE stock_items or Inventory Count tables.

insert into public.workspace_storages (
  workspace_id,
  location_key,
  name,
  sort_order,
  active
)
with distinct_keys as (
  select distinct
    si.workspace_id,
    si.storage_location as location_key
  from public.stock_items si
  where si.storage_location is not null
    and length(btrim(si.storage_location)) > 0
),
schema_safe as (
  select
    dk.workspace_id,
    dk.location_key
  from distinct_keys dk
  where dk.location_key = btrim(dk.location_key)
    and length(dk.location_key) > 0
    and char_length(dk.location_key) <= 80
),
normalized_groups as (
  select
    ss.workspace_id,
    lower(btrim(ss.location_key)) as name_normalized,
    count(*)::bigint as exact_key_count
  from schema_safe ss
  group by ss.workspace_id, lower(btrim(ss.location_key))
),
safe_unique as (
  select
    ss.workspace_id,
    ss.location_key
  from schema_safe ss
  inner join normalized_groups ng
    on ng.workspace_id = ss.workspace_id
   and ng.name_normalized = lower(btrim(ss.location_key))
  where ng.exact_key_count = 1
)
select
  su.workspace_id,
  su.location_key,
  su.location_key as name, -- V1: name == location_key
  (row_number() over (
    partition by su.workspace_id
    order by su.location_key
  ) - 1)::integer as sort_order,
  true as active
from safe_unique su
on conflict (workspace_id, location_key) do nothing;

-- =============================================================================
-- 3) OPTIONAL DEFAULT SEED (STOCK_LOCATIONS templates)
-- =============================================================================
-- Runs ONLY for workspaces that still have zero workspace_storages rows.
-- Never overwrites custom catalog values. Idempotent via ON CONFLICT.

insert into public.workspace_storages (
  workspace_id,
  location_key,
  name,
  sort_order,
  active
)
select
  w.id as workspace_id,
  seed.location_key,
  seed.location_key as name,
  seed.sort_order,
  true as active
from public.workspaces w
cross join (
  values
    (0, 'Main Storage'),
    (1, 'Bar'),
    (2, 'Fridge'),
    (3, 'Freezer'),
    (4, 'Wine Storage'),
    (5, 'Coffee Station'),
    (6, 'Kitchen'),
    (7, 'Other')
) as seed(sort_order, location_key)
where not exists (
  select 1
  from public.workspace_storages ws
  where ws.workspace_id = w.id
)
on conflict (workspace_id, location_key) do nothing;

-- =============================================================================
-- 4) POST-FLIGHT VERIFICATION (manual review; no writes)
-- =============================================================================

-- 4a. Catalog counts after backfill/seed
select
  ws.workspace_id,
  w.slug as workspace_slug,
  count(*)::bigint as storage_count,
  count(*) filter (where ws.active)::bigint as active_count
from public.workspace_storages ws
left join public.workspaces w on w.id = ws.workspace_id
group by ws.workspace_id, w.slug
order by w.slug nulls last;

-- 4b. Exact stock keys still missing from catalog (schema-safe, non-colliding)
--     Expect 0 for clean workspaces; remaining rows need operator action.
with distinct_keys as (
  select distinct
    si.workspace_id,
    si.storage_location as location_key
  from public.stock_items si
  where si.storage_location is not null
    and length(btrim(si.storage_location)) > 0
),
schema_safe as (
  select dk.*
  from distinct_keys dk
  where dk.location_key = btrim(dk.location_key)
    and char_length(dk.location_key) <= 80
),
normalized_groups as (
  select
    ss.workspace_id,
    lower(btrim(ss.location_key)) as name_normalized,
    count(*)::bigint as exact_key_count
  from schema_safe ss
  group by ss.workspace_id, lower(btrim(ss.location_key))
),
safe_unique as (
  select ss.*
  from schema_safe ss
  inner join normalized_groups ng
    on ng.workspace_id = ss.workspace_id
   and ng.name_normalized = lower(btrim(ss.location_key))
  where ng.exact_key_count = 1
)
select
  su.workspace_id,
  w.slug as workspace_slug,
  su.location_key
from safe_unique su
left join public.workspaces w on w.id = su.workspace_id
where not exists (
  select 1
  from public.workspace_storages ws
  where ws.workspace_id = su.workspace_id
    and ws.location_key = su.location_key
)
order by w.slug nulls last, su.location_key;

-- 4c. Re-list unresolved case-only collisions (unchanged by this script)
select
  si.workspace_id,
  w.slug as workspace_slug,
  lower(btrim(si.storage_location)) as name_normalized,
  count(distinct si.storage_location)::bigint as distinct_exact_keys,
  array_agg(distinct si.storage_location order by si.storage_location) as exact_keys
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.storage_location is not null
  and length(btrim(si.storage_location)) > 0
group by si.workspace_id, w.slug, lower(btrim(si.storage_location))
having count(distinct si.storage_location) > 1
order by distinct_exact_keys desc, name_normalized asc;

-- 4d. Re-list outer-whitespace variants (stock_items unchanged)
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.storage_location as exact_key,
  btrim(si.storage_location) as trimmed_key,
  count(*)::bigint as stock_item_rows
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.storage_location is not null
  and length(btrim(si.storage_location)) > 0
  and si.storage_location is distinct from btrim(si.storage_location)
group by si.workspace_id, w.slug, si.storage_location
order by w.slug nulls last, exact_key;

-- =============================================================================
-- 5) SAFETY NOTES
-- =============================================================================
-- This script intentionally contains:
--   - INSERT into public.workspace_storages only
--   - SELECT verification queries
--
-- This script must NEVER contain:
--   - UPDATE / DELETE / TRUNCATE on stock_items
--   - UPDATE / DELETE on inventory_count_sessions
--   - UPDATE / DELETE on inventory_count_session_locations
--   - snapshot / posted history mutations
--   - rename / merge / lowercase rewrite of storage keys
-- =============================================================================
-- Rollback (emergency only — removes catalog rows created by this process)
-- =============================================================================
-- Prefer restore from backup. If you must clear a workspace catalog:
--   delete from public.workspace_storages where workspace_id = '<uuid>';
-- Do NOT use rollback to rewrite stock_items.storage_location.

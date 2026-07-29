-- =============================================================================
-- P8.29.4 — Balance Backfill & Aggregate Verification
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/stock_item_location_balances_schema.sql (P8.29.2)
--   2. supabase/workspace_storages_schema.sql + workspace_storages_backfill.sql
--   3. public.stock_items populated with current_quantity + storage_location
-- Do NOT auto-run from the app.
-- Run as a privileged role (Supabase SQL Editor). Client roles cannot INSERT
-- into stock_item_location_balances (SELECT-only RLS by design).
--
-- Purpose:
--   Create exactly ONE balance row per stock item from:
--     quantity  = stock_items.current_quantity
--     location  = stock_items.storage_location (exact match → workspace_storages)
--
-- Contract:
--   P8.29.1 — Multi-Location Product Contract Lock
--
-- Rules:
--   - resolve workspace_storage_id via exact (workspace_id, location_key)
--   - NEVER invent / insert workspace_storages rows
--   - NEVER mutate stock_items.current_quantity or storage_location
--   - NEVER insert stock_movements
--   - STOP with exception if any item cannot resolve storage
--   - idempotent: ON CONFLICT DO NOTHING on unique (workspace, item, storage)
--
-- Does NOT:
--   - cut over runtime readers/writers to balances
--   - create mutation RPCs
--   - touch Inventory Count / Import / Dashboard / services / UI
-- =============================================================================

-- =============================================================================
-- 1) PRE-FLIGHT VERIFICATION (review before transactional backfill; no writes)
-- =============================================================================

-- 1a. Stock items vs existing balances
select
  (select count(*)::bigint from public.stock_items) as stock_item_rows,
  (select count(*)::bigint from public.stock_item_location_balances) as balance_rows;

-- 1b. Items whose storage_location does not resolve to workspace_storages
--     Expect 0 before running section 2. Any rows here must be fixed via
--     workspace_storages_backfill.sql / manual catalog repair — not invented here.
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.id as stock_item_id,
  si.name as stock_item_name,
  si.storage_location as location_key,
  si.current_quantity
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
left join public.workspace_storages ws
  on ws.workspace_id = si.workspace_id
 and ws.location_key = si.storage_location
where ws.id is null
order by w.slug nulls last, si.storage_location, si.name;

-- 1c. Invalid / unsafe storage_location values (blank, padded, over-length)
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.id as stock_item_id,
  si.storage_location as location_key,
  case
    when si.storage_location is null then 'null_key'
    when length(btrim(si.storage_location)) = 0 then 'blank_key'
    when si.storage_location is distinct from btrim(si.storage_location) then 'outer_whitespace'
    when char_length(si.storage_location) > 80 then 'over_length'
    else 'other'
  end as issue
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.storage_location is null
   or length(btrim(si.storage_location)) = 0
   or si.storage_location is distinct from btrim(si.storage_location)
   or char_length(si.storage_location) > 80
order by issue, w.slug nulls last, si.storage_location;

-- 1d. Negative current_quantity (cannot insert into non-negative balances)
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.id as stock_item_id,
  si.name,
  si.current_quantity
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
where si.current_quantity < 0
order by w.slug nulls last, si.name;

-- =============================================================================
-- 2) TRANSACTIONAL BACKFILL (validate → insert → verify aggregates)
-- =============================================================================
-- Run this entire block together. Failure rolls back; no orphan balances.

begin;

do $p8294_precheck$
declare
  v_missing_workspace bigint;
  v_missing_storage bigint;
  v_invalid_key bigint;
  v_negative_qty bigint;
  v_sample text;
begin
  if to_regclass('public.stock_items') is null then
    raise exception 'P8.29.4: public.stock_items does not exist';
  end if;

  if to_regclass('public.workspace_storages') is null then
    raise exception
      'P8.29.4: public.workspace_storages does not exist. Apply workspace_storages_schema.sql first.';
  end if;

  if to_regclass('public.stock_item_location_balances') is null then
    raise exception
      'P8.29.4: public.stock_item_location_balances does not exist. Apply stock_item_location_balances_schema.sql first.';
  end if;

  if to_regclass('public.workspaces') is null then
    raise exception 'P8.29.4: public.workspaces does not exist';
  end if;

  select count(*)::bigint
  into v_missing_workspace
  from public.stock_items si
  where not exists (
    select 1 from public.workspaces w where w.id = si.workspace_id
  );

  if v_missing_workspace > 0 then
    raise exception
      'P8.29.4: % stock_items row(s) reference a missing workspace. Refusing backfill.',
      v_missing_workspace;
  end if;

  select count(*)::bigint
  into v_invalid_key
  from public.stock_items si
  where si.storage_location is null
     or length(btrim(si.storage_location)) = 0
     or si.storage_location is distinct from btrim(si.storage_location)
     or char_length(si.storage_location) > 80;

  if v_invalid_key > 0 then
    raise exception
      'P8.29.4: % stock_items row(s) have null/blank/padded/over-length storage_location. Fix keys before balance backfill; refusing to invent storages.',
      v_invalid_key;
  end if;

  select count(*)::bigint
  into v_negative_qty
  from public.stock_items si
  where si.current_quantity < 0;

  if v_negative_qty > 0 then
    raise exception
      'P8.29.4: % stock_items row(s) have negative current_quantity. Balances require quantity >= 0; refusing backfill.',
      v_negative_qty;
  end if;

  select count(*)::bigint
  into v_missing_storage
  from public.stock_items si
  where not exists (
    select 1
    from public.workspace_storages ws
    where ws.workspace_id = si.workspace_id
      and ws.location_key = si.storage_location
  );

  if v_missing_storage > 0 then
    select string_agg(distinct si.storage_location, ', ' order by si.storage_location)
    into v_sample
    from public.stock_items si
    where not exists (
      select 1
      from public.workspace_storages ws
      where ws.workspace_id = si.workspace_id
        and ws.location_key = si.storage_location
    );

    raise exception
      'P8.29.4: % stock_items row(s) have storage_location with no matching workspace_storages.location_key (exact). Sample keys: %. Run workspace_storages_backfill.sql / repair catalog first. Refusing to invent storages or create orphan balances.',
      v_missing_storage,
      coalesce(v_sample, '<none>');
  end if;
end;
$p8294_precheck$;

-- Exactly one balance per item at resolved primary storage.
-- Idempotent: unique (workspace_id, stock_item_id, workspace_storage_id)
-- ON CONFLICT DO NOTHING (does not rewrite quantity on re-run).
insert into public.stock_item_location_balances (
  workspace_id,
  stock_item_id,
  workspace_storage_id,
  location_key,
  quantity,
  quantity_version,
  updated_by
)
select
  si.workspace_id,
  si.id as stock_item_id,
  ws.id as workspace_storage_id,
  ws.location_key,
  si.current_quantity as quantity,
  1::bigint as quantity_version,
  null::uuid as updated_by
from public.stock_items si
inner join public.workspace_storages ws
  on ws.workspace_id = si.workspace_id
 and ws.location_key = si.storage_location
on conflict (workspace_id, stock_item_id, workspace_storage_id) do nothing;

do $p8294_verify$
declare
  v_items_without_one_balance bigint;
  v_aggregate_mismatches bigint;
  v_duplicate_item_balances bigint;
begin
  -- Every stock item must have exactly one balance row after backfill.
  select count(*)::bigint
  into v_items_without_one_balance
  from public.stock_items si
  where (
    select count(*)::bigint
    from public.stock_item_location_balances b
    where b.workspace_id = si.workspace_id
      and b.stock_item_id = si.id
  ) <> 1;

  if v_items_without_one_balance > 0 then
    raise exception
      'P8.29.4 verify: % stock_items row(s) do not have exactly one balance. Duplicate protection / incomplete backfill detected.',
      v_items_without_one_balance;
  end if;

  select count(*)::bigint
  into v_duplicate_item_balances
  from (
    select b.workspace_id, b.stock_item_id
    from public.stock_item_location_balances b
    group by b.workspace_id, b.stock_item_id
    having count(*) > 1
  ) d;

  if v_duplicate_item_balances > 0 then
    raise exception
      'P8.29.4 verify: % item(s) have more than one balance row. Duplicate balance target detected; refusing to leave inconsistent state.',
      v_duplicate_item_balances;
  end if;

  -- SUM(location balances) must equal stock_items.current_quantity (no qty rewrite).
  select count(*)::bigint
  into v_aggregate_mismatches
  from public.stock_items si
  where si.current_quantity is distinct from (
    select coalesce(sum(b.quantity), 0)
    from public.stock_item_location_balances b
    where b.workspace_id = si.workspace_id
      and b.stock_item_id = si.id
  );

  if v_aggregate_mismatches > 0 then
    raise exception
      'P8.29.4 verify: % stock_items row(s) have SUM(balances) <> current_quantity. current_quantity was not updated; investigate before cutover.',
      v_aggregate_mismatches;
  end if;

  raise notice 'P8.29.4: balance backfill verified — one balance per item; aggregates match current_quantity';
end;
$p8294_verify$;

commit;

-- =============================================================================
-- 3) POST-FLIGHT VERIFICATION QUERIES (manual review; no writes)
-- =============================================================================

-- 3a. Aggregate verification (expect 0 rows)
--     SUM(location balances) == stock_items.current_quantity
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.id as stock_item_id,
  si.name,
  si.storage_location,
  si.current_quantity,
  coalesce(sum(b.quantity), 0) as balance_sum,
  (si.current_quantity - coalesce(sum(b.quantity), 0)) as drift
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
left join public.stock_item_location_balances b
  on b.workspace_id = si.workspace_id
 and b.stock_item_id = si.id
group by si.workspace_id, w.slug, si.id, si.name, si.storage_location, si.current_quantity
having si.current_quantity is distinct from coalesce(sum(b.quantity), 0)
order by w.slug nulls last, si.name;

-- 3b. Coverage: items without exactly one balance (expect 0)
select
  si.workspace_id,
  w.slug as workspace_slug,
  si.id as stock_item_id,
  si.name,
  count(b.id)::bigint as balance_count
from public.stock_items si
left join public.workspaces w on w.id = si.workspace_id
left join public.stock_item_location_balances b
  on b.workspace_id = si.workspace_id
 and b.stock_item_id = si.id
group by si.workspace_id, w.slug, si.id, si.name
having count(b.id) <> 1
order by balance_count desc, si.name;

-- 3c. Counts after backfill
select
  (select count(*)::bigint from public.stock_items) as stock_item_rows,
  (select count(*)::bigint from public.stock_item_location_balances) as balance_rows,
  (select count(distinct stock_item_id)::bigint from public.stock_item_location_balances) as distinct_items_with_balances;

-- =============================================================================
-- 4) SAFETY NOTES
-- =============================================================================
-- This script intentionally contains:
--   - INSERT into public.stock_item_location_balances only
--   - SELECT verification queries
--   - RAISE EXCEPTION on missing storage / invalid keys / aggregate drift
--
-- This script must NEVER contain:
--   - UPDATE / DELETE on stock_items
--   - INSERT into stock_movements
--   - INSERT into workspace_storages
--   - Inventory Count / Import mutations
--   - runtime cutover
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- Prefer restore from backup. To clear balances for a workspace and re-run:
--   delete from public.stock_item_location_balances where workspace_id = '<uuid>';
-- Do NOT use rollback to rewrite stock_items.current_quantity or storage_location.

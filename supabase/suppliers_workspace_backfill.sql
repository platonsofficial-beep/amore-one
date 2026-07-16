-- =============================================================================
-- P7.2.4 — Supplier workspace_id backfill (PREPARATION ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Prerequisites:
--   1. public.suppliers exists
--   2. public.workspaces exists
--   3. supabase/suppliers_workspace_id.sql has been applied
--      (nullable workspace_id uuid → workspaces(id) ON DELETE CASCADE)
--
-- Guarantees:
--   - Updates ONLY rows where workspace_id IS NULL
--   - NEVER overwrites a non-null workspace_id
--   - Idempotent (re-run is a no-op once NULL rows are gone / already filled)
--
-- This script does NOT:
--   - enable or change RLS
--   - alter schema / add columns / add constraints
--   - touch application code
--   - assign supplier_id on stock_items / stock_orders
--
-- Target workspace selection:
--   - If exactly ONE workspace exists → use it automatically.
--   - If MULTIPLE workspaces exist → set v_target_workspace_id below explicitly
--     (leave NULL to abort safely).
--   - If ZERO workspaces exist → abort.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) OPTIONAL: pin a workspace when multiple exist
--    Example: select id from public.workspaces where slug = 'amore-nicosia';
-- -----------------------------------------------------------------------------
-- do $$ ... uses this variable; leave null for single-workspace auto-detect.

-- =============================================================================
-- 1) PRE-FLIGHT COUNTS (run these SELECTS first; review before UPDATE)
-- =============================================================================

-- 1a. Total suppliers
select count(*)::bigint as total_suppliers
from public.suppliers;

-- 1b. Suppliers still missing workspace_id (legacy / unassigned)
select count(*)::bigint as suppliers_null_workspace
from public.suppliers
where workspace_id is null;

-- 1c. Suppliers already assigned
select count(*)::bigint as suppliers_with_workspace
from public.suppliers
where workspace_id is not null;

-- 1d. Workspace inventory (decide target if count > 1)
select
  w.id,
  w.name,
  w.slug,
  count(s.id)::bigint as supplier_count
from public.workspaces w
left join public.suppliers s on s.workspace_id = w.id
group by w.id, w.name, w.slug
order by w.created_at asc, w.name asc;

-- 1e. Duplicate company names (global) — informative only
select
  lower(trim(company_name)) as company_name_key,
  count(*)::bigint as row_count
from public.suppliers
group by lower(trim(company_name))
having count(*) > 1
order by row_count desc, company_name_key asc;

-- =============================================================================
-- 2) BACKFILL (idempotent; NULL workspace_id only)
-- =============================================================================
-- Review section 1 results, then run this block once.

do $$
declare
  v_workspace_count integer;
  v_null_before bigint;
  v_null_after bigint;
  v_updated bigint;
  v_target_workspace_id uuid := null; -- set explicitly if multiple workspaces
  -- Example pin:
  -- v_target_workspace_id := (
  --   select id from public.workspaces where slug = 'amore-nicosia' limit 1
  -- );
begin
  if to_regclass('public.suppliers') is null then
    raise exception 'public.suppliers does not exist';
  end if;

  if to_regclass('public.workspaces') is null then
    raise exception 'public.workspaces does not exist';
  end if;

  -- Require workspace_id column (from suppliers_workspace_id.sql)
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suppliers'
      and column_name = 'workspace_id'
  ) then
    raise exception
      'public.suppliers.workspace_id is missing. Run supabase/suppliers_workspace_id.sql first.';
  end if;

  select count(*)::integer into v_workspace_count from public.workspaces;

  if v_workspace_count = 0 then
    raise exception 'No workspaces found. Create a workspace before backfilling suppliers.';
  end if;

  if v_target_workspace_id is null then
    if v_workspace_count = 1 then
      select id into v_target_workspace_id
      from public.workspaces
      order by created_at asc
      limit 1;
    else
      raise exception
        'Multiple workspaces (%) found. Set v_target_workspace_id explicitly in this script before running.',
        v_workspace_count;
    end if;
  end if;

  if not exists (
    select 1 from public.workspaces w where w.id = v_target_workspace_id
  ) then
    raise exception 'Target workspace_id % does not exist in public.workspaces', v_target_workspace_id;
  end if;

  select count(*)::bigint into v_null_before
  from public.suppliers
  where workspace_id is null;

  raise notice 'Backfill target workspace_id = %', v_target_workspace_id;
  raise notice 'Suppliers with NULL workspace_id BEFORE = %', v_null_before;

  update public.suppliers
  set workspace_id = v_target_workspace_id
  where workspace_id is null;

  get diagnostics v_updated = row_count;

  select count(*)::bigint into v_null_after
  from public.suppliers
  where workspace_id is null;

  raise notice 'Rows updated (NULL → target) = %', v_updated;
  raise notice 'Suppliers with NULL workspace_id AFTER = %', v_null_after;

  if v_null_after > 0 then
    raise exception
      'Backfill incomplete: % suppliers still have NULL workspace_id',
      v_null_after;
  end if;
end $$;

-- =============================================================================
-- 3) POST-FLIGHT VERIFICATION (run after the DO block)
-- =============================================================================

-- 3a. NULL workspace_id remaining (expect 0 after successful backfill)
select count(*)::bigint as suppliers_null_workspace_after
from public.suppliers
where workspace_id is null;

-- 3b. Suppliers grouped by workspace
select
  s.workspace_id,
  w.name as workspace_name,
  w.slug as workspace_slug,
  count(*)::bigint as supplier_count
from public.suppliers s
left join public.workspaces w on w.id = s.workspace_id
group by s.workspace_id, w.name, w.slug
order by supplier_count desc, w.name asc nulls last;

-- 3c. Duplicate company names inside the same workspace
select
  s.workspace_id,
  w.slug as workspace_slug,
  lower(trim(s.company_name)) as company_name_key,
  count(*)::bigint as row_count,
  array_agg(s.id order by s.id) as supplier_ids
from public.suppliers s
left join public.workspaces w on w.id = s.workspace_id
where s.workspace_id is not null
group by s.workspace_id, w.slug, lower(trim(s.company_name))
having count(*) > 1
order by row_count desc, company_name_key asc;

-- 3d. Total supplier count (unchanged by backfill)
select count(*)::bigint as total_suppliers
from public.suppliers;

-- 3e. Sample of recently updated rows (optional sanity check)
select
  id,
  company_name,
  workspace_id,
  active,
  updated_at
from public.suppliers
order by updated_at desc nulls last, id desc
limit 25;

-- =============================================================================
-- 4) ROLLBACK GUIDANCE (manual; only if you know the prior state)
-- =============================================================================
-- Backfill cannot be perfectly reversed without a snapshot of previous values.
-- Safe options:
--
-- A) Immediate undo for THIS run only (single-target backfill from all-NULL):
--    Only use if you are certain every non-null workspace_id was set by this
--    script and no new workspace-scoped creates happened afterward.
--
--    update public.suppliers
--    set workspace_id = null
--    where workspace_id = '<TARGET_WORKSPACE_UUID_USED_ABOVE>';
--
-- B) Preferred: restore from a DB backup / point-in-time recovery taken before
--    running section 2.
--
-- C) Do NOT blank workspace_id for rows created by the app after P7.2.3
--    (those should keep their workspace ownership).
--
-- Recommended ops practice:
--   1. Run section 1 SELECTs and save results
--   2. Take a backup / snapshot
--   3. Run section 2 DO block
--   4. Run section 3 SELECTs and confirm null count = 0
-- =============================================================================

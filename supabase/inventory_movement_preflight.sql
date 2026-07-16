-- =============================================================================
-- P7.4.7 — Preflight validation for inventory movement (quantity) migration
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Guarantees (READ-ONLY):
--   - No INSERT / UPDATE / DELETE / MERGE / TRUNCATE
--   - No ALTER / DROP / CREATE TABLE / CREATE INDEX
--   - Completes even when rows fail eligibility (NOTICE only; no RAISE)
--
-- Scope:
--   Every inventory_stock_item_map row with status IN ('created','linked')
--
-- Prerequisites:
--   public.inventory_stock_item_map
--   public.stock_items
-- =============================================================================

do $$
declare
  v_total bigint := 0;
  v_missing_stock bigint := 0;
  v_orphan_stock bigint := 0;
  v_cross_workspace bigint := 0;
  v_inactive bigint := 0;
  v_no_snapshot bigint := 0;
  v_non_numeric_qty bigint := 0;
  v_negative_qty bigint := 0;
  v_bad_unit bigint := 0;
  v_bad_category bigint := 0;
  v_dup_stock bigint := 0;
  v_base_ok bigint := 0;
  v_eligible bigint := 0;
  v_ineligible bigint := 0;
  r record;
begin
  with candidates as (
    select
      m.id as map_id,
      m.workspace_id,
      m.legacy_inventory_item_id,
      m.stock_item_id,
      m.status,
      m.resolution_type,
      m.source_snapshot,
      s.id as stock_row_id,
      s.workspace_id as stock_workspace_id,
      s.active as stock_active
    from public.inventory_stock_item_map m
    left join public.stock_items s on s.id = m.stock_item_id
    where m.status in ('created', 'linked')
  ),
  normalized as (
    select
      c.*,
      -- Quantity parse (safe: no exception on bad text)
      case
        when c.source_snapshot is null then null
        when jsonb_typeof(c.source_snapshot -> 'quantity') = 'number'
          then (c.source_snapshot ->> 'quantity')::numeric
        when jsonb_typeof(c.source_snapshot -> 'quantity') = 'string'
          and trim(c.source_snapshot ->> 'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then trim(c.source_snapshot ->> 'quantity')::numeric
        else null
      end as snapshot_qty,
      -- Category after normalization (dry-run rules: unsupported → null)
      case trim(coalesce(c.source_snapshot ->> 'category', ''))
        when 'Wines' then 'Wine'
        when 'Wine' then 'Wine'
        when 'Beers' then 'Beverages'
        when 'Beer' then 'Beverages'
        when 'Soft Drinks' then 'Beverages'
        when 'Coffee' then 'Beverages'
        when 'Kitchen' then 'Other'
        when 'Bar Supplies' then 'Consumables'
        when 'Housekeeping' then 'Consumables'
        when 'Spirits' then 'Spirits'
        when 'Syrups & Purées' then 'Syrups & Purées'
        when 'Beverages' then 'Beverages'
        when 'Fresh' then 'Fresh'
        when 'Consumables' then 'Consumables'
        when 'Other' then 'Other'
        when '' then null
        else null
      end as mapped_category,
      -- Unit after normalization (Bottle 1.5L → null / conversion required)
      case trim(coalesce(c.source_snapshot ->> 'unit', ''))
        when 'Bottle 0.7L' then 'Bottle 700ml'
        when 'Bottle 1L' then 'Bottle 1L'
        when 'Case 6' then 'Case 6 bottles'
        when 'Case 12' then 'Case 12 bottles'
        when 'Liter' then 'Litre'
        when 'Litre' then 'Litre'
        when 'Kg' then 'Kg'
        when 'Gram' then 'Gram'
        when 'Piece' then 'Piece'
        when 'Box' then 'Box'
        when 'Pack' then 'Pack'
        when 'Keg' then 'Keg'
        when 'Bottle' then 'Bottle'
        when 'Case' then 'Case'
        when 'Bottle 700ml' then 'Bottle 700ml'
        when 'Bottle 750ml' then 'Bottle 750ml'
        when 'Bottle 1.5L' then null
        when 'Bag' then trim(coalesce(c.source_snapshot ->> 'unit', ''))
        when '' then null
        else nullif(trim(coalesce(c.source_snapshot ->> 'unit', '')), '')
      end as mapped_unit
    from candidates c
  ),
  flags as (
    select
      n.*,
      -- A) Referenced stock_item exists
      (n.stock_item_id is not null and n.stock_row_id is not null) as ok_stock_exists,
      -- B) Same workspace
      (
        n.stock_row_id is not null
        and n.stock_workspace_id is not distinct from n.workspace_id
      ) as ok_same_workspace,
      -- C) Active
      (n.stock_active is true) as ok_active,
      -- D) Snapshot exists
      (
        n.source_snapshot is not null
        and n.source_snapshot <> '{}'::jsonb
      ) as ok_snapshot,
      -- E) Numeric quantity present
      (n.snapshot_qty is not null) as ok_numeric_qty,
      -- F) Quantity not negative
      (n.snapshot_qty is not null and n.snapshot_qty >= 0) as ok_non_negative_qty,
      -- G) Unit exists after normalization
      (n.mapped_unit is not null and trim(n.mapped_unit) <> '') as ok_unit,
      -- H) Category exists after normalization
      (n.mapped_category is not null and trim(n.mapped_category) <> '') as ok_category,
      -- J) Missing stock reference (null id or orphan)
      (
        n.stock_item_id is null
        or (n.stock_item_id is not null and n.stock_row_id is null)
      ) as missing_stock_ref
    from normalized n
  ),
  base as (
    select
      f.*,
      (
        f.ok_stock_exists
        and f.ok_same_workspace
        and f.ok_active
        and f.ok_snapshot
        and f.ok_numeric_qty
        and f.ok_non_negative_qty
        and f.ok_unit
        and f.ok_category
      ) as base_eligible
    from flags f
  ),
  dup_stock as (
    select stock_item_id
    from base
    where base_eligible
      and stock_item_id is not null
    group by stock_item_id
    having count(*) > 1
  ),
  with_dups as (
    select
      b.*,
      (b.base_eligible and d.stock_item_id is not null) as has_duplicate_stock_ref
    from base b
    left join dup_stock d on d.stock_item_id = b.stock_item_id
  ),
  scored as (
    select
      d.*,
      -- I + L: fully eligible = base checks pass AND unique stock_item among base-eligible
      (d.base_eligible and not d.has_duplicate_stock_ref) as fully_eligible
    from with_dups d
  )
  select
    count(*)::bigint,
    count(*) filter (where stock_item_id is null)::bigint,
    count(*) filter (
      where stock_item_id is not null and stock_row_id is null
    )::bigint,
    count(*) filter (where not ok_same_workspace and ok_stock_exists)::bigint,
    count(*) filter (where ok_stock_exists and not ok_active)::bigint,
    count(*) filter (where not ok_snapshot)::bigint,
    count(*) filter (where ok_snapshot and not ok_numeric_qty)::bigint,
    count(*) filter (
      where ok_numeric_qty and not ok_non_negative_qty
    )::bigint,
    count(*) filter (where not ok_unit)::bigint,
    count(*) filter (where not ok_category)::bigint,
    count(*) filter (where has_duplicate_stock_ref)::bigint,
    count(*) filter (where base_eligible)::bigint,
    count(*) filter (where fully_eligible)::bigint,
    count(*) filter (where not fully_eligible)::bigint
  into
    v_total,
    v_missing_stock,
    v_orphan_stock,
    v_cross_workspace,
    v_inactive,
    v_no_snapshot,
    v_non_numeric_qty,
    v_negative_qty,
    v_bad_unit,
    v_bad_category,
    v_dup_stock,
    v_base_ok,
    v_eligible,
    v_ineligible
  from scored;

  raise notice '========== P7.4.7 MOVEMENT PREFLIGHT ==========';
  raise notice 'Scope: status IN (created, linked)';
  raise notice '--- failure categories (rows may match multiple) ---';
  raise notice 'A missing_or_null_stock_item_id=%', v_missing_stock;
  raise notice 'A orphan_stock_item_id=%', v_orphan_stock;
  raise notice 'B cross_workspace=%', v_cross_workspace;
  raise notice 'C inactive_stock=%', v_inactive;
  raise notice 'D missing_or_empty_source_snapshot=%', v_no_snapshot;
  raise notice 'E non_numeric_or_missing_quantity=%', v_non_numeric_qty;
  raise notice 'F negative_quantity=%', v_negative_qty;
  raise notice 'G unit_missing_after_normalization=%', v_bad_unit;
  raise notice 'H category_missing_after_normalization=%', v_bad_category;
  raise notice 'I duplicate_stock_ref_among_base_eligible=%', v_dup_stock;
  raise notice 'J missing_stock_reference_total=%',
    (v_missing_stock + v_orphan_stock);
  raise notice 'K cannot_safely_migrate_quantity=%', v_ineligible;
  raise notice 'L fully_eligible=%', v_eligible;
  raise notice 'M coverage eligible=% of created_linked=% (pct=%)',
    v_eligible,
    v_total,
    case when v_total = 0 then 0
         else round((v_eligible::numeric / v_total::numeric) * 100, 2)
    end;
  raise notice 'base_checks_passed_before_dup_gate=%', v_base_ok;
  raise notice '--- N summary by status ---';

  for r in
    select status, count(*)::bigint as n
    from public.inventory_stock_item_map
    where status in ('created', 'linked')
    group by status
    order by status
  loop
    raise notice '  status=% count=%', r.status, r.n;
  end loop;

  raise notice '--- O summary by resolution_type ---';

  for r in
    select coalesce(resolution_type, '<null>') as resolution_type, count(*)::bigint as n
    from public.inventory_stock_item_map
    where status in ('created', 'linked')
    group by resolution_type
    order by resolution_type nulls first
  loop
    raise notice '  resolution_type=% count=%', r.resolution_type, r.n;
  end loop;

  raise notice 'PRE-FLIGHT COMPLETE';
end $$;

-- =============================================================================
-- VERIFICATION QUERIES (commented — SELECT only)
-- =============================================================================

-- Eligible rows (fully eligible = A–H pass AND unique stock_item_id among base-eligible)
-- with candidates as (
--   select m.*, s.id as stock_row_id, s.workspace_id as stock_workspace_id, s.active as stock_active
--   from public.inventory_stock_item_map m
--   left join public.stock_items s on s.id = m.stock_item_id
--   where m.status in ('created', 'linked')
-- )
-- select * from candidates; -- extend with same flags as the DO block

-- Ineligible rows (created/linked not fully eligible)
-- select m.id, m.status, m.stock_item_id, m.workspace_id
-- from public.inventory_stock_item_map m
-- where m.status in ('created', 'linked');

-- Missing stock references
-- select *
-- from public.inventory_stock_item_map m
-- where m.status in ('created', 'linked')
--   and (
--     m.stock_item_id is null
--     or not exists (select 1 from public.stock_items s where s.id = m.stock_item_id)
--   );

-- Duplicate stock references among created/linked
-- select stock_item_id, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- where status in ('created', 'linked')
--   and stock_item_id is not null
-- group by 1
-- having count(*) > 1;

-- Invalid quantities (missing / non-numeric / negative)
-- select m.id, m.source_snapshot -> 'quantity' as qty_json
-- from public.inventory_stock_item_map m
-- where m.status in ('created', 'linked')
--   and (
--     m.source_snapshot is null
--     or m.source_snapshot = '{}'::jsonb
--     or m.source_snapshot -> 'quantity' is null
--     or (
--       jsonb_typeof(m.source_snapshot -> 'quantity') = 'string'
--       and trim(m.source_snapshot ->> 'quantity') !~ '^-?[0-9]+(\.[0-9]+)?$'
--     )
--     or (
--       jsonb_typeof(m.source_snapshot -> 'quantity') = 'number'
--       and (m.source_snapshot ->> 'quantity')::numeric < 0
--     )
--   );

-- Invalid workspaces
-- select m.id, m.workspace_id as map_ws, s.workspace_id as stock_ws
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.status in ('created', 'linked')
--   and s.workspace_id is distinct from m.workspace_id;

-- Inactive stock
-- select m.id, s.id as stock_item_id, s.active
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.status in ('created', 'linked')
--   and s.active is distinct from true;

-- Coverage
-- select
--   count(*) filter (where status in ('created','linked'))::bigint as created_linked,
--   count(*) filter (where status = 'created')::bigint as created,
--   count(*) filter (where status = 'linked')::bigint as linked
-- from public.inventory_stock_item_map;

-- Distributions
-- select status, count(*) from public.inventory_stock_item_map
-- where status in ('created','linked') group by 1 order by 1;
-- select resolution_type, count(*) from public.inventory_stock_item_map
-- where status in ('created','linked') group by 1 order by 1;

-- Prove read-only: re-run twice; notices identical; counts unchanged.
-- select 'map' as t, count(*) from public.inventory_stock_item_map
-- union all select 'stock_items', count(*) from public.stock_items
-- union all select 'inventory_items', count(*) from public.inventory_items
-- union all select 'inventory_movements', count(*) from public.inventory_movements;
-- =============================================================================

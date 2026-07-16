-- =============================================================================
-- P7.4.8 — Dry-run inventory movement preview (READ-ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Guarantees (READ-ONLY):
--   - No INSERT / UPDATE / DELETE / MERGE / TRUNCATE
--   - No ALTER / DROP / CREATE TABLE / CREATE INDEX
--   - Never creates inventory_movements
--   - Never updates stock_items
--   - Completes even when rows are blocked (NOTICE only; no RAISE)
--
-- Eligibility: identical to P7.4.7 preflight (fully_eligible).
-- Preview dataset: ONLY fully_eligible rows.
--
-- Prerequisites:
--   public.inventory_stock_item_map
--   public.stock_items
-- =============================================================================

do $$
declare
  v_eligible bigint := 0;
  v_blocked bigint := 0;
  v_skipped bigint := 0;
  v_in bigint := 0;
  v_out bigint := 0;
  v_unchanged bigint := 0;
  v_planned_qty numeric := 0;
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
      s.active as stock_active,
      s.name as stock_name,
      coalesce(s.current_quantity, 0)::numeric as current_qty
    from public.inventory_stock_item_map m
    left join public.stock_items s on s.id = m.stock_item_id
    where m.status in ('created', 'linked')
  ),
  normalized as (
    select
      c.*,
      case
        when c.source_snapshot is null then null
        when jsonb_typeof(c.source_snapshot -> 'quantity') = 'number'
          then (c.source_snapshot ->> 'quantity')::numeric
        when jsonb_typeof(c.source_snapshot -> 'quantity') = 'string'
          and trim(c.source_snapshot ->> 'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then trim(c.source_snapshot ->> 'quantity')::numeric
        else null
      end as snapshot_qty,
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
      (n.stock_item_id is not null and n.stock_row_id is not null) as ok_stock_exists,
      (
        n.stock_row_id is not null
        and n.stock_workspace_id is not distinct from n.workspace_id
      ) as ok_same_workspace,
      (n.stock_active is true) as ok_active,
      (
        n.source_snapshot is not null
        and n.source_snapshot <> '{}'::jsonb
      ) as ok_snapshot,
      (n.snapshot_qty is not null) as ok_numeric_qty,
      (n.snapshot_qty is not null and n.snapshot_qty >= 0) as ok_non_negative_qty,
      (n.mapped_unit is not null and trim(n.mapped_unit) <> '') as ok_unit,
      (n.mapped_category is not null and trim(n.mapped_category) <> '') as ok_category
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
  scored as (
    select
      b.*,
      (b.base_eligible and d.stock_item_id is not null) as has_duplicate_stock_ref,
      (b.base_eligible and d.stock_item_id is null) as fully_eligible
    from base b
    left join dup_stock d on d.stock_item_id = b.stock_item_id
  ),
  preview as (
    select
      s.*,
      (s.snapshot_qty - s.current_qty) as qty_delta,
      case
        when not s.fully_eligible then null
        when (s.snapshot_qty - s.current_qty) > 0 then 'IN'
        when (s.snapshot_qty - s.current_qty) < 0 then 'OUT'
        else 'UNCHANGED'
      end as movement_direction,
      case
        when not s.fully_eligible then null
        else abs(s.snapshot_qty - s.current_qty)
      end as planned_movement_qty,
      case
        when not s.fully_eligible then 'INVALID'
        when (s.snapshot_qty - s.current_qty) = 0 then 'NO_CHANGE'
        else 'INITIAL_IMPORT'
      end as reason,
      case
        when not s.fully_eligible then 'BLOCKED'
        when (s.snapshot_qty - s.current_qty) = 0 then 'SKIPPED'
        else 'ELIGIBLE'
      end as migration_status
    from scored s
  )
  select
    count(*) filter (
      where fully_eligible and migration_status = 'ELIGIBLE'
    )::bigint,
    count(*) filter (where migration_status = 'BLOCKED')::bigint,
    count(*) filter (
      where fully_eligible and migration_status = 'SKIPPED'
    )::bigint,
    count(*) filter (
      where fully_eligible and movement_direction = 'IN'
    )::bigint,
    count(*) filter (
      where fully_eligible and movement_direction = 'OUT'
    )::bigint,
    count(*) filter (
      where fully_eligible and movement_direction = 'UNCHANGED'
    )::bigint,
    coalesce(
      sum(planned_movement_qty) filter (
        where fully_eligible and movement_direction in ('IN', 'OUT')
      ),
      0
    )
  into
    v_eligible,
    v_blocked,
    v_skipped,
    v_in,
    v_out,
    v_unchanged,
    v_planned_qty
  from preview;

  raise notice '========== P7.4.8 MOVEMENT PREVIEW ==========';
  raise notice 'eligible_rows=%', v_eligible;
  raise notice 'blocked_rows=%', v_blocked;
  raise notice 'skipped_rows=%', v_skipped;
  raise notice 'IN_movements=%', v_in;
  raise notice 'OUT_movements=%', v_out;
  raise notice 'unchanged_rows=%', v_unchanged;
  raise notice 'total_planned_movement_quantity=%', v_planned_qty;
  raise notice 'PREVIEW COMPLETE';
end $$;

-- =============================================================================
-- PREVIEW DATASET (eligible rows only — SELECT, no writes)
-- Columns: A–M per sprint spec
-- =============================================================================
with candidates as (
  select
    m.id as map_id,
    m.workspace_id,
    m.legacy_inventory_item_id,
    m.stock_item_id,
    m.status as map_status,
    m.resolution_type,
    m.source_snapshot,
    s.id as stock_row_id,
    s.workspace_id as stock_workspace_id,
    s.active as stock_active,
    s.name as stock_name,
    coalesce(s.current_quantity, 0)::numeric as current_qty
  from public.inventory_stock_item_map m
  left join public.stock_items s on s.id = m.stock_item_id
  where m.status in ('created', 'linked')
),
normalized as (
  select
    c.*,
    case
      when c.source_snapshot is null then null
      when jsonb_typeof(c.source_snapshot -> 'quantity') = 'number'
        then (c.source_snapshot ->> 'quantity')::numeric
      when jsonb_typeof(c.source_snapshot -> 'quantity') = 'string'
        and trim(c.source_snapshot ->> 'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then trim(c.source_snapshot ->> 'quantity')::numeric
      else null
    end as snapshot_qty,
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
    (n.stock_item_id is not null and n.stock_row_id is not null) as ok_stock_exists,
    (
      n.stock_row_id is not null
      and n.stock_workspace_id is not distinct from n.workspace_id
    ) as ok_same_workspace,
    (n.stock_active is true) as ok_active,
    (
      n.source_snapshot is not null
      and n.source_snapshot <> '{}'::jsonb
    ) as ok_snapshot,
    (n.snapshot_qty is not null) as ok_numeric_qty,
    (n.snapshot_qty is not null and n.snapshot_qty >= 0) as ok_non_negative_qty,
    (n.mapped_unit is not null and trim(n.mapped_unit) <> '') as ok_unit,
    (n.mapped_category is not null and trim(n.mapped_category) <> '') as ok_category
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
scored as (
  select
    b.*,
    (b.base_eligible and d.stock_item_id is null) as fully_eligible
  from base b
  left join dup_stock d on d.stock_item_id = b.stock_item_id
),
preview as (
  select
    -- A
    s.workspace_id,
    -- B
    s.legacy_inventory_item_id,
    -- C
    s.stock_item_id,
    -- D
    s.stock_name,
    -- E
    s.mapped_unit as normalized_unit,
    -- F
    s.mapped_category as normalized_category,
    -- G
    s.current_qty as current_stock_quantity,
    -- H
    s.snapshot_qty as snapshot_quantity,
    -- I
    (s.snapshot_qty - s.current_qty) as quantity_delta,
    -- J
    case
      when (s.snapshot_qty - s.current_qty) > 0 then 'IN'
      when (s.snapshot_qty - s.current_qty) < 0 then 'OUT'
      else 'UNCHANGED'
    end as planned_movement_direction,
    -- K
    abs(s.snapshot_qty - s.current_qty) as planned_movement_quantity,
    -- L
    case
      when (s.snapshot_qty - s.current_qty) = 0 then 'NO_CHANGE'
      else 'INITIAL_IMPORT'
    end as reason,
    -- M
    case
      when (s.snapshot_qty - s.current_qty) = 0 then 'SKIPPED'
      else 'ELIGIBLE'
    end as migration_status,
    s.map_id,
    s.map_status,
    s.resolution_type
  from scored s
  where s.fully_eligible
)
select *
from preview
order by workspace_id, stock_name, legacy_inventory_item_id;

-- =============================================================================
-- VERIFICATION QUERIES (commented — SELECT only)
-- =============================================================================

-- All preview rows: run the active SELECT above (eligible only).

-- Only IN rows
-- ... wrap preview CTE ... where planned_movement_direction = 'IN';

-- Only OUT rows
-- ... where planned_movement_direction = 'OUT';

-- Unchanged / skipped rows
-- ... where planned_movement_direction = 'UNCHANGED';

-- Blocked rows (failed preflight; not in main preview dataset)
-- with candidates as (
--   select m.*, s.id as stock_row_id, s.workspace_id as stock_workspace_id, s.active
--   from public.inventory_stock_item_map m
--   left join public.stock_items s on s.id = m.stock_item_id
--   where m.status in ('created', 'linked')
-- )
-- select * from candidates
-- where stock_item_id is null
--    or stock_row_id is null
--    or stock_workspace_id is distinct from workspace_id
--    or active is distinct from true
--    or source_snapshot is null
--    or source_snapshot = '{}'::jsonb;

-- Planned totals
-- select
--   count(*) filter (where planned_movement_direction = 'IN') as in_n,
--   count(*) filter (where planned_movement_direction = 'OUT') as out_n,
--   count(*) filter (where planned_movement_direction = 'UNCHANGED') as unchanged_n,
--   coalesce(sum(planned_movement_quantity) filter (
--     where planned_movement_direction in ('IN','OUT')
--   ), 0) as total_planned_qty
-- from preview;

-- Quantity distribution
-- select
--   case
--     when quantity_delta > 0 then 'positive'
--     when quantity_delta < 0 then 'negative'
--     else 'zero'
--   end as delta_bucket,
--   count(*)::bigint as n,
--   min(quantity_delta) as min_delta,
--   max(quantity_delta) as max_delta
-- from preview
-- group by 1
-- order by 1;

-- Movement direction distribution
-- select planned_movement_direction, count(*)::bigint as n
-- from preview
-- group by 1
-- order by 1;

-- Prove read-only: re-run twice; notices + result set identical; counts unchanged.
-- select 'map' as t, count(*) from public.inventory_stock_item_map
-- union all select 'stock_items', count(*) from public.stock_items
-- union all select 'inventory_items', count(*) from public.inventory_items
-- union all select 'inventory_movements', count(*) from public.inventory_movements;
-- =============================================================================

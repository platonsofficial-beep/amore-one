-- =============================================================================
-- P7.4.2 — Inventory → Stock migration dry-run classifier (SELECT-ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Guarantees:
--   - SELECT only (no INSERT / UPDATE / DELETE / MERGE / TRUNCATE)
--   - Does NOT write inventory_stock_item_map
--   - Does NOT create/update stock_items
--   - Does NOT create stock_movements
--   - Does NOT touch bar_refills / inventory_items
--
-- Prerequisites:
--   1. public.inventory_items
--   2. public.stock_items
--   3. public.workspaces
--   4. public.inventory_stock_item_map (P7.4.1) — optional for "already mapped" skip
--   5. public.stock_movements (optional; missing → movement_count = 0)
--   6. public.suppliers / public.bar_refills / public.bar_refill_items (optional probes)
--
-- Quantity epsilon: 0.001 (matches stock numeric(12,3) precision)
--
-- Classification precedence (first match wins):
--   1. skip     — already mapped created/linked; empty/invalid with no migration value
--   2. manual   — conflicts / ambiguity / missing workspace / open refill / type mismatch
--   3. auto_link — exactly one V1 match on name+unit+category; qty safe
--   4. auto_create — no V1 candidate; mappings supported
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) INPUT — set target workspace explicitly (do NOT hardcode a real UUID)
-- -----------------------------------------------------------------------------
-- Example:
--   select '00000000-0000-0000-0000-000000000000'::uuid;  -- replace, then paste below

with params as (
  select
    null::uuid as target_workspace_id,
    0.001::numeric as qty_epsilon
),

-- -----------------------------------------------------------------------------
-- A) Live type probe (Bar Refill FK vs inventory PK)
-- -----------------------------------------------------------------------------
type_probe as (
  select
    (
      select c.udt_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'inventory_items'
        and c.column_name = 'id'
    ) as inventory_id_udt,
    (
      select c.udt_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'bar_refill_items'
        and c.column_name = 'inventory_item_id'
    ) as refill_fk_udt
),

type_flags as (
  select
    inventory_id_udt,
    refill_fk_udt,
    case
      when inventory_id_udt is null or refill_fk_udt is null then false
      when inventory_id_udt is distinct from refill_fk_udt then true
      else false
    end as refill_type_mismatch
  from type_probe
),

-- -----------------------------------------------------------------------------
-- B) Normalization helpers via SELECT CASE (mirrors stockCatalog.js maps)
-- -----------------------------------------------------------------------------
-- Categories: LEGACY_STOCK_CATEGORY_MAP + exact STOCK_CATEGORIES pass-through
-- Units: inventory preset → stock preset equivalents (no quantity conversion)

legacy_base as (
  select
    i.id as legacy_inventory_item_id,
    p.target_workspace_id,
    p.qty_epsilon,
    coalesce(i.item_name, '') as legacy_name,
    lower(trim(coalesce(i.item_name, ''))) as normalized_name,
    coalesce(i.category, '') as legacy_category,
    coalesce(i.subcategory, '') as legacy_subcategory,
    coalesce(i.unit, '') as legacy_unit,
    coalesce(i.supplier, '') as legacy_supplier,
    coalesce(i.quantity, 0)::numeric as legacy_quantity,
    coalesce(i.minimum_quantity, 0)::numeric as legacy_minimum_quantity,
    coalesce(i.cost, 0)::numeric as legacy_cost,
    coalesce(i.status, '') as legacy_status,
    coalesce(i.notes, '') as legacy_notes,
    i.created_at as legacy_created_at,
    i.updated_at as legacy_updated_at,
    to_jsonb(i) as source_snapshot,
    md5(to_jsonb(i)::text) as source_hash
  from public.inventory_items i
  cross join params p
),

legacy_normalized as (
  select
    b.*,
    case trim(b.legacy_category)
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
      else null  -- unsupported / custom → manual
    end as mapped_category,
    case
      when trim(b.legacy_subcategory) = '' then 'Other'
      when lower(trim(b.legacy_subcategory)) in (
        'vodka', 'gin', 'rum', 'whiskey', 'tequila', 'other'
      ) then initcap(lower(trim(b.legacy_subcategory)))
      when lower(trim(b.legacy_subcategory)) = 'mezcal' then 'Tequila'
      when lower(trim(b.legacy_subcategory)) in ('liqueurs', 'liqueur', 'vermouth')
        then 'Vermouth & Liqueur'
      when lower(trim(b.legacy_subcategory)) = 'brandy' then 'Cognac'
      when lower(trim(b.legacy_subcategory)) in ('aperitifs', 'aperitif') then 'Aperitif'
      when lower(trim(b.legacy_subcategory)) = 'red wine' then 'Red Wine'
      when lower(trim(b.legacy_subcategory)) = 'white wine' then 'White Wine'
      when lower(trim(b.legacy_subcategory)) in ('rose wine', 'rosé wine', 'rosé wine')
        then 'Rosé Wine'
      when lower(trim(b.legacy_subcategory)) in ('sparkling', 'sparkling wine')
        then 'Sparkling Wine'
      when lower(trim(b.legacy_subcategory)) = 'champagne' then 'Champagne'
      when lower(trim(b.legacy_subcategory)) = 'dessert wine' then 'Dessert Wine'
      when lower(trim(b.legacy_subcategory)) in (
        'lager', 'ipa', 'ale', 'stout', 'cider', 'alcohol free'
      ) then 'Beer'
      when lower(trim(b.legacy_subcategory)) in ('soda', 'tonic') then 'Soda / Tonic'
      when lower(trim(b.legacy_subcategory)) in ('cola', 'lemonade', 'orangeade')
        then 'Soft Drink'
      when lower(trim(b.legacy_subcategory)) in ('juices', 'juice') then 'Juice'
      when lower(trim(b.legacy_subcategory)) = 'energy drinks' then 'Energy Drink'
      when lower(trim(b.legacy_subcategory)) in ('napkins', 'straws', 'cleaning')
        then initcap(lower(trim(b.legacy_subcategory)))
      when lower(trim(b.legacy_subcategory)) in ('purees', 'purées', 'purée') then 'Purée'
      when lower(trim(b.legacy_subcategory)) = 'syrups' then 'Syrup'
      when lower(trim(b.legacy_subcategory)) in ('fruits', 'fruit') then 'Fruit'
      else 'Other'
    end as mapped_item_type,
    case trim(b.legacy_unit)
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
      when 'Bottle 1.5L' then null  -- conversion/ambiguous → manual
      when 'Bag' then trim(b.legacy_unit)  -- custom preserve (no conversion)
      when '' then ''
      else trim(b.legacy_unit)  -- custom preserve if no conversion needed
    end as mapped_unit,
    case
      when trim(b.legacy_unit) = 'Bottle 1.5L' then true
      else false
    end as unit_conversion_required
  from legacy_base b
),

legacy_enriched as (
  select
    n.*,
    case
      when n.mapped_category is null then false
      else true
    end as category_mapping_ok,
    case
      when n.unit_conversion_required then false
      when n.mapped_unit is null then false
      else true
    end as unit_mapping_ok,
    lower(trim(coalesce(n.mapped_unit, ''))) as mapped_unit_key,
    lower(trim(coalesce(n.mapped_category, ''))) as mapped_category_key
  from legacy_normalized n
),

-- -----------------------------------------------------------------------------
-- C) Existing map rows (skip if already created/linked)
-- -----------------------------------------------------------------------------
existing_map as (
  select
    m.legacy_inventory_item_id,
    m.workspace_id,
    m.status as map_status,
    m.stock_item_id as map_stock_item_id,
    m.resolution_type as map_resolution_type
  from public.inventory_stock_item_map m
  cross join params p
  where p.target_workspace_id is not null
    and m.workspace_id = p.target_workspace_id
),

-- -----------------------------------------------------------------------------
-- D) V1 candidates in target workspace (normalized)
-- -----------------------------------------------------------------------------
v1_items as (
  select
    s.id as stock_item_id,
    s.workspace_id,
    s.name as stock_name,
    lower(trim(s.name)) as normalized_name,
    s.category as stock_category,
    case trim(s.category)
      when 'Wines' then 'Wine'
      when 'Wine' then 'Wine'
      when 'Beers' then 'Beverages'
      when 'Beer' then 'Beverages'
      when 'Soft Drinks' then 'Beverages'
      when 'Coffee' then 'Beverages'
      when 'Kitchen' then 'Other'
      when 'Bar Supplies' then 'Consumables'
      when 'Housekeeping' then 'Consumables'
      else trim(s.category)
    end as mapped_category,
    s.unit as stock_unit,
    case trim(s.unit)
      when 'Bottle 0.7L' then 'Bottle 700ml'
      when 'Case 6' then 'Case 6 bottles'
      when 'Case 12' then 'Case 12 bottles'
      when 'Liter' then 'Litre'
      else trim(s.unit)
    end as mapped_unit,
    coalesce(s.current_quantity, 0)::numeric as current_quantity,
    -- Authoritative live/greenfield stock supplier is text only (no live FK column).
    -- Dry-run resolved_supplier_id comes from public.suppliers, not stock_items.
    coalesce(s.supplier, '') as stock_supplier
  from public.stock_items s
  cross join params p
  where p.target_workspace_id is not null
    and s.workspace_id = p.target_workspace_id
),

v1_normalized as (
  select
    v.*,
    lower(trim(v.mapped_unit)) as mapped_unit_key,
    lower(trim(v.mapped_category)) as mapped_category_key
  from v1_items v
),

-- Movement counts per V1 item (0 if table empty / no rows)
v1_movements as (
  select
    sm.item_id as stock_item_id,
    count(*)::bigint as movement_count
  from public.stock_movements sm
  cross join params p
  where p.target_workspace_id is not null
    and sm.workspace_id = p.target_workspace_id
  group by sm.item_id
),

-- -----------------------------------------------------------------------------
-- E) Supplier resolution (global catalog; unique company_name only)
-- Live suppliers have no workspace_id (optional suppliers_workspace_id.sql undeployed).
-- Duplicate names are evaluated globally; extra ambiguous → manual (safer than auto).
-- Restore workspace scoping only in a dedicated Suppliers workspace foundation sprint.
-- -----------------------------------------------------------------------------
workspace_suppliers as (
  select
    s.id as supplier_id,
    lower(trim(s.company_name)) as name_key,
    count(*) over (partition by lower(trim(s.company_name))) as name_dup_count
  from public.suppliers s
  cross join params p
  where p.target_workspace_id is not null
    and trim(coalesce(s.company_name, '')) <> ''
),

unique_suppliers as (
  select supplier_id, name_key
  from workspace_suppliers
  where name_dup_count = 1
),

ambiguous_supplier_names as (
  select distinct name_key
  from workspace_suppliers
  where name_dup_count > 1
),

-- -----------------------------------------------------------------------------
-- F) Bar Refill references (text cast for type-agnostic join)
-- -----------------------------------------------------------------------------
refill_refs as (
  select
    bri.inventory_item_id::text as legacy_id_text,
    bool_or(true) as referenced_by_refill,
    bool_or(br.status = 'draft') as referenced_by_open_refill
  from public.bar_refill_items bri
  join public.bar_refills br on br.id = bri.refill_id
  where bri.inventory_item_id is not null
  group by bri.inventory_item_id::text
),

-- -----------------------------------------------------------------------------
-- G) Candidate matching: name + unit + category (NOT name-only)
-- -----------------------------------------------------------------------------
candidates as (
  select
    l.legacy_inventory_item_id,
    v.stock_item_id,
    v.current_quantity as candidate_quantity,
    coalesce(m.movement_count, 0)::bigint as candidate_movement_count,
    v.stock_supplier,
    v.mapped_unit as candidate_mapped_unit,
    v.mapped_category as candidate_mapped_category
  from legacy_enriched l
  join v1_normalized v
    on v.normalized_name = l.normalized_name
   and v.mapped_unit_key = l.mapped_unit_key
   and v.mapped_category_key = l.mapped_category_key
   and l.normalized_name <> ''
   and l.mapped_unit_key <> ''
   and l.mapped_category_key <> ''
  left join v1_movements m on m.stock_item_id = v.stock_item_id
),

candidate_agg as (
  select
    legacy_inventory_item_id,
    count(*)::bigint as candidate_count,
    max(candidate_quantity) as candidate_quantity,
    max(candidate_movement_count) as candidate_movement_count,
    max(stock_supplier) as candidate_supplier_text
  from candidates
  group by legacy_inventory_item_id
),

-- When exactly one candidate, pick its id reliably
candidate_one as (
  select
    c.legacy_inventory_item_id,
    (array_agg(c.stock_item_id order by c.stock_item_id::text))[1] as candidate_stock_item_id,
    (array_agg(c.candidate_quantity order by c.stock_item_id::text))[1] as candidate_quantity,
    (array_agg(c.candidate_movement_count order by c.stock_item_id::text))[1] as candidate_movement_count,
    (array_agg(c.stock_supplier order by c.stock_item_id::text))[1] as candidate_supplier_text
  from candidates c
  join candidate_agg a
    on a.legacy_inventory_item_id = c.legacy_inventory_item_id
   and a.candidate_count = 1
  group by c.legacy_inventory_item_id
),

-- Name-only matches (for conflict surfacing; never used alone for auto_link)
name_only_matches as (
  select
    l.legacy_inventory_item_id,
    count(*)::bigint as name_only_candidate_count
  from legacy_enriched l
  join v1_normalized v
    on v.normalized_name = l.normalized_name
   and l.normalized_name <> ''
  group by l.legacy_inventory_item_id
),

-- -----------------------------------------------------------------------------
-- H) Per-row classification
-- -----------------------------------------------------------------------------
classified as (
  select
    l.legacy_inventory_item_id,
    l.target_workspace_id,
    l.legacy_name,
    l.normalized_name,
    l.legacy_category,
    l.mapped_category,
    l.legacy_subcategory,
    l.mapped_item_type,
    l.legacy_unit,
    l.mapped_unit,
    l.legacy_supplier,
    us.supplier_id as resolved_supplier_id,
    l.legacy_quantity,
    coalesce(ca.candidate_count, 0)::bigint as candidate_count,
    co.candidate_stock_item_id,
    coalesce(co.candidate_quantity, ca.candidate_quantity) as candidate_quantity,
    coalesce(co.candidate_movement_count, ca.candidate_movement_count, 0)::bigint
      as candidate_movement_count,
    coalesce(rr.referenced_by_refill, false) as referenced_by_refill,
    coalesce(rr.referenced_by_open_refill, false) as referenced_by_open_refill,
    tf.refill_type_mismatch,
    l.source_snapshot,
    l.source_hash,
    em.map_status,
    em.map_stock_item_id,
    l.category_mapping_ok,
    l.unit_mapping_ok,
    l.unit_conversion_required,
    l.qty_epsilon,
    asn.name_key is not null as supplier_ambiguous,
    coalesce(nom.name_only_candidate_count, 0)::bigint as name_only_candidate_count,
    -- Quantity conflict helpers
    case
      when coalesce(ca.candidate_count, 0) = 1
        and abs(
          l.legacy_quantity
          - coalesce(co.candidate_quantity, ca.candidate_quantity, 0)
        ) <= l.qty_epsilon
      then true
      else false
    end as quantities_equal,
    case
      when coalesce(ca.candidate_count, 0) = 1
        and l.legacy_quantity <> 0
        and coalesce(co.candidate_quantity, ca.candidate_quantity, 0) <> 0
        and abs(
          l.legacy_quantity
          - coalesce(co.candidate_quantity, ca.candidate_quantity, 0)
        ) > l.qty_epsilon
      then true
      else false
    end as both_nonzero_unequal,
    case
      when coalesce(ca.candidate_count, 0) = 1
        and coalesce(co.candidate_movement_count, ca.candidate_movement_count, 0) > 0
        and abs(
          l.legacy_quantity
          - coalesce(co.candidate_quantity, ca.candidate_quantity, 0)
        ) > l.qty_epsilon
      then true
      else false
    end as movement_qty_conflict,
    case
      when coalesce(ca.candidate_count, 0) = 1
        and coalesce(co.candidate_movement_count, ca.candidate_movement_count, 0) = 0
        and coalesce(co.candidate_quantity, ca.candidate_quantity, 0) = 0
      then true
      else false
    end as v1_zero_no_movements
  from legacy_enriched l
  cross join type_flags tf
  left join existing_map em
    on em.legacy_inventory_item_id = l.legacy_inventory_item_id
  left join candidate_agg ca
    on ca.legacy_inventory_item_id = l.legacy_inventory_item_id
  left join candidate_one co
    on co.legacy_inventory_item_id = l.legacy_inventory_item_id
  left join unique_suppliers us
    on us.name_key = lower(trim(l.legacy_supplier))
   and trim(l.legacy_supplier) <> ''
  left join ambiguous_supplier_names asn
    on asn.name_key = lower(trim(l.legacy_supplier))
   and trim(l.legacy_supplier) <> ''
  left join refill_refs rr
    on rr.legacy_id_text = l.legacy_inventory_item_id::text
  left join name_only_matches nom
    on nom.legacy_inventory_item_id = l.legacy_inventory_item_id
),

decided as (
  select
    c.*,
    case
      -- A) skip
      when c.map_status in ('created', 'linked') then 'skip'
      when trim(c.legacy_name) = '' and coalesce(c.legacy_quantity, 0) = 0
        and not coalesce(c.referenced_by_refill, false)
        then 'skip'

      -- B) manual
      when c.target_workspace_id is null then 'manual'
      when trim(c.legacy_name) = '' then 'manual'
      when not c.category_mapping_ok then 'manual'
      when c.unit_conversion_required or not c.unit_mapping_ok then 'manual'
      when c.supplier_ambiguous then 'manual'
      when c.candidate_count > 1 then 'manual'
      when c.candidate_count = 0
        and c.name_only_candidate_count > 0 then 'manual'  -- name match but unit/category conflict
      when c.both_nonzero_unequal then 'manual'
      when c.movement_qty_conflict then 'manual'
      when c.referenced_by_open_refill then 'manual'
      when c.referenced_by_refill and c.refill_type_mismatch then 'manual'

      -- C) auto_link
      when c.candidate_count = 1
        and (
          c.quantities_equal
          or c.v1_zero_no_movements
        )
        then 'auto_link'

      -- D) auto_create
      when c.candidate_count = 0
        and c.name_only_candidate_count = 0
        and c.category_mapping_ok
        and c.unit_mapping_ok
        and not c.unit_conversion_required
        and not c.supplier_ambiguous
        and c.map_status is distinct from 'created'
        and c.map_status is distinct from 'linked'
        then 'auto_create'

      else 'manual'
    end as classification
  from classified c
),

final_rows as (
  select
    d.legacy_inventory_item_id,
    d.target_workspace_id,
    d.legacy_name,
    d.normalized_name,
    d.legacy_category,
    d.mapped_category,
    d.legacy_subcategory,
    d.mapped_item_type,
    d.legacy_unit,
    d.mapped_unit,
    d.legacy_supplier,
    d.resolved_supplier_id,
    d.legacy_quantity,
    d.candidate_stock_item_id,
    d.candidate_count,
    d.candidate_quantity,
    d.candidate_movement_count,
    d.referenced_by_refill,
    d.referenced_by_open_refill,
    d.classification,
    case d.classification
      when 'auto_create' then 'auto_create'
      when 'auto_link' then 'auto_link'
      when 'skip' then 'skip'
      when 'manual' then null
      else null
    end as resolution_type,
    trim(both '; ' from concat_ws('; ',
      case when d.map_status in ('created', 'linked')
        then 'already_mapped_' || d.map_status end,
      case when d.target_workspace_id is null then 'missing_target_workspace' end,
      case when trim(d.legacy_name) = '' then 'blank_legacy_name' end,
      case when not d.category_mapping_ok then 'unsupported_category' end,
      case when d.unit_conversion_required then 'unit_conversion_required' end,
      case when not d.unit_mapping_ok then 'unsupported_unit' end,
      case when d.supplier_ambiguous then 'ambiguous_supplier' end,
      case when d.candidate_count > 1 then 'multiple_v1_candidates' end,
      case when d.candidate_count = 0 and d.name_only_candidate_count > 0
        then 'name_match_unit_or_category_conflict' end,
      case when d.both_nonzero_unequal then 'quantity_conflict_both_nonzero' end,
      case when d.movement_qty_conflict then 'quantity_conflict_with_movements' end,
      case when d.referenced_by_open_refill then 'open_bar_refill_dependency' end,
      case when d.referenced_by_refill and d.refill_type_mismatch
        then 'bar_refill_type_mismatch' end,
      case when d.classification = 'manual'
        and d.target_workspace_id is not null
        and trim(d.legacy_name) <> ''
        and d.category_mapping_ok
        and d.unit_mapping_ok
        and not d.supplier_ambiguous
        and d.candidate_count = 1
        and not d.quantities_equal
        and not d.v1_zero_no_movements
        then 'quantity_not_safe_for_auto_link' end
    )) as conflict_reason,
    d.source_snapshot,
    d.source_hash,
    case d.classification
      when 'manual' then 1
      when 'auto_link' then 2
      when 'auto_create' then 3
      when 'skip' then 4
      else 9
    end as sort_rank
  from decided d
)

-- =============================================================================
-- PRIMARY DRY-RUN RESULT (every legacy row; deterministic order)
-- =============================================================================
select
  legacy_inventory_item_id,
  target_workspace_id,
  legacy_name,
  normalized_name,
  legacy_category,
  mapped_category,
  legacy_subcategory,
  mapped_item_type,
  legacy_unit,
  mapped_unit,
  legacy_supplier,
  resolved_supplier_id,
  legacy_quantity,
  candidate_stock_item_id,
  candidate_count,
  candidate_quantity,
  candidate_movement_count,
  referenced_by_refill,
  referenced_by_open_refill,
  classification,
  resolution_type,
  conflict_reason,
  source_snapshot,
  source_hash
from final_rows
order by sort_rank, normalized_name, legacy_inventory_item_id;

-- =============================================================================
-- SUMMARY QUERIES (commented — run separately after setting params the same way)
-- =============================================================================
-- Copy the params CTE + rebuild is heavy; simpler: wrap primary result in a temp
-- analysis by re-running with the same target_workspace_id and aggregating.
--
-- S1. Count by classification
-- select classification, count(*)::bigint as n
-- from (<paste primary select without order, or use a VIEW in a later sprint>)
-- group by classification
-- order by n desc;
--
-- Practical approach: after running the primary query in the SQL editor, export
-- results, OR wrap as:
--
-- with dry_run as (
--   -- entire CTE chain ending in final_rows
-- )
-- select classification, count(*)::bigint as n from dry_run group by 1 order by 2 desc;
--
-- S2. Count by conflict_reason (non-empty)
-- select nullif(conflict_reason, '') as conflict_reason, count(*)::bigint as n
-- from dry_run
-- where conflict_reason <> ''
-- group by 1 order by n desc;
--
-- S3. Category mapping status
-- select
--   case when mapped_category is null then 'unsupported' else 'mapped' end as category_status,
--   count(*)::bigint as n
-- from dry_run group by 1;
--
-- S4. Unit mapping status
-- select
--   case
--     when mapped_unit is null then 'conversion_or_unsupported'
--     when mapped_unit is distinct from legacy_unit then 'normalized'
--     else 'exact_or_custom'
--   end as unit_status,
--   count(*)::bigint as n
-- from dry_run group by 1;
--
-- S5. Ambiguous suppliers
-- select count(*)::bigint as ambiguous_supplier_rows
-- from dry_run
-- where conflict_reason like '%ambiguous_supplier%';
--
-- S6. Quantity conflicts
-- select count(*)::bigint as quantity_conflict_rows
-- from dry_run
-- where conflict_reason like '%quantity_conflict%';
--
-- S7. Open refill refs
-- select count(*)::bigint as open_refill_rows
-- from dry_run
-- where referenced_by_open_refill;
--
-- S8. Already mapped skips
-- select count(*)::bigint as already_mapped_skips
-- from dry_run
-- where classification = 'skip'
--   and conflict_reason like 'already_mapped%';
--
-- S9. Candidate duplicate groups (multiple V1 matches)
-- select normalized_name, mapped_unit, mapped_category, candidate_count
-- from dry_run
-- where candidate_count > 1
-- order by candidate_count desc, normalized_name;

-- =============================================================================
-- VERIFICATION (read-only checks)
-- =============================================================================
-- 1) This file must contain no INSERT/UPDATE/DELETE/MERGE/TRUNCATE.
-- 2) params.target_workspace_id must be set by the caller (null → all manual).
-- 3) Re-run twice with the same workspace → identical classification set.
-- 4) select count(*) from inventory_items;
--    select count(*) from stock_items;
--    select count(*) from inventory_stock_item_map;
--    → counts unchanged after running this script.
-- =============================================================================
-- ROLLBACK: n/a (no writes)
-- =============================================================================

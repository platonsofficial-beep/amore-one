-- =============================================================================
-- P7.8.9 — Inventory Migration Persist stage-owned RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_session_steps.sql
--   3. inventory_migration_activity.sql
--   4. inventory_migration_step_results.sql (P7.8.5)
--   5. inventory_migration_start_session_rpc.sql (bootstrap steps)
--   6. inventory_stock_item_map.sql (P7.4.1)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER stage RPC for canonical step `persist`:
--     authorize → lock session/steps → waiting→running → classify (P7.4.2 rules)
--     → UPSERT map (P7.4.3) → persist step result → running→completed
--     → activity note → return outcome
--
-- Business writes: ONLY public.inventory_stock_item_map per P7.4.3 contract.
-- Does NOT create/update stock_items, stock_movements, or run auto_link/auto_create.
-- P8.6.1: for resolution_type=auto_link only, persists the authoritative
--   candidate_stock_item_id (derived in this RPC from live DB state) into
--   inventory_stock_item_map.stock_item_id. Non-auto_link rows write null.
-- NEVER overwrites stock_item_id or migrated_at on created / linked / migrated rows.
-- NEVER downgrades status created / linked.
--
-- Prerequisites: foundation completed only (early pipeline stage).
-- Idempotency (step): reject if already completed / result exists.
-- Idempotency (map): ON CONFLICT (legacy_inventory_item_id, workspace_id) DO UPDATE
--   with created/linked/migrated_at protection and hash/status/identity change gate.
--
-- Classifier duplication note (P8.6.1): P7.4.2 classification CTEs remain embedded
-- here (byte-for-byte semantic alignment with dry-run / legacy persist). No shared
-- internal function introduced in this sprint.
-- =============================================================================

drop function if exists public.run_inventory_migration_persist(uuid, uuid);

create or replace function public.run_inventory_migration_persist(
  p_workspace_id uuid,
  p_session_id uuid
)
returns table (
  session_id uuid,
  step_id uuid,
  step_name text,
  step_status text,
  result_id uuid,
  result_status text,
  critical_finding_count bigint,
  attention_finding_count bigint,
  total_findings bigint,
  executed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_session public.inventory_migration_sessions%rowtype;
  v_step public.inventory_migration_session_steps%rowtype;
  v_existing_result_id uuid := null;
  v_pred_incomplete boolean := false;
  v_other_running boolean := false;

  v_source_rows bigint := 0;
  v_skip_count bigint := 0;
  v_manual_count bigint := 0;
  v_auto_link_count bigint := 0;
  v_auto_create_count bigint := 0;
  v_other_count bigint := 0;
  v_inserted bigint := 0;
  v_updated bigint := 0;
  v_upsert_returned bigint := 0;
  v_protected bigint := 0;
  v_unchanged bigint := 0;

  v_result_status text;
  v_critical_count bigint := 0;
  v_attention_count bigint := 0;
  v_total_findings bigint := 0;
  v_result_summary jsonb;
  v_result_id uuid;
  v_executed_at timestamptz;
  v_activity_text text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_persist_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_persist_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_persist_session_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_persist_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_persist_forbidden';
  end if;

  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  -- Lock order 1: session (session-level mutex).
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_persist_session_not_found';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_persist_session_not_running';
  end if;

  -- Lock order 2: all session steps in canonical order.
  perform 1
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
  order by
    case st.step_name
      when 'foundation' then 1
      when 'persist' then 2
      when 'auto_link' then 3
      when 'auto_create' then 4
      when 'integrity_audit' then 5
      when 'preflight' then 6
      when 'preview' then 7
      when 'phase1' then 8
      when 'phase2' then 9
      when 'post_apply_audit' then 10
      else 11
    end
  for update;

  select st.*
  into v_step
  from public.inventory_migration_session_steps st
  where st.session_id = p_session_id
    and st.workspace_id = p_workspace_id
    and st.step_name = 'persist';

  if not found then
    raise exception 'inventory_migration_persist_step_not_found';
  end if;

  select r.id
  into v_existing_result_id
  from public.inventory_migration_step_results r
  where r.step_id = v_step.id
  limit 1;

  if v_existing_result_id is not null or v_step.status = 'completed' then
    raise exception 'inventory_migration_persist_already_completed';
  end if;

  if v_step.status is distinct from 'waiting' then
    raise exception 'inventory_migration_persist_invalid_step_state';
  end if;

  if v_step.started_at is not null or v_step.completed_at is not null then
    raise exception 'inventory_migration_persist_invalid_step_state';
  end if;

  -- Prerequisites: foundation completed only (persist is early pipeline stage).
  select exists (
    select 1
    from unnest(array['foundation']) as pred(step_name)
    where not exists (
      select 1
      from public.inventory_migration_session_steps st
      where st.session_id = p_session_id
        and st.workspace_id = p_workspace_id
        and st.step_name = pred.step_name
        and st.status = 'completed'
    )
  )
  into v_pred_incomplete;

  if v_pred_incomplete then
    raise exception 'inventory_migration_persist_prerequisite_incomplete';
  end if;

  select exists (
    select 1
    from public.inventory_migration_session_steps st
    where st.session_id = p_session_id
      and st.workspace_id = p_workspace_id
      and st.status = 'running'
      and st.step_name is distinct from 'persist'
  )
  into v_other_running;

  if v_other_running then
    raise exception 'inventory_migration_persist_another_step_running';
  end if;

  -- waiting → running
  update public.inventory_migration_session_steps st
  set
    status = 'running',
    started_at = now()
  where st.id = v_step.id
  returning * into v_step;

  -- Lock order 3: existing map rows for this workspace (deterministic id order)
  -- before identity/status UPSERT. Serializes against concurrent map writers
  -- (legacy SQL path remains a residual unlocked peer — dual-path policy later).
  perform 1
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
  order by m.id
  for update;

  select count(*)::bigint into v_protected
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked');

  -- ---------------------------------------------------------------------------
  -- P7.4.3 classification persistence (embedded; meanings unchanged)
  -- P8.6.1: auto_link also persists candidate_stock_item_id → stock_item_id
  -- ---------------------------------------------------------------------------
  with params as (
    select
      p_workspace_id as target_workspace_id,
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
    -- P8.6.1: only auto_link with exactly one authoritative candidate may carry identity.
    -- candidate_one is empty when candidate_count <> 1; auto_link requires count = 1.
    case
      when d.classification = 'auto_link'
        and d.candidate_count = 1
        and d.candidate_stock_item_id is not null
      then d.candidate_stock_item_id
      else null
    end as stock_item_id
  from decided d
),

persist_rows as (
  select
    f.legacy_inventory_item_id,
    f.target_workspace_id as workspace_id,
    case f.classification
      when 'auto_create' then 'classified'
      when 'auto_link' then 'classified'
      when 'manual' then 'manual'
      when 'skip' then 'skipped'
      else 'failed'
    end as status,
    f.resolution_type,
    coalesce(f.conflict_reason, '') as conflict_reason,
    f.source_snapshot,
    f.source_hash,
    f.stock_item_id
  from final_rows f
  where f.target_workspace_id is not null
),

class_counts as (
  select
    count(*)::bigint as source_rows,
    count(*) filter (where classification = 'skip')::bigint as skip_count,
    count(*) filter (where classification = 'manual')::bigint as manual_count,
    count(*) filter (where classification = 'auto_link')::bigint as auto_link_count,
    count(*) filter (where classification = 'auto_create')::bigint as auto_create_count,
    count(*) filter (where classification not in ('skip','manual','auto_link','auto_create'))::bigint as other_count
  from final_rows
),
upserted as (
  insert into public.inventory_stock_item_map (
    legacy_inventory_item_id,
    workspace_id,
    stock_item_id,
    status,
    resolution_type,
    conflict_reason,
    source_snapshot,
    source_hash
  )
  select
    p.legacy_inventory_item_id,
    p.workspace_id,
    p.stock_item_id,
    p.status,
    p.resolution_type,
    p.conflict_reason,
    p.source_snapshot,
    p.source_hash
  from persist_rows p
  on conflict (legacy_inventory_item_id, workspace_id)
  do update set
    status = excluded.status,
    resolution_type = excluded.resolution_type,
    conflict_reason = excluded.conflict_reason,
    source_snapshot = excluded.source_snapshot,
    source_hash = excluded.source_hash,
    -- P8.6.1: set/clear identity only on non-finalized rows (WHERE below).
    -- auto_link → authoritative candidate; non-auto_link → null (no fabricated id).
    stock_item_id = excluded.stock_item_id,
    updated_at = now()
  where public.inventory_stock_item_map.status not in ('created', 'linked')
    and public.inventory_stock_item_map.migrated_at is null
    and (
      public.inventory_stock_item_map.source_hash is distinct from excluded.source_hash
      or public.inventory_stock_item_map.status is distinct from excluded.status
      or public.inventory_stock_item_map.resolution_type is distinct from excluded.resolution_type
      or public.inventory_stock_item_map.conflict_reason is distinct from excluded.conflict_reason
      or public.inventory_stock_item_map.stock_item_id is distinct from excluded.stock_item_id
    )
  returning (xmax = 0) as was_inserted
)
select
  (select source_rows from class_counts),
  (select skip_count from class_counts),
  (select manual_count from class_counts),
  (select auto_link_count from class_counts),
  (select auto_create_count from class_counts),
  (select other_count from class_counts),
  count(*) filter (where was_inserted)::bigint,
  count(*) filter (where not was_inserted)::bigint,
  count(*)::bigint
into
  v_source_rows,
  v_skip_count,
  v_manual_count,
  v_auto_link_count,
  v_auto_create_count,
  v_other_count,
  v_inserted,
  v_updated,
  v_upsert_returned
from upserted;

  select count(*)::bigint into v_protected
  from public.inventory_stock_item_map m
  where m.workspace_id = p_workspace_id
    and m.status in ('created', 'linked');

  select
    greatest(
      (
        select count(*)::bigint
        from public.inventory_stock_item_map m
        where m.workspace_id = p_workspace_id
      ) - v_protected - v_inserted - v_updated,
      0
    )
  into v_unchanged;

  -- Manual review rows require attention; expected skip/auto_* are not failures.
  v_critical_count := coalesce(v_other_count, 0);
  v_attention_count := coalesce(v_manual_count, 0) + coalesce(v_other_count, 0);
  v_total_findings := v_attention_count;

  if v_attention_count > 0 then
    v_result_status := 'attention_required';
  else
    v_result_status := 'passed';
  end if;

  v_result_summary := jsonb_build_object(
    'persist_version', 1,
    'classifications', jsonb_build_array(
      jsonb_build_object('key', 'skip', 'label', 'Skip', 'count', v_skip_count),
      jsonb_build_object('key', 'manual', 'label', 'Manual Review', 'count', v_manual_count),
      jsonb_build_object('key', 'auto_link', 'label', 'Auto Link', 'count', v_auto_link_count),
      jsonb_build_object('key', 'auto_create', 'label', 'Auto Create', 'count', v_auto_create_count)
    ),
    'writes', jsonb_build_object(
      'inserted', v_inserted,
      'updated', v_updated,
      'unchanged', v_unchanged,
      'protected', v_protected,
      'upsert_returned', v_upsert_returned
    ),
    'totals', jsonb_build_object(
      'source_rows', v_source_rows,
      'persisted_rows', v_inserted + v_updated,
      'attention_rows', v_attention_count,
      'error_rows', v_critical_count
    )
  );

  v_executed_at := now();

  update public.inventory_migration_session_steps st
  set
    status = 'completed',
    completed_at = v_executed_at
  where st.id = v_step.id
  returning * into v_step;

  insert into public.inventory_migration_step_results (
    session_id,
    step_id,
    workspace_id,
    step_name,
    result_status,
    result_summary,
    critical_finding_count,
    attention_finding_count,
    executed_by,
    operator_display_name,
    executed_at
  )
  values (
    v_session.id,
    v_step.id,
    p_workspace_id,
    'persist',
    v_result_status,
    v_result_summary,
    v_critical_count,
    v_attention_count,
    v_auth_user_id,
    v_operator_display_name,
    v_executed_at
  )
  returning id into v_result_id;

  v_activity_text := format(
    'Persist completed: %s (result_id=%s, inserted=%s, updated=%s, manual=%s, protected=%s).',
    v_result_status,
    v_result_id,
    v_inserted,
    v_updated,
    v_manual_count,
    v_protected
  );

  insert into public.inventory_migration_activity (
    session_id,
    workspace_id,
    activity_type,
    activity_text,
    created_by,
    operator_display_name
  )
  values (
    v_session.id,
    p_workspace_id,
    'note',
    v_activity_text,
    v_auth_user_id,
    v_operator_display_name
  );

  session_id := v_session.id;
  step_id := v_step.id;
  step_name := v_step.step_name;
  step_status := v_step.status;
  result_id := v_result_id;
  result_status := v_result_status;
  critical_finding_count := v_critical_count;
  attention_finding_count := v_attention_count;
  total_findings := v_total_findings;
  executed_at := v_executed_at;
  return next;
end;
$$;

revoke all on function public.run_inventory_migration_persist(uuid, uuid) from public;
revoke all on function public.run_inventory_migration_persist(uuid, uuid) from anon;
grant execute on function public.run_inventory_migration_persist(uuid, uuid) to authenticated;

comment on function public.run_inventory_migration_persist(uuid, uuid) is
  'P7.8.9/P8.6.1 stage-owned Persist: locks session/steps/map rows, runs P7.4.3 classification UPSERT into inventory_stock_item_map (auto_link writes validated candidate stock_item_id), persists step result, completes step, writes activity note. Protects created/linked/migrated_at; never writes stock_items/movements.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- select pg_get_functiondef(
--   'public.run_inventory_migration_persist(uuid,uuid)'::regprocedure
-- );

-- Example:
--   select * from public.run_inventory_migration_persist(
--     '<workspace_uuid>',
--     '<session_uuid>'
--   );

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.run_inventory_migration_persist(uuid, uuid);

-- =============================================================================
-- P8.31.11 — Temporary Real-Label Test Catalog SEED (AMORE.NICOSIA)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Do NOT auto-run from the app. Do NOT wire into migrations.
-- Do NOT execute from CI.
--
-- Source of truth:
--   supabase/data/p8_31_9_temporary_real_label_catalog.json (P8.31.10 finalized)
--
-- Batch id:
--   ONE_REAL_LABEL_TEST_2026_07
--
-- UUID namespaces (deterministic):
--   products:  c0318a00-2026-4000-8000-<seq hex>
--   suppliers: c0318b00-2026-4000-8000-<1..7 hex>
--   balances:  c0318c00-2026-4000-8000-<balance hex>
--   movements: d0318a00-2026-4000-8000-<balance hex>
--
-- Creates:
--   7 fictional suppliers (global public.suppliers — no workspace_id column)
--   180 stock_items
--   336 stock_item_location_balances
--   336 opening stock_count movements (ledger parity for seeded balances)
--
-- Visible Brand / Product Name are realistic (no batch prefix).
-- Cleanup (future): identify by product UUID namespace + supplier notes/UUID namespace.
-- =============================================================================

begin;

do $p8_31_11_temporary_real_label_catalog_seed$
declare
  v_workspace_id uuid;
  v_workspace_name text;
  v_workspace_slug text;
  v_match_count bigint := 0;
  v_existing_items bigint := 0;
  v_existing_batch_items bigint := 0;
  v_existing_batch_suppliers bigint := 0;
  v_supplier_name_conflicts bigint := 0;
  v_missing_storages bigint := 0;
  v_inserted_suppliers bigint := 0;
  v_inserted_items bigint := 0;
  v_inserted_balances bigint := 0;
  v_inserted_movements bigint := 0;
  v_agg_item_qty numeric(14, 3) := 0;
  v_agg_balance_qty numeric(14, 3) := 0;
  v_active bigint := 0;
  v_inactive bigint := 0;
  v_multi bigint := 0;
  v_batch_marker constant text := 'ONE_REAL_LABEL_TEST_2026_07';
  v_required_keys text[] := array['Main Storage', 'Bar', 'Wine Storage', 'Fridge', 'Kitchen', 'Coffee Station'];
begin
  -- ---------------------------------------------------------------------------
  -- 1) Exact-one workspace gate
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_match_count
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_match_count = 0 then
    raise exception
      'P8.31.11 seed abort: no workspace matched name=AMORE.NICOSIA / slug=amore-nicosia';
  end if;

  if v_match_count > 1 then
    raise exception
      'P8.31.11 seed abort: % workspaces matched AMORE.NICOSIA / amore-nicosia — expected exactly one',
      v_match_count;
  end if;

  select w.id, w.name, w.slug
  into v_workspace_id, v_workspace_name, v_workspace_slug
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  raise notice 'P8.31.11 seed workspace: id=% name=% slug=%',
    v_workspace_id, v_workspace_name, v_workspace_slug;

  -- ---------------------------------------------------------------------------
  -- 2) Empty catalog + batch idempotency gates
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_existing_items
  from public.stock_items s
  where s.workspace_id = v_workspace_id;

  if v_existing_items <> 0 then
    raise exception
      'P8.31.11 seed abort: workspace stock_items count is % (expected 0). Clear catalog / prior test batches first.',
      v_existing_items;
  end if;

  select count(*)
  into v_existing_batch_items
  from public.stock_items s
  where s.id::text like 'c0318a00-2026-4000-8000-%';

  if v_existing_batch_items > 0 then
    raise exception
      'P8.31.11 seed abort: batch product UUID namespace already present (% rows).',
      v_existing_batch_items;
  end if;

  select count(*)
  into v_existing_batch_suppliers
  from public.suppliers s
  where s.id::text like 'c0318b00-2026-4000-8000-%'
     or s.notes like '%' || v_batch_marker || '%';

  if v_existing_batch_suppliers > 0 then
    raise exception
      'P8.31.11 seed abort: batch supplier markers already present (% rows).',
      v_existing_batch_suppliers;
  end if;

  select count(*)
  into v_supplier_name_conflicts
  from public.suppliers s
  where s.company_name in (
      'Premium Spirits Distribution Ltd',
      'Mediterranean Beverage Partners',
      'Cyprus Fine Wines Trading',
      'Island Water & Refreshments',
      'FreshServe Food Solutions',
      'Nicosia HORECA Supplies',
      'Local Produce Partners'
    )
    and coalesce(s.notes, '') not like '%' || v_batch_marker || '%';

  if v_supplier_name_conflicts > 0 then
    raise exception
      'P8.31.11 seed abort: % supplier name(s) already exist without this batch marker. Refusing to collide with non-test suppliers.',
      v_supplier_name_conflicts;
  end if;

  select count(*)
  into v_missing_storages
  from unnest(v_required_keys) as required(location_key)
  where not exists (
    select 1
    from public.workspace_storages ws
    where ws.workspace_id = v_workspace_id
      and ws.location_key = required.location_key
  );

  if v_missing_storages > 0 then
    raise exception
      'P8.31.11 seed abort: % required workspace_storages location_key(s) missing for dataset allocations.',
      v_missing_storages;
  end if;

  if to_regclass('public.stock_item_location_balances') is null then
    raise exception
      'P8.31.11 seed abort: public.stock_item_location_balances does not exist';
  end if;

  -- ---------------------------------------------------------------------------
  -- 3) Insert 7 fictional temporary suppliers (global rows — no workspace_id)
  -- ---------------------------------------------------------------------------
  insert into public.suppliers (
    id,
    company_name,
    contact_person,
    phone,
    email,
    address,
    payment_terms,
    delivery_days,
    notes,
    tax_id,
    active
  )
  select
    v.id,
    v.company_name,
    ''::text,
    ''::text,
    ''::text,
    ''::text,
    ''::text,
    ''::text,
    v.notes,
    ''::text,
    true
  from (
    values
    (
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Premium Spirits Distribution Ltd'::text,
      'ONE_REAL_LABEL_TEST_2026_07 | temporary disposable test supplier — not a real business'::text
    ),
    (
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Mediterranean Beverage Partners'::text,
      'ONE_REAL_LABEL_TEST_2026_07 | temporary disposable test supplier — not a real business'::text
    ),
    (
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Cyprus Fine Wines Trading'::text,
      'ONE_REAL_LABEL_TEST_2026_07 | temporary disposable test supplier — not a real business'::text
    ),
    (
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Island Water & Refreshments'::text,
      'ONE_REAL_LABEL_TEST_2026_07 | temporary disposable test supplier — not a real business'::text
    ),
    (
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'FreshServe Food Solutions'::text,
      'ONE_REAL_LABEL_TEST_2026_07 | temporary disposable test supplier — not a real business'::text
    ),
    (
      'c0318b00-2026-4000-8000-000000000006'::uuid,
      'Nicosia HORECA Supplies'::text,
      'ONE_REAL_LABEL_TEST_2026_07 | temporary disposable test supplier — not a real business'::text
    ),
    (
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Local Produce Partners'::text,
      'ONE_REAL_LABEL_TEST_2026_07 | temporary disposable test supplier — not a real business'::text
    )
  ) as v(id, company_name, notes);

  get diagnostics v_inserted_suppliers = row_count;

  if v_inserted_suppliers <> 7 then
    raise exception
      'P8.31.11 seed abort: expected 7 suppliers, inserted %',
      v_inserted_suppliers;
  end if;

  -- ---------------------------------------------------------------------------
  -- 4) Insert 180 stock_items
  -- ---------------------------------------------------------------------------
  insert into public.stock_items (
    id,
    workspace_id,
    name,
    brand,
    category,
    item_type,
    size,
    unit,
    packaging_note,
    barcode,
    supplier,
    supplier_id,
    storage_location,
    cost_price,
    minimum_quantity,
    target_quantity,
    order_quantity,
    current_quantity,
    active
  )
  select
    v.id,
    v_workspace_id,
    v.name,
    v.brand,
    v.category,
    v.item_type,
    v.size,
    v.unit,
    v.packaging_note,
    v.barcode,
    v.supplier,
    v.supplier_id,
    v.storage_location,
    v.cost_price,
    v.minimum_quantity,
    v.target_quantity,
    v.order_quantity,
    v.current_quantity,
    v.active
  from (
    values
    (
      'c0318a00-2026-4000-8000-000000000001'::uuid,
      'Vodka'::text,
      'Belvedere'::text,
      'Spirits'::text,
      'Vodka'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      28.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000002'::uuid,
      'Blue Vodka'::text,
      'Absolut'::text,
      'Spirits'::text,
      'Vodka'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      14.2::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000003'::uuid,
      'Vodka'::text,
      'Grey Goose'::text,
      'Spirits'::text,
      'Vodka'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      32::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000004'::uuid,
      'Vodka'::text,
      'Ketel One'::text,
      'Spirits'::text,
      'Vodka'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      18.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000005'::uuid,
      'No. 21 Red Label'::text,
      'Smirnoff'::text,
      'Spirits'::text,
      'Vodka'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      11::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000006'::uuid,
      'Premium Vodka'::text,
      'Stolichnaya'::text,
      'Spirits'::text,
      'Vodka'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      13.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000007'::uuid,
      'Vodka'::text,
      'Finlandia'::text,
      'Spirits'::text,
      'Vodka'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      12.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000008'::uuid,
      'London Dry Gin'::text,
      'Tanqueray'::text,
      'Spirits'::text,
      'Gin'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      19::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000009'::uuid,
      'London Dry Gin'::text,
      'Bombay Sapphire'::text,
      'Spirits'::text,
      'Gin'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      18::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000000a'::uuid,
      'Gin'::text,
      'Hendrick''s'::text,
      'Spirits'::text,
      'Gin'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      27.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000000b'::uuid,
      'London Dry Gin'::text,
      'Beefeater'::text,
      'Spirits'::text,
      'Gin'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      14::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000000c'::uuid,
      'London Dry Gin'::text,
      'Gordon''s'::text,
      'Spirits'::text,
      'Gin'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      12::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      12::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000000d'::uuid,
      'Schwarzwald Dry Gin'::text,
      'Monkey 47'::text,
      'Spirits'::text,
      'Gin'::text,
      '50 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      34::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000000e'::uuid,
      'Con Limone Gin'::text,
      'Malfy'::text,
      'Spirits'::text,
      'Gin'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      22::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000000f'::uuid,
      'Carta Blanca'::text,
      'Bacardi'::text,
      'Spirits'::text,
      'Rum'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      13.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000010'::uuid,
      'Añejo 3 Años'::text,
      'Havana Club'::text,
      'Spirits'::text,
      'Rum'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      16::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000011'::uuid,
      'Original Spiced Gold'::text,
      'Captain Morgan'::text,
      'Spirits'::text,
      'Rum'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      14.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000012'::uuid,
      'Reserva Exclusiva'::text,
      'Diplomático'::text,
      'Spirits'::text,
      'Rum'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      36::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000013'::uuid,
      'Eclipse'::text,
      'Mount Gay'::text,
      'Spirits'::text,
      'Rum'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      18::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000014'::uuid,
      'Black Spiced Rum'::text,
      'The Kraken'::text,
      'Spirits'::text,
      'Rum'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      20::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000015'::uuid,
      'Centenario 23'::text,
      'Zacapa'::text,
      'Spirits'::text,
      'Rum'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      42::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000016'::uuid,
      'Especial Silver'::text,
      'José Cuervo'::text,
      'Spirits'::text,
      'Tequila'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      15::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000017'::uuid,
      'Silver'::text,
      'Patrón'::text,
      'Spirits'::text,
      'Tequila'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      38::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000018'::uuid,
      'Blanco'::text,
      'Don Julio'::text,
      'Spirits'::text,
      'Tequila'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      40::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000019'::uuid,
      'Plata'::text,
      'Olmeca Altos'::text,
      'Spirits'::text,
      'Tequila'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      22::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      20::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000001a'::uuid,
      'Blanco'::text,
      'Casamigos'::text,
      'Spirits'::text,
      'Tequila'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      36::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000001b'::uuid,
      'Blanco'::text,
      'Espolòn'::text,
      'Spirits'::text,
      'Tequila'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      21::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000001c'::uuid,
      'Black Label'::text,
      'Johnnie Walker'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      24::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000001d'::uuid,
      'Red Label'::text,
      'Johnnie Walker'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      16::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      12::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000001e'::uuid,
      'Old No. 7'::text,
      'Jack Daniel''s'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      22::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      20::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000001f'::uuid,
      'Irish Whiskey'::text,
      'Jameson'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      20::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000020'::uuid,
      '12 Year Old'::text,
      'Chivas Regal'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      26::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000021'::uuid,
      'Blended Malt Scotch Whisky'::text,
      'Monkey Shoulder'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      22::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      16::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000022'::uuid,
      '12 Year Old'::text,
      'Glenfiddich'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      34::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000023'::uuid,
      'Double Cask 12 Years Old'::text,
      'The Macallan'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      58::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      20::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000024'::uuid,
      'Bourbon'::text,
      'Maker''s Mark'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      28::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000025'::uuid,
      'Bourbon Frontier Whiskey'::text,
      'Bulleit'::text,
      'Spirits'::text,
      'Whiskey'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      26::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000026'::uuid,
      'V.S'::text,
      'Hennessy'::text,
      'Spirits'::text,
      'Cognac'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      32::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000027'::uuid,
      'V.S.O.P'::text,
      'Rémy Martin'::text,
      'Spirits'::text,
      'Cognac'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      42::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000028'::uuid,
      '5 Stars'::text,
      'Metaxa'::text,
      'Spirits'::text,
      'Cognac'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      14::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      22::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000029'::uuid,
      'V.S'::text,
      'Martell'::text,
      'Spirits'::text,
      'Cognac'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      31::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      3::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000002a'::uuid,
      'Bitter'::text,
      'Campari'::text,
      'Spirits'::text,
      'Aperitif'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      14.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000002b'::uuid,
      'Aperitivo'::text,
      'Aperol'::text,
      'Spirits'::text,
      'Aperitif'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      12::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000002c'::uuid,
      'Ouzo'::text,
      'Mini'::text,
      'Spirits'::text,
      'Aperitif'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      8.5::numeric,
      6::numeric,
      18::numeric,
      12::numeric,
      16::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000002d'::uuid,
      'Ouzo'::text,
      'Ouzo 12'::text,
      'Spirits'::text,
      'Aperitif'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      9.5::numeric,
      6::numeric,
      18::numeric,
      12::numeric,
      20::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000002e'::uuid,
      'Rosso'::text,
      'Martini'::text,
      'Spirits'::text,
      'Vermouth & Liqueur'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      9.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000002f'::uuid,
      'Extra Dry'::text,
      'Martini'::text,
      'Spirits'::text,
      'Vermouth & Liqueur'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      9.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000030'::uuid,
      'Liqueur'::text,
      'Cointreau'::text,
      'Spirits'::text,
      'Vermouth & Liqueur'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      18::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000031'::uuid,
      'Original Irish Cream'::text,
      'Baileys'::text,
      'Spirits'::text,
      'Vermouth & Liqueur'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      16.5::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000032'::uuid,
      'Originale'::text,
      'Disaronno'::text,
      'Spirits'::text,
      'Vermouth & Liqueur'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      15::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      20::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000033'::uuid,
      'Coffee Liqueur'::text,
      'Kahlúa'::text,
      'Spirits'::text,
      'Vermouth & Liqueur'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      14::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000034'::uuid,
      'Cordon Rouge'::text,
      'Grand Marnier'::text,
      'Spirits'::text,
      'Vermouth & Liqueur'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      24::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000035'::uuid,
      'Ouzo'::text,
      'Plomari'::text,
      'Spirits'::text,
      'Aperitif'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      10::numeric,
      6::numeric,
      18::numeric,
      12::numeric,
      14::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000036'::uuid,
      'Aromatic Bitters'::text,
      'Angostura'::text,
      'Spirits'::text,
      'Other'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      9::numeric,
      6::numeric,
      24::numeric,
      12::numeric,
      24::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000037'::uuid,
      'Τσίπουρο'::text,
      'Δεκαράκι'::text,
      'Spirits'::text,
      'Other'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      7.5::numeric,
      4::numeric,
      12::numeric,
      6::numeric,
      11::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000038'::uuid,
      'Μαλαγουζιά'::text,
      'Κτήμα Καριπίδη'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      11.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000039'::uuid,
      'Moschofilero'::text,
      'Μπουτάρη'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      8.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000003a'::uuid,
      'Agioritikos White'::text,
      'Tsantali'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      7.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000003b'::uuid,
      'Sauvignon Blanc'::text,
      'Κτήμα Άλφα'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      14::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      15::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000003c'::uuid,
      'Ασύρτικο'::text,
      'Κτήμα Γεροβασιλείου'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      16::numeric,
      4::numeric,
      16::numeric,
      6::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000003d'::uuid,
      'Xynisteri'::text,
      'Κυπερούντα'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      11::numeric,
      4::numeric,
      16::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000003e'::uuid,
      'Rueda Blanco'::text,
      'Marqués de Riscal'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      9.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000003f'::uuid,
      'La Scolca White Label'::text,
      'Gavi di Gavi'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      14::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000040'::uuid,
      'Ramnista'::text,
      'Κτήμα Κυρ-Γιάννη'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      16::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000041'::uuid,
      'Megas Oenos'::text,
      'Skouras'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      15::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      1::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000042'::uuid,
      'Naoussa'::text,
      'Μπουτάρη'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      9::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000043'::uuid,
      'Xynisteri'::text,
      'Ζαμπάρτας'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      12.5::numeric,
      4::numeric,
      16::numeric,
      6::numeric,
      14::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000044'::uuid,
      'Xynisteri'::text,
      'Τσιάκκας'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      10.5::numeric,
      4::numeric,
      16::numeric,
      6::numeric,
      1::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000045'::uuid,
      'Assyrtiko Santorini'::text,
      'Αργυρού'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      18::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000046'::uuid,
      'Thalassitis Assyrtiko'::text,
      'Γαία'::text,
      'Wine'::text,
      'White Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      17::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      9::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000047'::uuid,
      'Peppoli Chianti Classico'::text,
      'Antinori'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      14.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000048'::uuid,
      'Ξινόμαυρο Hedgehog'::text,
      'Κτήμα Άλφα'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      15::numeric,
      4::numeric,
      14::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000049'::uuid,
      'Sangre de Toro'::text,
      'Torres'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      8.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000004a'::uuid,
      'Rosé'::text,
      'Whispering Angel'::text,
      'Wine'::text,
      'Rosé Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      16.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000004b'::uuid,
      'M Rosé'::text,
      'Minuty'::text,
      'Wine'::text,
      'Rosé Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      14::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000004c'::uuid,
      'Ροζέ'::text,
      'Κτήμα Καριπίδη'::text,
      'Wine'::text,
      'Rosé Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      10::numeric,
      4::numeric,
      14::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000004d'::uuid,
      'Rosé'::text,
      'AIX'::text,
      'Wine'::text,
      'Rosé Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      13::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000004e'::uuid,
      'Extra Dry'::text,
      'Prosecco La Marca'::text,
      'Wine'::text,
      'Sparkling Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      9::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000004f'::uuid,
      'Cordon Negro Brut'::text,
      'Freixenet'::text,
      'Wine'::text,
      'Sparkling Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      8::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000050'::uuid,
      'Prosecco'::text,
      'Martini'::text,
      'Wine'::text,
      'Sparkling Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      8.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000051'::uuid,
      'Prosecco Cuvée 1821'::text,
      'Zonin'::text,
      'Wine'::text,
      'Sparkling Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      8::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000052'::uuid,
      'Clásico Brut'::text,
      'Codorníu'::text,
      'Wine'::text,
      'Sparkling Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      7.5::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      1::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000053'::uuid,
      'Impérial Brut'::text,
      'Moët & Chandon'::text,
      'Wine'::text,
      'Champagne'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      42::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000054'::uuid,
      'Yellow Label Brut'::text,
      'Veuve Clicquot'::text,
      'Wine'::text,
      'Champagne'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      48::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000055'::uuid,
      'Vintage Brut'::text,
      'Dom Pérignon'::text,
      'Wine'::text,
      'Champagne'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      160::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000056'::uuid,
      'Blanc de Blancs'::text,
      'Ruinart'::text,
      'Wine'::text,
      'Champagne'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      68::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000057'::uuid,
      'Brut Réserve'::text,
      'Taittinger'::text,
      'Wine'::text,
      'Champagne'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      38::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000058'::uuid,
      'Anthemis'::text,
      'Samos'::text,
      'Wine'::text,
      'Dessert Wine'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      12::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000059'::uuid,
      'Special Reserve Port'::text,
      'Cockburn’s'::text,
      'Wine'::text,
      'Dessert Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      14::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000005a'::uuid,
      'Six Grapes Reserve Port'::text,
      'Graham’s'::text,
      'Wine'::text,
      'Dessert Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      16::numeric,
      4::numeric,
      18::numeric,
      6::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000005b'::uuid,
      'Lager'::text,
      'Heineken'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.85::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000005c'::uuid,
      'Extra'::text,
      'Corona'::text,
      'Beverages'::text,
      'Beer'::text,
      '355 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.95::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000005d'::uuid,
      'Lager'::text,
      'Stella Artois'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.9::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000005e'::uuid,
      'Draught'::text,
      'Guinness'::text,
      'Beverages'::text,
      'Beer'::text,
      '440 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.4::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000005f'::uuid,
      'Hellénique'::text,
      'Alpha'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.75::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000060'::uuid,
      'Hellas'::text,
      'Fix'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.8::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      60::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000061'::uuid,
      'Hellenic Lager'::text,
      'Mythos'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.8::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000062'::uuid,
      'Beer'::text,
      'KEO'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.75::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000063'::uuid,
      'Cyprus'::text,
      'Carlsberg'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.85::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000064'::uuid,
      'Lager'::text,
      'Vergina'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.78::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      54::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000065'::uuid,
      'Beer'::text,
      'Leon'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.8::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000066'::uuid,
      'Weissbier'::text,
      'Erdinger'::text,
      'Beverages'::text,
      'Beer'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.3::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000067'::uuid,
      'Beer'::text,
      'KEO'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml can'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.7::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000068'::uuid,
      'Weiss'::text,
      'Alpha'::text,
      'Beverages'::text,
      'Beer'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 12.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.1::numeric,
      12::numeric,
      48::numeric,
      24::numeric,
      36::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000069'::uuid,
      'Dark'::text,
      'Fix'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.85::numeric,
      24::numeric,
      72::numeric,
      24::numeric,
      48::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000006a'::uuid,
      '0.0'::text,
      'Heineken'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.7::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000006b'::uuid,
      'Alkoholfrei'::text,
      'Erdinger'::text,
      'Beverages'::text,
      'Beer'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000006c'::uuid,
      '0.0'::text,
      'Guinness'::text,
      'Beverages'::text,
      'Beer'::text,
      '440 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.2::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000006d'::uuid,
      'Classic'::text,
      'Coca-Cola'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '250 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.45::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000006e'::uuid,
      'Zero'::text,
      'Coca-Cola'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '250 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.45::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      120::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000006f'::uuid,
      'Diet Coke'::text,
      'Coca-Cola'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '330 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000070'::uuid,
      'Aegean Tonic Water'::text,
      'Three Cents'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.9::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000071'::uuid,
      'Lemon-Lime'::text,
      'Sprite'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '330 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000072'::uuid,
      'Orange'::text,
      'Fanta'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '330 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000073'::uuid,
      'Lemonade'::text,
      '7UP'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '330 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000074'::uuid,
      'Lemonade'::text,
      'Schweppes'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      1.1::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000075'::uuid,
      'Ice Tea Lemon'::text,
      'Lipton'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '330 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.55::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000076'::uuid,
      'Energy Drink'::text,
      'Red Bull'::text,
      'Beverages'::text,
      'Energy Drink'::text,
      '250 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.2::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000077'::uuid,
      'Sugarfree'::text,
      'Red Bull'::text,
      'Beverages'::text,
      'Energy Drink'::text,
      '250 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.2::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000078'::uuid,
      'Energy'::text,
      'Monster'::text,
      'Beverages'::text,
      'Energy Drink'::text,
      '500 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000079'::uuid,
      'Ultra White'::text,
      'Monster'::text,
      'Beverages'::text,
      'Energy Drink'::text,
      '500 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      84::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000007a'::uuid,
      'Indian Tonic Water'::text,
      'Schweppes'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.55::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000007b'::uuid,
      'Soda Water'::text,
      'Schweppes'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.45::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000007c'::uuid,
      'Premium Indian Tonic Water'::text,
      'Fever-Tree'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.85::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      18::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000007d'::uuid,
      'Ginger Beer'::text,
      'Fever-Tree'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.85::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000007e'::uuid,
      'Tonic Water'::text,
      'Thomas Henry'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.75::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000007f'::uuid,
      'Pink Grapefruit Soda'::text,
      'Three Cents'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.9::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000080'::uuid,
      'Natural Mineral Water'::text,
      'Evian'::text,
      'Beverages'::text,
      'Water'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0.55::numeric,
      24::numeric,
      120::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000081'::uuid,
      'Sparkling Natural Mineral Water'::text,
      'San Pellegrino'::text,
      'Beverages'::text,
      'Water'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0.7::numeric,
      24::numeric,
      120::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000082'::uuid,
      'Sparkling Natural Mineral Water'::text,
      'Perrier'::text,
      'Beverages'::text,
      'Water'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0.65::numeric,
      24::numeric,
      120::numeric,
      48::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000083'::uuid,
      'Natural Mineral Water'::text,
      'Zagori'::text,
      'Beverages'::text,
      'Water'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0.35::numeric,
      24::numeric,
      120::numeric,
      48::numeric,
      104::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000084'::uuid,
      'Natural Mineral Water'::text,
      'Theoni'::text,
      'Beverages'::text,
      'Water'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0.4::numeric,
      24::numeric,
      120::numeric,
      48::numeric,
      90::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000085'::uuid,
      'Natural Mineral Water'::text,
      'Agros'::text,
      'Beverages'::text,
      'Water'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0.35::numeric,
      24::numeric,
      120::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000086'::uuid,
      'Orange Juice Smooth'::text,
      'Innocent'::text,
      'Beverages'::text,
      'Juice'::text,
      '900 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Fridge'::text,
      2.8::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000087'::uuid,
      'Orange Juice'::text,
      'Kean'::text,
      'Beverages'::text,
      'Juice'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Fridge'::text,
      1.6::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000088'::uuid,
      'Apple Juice'::text,
      'Kean'::text,
      'Beverages'::text,
      'Juice'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Fridge'::text,
      1.5::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000089'::uuid,
      'Orange Nectar'::text,
      'Cappy'::text,
      'Beverages'::text,
      'Juice'::text,
      '1 L'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Fridge'::text,
      1.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      72::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000008a'::uuid,
      'Zero'::text,
      'Sprite'::text,
      'Beverages'::text,
      'Soft Drink'::text,
      '330 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.4::numeric,
      36::numeric,
      144::numeric,
      48::numeric,
      88::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000008b'::uuid,
      'Vanilla Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      7.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000008c'::uuid,
      'Caramel Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      7.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000008d'::uuid,
      'Grenadine Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      7::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      5::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000008e'::uuid,
      'Hazelnut Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      7.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000008f'::uuid,
      'Passion Fruit Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      8::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000090'::uuid,
      'Elderflower Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      8::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000091'::uuid,
      'Sugar Free Vanilla Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      8.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000092'::uuid,
      'Mango Syrup'::text,
      'Monin'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      8::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000093'::uuid,
      'Orgeat Syrup'::text,
      'Giffard'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '1 L'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      9.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      5::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000094'::uuid,
      'Rose Syrup'::text,
      'Giffard'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '1 L'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      9.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000095'::uuid,
      'Vanilla Syrup'::text,
      '1883'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '1 L'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      8.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000096'::uuid,
      'Strawberry Syrup'::text,
      'Fabbri'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '1 L'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      9::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      1::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000097'::uuid,
      'Mango Purée'::text,
      'Funkin'::text,
      'Syrups & Purées'::text,
      'Purée'::text,
      '1 kg'::text,
      'Kilogram'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Fridge'::text,
      9::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000098'::uuid,
      'Passion Fruit Purée'::text,
      'Funkin'::text,
      'Syrups & Purées'::text,
      'Purée'::text,
      '1 kg'::text,
      'Kilogram'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Fridge'::text,
      9.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-000000000099'::uuid,
      'Classico Coffee Beans'::text,
      'Illy'::text,
      'Beverages'::text,
      'Other'::text,
      '250 g'::text,
      'Gram'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Coffee Station'::text,
      8.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000009a'::uuid,
      'Qualità Rossa Beans'::text,
      'Lavazza'::text,
      'Beverages'::text,
      'Other'::text,
      '1 kg'::text,
      'Kilogram'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Coffee Station'::text,
      14::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000009b'::uuid,
      'Lemons'::text,
      null::text,
      'Fresh'::text,
      'Citrus'::text,
      '1 kg'::text,
      'Kilogram'::text,
      'Chilled product.'::text,
      null::text,
      'Local Produce Partners'::text,
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Fridge'::text,
      2.2::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000009c'::uuid,
      'Limes'::text,
      null::text,
      'Fresh'::text,
      'Citrus'::text,
      '1 kg'::text,
      'Kilogram'::text,
      'Chilled product.'::text,
      null::text,
      'Local Produce Partners'::text,
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Fridge'::text,
      3.5::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      5::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000009d'::uuid,
      'Oranges'::text,
      null::text,
      'Fresh'::text,
      'Citrus'::text,
      '1 kg'::text,
      'Kilogram'::text,
      'Chilled product.'::text,
      null::text,
      'Local Produce Partners'::text,
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Fridge'::text,
      2::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000009e'::uuid,
      'Fresh Mint'::text,
      null::text,
      'Fresh'::text,
      'Herbs'::text,
      '100 g'::text,
      'Gram'::text,
      'Chilled product.'::text,
      null::text,
      'Local Produce Partners'::text,
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Fridge'::text,
      1.8::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-00000000009f'::uuid,
      'Cucumber'::text,
      null::text,
      'Fresh'::text,
      'Garnish'::text,
      '1 kg'::text,
      'Kilogram'::text,
      'Chilled product.'::text,
      null::text,
      'Local Produce Partners'::text,
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Fridge'::text,
      1.6::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      5::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a0'::uuid,
      'Fresh Milk'::text,
      null::text,
      'Fresh'::text,
      'Dairy'::text,
      '1 L'::text,
      'Liter'::text,
      'Chilled product.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Fridge'::text,
      1.2::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      6::numeric,
      false::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a1'::uuid,
      'Single Cream'::text,
      null::text,
      'Fresh'::text,
      'Dairy'::text,
      '500 ml'::text,
      'Milliliter'::text,
      'Chilled product.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Fridge'::text,
      1.5::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a2'::uuid,
      'Strawberries'::text,
      null::text,
      'Fresh'::text,
      'Fruit'::text,
      '500 g'::text,
      'Gram'::text,
      'Chilled product.'::text,
      null::text,
      'Local Produce Partners'::text,
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Fridge'::text,
      3.2::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      5::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a3'::uuid,
      'Fresh Basil'::text,
      null::text,
      'Fresh'::text,
      'Herbs'::text,
      '50 g'::text,
      'Gram'::text,
      'Chilled product.'::text,
      null::text,
      'Local Produce Partners'::text,
      'c0318b00-2026-4000-8000-000000000007'::uuid,
      'Fridge'::text,
      1.4::numeric,
      2::numeric,
      8::numeric,
      4::numeric,
      6::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a4'::uuid,
      'Cocktail Napkins'::text,
      null::text,
      'Consumables'::text,
      'Napkins'::text,
      'Pack count varies'::text,
      'Piece'::text,
      'Often delivered in cases of 250.'::text,
      null::text,
      'Nicosia HORECA Supplies'::text,
      'c0318b00-2026-4000-8000-000000000006'::uuid,
      'Main Storage'::text,
      0.02::numeric,
      50::numeric,
      200::numeric,
      100::numeric,
      140::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a5'::uuid,
      'Paper Straws'::text,
      null::text,
      'Consumables'::text,
      'Straws'::text,
      'Pack count varies'::text,
      'Piece'::text,
      'Often delivered in cases of 200.'::text,
      null::text,
      'Nicosia HORECA Supplies'::text,
      'c0318b00-2026-4000-8000-000000000006'::uuid,
      'Main Storage'::text,
      0.03::numeric,
      50::numeric,
      200::numeric,
      100::numeric,
      30::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a6'::uuid,
      '12 Stars'::text,
      'Metaxa'::text,
      'Spirits'::text,
      'Cognac'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      22::numeric,
      4::numeric,
      12::numeric,
      6::numeric,
      14::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a7'::uuid,
      'Without Anise'::text,
      'Tsipouro Tirnavou'::text,
      'Spirits'::text,
      'Other'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      8::numeric,
      4::numeric,
      12::numeric,
      6::numeric,
      12::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a8'::uuid,
      '7 Stars'::text,
      'Metaxa'::text,
      'Spirits'::text,
      'Cognac'::text,
      '70 cl'::text,
      'Bottle'::text,
      'Often delivered in cases of 6.'::text,
      null::text,
      'Premium Spirits Distribution Ltd'::text,
      'c0318b00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      16.5::numeric,
      4::numeric,
      14::numeric,
      6::numeric,
      16::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000a9'::uuid,
      'Ερυθρός'::text,
      'Κτήμα Γεροβασιλείου'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      18::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      10::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000aa'::uuid,
      'Surface Cleaner'::text,
      null::text,
      'Consumables'::text,
      'Cleaning'::text,
      '1 L'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Nicosia HORECA Supplies'::text,
      'c0318b00-2026-4000-8000-000000000006'::uuid,
      'Main Storage'::text,
      2.5::numeric,
      2::numeric,
      6::numeric,
      3::numeric,
      0::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000ab'::uuid,
      'Shiraz'::text,
      'Ζαμπάρτας'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      13.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      11::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000ac'::uuid,
      'Maratheftiko'::text,
      'Τσιάκκας'::text,
      'Wine'::text,
      'Red Wine'::text,
      '750 ml'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'Cyprus Fine Wines Trading'::text,
      'c0318b00-2026-4000-8000-000000000003'::uuid,
      'Wine Storage'::text,
      14::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      9::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000ad'::uuid,
      'Red'::text,
      'Mythos'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.85::numeric,
      24::numeric,
      72::numeric,
      24::numeric,
      48::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000ae'::uuid,
      'Weiss'::text,
      'Vergina'::text,
      'Beverages'::text,
      'Beer'::text,
      '500 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 12.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      1.15::numeric,
      12::numeric,
      48::numeric,
      12::numeric,
      30::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000af'::uuid,
      'Áneu'::text,
      'Fix'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.9::numeric,
      24::numeric,
      72::numeric,
      24::numeric,
      42::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000b0'::uuid,
      'Fresh'::text,
      'Alpha'::text,
      'Beverages'::text,
      'Beer'::text,
      '330 ml'::text,
      'Can'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Fridge'::text,
      0.7::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      60::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000b1'::uuid,
      'Sparkling Water'::text,
      'Zagori'::text,
      'Beverages'::text,
      'Water'::text,
      '330 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Island Water & Refreshments'::text,
      'c0318b00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0.4::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      70::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000b2'::uuid,
      'Ginger Beer'::text,
      'Three Cents'::text,
      'Beverages'::text,
      'Soda / Tonic'::text,
      '200 ml'::text,
      'Bottle'::text,
      'Often delivered in cases of 24.'::text,
      null::text,
      'Mediterranean Beverage Partners'::text,
      'c0318b00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0.95::numeric,
      24::numeric,
      96::numeric,
      48::numeric,
      60::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000b3'::uuid,
      'Caramel Syrup'::text,
      '1883'::text,
      'Syrups & Purées'::text,
      'Syrup'::text,
      '1 L'::text,
      'Bottle'::text,
      'Usually delivered as individual bottles.'::text,
      null::text,
      'FreshServe Food Solutions'::text,
      'c0318b00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      8.5::numeric,
      3::numeric,
      12::numeric,
      6::numeric,
      7::numeric,
      true::boolean
    ),
    (
      'c0318a00-2026-4000-8000-0000000000b4'::uuid,
      'Ice Scoop'::text,
      null::text,
      'Consumables'::text,
      'Other'::text,
      'Standard'::text,
      'Piece'::text,
      'Supplier packaging may vary.'::text,
      null::text,
      'Nicosia HORECA Supplies'::text,
      'c0318b00-2026-4000-8000-000000000006'::uuid,
      'Main Storage'::text,
      3.5::numeric,
      2::numeric,
      6::numeric,
      2::numeric,
      3::numeric,
      true::boolean
    )
  ) as v(
    id,
    name,
    brand,
    category,
    item_type,
    size,
    unit,
    packaging_note,
    barcode,
    supplier,
    supplier_id,
    storage_location,
    cost_price,
    minimum_quantity,
    target_quantity,
    order_quantity,
    current_quantity,
    active
  );

  get diagnostics v_inserted_items = row_count;

  if v_inserted_items <> 180 then
    raise exception
      'P8.31.11 seed abort: expected 180 stock_items, inserted %',
      v_inserted_items;
  end if;

  -- ---------------------------------------------------------------------------
  -- 5) Insert location balances (quantity_version = 1)
  -- ---------------------------------------------------------------------------
  insert into public.stock_item_location_balances (
    id,
    workspace_id,
    stock_item_id,
    workspace_storage_id,
    location_key,
    quantity,
    quantity_version,
    updated_by
  )
  select
    v.id,
    v_workspace_id,
    v.stock_item_id,
    ws.id,
    v.location_key,
    v.quantity,
    1::bigint,
    null::uuid
  from (
    values
    (
      'c0318c00-2026-4000-8000-000000000001'::uuid,
      'c0318a00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000002'::uuid,
      'c0318a00-2026-4000-8000-000000000001'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000003'::uuid,
      'c0318a00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000004'::uuid,
      'c0318a00-2026-4000-8000-000000000002'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000005'::uuid,
      'c0318a00-2026-4000-8000-000000000003'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000006'::uuid,
      'c0318a00-2026-4000-8000-000000000003'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000007'::uuid,
      'c0318a00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000008'::uuid,
      'c0318a00-2026-4000-8000-000000000004'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000009'::uuid,
      'c0318a00-2026-4000-8000-000000000005'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000000a'::uuid,
      'c0318a00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000000b'::uuid,
      'c0318a00-2026-4000-8000-000000000006'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000000c'::uuid,
      'c0318a00-2026-4000-8000-000000000006'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000000d'::uuid,
      'c0318a00-2026-4000-8000-000000000007'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000000e'::uuid,
      'c0318a00-2026-4000-8000-000000000007'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000000f'::uuid,
      'c0318a00-2026-4000-8000-000000000008'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000010'::uuid,
      'c0318a00-2026-4000-8000-000000000008'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000011'::uuid,
      'c0318a00-2026-4000-8000-000000000009'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000012'::uuid,
      'c0318a00-2026-4000-8000-000000000009'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000013'::uuid,
      'c0318a00-2026-4000-8000-00000000000a'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000014'::uuid,
      'c0318a00-2026-4000-8000-00000000000a'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000015'::uuid,
      'c0318a00-2026-4000-8000-00000000000b'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000016'::uuid,
      'c0318a00-2026-4000-8000-00000000000b'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000017'::uuid,
      'c0318a00-2026-4000-8000-00000000000c'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000018'::uuid,
      'c0318a00-2026-4000-8000-00000000000c'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000019'::uuid,
      'c0318a00-2026-4000-8000-00000000000d'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000001a'::uuid,
      'c0318a00-2026-4000-8000-00000000000d'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000001b'::uuid,
      'c0318a00-2026-4000-8000-00000000000e'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000001c'::uuid,
      'c0318a00-2026-4000-8000-00000000000e'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000001d'::uuid,
      'c0318a00-2026-4000-8000-00000000000f'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000001e'::uuid,
      'c0318a00-2026-4000-8000-00000000000f'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000001f'::uuid,
      'c0318a00-2026-4000-8000-000000000010'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000020'::uuid,
      'c0318a00-2026-4000-8000-000000000010'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000021'::uuid,
      'c0318a00-2026-4000-8000-000000000011'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000022'::uuid,
      'c0318a00-2026-4000-8000-000000000011'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000023'::uuid,
      'c0318a00-2026-4000-8000-000000000012'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000024'::uuid,
      'c0318a00-2026-4000-8000-000000000012'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000025'::uuid,
      'c0318a00-2026-4000-8000-000000000013'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000026'::uuid,
      'c0318a00-2026-4000-8000-000000000013'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000027'::uuid,
      'c0318a00-2026-4000-8000-000000000014'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000028'::uuid,
      'c0318a00-2026-4000-8000-000000000014'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000029'::uuid,
      'c0318a00-2026-4000-8000-000000000015'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000002a'::uuid,
      'c0318a00-2026-4000-8000-000000000015'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000002b'::uuid,
      'c0318a00-2026-4000-8000-000000000016'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000002c'::uuid,
      'c0318a00-2026-4000-8000-000000000016'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000002d'::uuid,
      'c0318a00-2026-4000-8000-000000000017'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000002e'::uuid,
      'c0318a00-2026-4000-8000-000000000017'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000002f'::uuid,
      'c0318a00-2026-4000-8000-000000000018'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000030'::uuid,
      'c0318a00-2026-4000-8000-000000000018'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000031'::uuid,
      'c0318a00-2026-4000-8000-000000000019'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000032'::uuid,
      'c0318a00-2026-4000-8000-00000000001a'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000033'::uuid,
      'c0318a00-2026-4000-8000-00000000001a'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000034'::uuid,
      'c0318a00-2026-4000-8000-00000000001b'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000035'::uuid,
      'c0318a00-2026-4000-8000-00000000001b'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000036'::uuid,
      'c0318a00-2026-4000-8000-00000000001c'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000037'::uuid,
      'c0318a00-2026-4000-8000-00000000001c'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000038'::uuid,
      'c0318a00-2026-4000-8000-00000000001d'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000039'::uuid,
      'c0318a00-2026-4000-8000-00000000001d'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000003a'::uuid,
      'c0318a00-2026-4000-8000-00000000001e'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000003b'::uuid,
      'c0318a00-2026-4000-8000-00000000001f'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000003c'::uuid,
      'c0318a00-2026-4000-8000-00000000001f'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000003d'::uuid,
      'c0318a00-2026-4000-8000-000000000020'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000003e'::uuid,
      'c0318a00-2026-4000-8000-000000000020'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000003f'::uuid,
      'c0318a00-2026-4000-8000-000000000021'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000040'::uuid,
      'c0318a00-2026-4000-8000-000000000021'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000041'::uuid,
      'c0318a00-2026-4000-8000-000000000022'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000042'::uuid,
      'c0318a00-2026-4000-8000-000000000022'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000043'::uuid,
      'c0318a00-2026-4000-8000-000000000023'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000044'::uuid,
      'c0318a00-2026-4000-8000-000000000024'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000045'::uuid,
      'c0318a00-2026-4000-8000-000000000024'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000046'::uuid,
      'c0318a00-2026-4000-8000-000000000025'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000047'::uuid,
      'c0318a00-2026-4000-8000-000000000025'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000048'::uuid,
      'c0318a00-2026-4000-8000-000000000026'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000049'::uuid,
      'c0318a00-2026-4000-8000-000000000026'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000004a'::uuid,
      'c0318a00-2026-4000-8000-000000000027'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000004b'::uuid,
      'c0318a00-2026-4000-8000-000000000027'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000004c'::uuid,
      'c0318a00-2026-4000-8000-000000000028'::uuid,
      'Main Storage'::text,
      16::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000004d'::uuid,
      'c0318a00-2026-4000-8000-000000000028'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000004e'::uuid,
      'c0318a00-2026-4000-8000-000000000029'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000004f'::uuid,
      'c0318a00-2026-4000-8000-000000000029'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000050'::uuid,
      'c0318a00-2026-4000-8000-00000000002a'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000051'::uuid,
      'c0318a00-2026-4000-8000-00000000002a'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000052'::uuid,
      'c0318a00-2026-4000-8000-00000000002b'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000053'::uuid,
      'c0318a00-2026-4000-8000-00000000002b'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000054'::uuid,
      'c0318a00-2026-4000-8000-00000000002c'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000055'::uuid,
      'c0318a00-2026-4000-8000-00000000002c'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000056'::uuid,
      'c0318a00-2026-4000-8000-00000000002d'::uuid,
      'Main Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000057'::uuid,
      'c0318a00-2026-4000-8000-00000000002d'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000058'::uuid,
      'c0318a00-2026-4000-8000-00000000002e'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000059'::uuid,
      'c0318a00-2026-4000-8000-00000000002e'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000005a'::uuid,
      'c0318a00-2026-4000-8000-00000000002f'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000005b'::uuid,
      'c0318a00-2026-4000-8000-00000000002f'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000005c'::uuid,
      'c0318a00-2026-4000-8000-000000000030'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000005d'::uuid,
      'c0318a00-2026-4000-8000-000000000030'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000005e'::uuid,
      'c0318a00-2026-4000-8000-000000000031'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000005f'::uuid,
      'c0318a00-2026-4000-8000-000000000031'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000060'::uuid,
      'c0318a00-2026-4000-8000-000000000032'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000061'::uuid,
      'c0318a00-2026-4000-8000-000000000033'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000062'::uuid,
      'c0318a00-2026-4000-8000-000000000033'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000063'::uuid,
      'c0318a00-2026-4000-8000-000000000034'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000064'::uuid,
      'c0318a00-2026-4000-8000-000000000034'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000065'::uuid,
      'c0318a00-2026-4000-8000-000000000035'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000066'::uuid,
      'c0318a00-2026-4000-8000-000000000035'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000067'::uuid,
      'c0318a00-2026-4000-8000-000000000036'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000068'::uuid,
      'c0318a00-2026-4000-8000-000000000036'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000069'::uuid,
      'c0318a00-2026-4000-8000-000000000037'::uuid,
      'Main Storage'::text,
      8::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000006a'::uuid,
      'c0318a00-2026-4000-8000-000000000037'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000006b'::uuid,
      'c0318a00-2026-4000-8000-000000000038'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000006c'::uuid,
      'c0318a00-2026-4000-8000-000000000039'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000006d'::uuid,
      'c0318a00-2026-4000-8000-000000000039'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000006e'::uuid,
      'c0318a00-2026-4000-8000-00000000003a'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000006f'::uuid,
      'c0318a00-2026-4000-8000-00000000003a'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000070'::uuid,
      'c0318a00-2026-4000-8000-00000000003b'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000071'::uuid,
      'c0318a00-2026-4000-8000-00000000003b'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000072'::uuid,
      'c0318a00-2026-4000-8000-00000000003c'::uuid,
      'Wine Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000073'::uuid,
      'c0318a00-2026-4000-8000-00000000003c'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000074'::uuid,
      'c0318a00-2026-4000-8000-00000000003d'::uuid,
      'Wine Storage'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000075'::uuid,
      'c0318a00-2026-4000-8000-00000000003d'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000076'::uuid,
      'c0318a00-2026-4000-8000-00000000003e'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000077'::uuid,
      'c0318a00-2026-4000-8000-00000000003e'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000078'::uuid,
      'c0318a00-2026-4000-8000-00000000003f'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000079'::uuid,
      'c0318a00-2026-4000-8000-00000000003f'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000007a'::uuid,
      'c0318a00-2026-4000-8000-000000000040'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000007b'::uuid,
      'c0318a00-2026-4000-8000-000000000041'::uuid,
      'Wine Storage'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000007c'::uuid,
      'c0318a00-2026-4000-8000-000000000041'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000007d'::uuid,
      'c0318a00-2026-4000-8000-000000000042'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000007e'::uuid,
      'c0318a00-2026-4000-8000-000000000042'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000007f'::uuid,
      'c0318a00-2026-4000-8000-000000000043'::uuid,
      'Wine Storage'::text,
      11::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000080'::uuid,
      'c0318a00-2026-4000-8000-000000000043'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000081'::uuid,
      'c0318a00-2026-4000-8000-000000000044'::uuid,
      'Wine Storage'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000082'::uuid,
      'c0318a00-2026-4000-8000-000000000044'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000083'::uuid,
      'c0318a00-2026-4000-8000-000000000045'::uuid,
      'Wine Storage'::text,
      8::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000084'::uuid,
      'c0318a00-2026-4000-8000-000000000045'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000085'::uuid,
      'c0318a00-2026-4000-8000-000000000046'::uuid,
      'Wine Storage'::text,
      8::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000086'::uuid,
      'c0318a00-2026-4000-8000-000000000046'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000087'::uuid,
      'c0318a00-2026-4000-8000-000000000047'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000088'::uuid,
      'c0318a00-2026-4000-8000-000000000047'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000089'::uuid,
      'c0318a00-2026-4000-8000-000000000048'::uuid,
      'Wine Storage'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000008a'::uuid,
      'c0318a00-2026-4000-8000-000000000048'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000008b'::uuid,
      'c0318a00-2026-4000-8000-000000000049'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000008c'::uuid,
      'c0318a00-2026-4000-8000-000000000049'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000008d'::uuid,
      'c0318a00-2026-4000-8000-00000000004a'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000008e'::uuid,
      'c0318a00-2026-4000-8000-00000000004a'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000008f'::uuid,
      'c0318a00-2026-4000-8000-00000000004b'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000090'::uuid,
      'c0318a00-2026-4000-8000-00000000004b'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000091'::uuid,
      'c0318a00-2026-4000-8000-00000000004c'::uuid,
      'Wine Storage'::text,
      9::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000092'::uuid,
      'c0318a00-2026-4000-8000-00000000004c'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000093'::uuid,
      'c0318a00-2026-4000-8000-00000000004d'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000094'::uuid,
      'c0318a00-2026-4000-8000-00000000004d'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000095'::uuid,
      'c0318a00-2026-4000-8000-00000000004e'::uuid,
      'Wine Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000096'::uuid,
      'c0318a00-2026-4000-8000-00000000004e'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000097'::uuid,
      'c0318a00-2026-4000-8000-00000000004f'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000098'::uuid,
      'c0318a00-2026-4000-8000-00000000004f'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000099'::uuid,
      'c0318a00-2026-4000-8000-000000000050'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000009a'::uuid,
      'c0318a00-2026-4000-8000-000000000051'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000009b'::uuid,
      'c0318a00-2026-4000-8000-000000000051'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000009c'::uuid,
      'c0318a00-2026-4000-8000-000000000052'::uuid,
      'Wine Storage'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000009d'::uuid,
      'c0318a00-2026-4000-8000-000000000052'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000009e'::uuid,
      'c0318a00-2026-4000-8000-000000000053'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000009f'::uuid,
      'c0318a00-2026-4000-8000-000000000053'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a0'::uuid,
      'c0318a00-2026-4000-8000-000000000054'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a1'::uuid,
      'c0318a00-2026-4000-8000-000000000055'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a2'::uuid,
      'c0318a00-2026-4000-8000-000000000055'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a3'::uuid,
      'c0318a00-2026-4000-8000-000000000056'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a4'::uuid,
      'c0318a00-2026-4000-8000-000000000056'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a5'::uuid,
      'c0318a00-2026-4000-8000-000000000057'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a6'::uuid,
      'c0318a00-2026-4000-8000-000000000057'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a7'::uuid,
      'c0318a00-2026-4000-8000-000000000058'::uuid,
      'Wine Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a8'::uuid,
      'c0318a00-2026-4000-8000-000000000058'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000a9'::uuid,
      'c0318a00-2026-4000-8000-000000000059'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000aa'::uuid,
      'c0318a00-2026-4000-8000-000000000059'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ab'::uuid,
      'c0318a00-2026-4000-8000-00000000005a'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ac'::uuid,
      'c0318a00-2026-4000-8000-00000000005a'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ad'::uuid,
      'c0318a00-2026-4000-8000-00000000005b'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ae'::uuid,
      'c0318a00-2026-4000-8000-00000000005b'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000af'::uuid,
      'c0318a00-2026-4000-8000-00000000005c'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b0'::uuid,
      'c0318a00-2026-4000-8000-00000000005c'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b1'::uuid,
      'c0318a00-2026-4000-8000-00000000005d'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b2'::uuid,
      'c0318a00-2026-4000-8000-00000000005e'::uuid,
      'Fridge'::text,
      8::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b3'::uuid,
      'c0318a00-2026-4000-8000-00000000005e'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b4'::uuid,
      'c0318a00-2026-4000-8000-00000000005f'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b5'::uuid,
      'c0318a00-2026-4000-8000-00000000005f'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b6'::uuid,
      'c0318a00-2026-4000-8000-000000000060'::uuid,
      'Fridge'::text,
      40::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b7'::uuid,
      'c0318a00-2026-4000-8000-000000000060'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b8'::uuid,
      'c0318a00-2026-4000-8000-000000000061'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000b9'::uuid,
      'c0318a00-2026-4000-8000-000000000061'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ba'::uuid,
      'c0318a00-2026-4000-8000-000000000062'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000bb'::uuid,
      'c0318a00-2026-4000-8000-000000000062'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000bc'::uuid,
      'c0318a00-2026-4000-8000-000000000063'::uuid,
      'Fridge'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000bd'::uuid,
      'c0318a00-2026-4000-8000-000000000063'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000be'::uuid,
      'c0318a00-2026-4000-8000-000000000064'::uuid,
      'Fridge'::text,
      36::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000bf'::uuid,
      'c0318a00-2026-4000-8000-000000000064'::uuid,
      'Bar'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c0'::uuid,
      'c0318a00-2026-4000-8000-000000000065'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c1'::uuid,
      'c0318a00-2026-4000-8000-000000000066'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c2'::uuid,
      'c0318a00-2026-4000-8000-000000000067'::uuid,
      'Fridge'::text,
      50::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c3'::uuid,
      'c0318a00-2026-4000-8000-000000000067'::uuid,
      'Bar'::text,
      22::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c4'::uuid,
      'c0318a00-2026-4000-8000-000000000068'::uuid,
      'Fridge'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c5'::uuid,
      'c0318a00-2026-4000-8000-000000000068'::uuid,
      'Bar'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c6'::uuid,
      'c0318a00-2026-4000-8000-000000000069'::uuid,
      'Fridge'::text,
      36::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c7'::uuid,
      'c0318a00-2026-4000-8000-000000000069'::uuid,
      'Bar'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c8'::uuid,
      'c0318a00-2026-4000-8000-00000000006a'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000c9'::uuid,
      'c0318a00-2026-4000-8000-00000000006a'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ca'::uuid,
      'c0318a00-2026-4000-8000-00000000006b'::uuid,
      'Fridge'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000cb'::uuid,
      'c0318a00-2026-4000-8000-00000000006b'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000cc'::uuid,
      'c0318a00-2026-4000-8000-00000000006c'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000cd'::uuid,
      'c0318a00-2026-4000-8000-00000000006d'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ce'::uuid,
      'c0318a00-2026-4000-8000-00000000006e'::uuid,
      'Main Storage'::text,
      96::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000cf'::uuid,
      'c0318a00-2026-4000-8000-00000000006e'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d0'::uuid,
      'c0318a00-2026-4000-8000-00000000006f'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d1'::uuid,
      'c0318a00-2026-4000-8000-00000000006f'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d2'::uuid,
      'c0318a00-2026-4000-8000-000000000070'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d3'::uuid,
      'c0318a00-2026-4000-8000-000000000070'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d4'::uuid,
      'c0318a00-2026-4000-8000-000000000071'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d5'::uuid,
      'c0318a00-2026-4000-8000-000000000072'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d6'::uuid,
      'c0318a00-2026-4000-8000-000000000072'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d7'::uuid,
      'c0318a00-2026-4000-8000-000000000073'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d8'::uuid,
      'c0318a00-2026-4000-8000-000000000073'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000d9'::uuid,
      'c0318a00-2026-4000-8000-000000000074'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000da'::uuid,
      'c0318a00-2026-4000-8000-000000000074'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000db'::uuid,
      'c0318a00-2026-4000-8000-000000000075'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000dc'::uuid,
      'c0318a00-2026-4000-8000-000000000076'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000dd'::uuid,
      'c0318a00-2026-4000-8000-000000000076'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000de'::uuid,
      'c0318a00-2026-4000-8000-000000000077'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000df'::uuid,
      'c0318a00-2026-4000-8000-000000000077'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e0'::uuid,
      'c0318a00-2026-4000-8000-000000000078'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e1'::uuid,
      'c0318a00-2026-4000-8000-000000000078'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e2'::uuid,
      'c0318a00-2026-4000-8000-000000000079'::uuid,
      'Fridge'::text,
      60::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e3'::uuid,
      'c0318a00-2026-4000-8000-000000000079'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e4'::uuid,
      'c0318a00-2026-4000-8000-00000000007a'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e5'::uuid,
      'c0318a00-2026-4000-8000-00000000007a'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e6'::uuid,
      'c0318a00-2026-4000-8000-00000000007b'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e7'::uuid,
      'c0318a00-2026-4000-8000-00000000007b'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e8'::uuid,
      'c0318a00-2026-4000-8000-00000000007c'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000e9'::uuid,
      'c0318a00-2026-4000-8000-00000000007c'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ea'::uuid,
      'c0318a00-2026-4000-8000-00000000007d'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000eb'::uuid,
      'c0318a00-2026-4000-8000-00000000007e'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ec'::uuid,
      'c0318a00-2026-4000-8000-00000000007e'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ed'::uuid,
      'c0318a00-2026-4000-8000-00000000007f'::uuid,
      'Main Storage'::text,
      48::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ee'::uuid,
      'c0318a00-2026-4000-8000-00000000007f'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ef'::uuid,
      'c0318a00-2026-4000-8000-000000000080'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f0'::uuid,
      'c0318a00-2026-4000-8000-000000000080'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f1'::uuid,
      'c0318a00-2026-4000-8000-000000000081'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f2'::uuid,
      'c0318a00-2026-4000-8000-000000000082'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f3'::uuid,
      'c0318a00-2026-4000-8000-000000000082'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f4'::uuid,
      'c0318a00-2026-4000-8000-000000000083'::uuid,
      'Main Storage'::text,
      80::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f5'::uuid,
      'c0318a00-2026-4000-8000-000000000083'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f6'::uuid,
      'c0318a00-2026-4000-8000-000000000084'::uuid,
      'Main Storage'::text,
      70::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f7'::uuid,
      'c0318a00-2026-4000-8000-000000000084'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f8'::uuid,
      'c0318a00-2026-4000-8000-000000000085'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000f9'::uuid,
      'c0318a00-2026-4000-8000-000000000086'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000fa'::uuid,
      'c0318a00-2026-4000-8000-000000000086'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000fb'::uuid,
      'c0318a00-2026-4000-8000-000000000087'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000fc'::uuid,
      'c0318a00-2026-4000-8000-000000000087'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000fd'::uuid,
      'c0318a00-2026-4000-8000-000000000088'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000fe'::uuid,
      'c0318a00-2026-4000-8000-000000000088'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-0000000000ff'::uuid,
      'c0318a00-2026-4000-8000-000000000089'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000100'::uuid,
      'c0318a00-2026-4000-8000-00000000008a'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000101'::uuid,
      'c0318a00-2026-4000-8000-00000000008a'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000102'::uuid,
      'c0318a00-2026-4000-8000-00000000008b'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000103'::uuid,
      'c0318a00-2026-4000-8000-00000000008b'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000104'::uuid,
      'c0318a00-2026-4000-8000-00000000008c'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000105'::uuid,
      'c0318a00-2026-4000-8000-00000000008c'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000106'::uuid,
      'c0318a00-2026-4000-8000-00000000008d'::uuid,
      'Bar'::text,
      5::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000107'::uuid,
      'c0318a00-2026-4000-8000-00000000008e'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000108'::uuid,
      'c0318a00-2026-4000-8000-00000000008e'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000109'::uuid,
      'c0318a00-2026-4000-8000-00000000008f'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000010a'::uuid,
      'c0318a00-2026-4000-8000-00000000008f'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000010b'::uuid,
      'c0318a00-2026-4000-8000-000000000090'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000010c'::uuid,
      'c0318a00-2026-4000-8000-000000000090'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000010d'::uuid,
      'c0318a00-2026-4000-8000-000000000091'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000010e'::uuid,
      'c0318a00-2026-4000-8000-000000000091'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000010f'::uuid,
      'c0318a00-2026-4000-8000-000000000092'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000110'::uuid,
      'c0318a00-2026-4000-8000-000000000092'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000111'::uuid,
      'c0318a00-2026-4000-8000-000000000093'::uuid,
      'Bar'::text,
      5::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000112'::uuid,
      'c0318a00-2026-4000-8000-000000000094'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000113'::uuid,
      'c0318a00-2026-4000-8000-000000000094'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000114'::uuid,
      'c0318a00-2026-4000-8000-000000000095'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000115'::uuid,
      'c0318a00-2026-4000-8000-000000000095'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000116'::uuid,
      'c0318a00-2026-4000-8000-000000000096'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000117'::uuid,
      'c0318a00-2026-4000-8000-000000000096'::uuid,
      'Kitchen'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000118'::uuid,
      'c0318a00-2026-4000-8000-000000000097'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000119'::uuid,
      'c0318a00-2026-4000-8000-000000000097'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000011a'::uuid,
      'c0318a00-2026-4000-8000-000000000098'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000011b'::uuid,
      'c0318a00-2026-4000-8000-000000000098'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000011c'::uuid,
      'c0318a00-2026-4000-8000-000000000099'::uuid,
      'Coffee Station'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000011d'::uuid,
      'c0318a00-2026-4000-8000-000000000099'::uuid,
      'Main Storage'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000011e'::uuid,
      'c0318a00-2026-4000-8000-00000000009a'::uuid,
      'Coffee Station'::text,
      6::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000011f'::uuid,
      'c0318a00-2026-4000-8000-00000000009a'::uuid,
      'Main Storage'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000120'::uuid,
      'c0318a00-2026-4000-8000-00000000009b'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000121'::uuid,
      'c0318a00-2026-4000-8000-00000000009b'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000122'::uuid,
      'c0318a00-2026-4000-8000-00000000009c'::uuid,
      'Fridge'::text,
      5::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000123'::uuid,
      'c0318a00-2026-4000-8000-00000000009d'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000124'::uuid,
      'c0318a00-2026-4000-8000-00000000009d'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000125'::uuid,
      'c0318a00-2026-4000-8000-00000000009e'::uuid,
      'Fridge'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000126'::uuid,
      'c0318a00-2026-4000-8000-00000000009e'::uuid,
      'Kitchen'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000127'::uuid,
      'c0318a00-2026-4000-8000-00000000009f'::uuid,
      'Fridge'::text,
      5::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000128'::uuid,
      'c0318a00-2026-4000-8000-0000000000a0'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000129'::uuid,
      'c0318a00-2026-4000-8000-0000000000a0'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000012a'::uuid,
      'c0318a00-2026-4000-8000-0000000000a1'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000012b'::uuid,
      'c0318a00-2026-4000-8000-0000000000a1'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000012c'::uuid,
      'c0318a00-2026-4000-8000-0000000000a2'::uuid,
      'Fridge'::text,
      5::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000012d'::uuid,
      'c0318a00-2026-4000-8000-0000000000a3'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000012e'::uuid,
      'c0318a00-2026-4000-8000-0000000000a3'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000012f'::uuid,
      'c0318a00-2026-4000-8000-0000000000a4'::uuid,
      'Main Storage'::text,
      100::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000130'::uuid,
      'c0318a00-2026-4000-8000-0000000000a4'::uuid,
      'Bar'::text,
      40::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000131'::uuid,
      'c0318a00-2026-4000-8000-0000000000a5'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000132'::uuid,
      'c0318a00-2026-4000-8000-0000000000a5'::uuid,
      'Bar'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000133'::uuid,
      'c0318a00-2026-4000-8000-0000000000a6'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000134'::uuid,
      'c0318a00-2026-4000-8000-0000000000a6'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000135'::uuid,
      'c0318a00-2026-4000-8000-0000000000a7'::uuid,
      'Main Storage'::text,
      9::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000136'::uuid,
      'c0318a00-2026-4000-8000-0000000000a7'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000137'::uuid,
      'c0318a00-2026-4000-8000-0000000000a8'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000138'::uuid,
      'c0318a00-2026-4000-8000-0000000000a8'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000139'::uuid,
      'c0318a00-2026-4000-8000-0000000000a9'::uuid,
      'Wine Storage'::text,
      8::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000013a'::uuid,
      'c0318a00-2026-4000-8000-0000000000a9'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000013b'::uuid,
      'c0318a00-2026-4000-8000-0000000000aa'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000013c'::uuid,
      'c0318a00-2026-4000-8000-0000000000aa'::uuid,
      'Kitchen'::text,
      0::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000013d'::uuid,
      'c0318a00-2026-4000-8000-0000000000ab'::uuid,
      'Wine Storage'::text,
      9::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000013e'::uuid,
      'c0318a00-2026-4000-8000-0000000000ab'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000013f'::uuid,
      'c0318a00-2026-4000-8000-0000000000ac'::uuid,
      'Wine Storage'::text,
      7::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000140'::uuid,
      'c0318a00-2026-4000-8000-0000000000ac'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000141'::uuid,
      'c0318a00-2026-4000-8000-0000000000ad'::uuid,
      'Fridge'::text,
      30::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000142'::uuid,
      'c0318a00-2026-4000-8000-0000000000ad'::uuid,
      'Bar'::text,
      18::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000143'::uuid,
      'c0318a00-2026-4000-8000-0000000000ae'::uuid,
      'Fridge'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000144'::uuid,
      'c0318a00-2026-4000-8000-0000000000ae'::uuid,
      'Bar'::text,
      10::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000145'::uuid,
      'c0318a00-2026-4000-8000-0000000000af'::uuid,
      'Fridge'::text,
      28::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000146'::uuid,
      'c0318a00-2026-4000-8000-0000000000af'::uuid,
      'Bar'::text,
      14::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000147'::uuid,
      'c0318a00-2026-4000-8000-0000000000b0'::uuid,
      'Fridge'::text,
      40::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000148'::uuid,
      'c0318a00-2026-4000-8000-0000000000b0'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000149'::uuid,
      'c0318a00-2026-4000-8000-0000000000b1'::uuid,
      'Main Storage'::text,
      50::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000014a'::uuid,
      'c0318a00-2026-4000-8000-0000000000b1'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000014b'::uuid,
      'c0318a00-2026-4000-8000-0000000000b2'::uuid,
      'Main Storage'::text,
      40::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000014c'::uuid,
      'c0318a00-2026-4000-8000-0000000000b2'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000014d'::uuid,
      'c0318a00-2026-4000-8000-0000000000b3'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000014e'::uuid,
      'c0318a00-2026-4000-8000-0000000000b3'::uuid,
      'Main Storage'::text,
      4::numeric
    ),
    (
      'c0318c00-2026-4000-8000-00000000014f'::uuid,
      'c0318a00-2026-4000-8000-0000000000b4'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'c0318c00-2026-4000-8000-000000000150'::uuid,
      'c0318a00-2026-4000-8000-0000000000b4'::uuid,
      'Bar'::text,
      1::numeric
    )
  ) as v(id, stock_item_id, location_key, quantity)
  inner join public.workspace_storages ws
    on ws.workspace_id = v_workspace_id
   and ws.location_key = v.location_key;

  get diagnostics v_inserted_balances = row_count;

  if v_inserted_balances <> 336 then
    raise exception
      'P8.31.11 seed abort: expected 336 balances, inserted %',
      v_inserted_balances;
  end if;

  -- ---------------------------------------------------------------------------
  -- 6) Opening stock_count movements (explain seeded balances; note = batch id)
  -- ---------------------------------------------------------------------------
  insert into public.stock_movements (
    id,
    workspace_id,
    item_id,
    type,
    quantity,
    note,
    created_by,
    destination_workspace_storage_id,
    destination_location_key,
    origin_workflow
  )
  select
    v.id,
    v_workspace_id,
    v.stock_item_id,
    'stock_count',
    v.quantity,
    v_batch_marker || ' | opening balance seed',
    null::uuid,
    ws.id,
    v.location_key,
    'migration'
  from (
    values
    (
      'd0318a00-2026-4000-8000-000000000001'::uuid,
      'c0318a00-2026-4000-8000-000000000001'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000002'::uuid,
      'c0318a00-2026-4000-8000-000000000001'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000003'::uuid,
      'c0318a00-2026-4000-8000-000000000002'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000004'::uuid,
      'c0318a00-2026-4000-8000-000000000002'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000005'::uuid,
      'c0318a00-2026-4000-8000-000000000003'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000006'::uuid,
      'c0318a00-2026-4000-8000-000000000003'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000007'::uuid,
      'c0318a00-2026-4000-8000-000000000004'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000008'::uuid,
      'c0318a00-2026-4000-8000-000000000004'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000009'::uuid,
      'c0318a00-2026-4000-8000-000000000005'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000000a'::uuid,
      'c0318a00-2026-4000-8000-000000000005'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000000b'::uuid,
      'c0318a00-2026-4000-8000-000000000006'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000000c'::uuid,
      'c0318a00-2026-4000-8000-000000000006'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000000d'::uuid,
      'c0318a00-2026-4000-8000-000000000007'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000000e'::uuid,
      'c0318a00-2026-4000-8000-000000000007'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000000f'::uuid,
      'c0318a00-2026-4000-8000-000000000008'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000010'::uuid,
      'c0318a00-2026-4000-8000-000000000008'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000011'::uuid,
      'c0318a00-2026-4000-8000-000000000009'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000012'::uuid,
      'c0318a00-2026-4000-8000-000000000009'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000013'::uuid,
      'c0318a00-2026-4000-8000-00000000000a'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000014'::uuid,
      'c0318a00-2026-4000-8000-00000000000a'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000015'::uuid,
      'c0318a00-2026-4000-8000-00000000000b'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000016'::uuid,
      'c0318a00-2026-4000-8000-00000000000b'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000017'::uuid,
      'c0318a00-2026-4000-8000-00000000000c'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000018'::uuid,
      'c0318a00-2026-4000-8000-00000000000c'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000019'::uuid,
      'c0318a00-2026-4000-8000-00000000000d'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000001a'::uuid,
      'c0318a00-2026-4000-8000-00000000000d'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000001b'::uuid,
      'c0318a00-2026-4000-8000-00000000000e'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000001c'::uuid,
      'c0318a00-2026-4000-8000-00000000000e'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000001d'::uuid,
      'c0318a00-2026-4000-8000-00000000000f'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000001e'::uuid,
      'c0318a00-2026-4000-8000-00000000000f'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000001f'::uuid,
      'c0318a00-2026-4000-8000-000000000010'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000020'::uuid,
      'c0318a00-2026-4000-8000-000000000010'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000021'::uuid,
      'c0318a00-2026-4000-8000-000000000011'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000022'::uuid,
      'c0318a00-2026-4000-8000-000000000011'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000023'::uuid,
      'c0318a00-2026-4000-8000-000000000012'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000024'::uuid,
      'c0318a00-2026-4000-8000-000000000012'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000025'::uuid,
      'c0318a00-2026-4000-8000-000000000013'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000026'::uuid,
      'c0318a00-2026-4000-8000-000000000013'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000027'::uuid,
      'c0318a00-2026-4000-8000-000000000014'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000028'::uuid,
      'c0318a00-2026-4000-8000-000000000014'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000029'::uuid,
      'c0318a00-2026-4000-8000-000000000015'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000002a'::uuid,
      'c0318a00-2026-4000-8000-000000000015'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000002b'::uuid,
      'c0318a00-2026-4000-8000-000000000016'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000002c'::uuid,
      'c0318a00-2026-4000-8000-000000000016'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000002d'::uuid,
      'c0318a00-2026-4000-8000-000000000017'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000002e'::uuid,
      'c0318a00-2026-4000-8000-000000000017'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000002f'::uuid,
      'c0318a00-2026-4000-8000-000000000018'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000030'::uuid,
      'c0318a00-2026-4000-8000-000000000018'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000031'::uuid,
      'c0318a00-2026-4000-8000-000000000019'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000032'::uuid,
      'c0318a00-2026-4000-8000-00000000001a'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000033'::uuid,
      'c0318a00-2026-4000-8000-00000000001a'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000034'::uuid,
      'c0318a00-2026-4000-8000-00000000001b'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000035'::uuid,
      'c0318a00-2026-4000-8000-00000000001b'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000036'::uuid,
      'c0318a00-2026-4000-8000-00000000001c'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000037'::uuid,
      'c0318a00-2026-4000-8000-00000000001c'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000038'::uuid,
      'c0318a00-2026-4000-8000-00000000001d'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000039'::uuid,
      'c0318a00-2026-4000-8000-00000000001d'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000003a'::uuid,
      'c0318a00-2026-4000-8000-00000000001e'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000003b'::uuid,
      'c0318a00-2026-4000-8000-00000000001f'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000003c'::uuid,
      'c0318a00-2026-4000-8000-00000000001f'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000003d'::uuid,
      'c0318a00-2026-4000-8000-000000000020'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000003e'::uuid,
      'c0318a00-2026-4000-8000-000000000020'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000003f'::uuid,
      'c0318a00-2026-4000-8000-000000000021'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000040'::uuid,
      'c0318a00-2026-4000-8000-000000000021'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000041'::uuid,
      'c0318a00-2026-4000-8000-000000000022'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000042'::uuid,
      'c0318a00-2026-4000-8000-000000000022'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000043'::uuid,
      'c0318a00-2026-4000-8000-000000000023'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000044'::uuid,
      'c0318a00-2026-4000-8000-000000000024'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000045'::uuid,
      'c0318a00-2026-4000-8000-000000000024'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000046'::uuid,
      'c0318a00-2026-4000-8000-000000000025'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000047'::uuid,
      'c0318a00-2026-4000-8000-000000000025'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000048'::uuid,
      'c0318a00-2026-4000-8000-000000000026'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000049'::uuid,
      'c0318a00-2026-4000-8000-000000000026'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000004a'::uuid,
      'c0318a00-2026-4000-8000-000000000027'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000004b'::uuid,
      'c0318a00-2026-4000-8000-000000000027'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000004c'::uuid,
      'c0318a00-2026-4000-8000-000000000028'::uuid,
      'Main Storage'::text,
      16::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000004d'::uuid,
      'c0318a00-2026-4000-8000-000000000028'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000004e'::uuid,
      'c0318a00-2026-4000-8000-000000000029'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000004f'::uuid,
      'c0318a00-2026-4000-8000-000000000029'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000050'::uuid,
      'c0318a00-2026-4000-8000-00000000002a'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000051'::uuid,
      'c0318a00-2026-4000-8000-00000000002a'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000052'::uuid,
      'c0318a00-2026-4000-8000-00000000002b'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000053'::uuid,
      'c0318a00-2026-4000-8000-00000000002b'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000054'::uuid,
      'c0318a00-2026-4000-8000-00000000002c'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000055'::uuid,
      'c0318a00-2026-4000-8000-00000000002c'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000056'::uuid,
      'c0318a00-2026-4000-8000-00000000002d'::uuid,
      'Main Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000057'::uuid,
      'c0318a00-2026-4000-8000-00000000002d'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000058'::uuid,
      'c0318a00-2026-4000-8000-00000000002e'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000059'::uuid,
      'c0318a00-2026-4000-8000-00000000002e'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000005a'::uuid,
      'c0318a00-2026-4000-8000-00000000002f'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000005b'::uuid,
      'c0318a00-2026-4000-8000-00000000002f'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000005c'::uuid,
      'c0318a00-2026-4000-8000-000000000030'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000005d'::uuid,
      'c0318a00-2026-4000-8000-000000000030'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000005e'::uuid,
      'c0318a00-2026-4000-8000-000000000031'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000005f'::uuid,
      'c0318a00-2026-4000-8000-000000000031'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000060'::uuid,
      'c0318a00-2026-4000-8000-000000000032'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000061'::uuid,
      'c0318a00-2026-4000-8000-000000000033'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000062'::uuid,
      'c0318a00-2026-4000-8000-000000000033'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000063'::uuid,
      'c0318a00-2026-4000-8000-000000000034'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000064'::uuid,
      'c0318a00-2026-4000-8000-000000000034'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000065'::uuid,
      'c0318a00-2026-4000-8000-000000000035'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000066'::uuid,
      'c0318a00-2026-4000-8000-000000000035'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000067'::uuid,
      'c0318a00-2026-4000-8000-000000000036'::uuid,
      'Main Storage'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000068'::uuid,
      'c0318a00-2026-4000-8000-000000000036'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000069'::uuid,
      'c0318a00-2026-4000-8000-000000000037'::uuid,
      'Main Storage'::text,
      8::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000006a'::uuid,
      'c0318a00-2026-4000-8000-000000000037'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000006b'::uuid,
      'c0318a00-2026-4000-8000-000000000038'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000006c'::uuid,
      'c0318a00-2026-4000-8000-000000000039'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000006d'::uuid,
      'c0318a00-2026-4000-8000-000000000039'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000006e'::uuid,
      'c0318a00-2026-4000-8000-00000000003a'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000006f'::uuid,
      'c0318a00-2026-4000-8000-00000000003a'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000070'::uuid,
      'c0318a00-2026-4000-8000-00000000003b'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000071'::uuid,
      'c0318a00-2026-4000-8000-00000000003b'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000072'::uuid,
      'c0318a00-2026-4000-8000-00000000003c'::uuid,
      'Wine Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000073'::uuid,
      'c0318a00-2026-4000-8000-00000000003c'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000074'::uuid,
      'c0318a00-2026-4000-8000-00000000003d'::uuid,
      'Wine Storage'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000075'::uuid,
      'c0318a00-2026-4000-8000-00000000003d'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000076'::uuid,
      'c0318a00-2026-4000-8000-00000000003e'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000077'::uuid,
      'c0318a00-2026-4000-8000-00000000003e'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000078'::uuid,
      'c0318a00-2026-4000-8000-00000000003f'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000079'::uuid,
      'c0318a00-2026-4000-8000-00000000003f'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000007a'::uuid,
      'c0318a00-2026-4000-8000-000000000040'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000007b'::uuid,
      'c0318a00-2026-4000-8000-000000000041'::uuid,
      'Wine Storage'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000007c'::uuid,
      'c0318a00-2026-4000-8000-000000000041'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000007d'::uuid,
      'c0318a00-2026-4000-8000-000000000042'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000007e'::uuid,
      'c0318a00-2026-4000-8000-000000000042'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000007f'::uuid,
      'c0318a00-2026-4000-8000-000000000043'::uuid,
      'Wine Storage'::text,
      11::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000080'::uuid,
      'c0318a00-2026-4000-8000-000000000043'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000081'::uuid,
      'c0318a00-2026-4000-8000-000000000044'::uuid,
      'Wine Storage'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000082'::uuid,
      'c0318a00-2026-4000-8000-000000000044'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000083'::uuid,
      'c0318a00-2026-4000-8000-000000000045'::uuid,
      'Wine Storage'::text,
      8::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000084'::uuid,
      'c0318a00-2026-4000-8000-000000000045'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000085'::uuid,
      'c0318a00-2026-4000-8000-000000000046'::uuid,
      'Wine Storage'::text,
      8::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000086'::uuid,
      'c0318a00-2026-4000-8000-000000000046'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000087'::uuid,
      'c0318a00-2026-4000-8000-000000000047'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000088'::uuid,
      'c0318a00-2026-4000-8000-000000000047'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000089'::uuid,
      'c0318a00-2026-4000-8000-000000000048'::uuid,
      'Wine Storage'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000008a'::uuid,
      'c0318a00-2026-4000-8000-000000000048'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000008b'::uuid,
      'c0318a00-2026-4000-8000-000000000049'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000008c'::uuid,
      'c0318a00-2026-4000-8000-000000000049'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000008d'::uuid,
      'c0318a00-2026-4000-8000-00000000004a'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000008e'::uuid,
      'c0318a00-2026-4000-8000-00000000004a'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000008f'::uuid,
      'c0318a00-2026-4000-8000-00000000004b'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000090'::uuid,
      'c0318a00-2026-4000-8000-00000000004b'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000091'::uuid,
      'c0318a00-2026-4000-8000-00000000004c'::uuid,
      'Wine Storage'::text,
      9::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000092'::uuid,
      'c0318a00-2026-4000-8000-00000000004c'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000093'::uuid,
      'c0318a00-2026-4000-8000-00000000004d'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000094'::uuid,
      'c0318a00-2026-4000-8000-00000000004d'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000095'::uuid,
      'c0318a00-2026-4000-8000-00000000004e'::uuid,
      'Wine Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000096'::uuid,
      'c0318a00-2026-4000-8000-00000000004e'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000097'::uuid,
      'c0318a00-2026-4000-8000-00000000004f'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000098'::uuid,
      'c0318a00-2026-4000-8000-00000000004f'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000099'::uuid,
      'c0318a00-2026-4000-8000-000000000050'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000009a'::uuid,
      'c0318a00-2026-4000-8000-000000000051'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000009b'::uuid,
      'c0318a00-2026-4000-8000-000000000051'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000009c'::uuid,
      'c0318a00-2026-4000-8000-000000000052'::uuid,
      'Wine Storage'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000009d'::uuid,
      'c0318a00-2026-4000-8000-000000000052'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000009e'::uuid,
      'c0318a00-2026-4000-8000-000000000053'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000009f'::uuid,
      'c0318a00-2026-4000-8000-000000000053'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a0'::uuid,
      'c0318a00-2026-4000-8000-000000000054'::uuid,
      'Wine Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a1'::uuid,
      'c0318a00-2026-4000-8000-000000000055'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a2'::uuid,
      'c0318a00-2026-4000-8000-000000000055'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a3'::uuid,
      'c0318a00-2026-4000-8000-000000000056'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a4'::uuid,
      'c0318a00-2026-4000-8000-000000000056'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a5'::uuid,
      'c0318a00-2026-4000-8000-000000000057'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a6'::uuid,
      'c0318a00-2026-4000-8000-000000000057'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a7'::uuid,
      'c0318a00-2026-4000-8000-000000000058'::uuid,
      'Wine Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a8'::uuid,
      'c0318a00-2026-4000-8000-000000000058'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000a9'::uuid,
      'c0318a00-2026-4000-8000-000000000059'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000aa'::uuid,
      'c0318a00-2026-4000-8000-000000000059'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ab'::uuid,
      'c0318a00-2026-4000-8000-00000000005a'::uuid,
      'Wine Storage'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ac'::uuid,
      'c0318a00-2026-4000-8000-00000000005a'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ad'::uuid,
      'c0318a00-2026-4000-8000-00000000005b'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ae'::uuid,
      'c0318a00-2026-4000-8000-00000000005b'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000af'::uuid,
      'c0318a00-2026-4000-8000-00000000005c'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b0'::uuid,
      'c0318a00-2026-4000-8000-00000000005c'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b1'::uuid,
      'c0318a00-2026-4000-8000-00000000005d'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b2'::uuid,
      'c0318a00-2026-4000-8000-00000000005e'::uuid,
      'Fridge'::text,
      8::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b3'::uuid,
      'c0318a00-2026-4000-8000-00000000005e'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b4'::uuid,
      'c0318a00-2026-4000-8000-00000000005f'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b5'::uuid,
      'c0318a00-2026-4000-8000-00000000005f'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b6'::uuid,
      'c0318a00-2026-4000-8000-000000000060'::uuid,
      'Fridge'::text,
      40::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b7'::uuid,
      'c0318a00-2026-4000-8000-000000000060'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b8'::uuid,
      'c0318a00-2026-4000-8000-000000000061'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000b9'::uuid,
      'c0318a00-2026-4000-8000-000000000061'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ba'::uuid,
      'c0318a00-2026-4000-8000-000000000062'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000bb'::uuid,
      'c0318a00-2026-4000-8000-000000000062'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000bc'::uuid,
      'c0318a00-2026-4000-8000-000000000063'::uuid,
      'Fridge'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000bd'::uuid,
      'c0318a00-2026-4000-8000-000000000063'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000be'::uuid,
      'c0318a00-2026-4000-8000-000000000064'::uuid,
      'Fridge'::text,
      36::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000bf'::uuid,
      'c0318a00-2026-4000-8000-000000000064'::uuid,
      'Bar'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c0'::uuid,
      'c0318a00-2026-4000-8000-000000000065'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c1'::uuid,
      'c0318a00-2026-4000-8000-000000000066'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c2'::uuid,
      'c0318a00-2026-4000-8000-000000000067'::uuid,
      'Fridge'::text,
      50::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c3'::uuid,
      'c0318a00-2026-4000-8000-000000000067'::uuid,
      'Bar'::text,
      22::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c4'::uuid,
      'c0318a00-2026-4000-8000-000000000068'::uuid,
      'Fridge'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c5'::uuid,
      'c0318a00-2026-4000-8000-000000000068'::uuid,
      'Bar'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c6'::uuid,
      'c0318a00-2026-4000-8000-000000000069'::uuid,
      'Fridge'::text,
      36::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c7'::uuid,
      'c0318a00-2026-4000-8000-000000000069'::uuid,
      'Bar'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c8'::uuid,
      'c0318a00-2026-4000-8000-00000000006a'::uuid,
      'Fridge'::text,
      48::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000c9'::uuid,
      'c0318a00-2026-4000-8000-00000000006a'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ca'::uuid,
      'c0318a00-2026-4000-8000-00000000006b'::uuid,
      'Fridge'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000cb'::uuid,
      'c0318a00-2026-4000-8000-00000000006b'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000cc'::uuid,
      'c0318a00-2026-4000-8000-00000000006c'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000cd'::uuid,
      'c0318a00-2026-4000-8000-00000000006d'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ce'::uuid,
      'c0318a00-2026-4000-8000-00000000006e'::uuid,
      'Main Storage'::text,
      96::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000cf'::uuid,
      'c0318a00-2026-4000-8000-00000000006e'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d0'::uuid,
      'c0318a00-2026-4000-8000-00000000006f'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d1'::uuid,
      'c0318a00-2026-4000-8000-00000000006f'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d2'::uuid,
      'c0318a00-2026-4000-8000-000000000070'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d3'::uuid,
      'c0318a00-2026-4000-8000-000000000070'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d4'::uuid,
      'c0318a00-2026-4000-8000-000000000071'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d5'::uuid,
      'c0318a00-2026-4000-8000-000000000072'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d6'::uuid,
      'c0318a00-2026-4000-8000-000000000072'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d7'::uuid,
      'c0318a00-2026-4000-8000-000000000073'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d8'::uuid,
      'c0318a00-2026-4000-8000-000000000073'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000d9'::uuid,
      'c0318a00-2026-4000-8000-000000000074'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000da'::uuid,
      'c0318a00-2026-4000-8000-000000000074'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000db'::uuid,
      'c0318a00-2026-4000-8000-000000000075'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000dc'::uuid,
      'c0318a00-2026-4000-8000-000000000076'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000dd'::uuid,
      'c0318a00-2026-4000-8000-000000000076'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000de'::uuid,
      'c0318a00-2026-4000-8000-000000000077'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000df'::uuid,
      'c0318a00-2026-4000-8000-000000000077'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e0'::uuid,
      'c0318a00-2026-4000-8000-000000000078'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e1'::uuid,
      'c0318a00-2026-4000-8000-000000000078'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e2'::uuid,
      'c0318a00-2026-4000-8000-000000000079'::uuid,
      'Fridge'::text,
      60::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e3'::uuid,
      'c0318a00-2026-4000-8000-000000000079'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e4'::uuid,
      'c0318a00-2026-4000-8000-00000000007a'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e5'::uuid,
      'c0318a00-2026-4000-8000-00000000007a'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e6'::uuid,
      'c0318a00-2026-4000-8000-00000000007b'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e7'::uuid,
      'c0318a00-2026-4000-8000-00000000007b'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e8'::uuid,
      'c0318a00-2026-4000-8000-00000000007c'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000e9'::uuid,
      'c0318a00-2026-4000-8000-00000000007c'::uuid,
      'Bar'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ea'::uuid,
      'c0318a00-2026-4000-8000-00000000007d'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000eb'::uuid,
      'c0318a00-2026-4000-8000-00000000007e'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ec'::uuid,
      'c0318a00-2026-4000-8000-00000000007e'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ed'::uuid,
      'c0318a00-2026-4000-8000-00000000007f'::uuid,
      'Main Storage'::text,
      48::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ee'::uuid,
      'c0318a00-2026-4000-8000-00000000007f'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ef'::uuid,
      'c0318a00-2026-4000-8000-000000000080'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f0'::uuid,
      'c0318a00-2026-4000-8000-000000000080'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f1'::uuid,
      'c0318a00-2026-4000-8000-000000000081'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f2'::uuid,
      'c0318a00-2026-4000-8000-000000000082'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f3'::uuid,
      'c0318a00-2026-4000-8000-000000000082'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f4'::uuid,
      'c0318a00-2026-4000-8000-000000000083'::uuid,
      'Main Storage'::text,
      80::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f5'::uuid,
      'c0318a00-2026-4000-8000-000000000083'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f6'::uuid,
      'c0318a00-2026-4000-8000-000000000084'::uuid,
      'Main Storage'::text,
      70::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f7'::uuid,
      'c0318a00-2026-4000-8000-000000000084'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f8'::uuid,
      'c0318a00-2026-4000-8000-000000000085'::uuid,
      'Main Storage'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000f9'::uuid,
      'c0318a00-2026-4000-8000-000000000086'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000fa'::uuid,
      'c0318a00-2026-4000-8000-000000000086'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000fb'::uuid,
      'c0318a00-2026-4000-8000-000000000087'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000fc'::uuid,
      'c0318a00-2026-4000-8000-000000000087'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000fd'::uuid,
      'c0318a00-2026-4000-8000-000000000088'::uuid,
      'Fridge'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000fe'::uuid,
      'c0318a00-2026-4000-8000-000000000088'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-0000000000ff'::uuid,
      'c0318a00-2026-4000-8000-000000000089'::uuid,
      'Fridge'::text,
      72::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000100'::uuid,
      'c0318a00-2026-4000-8000-00000000008a'::uuid,
      'Main Storage'::text,
      64::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000101'::uuid,
      'c0318a00-2026-4000-8000-00000000008a'::uuid,
      'Bar'::text,
      24::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000102'::uuid,
      'c0318a00-2026-4000-8000-00000000008b'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000103'::uuid,
      'c0318a00-2026-4000-8000-00000000008b'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000104'::uuid,
      'c0318a00-2026-4000-8000-00000000008c'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000105'::uuid,
      'c0318a00-2026-4000-8000-00000000008c'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000106'::uuid,
      'c0318a00-2026-4000-8000-00000000008d'::uuid,
      'Bar'::text,
      5::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000107'::uuid,
      'c0318a00-2026-4000-8000-00000000008e'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000108'::uuid,
      'c0318a00-2026-4000-8000-00000000008e'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000109'::uuid,
      'c0318a00-2026-4000-8000-00000000008f'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000010a'::uuid,
      'c0318a00-2026-4000-8000-00000000008f'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000010b'::uuid,
      'c0318a00-2026-4000-8000-000000000090'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000010c'::uuid,
      'c0318a00-2026-4000-8000-000000000090'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000010d'::uuid,
      'c0318a00-2026-4000-8000-000000000091'::uuid,
      'Bar'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000010e'::uuid,
      'c0318a00-2026-4000-8000-000000000091'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000010f'::uuid,
      'c0318a00-2026-4000-8000-000000000092'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000110'::uuid,
      'c0318a00-2026-4000-8000-000000000092'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000111'::uuid,
      'c0318a00-2026-4000-8000-000000000093'::uuid,
      'Bar'::text,
      5::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000112'::uuid,
      'c0318a00-2026-4000-8000-000000000094'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000113'::uuid,
      'c0318a00-2026-4000-8000-000000000094'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000114'::uuid,
      'c0318a00-2026-4000-8000-000000000095'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000115'::uuid,
      'c0318a00-2026-4000-8000-000000000095'::uuid,
      'Main Storage'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000116'::uuid,
      'c0318a00-2026-4000-8000-000000000096'::uuid,
      'Bar'::text,
      1::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000117'::uuid,
      'c0318a00-2026-4000-8000-000000000096'::uuid,
      'Kitchen'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000118'::uuid,
      'c0318a00-2026-4000-8000-000000000097'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000119'::uuid,
      'c0318a00-2026-4000-8000-000000000097'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000011a'::uuid,
      'c0318a00-2026-4000-8000-000000000098'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000011b'::uuid,
      'c0318a00-2026-4000-8000-000000000098'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000011c'::uuid,
      'c0318a00-2026-4000-8000-000000000099'::uuid,
      'Coffee Station'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000011d'::uuid,
      'c0318a00-2026-4000-8000-000000000099'::uuid,
      'Main Storage'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000011e'::uuid,
      'c0318a00-2026-4000-8000-00000000009a'::uuid,
      'Coffee Station'::text,
      6::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000011f'::uuid,
      'c0318a00-2026-4000-8000-00000000009a'::uuid,
      'Main Storage'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000120'::uuid,
      'c0318a00-2026-4000-8000-00000000009b'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000121'::uuid,
      'c0318a00-2026-4000-8000-00000000009b'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000122'::uuid,
      'c0318a00-2026-4000-8000-00000000009c'::uuid,
      'Fridge'::text,
      5::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000123'::uuid,
      'c0318a00-2026-4000-8000-00000000009d'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000124'::uuid,
      'c0318a00-2026-4000-8000-00000000009d'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000125'::uuid,
      'c0318a00-2026-4000-8000-00000000009e'::uuid,
      'Fridge'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000126'::uuid,
      'c0318a00-2026-4000-8000-00000000009e'::uuid,
      'Kitchen'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000127'::uuid,
      'c0318a00-2026-4000-8000-00000000009f'::uuid,
      'Fridge'::text,
      5::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000128'::uuid,
      'c0318a00-2026-4000-8000-0000000000a0'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000129'::uuid,
      'c0318a00-2026-4000-8000-0000000000a0'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000012a'::uuid,
      'c0318a00-2026-4000-8000-0000000000a1'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000012b'::uuid,
      'c0318a00-2026-4000-8000-0000000000a1'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000012c'::uuid,
      'c0318a00-2026-4000-8000-0000000000a2'::uuid,
      'Fridge'::text,
      5::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000012d'::uuid,
      'c0318a00-2026-4000-8000-0000000000a3'::uuid,
      'Fridge'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000012e'::uuid,
      'c0318a00-2026-4000-8000-0000000000a3'::uuid,
      'Kitchen'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000012f'::uuid,
      'c0318a00-2026-4000-8000-0000000000a4'::uuid,
      'Main Storage'::text,
      100::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000130'::uuid,
      'c0318a00-2026-4000-8000-0000000000a4'::uuid,
      'Bar'::text,
      40::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000131'::uuid,
      'c0318a00-2026-4000-8000-0000000000a5'::uuid,
      'Main Storage'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000132'::uuid,
      'c0318a00-2026-4000-8000-0000000000a5'::uuid,
      'Bar'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000133'::uuid,
      'c0318a00-2026-4000-8000-0000000000a6'::uuid,
      'Main Storage'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000134'::uuid,
      'c0318a00-2026-4000-8000-0000000000a6'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000135'::uuid,
      'c0318a00-2026-4000-8000-0000000000a7'::uuid,
      'Main Storage'::text,
      9::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000136'::uuid,
      'c0318a00-2026-4000-8000-0000000000a7'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000137'::uuid,
      'c0318a00-2026-4000-8000-0000000000a8'::uuid,
      'Main Storage'::text,
      12::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000138'::uuid,
      'c0318a00-2026-4000-8000-0000000000a8'::uuid,
      'Bar'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000139'::uuid,
      'c0318a00-2026-4000-8000-0000000000a9'::uuid,
      'Wine Storage'::text,
      8::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000013a'::uuid,
      'c0318a00-2026-4000-8000-0000000000a9'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000013b'::uuid,
      'c0318a00-2026-4000-8000-0000000000aa'::uuid,
      'Main Storage'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000013c'::uuid,
      'c0318a00-2026-4000-8000-0000000000aa'::uuid,
      'Kitchen'::text,
      0::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000013d'::uuid,
      'c0318a00-2026-4000-8000-0000000000ab'::uuid,
      'Wine Storage'::text,
      9::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000013e'::uuid,
      'c0318a00-2026-4000-8000-0000000000ab'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000013f'::uuid,
      'c0318a00-2026-4000-8000-0000000000ac'::uuid,
      'Wine Storage'::text,
      7::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000140'::uuid,
      'c0318a00-2026-4000-8000-0000000000ac'::uuid,
      'Bar'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000141'::uuid,
      'c0318a00-2026-4000-8000-0000000000ad'::uuid,
      'Fridge'::text,
      30::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000142'::uuid,
      'c0318a00-2026-4000-8000-0000000000ad'::uuid,
      'Bar'::text,
      18::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000143'::uuid,
      'c0318a00-2026-4000-8000-0000000000ae'::uuid,
      'Fridge'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000144'::uuid,
      'c0318a00-2026-4000-8000-0000000000ae'::uuid,
      'Bar'::text,
      10::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000145'::uuid,
      'c0318a00-2026-4000-8000-0000000000af'::uuid,
      'Fridge'::text,
      28::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000146'::uuid,
      'c0318a00-2026-4000-8000-0000000000af'::uuid,
      'Bar'::text,
      14::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000147'::uuid,
      'c0318a00-2026-4000-8000-0000000000b0'::uuid,
      'Fridge'::text,
      40::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000148'::uuid,
      'c0318a00-2026-4000-8000-0000000000b0'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000149'::uuid,
      'c0318a00-2026-4000-8000-0000000000b1'::uuid,
      'Main Storage'::text,
      50::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000014a'::uuid,
      'c0318a00-2026-4000-8000-0000000000b1'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000014b'::uuid,
      'c0318a00-2026-4000-8000-0000000000b2'::uuid,
      'Main Storage'::text,
      40::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000014c'::uuid,
      'c0318a00-2026-4000-8000-0000000000b2'::uuid,
      'Bar'::text,
      20::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000014d'::uuid,
      'c0318a00-2026-4000-8000-0000000000b3'::uuid,
      'Bar'::text,
      3::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000014e'::uuid,
      'c0318a00-2026-4000-8000-0000000000b3'::uuid,
      'Main Storage'::text,
      4::numeric
    ),
    (
      'd0318a00-2026-4000-8000-00000000014f'::uuid,
      'c0318a00-2026-4000-8000-0000000000b4'::uuid,
      'Main Storage'::text,
      2::numeric
    ),
    (
      'd0318a00-2026-4000-8000-000000000150'::uuid,
      'c0318a00-2026-4000-8000-0000000000b4'::uuid,
      'Bar'::text,
      1::numeric
    )
  ) as v(id, stock_item_id, location_key, quantity)
  inner join public.workspace_storages ws
    on ws.workspace_id = v_workspace_id
   and ws.location_key = v.location_key;

  get diagnostics v_inserted_movements = row_count;

  if v_inserted_movements <> 336 then
    raise exception
      'P8.31.11 seed abort: expected 336 movements, inserted %',
      v_inserted_movements;
  end if;

  -- ---------------------------------------------------------------------------
  -- 7) In-transaction invariant verification
  -- ---------------------------------------------------------------------------
  select coalesce(sum(s.current_quantity), 0)
  into v_agg_item_qty
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.id::text like 'c0318a00-2026-4000-8000-%';

  select coalesce(sum(b.quantity), 0)
  into v_agg_balance_qty
  from public.stock_item_location_balances b
  where b.workspace_id = v_workspace_id
    and b.stock_item_id::text like 'c0318a00-2026-4000-8000-%';

  if v_agg_item_qty is distinct from v_agg_balance_qty then
    raise exception
      'P8.31.11 seed abort: aggregate item qty % != aggregate balance qty %',
      v_agg_item_qty, v_agg_balance_qty;
  end if;

  select
    count(*) filter (where s.active),
    count(*) filter (where not s.active)
  into v_active, v_inactive
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.id::text like 'c0318a00-2026-4000-8000-%';

  if v_active <> 172 or v_inactive <> 8 then
    raise exception
      'P8.31.11 seed abort: active/inactive expected 172/8, got %/%',
      v_active, v_inactive;
  end if;

  select count(*)
  into v_multi
  from (
    select b.stock_item_id
    from public.stock_item_location_balances b
    where b.workspace_id = v_workspace_id
      and b.stock_item_id::text like 'c0318a00-2026-4000-8000-%'
    group by b.stock_item_id
    having count(*) >= 2
  ) m;

  if v_multi <> 156 then
    raise exception
      'P8.31.11 seed abort: multi-location expected 156, got %',
      v_multi;
  end if;

  raise notice 'P8.31.11 seed OK: suppliers=% items=% balances=% movements=% active=% inactive=% multi=% agg_qty=%',
    v_inserted_suppliers, v_inserted_items, v_inserted_balances, v_inserted_movements,
    v_active, v_inactive, v_multi, v_agg_item_qty;
end;
$p8_31_11_temporary_real_label_catalog_seed$;

commit;

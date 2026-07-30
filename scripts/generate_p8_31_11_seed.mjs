/**
 * P8.31.11 — Build-time generator: JSON catalog → seed SQL.
 * Not imported by production runtime. Manual / test use only.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BATCH = 'ONE_REAL_LABEL_TEST_2026_07'
const DATASET_PATH = resolve('supabase/data/p8_31_9_temporary_real_label_catalog.json')
const SEED_PATH = resolve('supabase/p8_31_11_temporary_real_label_catalog_seed.sql')
const VERIFY_PATH = resolve('supabase/p8_31_11_temporary_real_label_catalog_verification.sql')

const SUPPLIERS = [
  'Premium Spirits Distribution Ltd',
  'Mediterranean Beverage Partners',
  'Cyprus Fine Wines Trading',
  'Island Water & Refreshments',
  'FreshServe Food Solutions',
  'Nicosia HORECA Supplies',
  'Local Produce Partners',
]

/** @param {number} n */
function hex12(n) {
  return n.toString(16).padStart(12, '0')
}

/** @param {number} sequence 1–180 */
function productUuid(sequence) {
  return `c0318a00-2026-4000-8000-${hex12(sequence)}`
}

/** @param {number} index 1–7 */
function supplierUuid(index) {
  return `c0318b00-2026-4000-8000-${hex12(index)}`
}

/** @param {number} index 1–N */
function balanceUuid(index) {
  return `c0318c00-2026-4000-8000-${hex12(index)}`
}

/** @param {number} index 1–N */
function movementUuid(index) {
  return `d0318a00-2026-4000-8000-${hex12(index)}`
}

/** @param {unknown} value */
function sqlText(value) {
  if (value == null) return 'null'
  const text = `${value}`
  return `'${text.replace(/'/g, "''")}'`
}

/** @param {unknown} value */
function sqlNullableText(value) {
  const text = value == null ? '' : `${value}`.trim()
  if (!text) return 'null'
  return sqlText(text)
}

/** @param {unknown} value */
function sqlNum(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`non-finite number: ${value}`)
  return `${n}`
}

/** @param {boolean} value */
function sqlBool(value) {
  return value ? 'true' : 'false'
}

function buildSeed(dataset) {
  const products = dataset.products
  if (products.length !== 180) throw new Error(`expected 180 products, got ${products.length}`)

  const supplierIndex = new Map(SUPPLIERS.map((name, i) => [name, i + 1]))
  const requiredKeys = [...new Set(products.flatMap((p) => [
    p.defaultStorage,
    ...p.locationQuantities.map((r) => r.locationKey),
  ]))]

  /** @type {string[]} */
  const productValues = []
  /** @type {string[]} */
  const balanceValues = []
  /** @type {string[]} */
  const movementValues = []
  let balanceIndex = 0

  for (const p of products) {
    const seq = p.sequence
    const itemId = productUuid(seq)
    const supplierName = p.supplierName
    const sIdx = supplierIndex.get(supplierName)
    if (!sIdx) throw new Error(`unknown supplier ${supplierName} at seq ${seq}`)
    const sid = supplierUuid(sIdx)
    const locSum = p.locationQuantities.reduce((s, r) => s + Number(r.quantity), 0)
    if (Math.abs(locSum - Number(p.currentQuantity)) > 1e-9) {
      throw new Error(`qty mismatch seq ${seq}`)
    }

    productValues.push(`    (
      '${itemId}'::uuid,
      ${sqlText(p.name)}::text,
      ${sqlNullableText(p.brand)}::text,
      ${sqlText(p.category)}::text,
      ${sqlText(p.itemType)}::text,
      ${sqlNullableText(p.size)}::text,
      ${sqlText(p.unit)}::text,
      ${sqlNullableText(p.packagingNote)}::text,
      ${sqlNullableText(p.barcode)}::text,
      ${sqlText(supplierName)}::text,
      '${sid}'::uuid,
      ${sqlText(p.defaultStorage)}::text,
      ${sqlNum(p.costPrice)}::numeric,
      ${sqlNum(p.minimumQuantity)}::numeric,
      ${sqlNum(p.targetQuantity)}::numeric,
      ${sqlNum(p.orderQuantity)}::numeric,
      ${sqlNum(p.currentQuantity)}::numeric,
      ${sqlBool(p.active)}::boolean
    )`)

    for (const row of p.locationQuantities) {
      balanceIndex += 1
      const bid = balanceUuid(balanceIndex)
      const mid = movementUuid(balanceIndex)
      balanceValues.push(`    (
      '${bid}'::uuid,
      '${itemId}'::uuid,
      ${sqlText(row.locationKey)}::text,
      ${sqlNum(row.quantity)}::numeric
    )`)
      movementValues.push(`    (
      '${mid}'::uuid,
      '${itemId}'::uuid,
      ${sqlText(row.locationKey)}::text,
      ${sqlNum(row.quantity)}::numeric
    )`)
    }
  }

  const supplierValues = SUPPLIERS.map((name, i) => {
    const id = supplierUuid(i + 1)
    const notes = `${BATCH} | temporary disposable test supplier — not a real business`
    return `    (
      '${id}'::uuid,
      ${sqlText(name)}::text,
      ${sqlText(notes)}::text
    )`
  }).join(',\n')

  const storageArray = requiredKeys.map((k) => sqlText(k)).join(', ')

  return `-- =============================================================================
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
--   ${BATCH}
--
-- UUID namespaces (deterministic):
--   products:  c0318a00-2026-4000-8000-<seq hex>
--   suppliers: c0318b00-2026-4000-8000-<1..7 hex>
--   balances:  c0318c00-2026-4000-8000-<balance hex>
--   movements: d0318a00-2026-4000-8000-<balance hex>
--
-- Creates:
--   7 fictional suppliers
--   180 stock_items
--   ${balanceIndex} stock_item_location_balances
--   ${balanceIndex} opening stock_count movements (ledger parity for seeded balances)
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
  v_batch_marker constant text := '${BATCH}';
  v_required_keys text[] := array[${storageArray}];
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
  -- 3) Insert 7 fictional temporary suppliers
  -- ---------------------------------------------------------------------------
  insert into public.suppliers (
    id,
    workspace_id,
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
    v_workspace_id,
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
${supplierValues}
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
${productValues.join(',\n')}
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
${balanceValues.join(',\n')}
  ) as v(id, stock_item_id, location_key, quantity)
  inner join public.workspace_storages ws
    on ws.workspace_id = v_workspace_id
   and ws.location_key = v.location_key;

  get diagnostics v_inserted_balances = row_count;

  if v_inserted_balances <> ${balanceIndex} then
    raise exception
      'P8.31.11 seed abort: expected ${balanceIndex} balances, inserted %',
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
${movementValues.join(',\n')}
  ) as v(id, stock_item_id, location_key, quantity)
  inner join public.workspace_storages ws
    on ws.workspace_id = v_workspace_id
   and ws.location_key = v.location_key;

  get diagnostics v_inserted_movements = row_count;

  if v_inserted_movements <> ${balanceIndex} then
    raise exception
      'P8.31.11 seed abort: expected ${balanceIndex} movements, inserted %',
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
`
}

function buildVerification() {
  return `-- =============================================================================
-- P8.31.11 — Temporary Real-Label Test Catalog VERIFICATION (read-only)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Do NOT modify data. Run before/after seed as needed.
-- Batch: ${BATCH}
-- =============================================================================

-- A) Workspace identity (exact one)
select
  count(*)::bigint as workspace_match_count,
  max(w.id::text) as workspace_id,
  max(w.name) as workspace_name,
  max(w.slug) as workspace_slug
from public.workspaces w
where w.slug = 'amore-nicosia'
   or w.name = 'AMORE.NICOSIA';

-- B) Temporary suppliers
select
  count(*)::bigint as temporary_suppliers,
  count(*) filter (where s.notes like '%${BATCH}%')::bigint as suppliers_with_batch_note
from public.suppliers s
where s.id::text like 'c0318b00-2026-4000-8000-%';

-- C) Batch products + active/inactive
select
  count(*)::bigint as batch_products,
  count(*) filter (where s.active)::bigint as active_count,
  count(*) filter (where not s.active)::bigint as inactive_count,
  count(*) filter (
    where s.name like '%${BATCH}%'
       or coalesce(s.brand, '') like '%${BATCH}%'
  )::bigint as visible_batch_prefix_violations
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%';

-- D) Balances
select
  count(*)::bigint as balances_inserted,
  count(distinct b.stock_item_id)::bigint as distinct_products_with_balances,
  coalesce(sum(b.quantity), 0)::numeric as aggregate_balance_quantity
from public.stock_item_location_balances b
where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%';

-- E) Aggregate item quantity vs balances
select
  coalesce(sum(s.current_quantity), 0)::numeric as aggregate_item_quantity,
  (
    select coalesce(sum(b.quantity), 0)
    from public.stock_item_location_balances b
    where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%'
  )::numeric as aggregate_balance_quantity,
  (
    select count(*)::bigint
    from public.stock_items s
    where s.id::text like 'c0318a00-2026-4000-8000-%'
      and s.current_quantity is distinct from (
        select coalesce(sum(b.quantity), 0)
        from public.stock_item_location_balances b
        where b.stock_item_id = s.id
      )
  )::bigint as aggregate_mismatch_rows
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%';

-- F) Multi-location products
select count(*)::bigint as multi_location_product_count
from (
  select b.stock_item_id
  from public.stock_item_location_balances b
  where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%'
  group by b.stock_item_id
  having count(*) >= 2
) m;

-- G) Healthy / low / out (deterministic from qty vs minimum)
select
  count(*) filter (
    where s.current_quantity > 0 and s.current_quantity >= s.minimum_quantity
  )::bigint as healthy_count,
  count(*) filter (
    where s.current_quantity > 0 and s.current_quantity < s.minimum_quantity
  )::bigint as low_count,
  count(*) filter (where s.current_quantity <= 0)::bigint as out_count
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%';

-- H) Rows by category
select s.category, count(*)::bigint as product_count
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%'
group by s.category
order by s.category;

-- I) Rows by supplier
select s.supplier, count(*)::bigint as product_count
from public.stock_items s
where s.id::text like 'c0318a00-2026-4000-8000-%'
group by s.supplier
order by s.supplier;

-- J) Balance rows by storage
select b.location_key, count(*)::bigint as balance_rows, coalesce(sum(b.quantity), 0)::numeric as quantity_sum
from public.stock_item_location_balances b
where b.stock_item_id::text like 'c0318a00-2026-4000-8000-%'
group by b.location_key
order by b.location_key;

-- K) Batch movements
select count(*)::bigint as batch_movement_rows
from public.stock_movements m
where m.id::text like 'd0318a00-2026-4000-8000-%'
   or m.note like '%${BATCH}%';

-- L) Non-batch stock items in workspace
select count(*)::bigint as non_batch_stock_item_count
from public.stock_items s
join public.workspaces w on w.id = s.workspace_id
where (w.slug = 'amore-nicosia' or w.name = 'AMORE.NICOSIA')
  and s.id::text not like 'c0318a00-2026-4000-8000-%';

-- Expected after successful first seed (workspace previously empty):
--   temporary_suppliers = 7
--   batch_products = 180
--   active_count = 172
--   inactive_count = 8
--   balances_inserted = 336
--   distinct_products_with_balances = 180
--   multi_location_product_count = 156
--   aggregate_mismatch_rows = 0
--   batch_movement_rows = 336
--   non_batch_stock_item_count = 0
--   visible_batch_prefix_violations = 0
`
}

export {
  BATCH as P8_31_11_BATCH_ID,
  SUPPLIERS as P8_31_11_SUPPLIERS,
  productUuid,
  supplierUuid,
  balanceUuid,
  movementUuid,
  buildSeed,
  buildVerification,
  DATASET_PATH as P8_31_11_DATASET_PATH,
  SEED_PATH as P8_31_11_SEED_PATH,
  VERIFY_PATH as P8_31_11_VERIFY_PATH,
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8'))
  if (dataset.batchId !== BATCH) {
    throw new Error(`dataset batchId mismatch: ${dataset.batchId}`)
  }

  writeFileSync(SEED_PATH, buildSeed(dataset))
  writeFileSync(VERIFY_PATH, buildVerification())
  console.log('wrote', SEED_PATH)
  console.log('wrote', VERIFY_PATH)
}

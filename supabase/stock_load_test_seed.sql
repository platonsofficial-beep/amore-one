-- =============================================================================
-- P8.17.2a — Stock Load-Test Dataset SEED (AMORE.NICOSIA)
-- =============================================================================
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- Do NOT auto-run from the app. Do NOT wire into migrations.
--
-- Purpose:
--   Insert exactly 200 deterministic temporary stock_items (+ selective
--   stock_count movements for Needs Attention coverage) into AMORE.NICOSIA.
--
-- Batch marker (universal):
--   name prefix:  ONE_STOCK_LOAD_TEST_2026_07 |
--   movement note: ONE_STOCK_LOAD_TEST_2026_07
--
-- Safety:
--   - Aborts if workspace identity is missing or ambiguous
--   - Aborts if this batch already exists (idempotent guard)
--   - Does NOT create inventory counts, orders, imports, or migration rows
--   - Does NOT create suppliers
--   - Rolls back if final counts do not match expectations
--
-- Manual order:
--   1) Run stock_load_test_verification.sql (before section)
--   2) Run THIS file
--   3) Run stock_load_test_verification.sql (after-seed section)
--
-- Cleanup (P8.31.5 official):
--   supabase/p8_31_5_controlled_test_catalog_cleanup.sql
-- =============================================================================

begin;

do $stock_load_test_seed$
declare
  v_workspace_id uuid;
  v_workspace_name text;
  v_workspace_slug text;
  v_match_count bigint := 0;
  v_existing_batch bigint := 0;
  v_inserted_items bigint := 0;
  v_inserted_movements bigint := 0;
  v_batch_marker constant text := 'ONE_STOCK_LOAD_TEST_2026_07';
  v_name_prefix constant text := 'ONE_STOCK_LOAD_TEST_2026_07 | ';
begin
  -- ---------------------------------------------------------------------------
  -- 1) Resolve exactly one AMORE.NICOSIA workspace (authoritative identity)
  --    Matches inventory_migration_auto_link_runtime_validation.sql convention:
  --      name = 'AMORE.NICOSIA'  OR  slug = 'amore-nicosia'
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_match_count
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  if v_match_count = 0 then
    raise exception
      'P8.17.2a seed abort: no workspace matched name=AMORE.NICOSIA / slug=amore-nicosia';
  end if;

  if v_match_count > 1 then
    raise exception
      'P8.17.2a seed abort: % workspaces matched AMORE.NICOSIA / amore-nicosia — expected exactly one',
      v_match_count;
  end if;

  select w.id, w.name, w.slug
  into v_workspace_id, v_workspace_name, v_workspace_slug
  from public.workspaces w
  where w.slug = 'amore-nicosia'
     or w.name = 'AMORE.NICOSIA';

  raise notice 'P8.17.2a seed workspace: id=% name=% slug=%',
    v_workspace_id, v_workspace_name, v_workspace_slug;

  -- ---------------------------------------------------------------------------
  -- 2) Idempotency: refuse to insert if this batch already exists
  -- ---------------------------------------------------------------------------
  select count(*)
  into v_existing_batch
  from public.stock_items s
  where s.workspace_id = v_workspace_id
    and s.name like v_name_prefix || '%';

  if v_existing_batch > 0 then
    raise exception
      'P8.17.2a seed abort: batch already present (% rows). Run cleanup first.',
      v_existing_batch;
  end if;

  -- ---------------------------------------------------------------------------
  -- 3) Insert 200 deterministic products
  --    UUID pattern: a0172a00-2026-4000-8000-<12-hex index>
  --    Attribute matrix is driven solely by series index (1..200).
  -- ---------------------------------------------------------------------------
  insert into public.stock_items (
    id,
    workspace_id,
    name,
    category,
    item_type,
    supplier,
    unit,
    current_quantity,
    minimum_quantity,
    target_quantity,
    order_quantity,
    cost_price,
    storage_location,
    active
  )
  select
    (
      'a0172a00-2026-4000-8000-' || lpad(to_hex(g), 12, '0')
    )::uuid as id,
    v_workspace_id,
    v_name_prefix || case
      when g = 1 then 'Ketel One Vodka 700ml'
      when g = 2 then 'KETEL ONE VODKA 700ML'
      when g = 3 then 'Ketel One Vodka 700ml (Bar Backup)'
      when g = 4 then 'Château Réserve Blanc — Cuvée Spéciale 2019 (Very Long Premium Wine Label For Layout Stress)'
      when g = 5 then 'Café Espresso Beans'
      when g = 6 then 'Lime (Fresh)'
      when g between 7 and 20 then format('Spirits Fixture %s', g)
      when g between 21 and 55 then format('Wine Fixture %s', g)
      when g between 56 and 85 then format('Beverage Fixture %s', g)
      when g between 86 and 105 then format('Syrup Fixture %s', g)
      when g between 106 and 130 then format('Fresh Fixture %s', g)
      when g between 131 and 155 then format('Consumable Fixture %s', g)
      else format('Other Fixture %s', g)
    end as name,
    case
      when g <= 40 then 'Spirits'
      when g <= 75 then 'Wine'
      when g <= 105 then 'Beverages'
      when g <= 125 then 'Syrups & Purées'
      when g <= 150 then 'Fresh'
      when g <= 175 then 'Consumables'
      else 'Other'
    end as category,
    case
      when g <= 40 then (array['Vodka','Gin','Tequila','Whiskey','Rum','Cognac','Vermouth & Liqueur','Aperitif','Other'])[((g - 1) % 9) + 1]
      when g <= 75 then (array['White Wine','Rosé Wine','Red Wine','Sparkling Wine','Champagne','Dessert Wine','Other'])[((g - 1) % 7) + 1]
      when g <= 105 then (array['Beer','Soft Drink','Water','Juice','Energy Drink','Soda / Tonic','Other'])[((g - 1) % 7) + 1]
      when g <= 125 then (array['Syrup','Purée','Cordial','Shrub','Other'])[((g - 1) % 5) + 1]
      when g <= 150 then (array['Citrus','Fruit','Herbs','Dairy','Garnish','Other'])[((g - 1) % 6) + 1]
      when g <= 175 then (array['Napkins','Straws','Cleaning','Packaging','Other'])[((g - 1) % 5) + 1]
      else 'Other'
    end as item_type,
    -- Empty supplier for indices 161..175 → Missing supplier (data attention) when not out/low/stale-priority
    case
      when g between 161 and 175 then ''
      when g % 17 = 0 then 'Demo Beverage Co'
      when g % 13 = 0 then 'Nicosia Wine Cellars'
      else 'Amore House Supplier'
    end as supplier,
    -- Empty unit edge cases: 176..180
    case
      when g between 176 and 180 then ''
      when g <= 40 then (array['Bottle 700ml','Bottle 1L','Case 6 bottles','Litre','Bottle'])[((g - 1) % 5) + 1]
      when g <= 75 then (array['Bottle 750ml','Case 6 bottles','Magnum','Bottle'])[((g - 1) % 4) + 1]
      when g <= 105 then (array['Bottle','Can','Keg','Case 24','Litre'])[((g - 1) % 5) + 1]
      when g <= 125 then (array['Bottle','Litre','Kg','Pack'])[((g - 1) % 4) + 1]
      when g <= 150 then (array['Kg','Gram','Piece','Bunch'])[((g - 1) % 4) + 1]
      when g <= 175 then (array['Pack','Box','Piece','Case'])[((g - 1) % 4) + 1]
      else (array['Piece','Pack','Kg','Litre'])[((g - 1) % 4) + 1]
    end as unit,
    -- Quantity / status matrix
    case
      when g between 41 and 60 then 0::numeric                 -- out
      when g between 61 and 85 then (g % 3 + 1)::numeric       -- low (below min 10)
      when g = 86 then 0.125::numeric                         -- decimal small
      when g = 87 then 1250.500::numeric                      -- large
      when g between 181 and 195 then 0::numeric              -- inactive out/zero
      else (20 + (g % 40))::numeric                           -- healthy
    end as current_quantity,
    case
      when g between 91 and 95 then 0::numeric                -- zero minimum threshold
      when g between 61 and 85 then 10::numeric               -- low band
      else 5::numeric
    end as minimum_quantity,
    case
      when g % 11 = 0 then null
      when g between 61 and 85 then 24::numeric
      else 30::numeric
    end as target_quantity,
    case
      when g % 19 = 0 then 6::numeric
      else null
    end as order_quantity,
    -- cost 0 for 146..160 → missing cost (data attention) when eligible
    case
      when g between 146 and 160 then 0::numeric
      when g <= 40 then (12 + (g % 40))::numeric
      when g <= 75 then (8 + (g % 25))::numeric
      else (3 + (g % 15))::numeric
    end as cost_price,
    -- Empty storage_location edge: 196..200 (UI falls back via resolveStockStorageLocation)
    case
      when g between 196 and 200 then ''
      when g % 8 = 1 then 'Main Storage'
      when g % 8 = 2 then 'Bar'
      when g % 8 = 3 then 'Fridge'
      when g % 8 = 4 then 'Freezer'
      when g % 8 = 5 then 'Wine Storage'
      when g % 8 = 6 then 'Coffee Station'
      when g % 8 = 7 then 'Kitchen'
      else 'Other'
    end as storage_location,
    -- Inactive band
    case
      when g between 181 and 195 then false
      else true
    end as active
  from generate_series(1, 200) as g;

  get diagnostics v_inserted_items = row_count;

  if v_inserted_items <> 200 then
    raise exception
      'P8.17.2a seed abort: expected 200 stock_items inserts, got %',
      v_inserted_items;
  end if;

  -- ---------------------------------------------------------------------------
  -- 4) Selective recent stock_count movements
  --    Purpose: prevent ALL healthy items flooding Needs Attention "Needs count".
  --    Indices 1..100 (active, typically healthy/low) receive a fresh count.
  --    Remaining active OK items without movements populate "Needs count".
  --    Movement note carries the same batch marker for cleanup.
  -- ---------------------------------------------------------------------------
  insert into public.stock_movements (
    id,
    workspace_id,
    item_id,
    type,
    quantity,
    note,
    created_at
  )
  select
    (
      'b0172a00-2026-4000-8000-' || lpad(to_hex(g), 12, '0')
    )::uuid,
    v_workspace_id,
    (
      'a0172a00-2026-4000-8000-' || lpad(to_hex(g), 12, '0')
    )::uuid,
    'stock_count',
    greatest(0, (select s.current_quantity from public.stock_items s where s.id = (
      ('a0172a00-2026-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid
    ))),
    v_batch_marker,
    now() - interval '1 day'
  from generate_series(1, 100) as g
  where exists (
    select 1
    from public.stock_items s
    where s.id = ('a0172a00-2026-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid
      and s.workspace_id = v_workspace_id
      and s.active = true
  );

  get diagnostics v_inserted_movements = row_count;

  -- ---------------------------------------------------------------------------
  -- 5) Final verification inside the transaction
  -- ---------------------------------------------------------------------------
  if (
    select count(*)
    from public.stock_items s
    where s.workspace_id = v_workspace_id
      and s.name like v_name_prefix || '%'
  ) <> 200 then
    raise exception 'P8.17.2a seed abort: batch stock_items count is not 200 after insert';
  end if;

  if v_inserted_movements < 1 then
    raise exception 'P8.17.2a seed abort: expected stock_count movements for freshness coverage';
  end if;

  raise notice
    'P8.17.2a seed OK: items=% movements=% workspace=%',
    v_inserted_items, v_inserted_movements, v_workspace_id;
end;
$stock_load_test_seed$;

commit;

-- =============================================================================
-- Expected Needs Attention coverage (derived from seed matrix + stockInsights):
--   out   : active qty<=0  → indices 41..60 (~20)
--   low   : active 0<qty<min → indices 61..85 (~25)
--   count : active ok/low/out priority skipped; stale/no stock_count
--           → active items g>100 without recent count, not out/low, not data-first
--   data  : active missing supplier (161..175) or cost 0 (146..160) when not
--           already classified as out/low/count
-- Inactive 181..195 are excluded from Needs Attention (active === false).
-- =============================================================================

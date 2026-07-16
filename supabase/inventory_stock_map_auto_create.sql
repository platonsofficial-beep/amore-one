-- =============================================================================
-- P7.4.5a — Safe AUTO-CREATE (snapshot contract + row lock)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Confirmed schema (P7.4.1 inventory_stock_item_map):
--   Snapshot column: source_snapshot jsonb  (NOT legacy_snapshot)
--   Hash column:     source_hash text         (NOT legacy_hash)
--   Persist (P7.4.3) stores to_jsonb(inventory_items) into source_snapshot
--   Snapshot keys: item_name, category, subcategory, supplier, unit,
--                  quantity, minimum_quantity, cost, status, notes, …
--
-- Scope:
--   - classified + auto_create + stock_item_id IS NULL + usable source_snapshot
--   - Payload ONLY from source_snapshot (never FROM inventory_items)
--   - workspace_id ONLY from map row
--   - FOR UPDATE lock map row before insert; re-check eligibility
--   - Map update: stock_item_id + status='created' only
--   - supplier_id left NULL (supplier text copied for compatibility only)
--
-- Idempotent + concurrent-safe for the same map row.
-- =============================================================================

do $$
declare
  v_target_workspace_id uuid := null;

  cand record;
  locked record;
  v_new_stock_id uuid;
  v_name text;
  v_category text;
  v_item_type text;
  v_unit text;
  v_supplier text;
  v_qty numeric;
  v_par numeric;
  v_cost numeric;
  v_location text;

  v_created bigint := 0;
  v_skipped bigint := 0;
  v_invalid_snapshot bigint := 0;
  v_invalid_name bigint := 0;
  v_already_has_stock_id bigint := 0;
  v_race_skipped bigint := 0;
  v_errors bigint := 0;
  v_eligible bigint := 0;
begin
  select count(*)::bigint into v_eligible
  from public.inventory_stock_item_map m
  where m.status = 'classified'
    and m.resolution_type = 'auto_create'
    and m.stock_item_id is null
    and m.source_snapshot is not null
    and m.source_snapshot <> '{}'::jsonb
    and (v_target_workspace_id is null or m.workspace_id = v_target_workspace_id);

  for cand in
    select m.id as map_id
    from public.inventory_stock_item_map m
    where m.status = 'classified'
      and m.resolution_type = 'auto_create'
      and m.stock_item_id is null
      and m.source_snapshot is not null
      and m.source_snapshot <> '{}'::jsonb
      and (v_target_workspace_id is null or m.workspace_id = v_target_workspace_id)
    order by m.legacy_inventory_item_id, m.id
  loop
    begin
      -- Lock map row; re-check eligibility under lock
      select
        m.id,
        m.workspace_id,
        m.stock_item_id,
        m.status,
        m.resolution_type,
        m.source_snapshot
      into locked
      from public.inventory_stock_item_map m
      where m.id = cand.map_id
      for update;

      if not found then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.status is distinct from 'classified'
         or locked.resolution_type is distinct from 'auto_create' then
        v_race_skipped := v_race_skipped + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.stock_item_id is not null then
        v_already_has_stock_id := v_already_has_stock_id + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if locked.source_snapshot is null
         or locked.source_snapshot = '{}'::jsonb then
        v_invalid_snapshot := v_invalid_snapshot + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Payload ONLY from source_snapshot; workspace_id ONLY from map row
      v_name := nullif(trim(coalesce(locked.source_snapshot ->> 'item_name', '')), '');
      if v_name is null then
        v_invalid_name := v_invalid_name + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_category := case trim(coalesce(locked.source_snapshot ->> 'category', ''))
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
        when '' then 'Other'
        else 'Other'
      end;

      v_item_type := case
        when trim(coalesce(locked.source_snapshot ->> 'subcategory', '')) = '' then 'Other'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in (
          'vodka', 'gin', 'rum', 'whiskey', 'tequila', 'other'
        ) then initcap(lower(trim(locked.source_snapshot ->> 'subcategory')))
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'mezcal' then 'Tequila'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('liqueurs', 'liqueur', 'vermouth')
          then 'Vermouth & Liqueur'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'brandy' then 'Cognac'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('aperitifs', 'aperitif')
          then 'Aperitif'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'red wine' then 'Red Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'white wine' then 'White Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('rose wine', 'rosé wine')
          then 'Rosé Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('sparkling', 'sparkling wine')
          then 'Sparkling Wine'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'champagne' then 'Champagne'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in (
          'lager', 'ipa', 'ale', 'stout', 'cider', 'alcohol free'
        ) then 'Beer'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('soda', 'tonic')
          then 'Soda / Tonic'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('cola', 'lemonade', 'orangeade')
          then 'Soft Drink'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('juices', 'juice') then 'Juice'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'energy drinks' then 'Energy Drink'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('napkins', 'straws', 'cleaning')
          then initcap(lower(trim(locked.source_snapshot ->> 'subcategory')))
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('purees', 'purées', 'purée')
          then 'Purée'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) = 'syrups' then 'Syrup'
        when lower(trim(locked.source_snapshot ->> 'subcategory')) in ('fruits', 'fruit') then 'Fruit'
        else 'Other'
      end;

      v_unit := case trim(coalesce(locked.source_snapshot ->> 'unit', ''))
        when 'Bottle 0.7L' then 'Bottle 700ml'
        when 'Bottle 1L' then 'Bottle 1L'
        when 'Case 6' then 'Case 6 bottles'
        when 'Case 12' then 'Case 12 bottles'
        when 'Liter' then 'Litre'
        else trim(coalesce(locked.source_snapshot ->> 'unit', ''))
      end;

      -- Compatibility text only; no supplier_id / no suppliers write
      v_supplier := coalesce(locked.source_snapshot ->> 'supplier', '');
      v_qty := greatest(coalesce((locked.source_snapshot ->> 'quantity')::numeric, 0), 0);
      v_par := greatest(coalesce((locked.source_snapshot ->> 'minimum_quantity')::numeric, 0), 0);
      v_cost := greatest(coalesce((locked.source_snapshot ->> 'cost')::numeric, 0), 0);

      v_location := case v_category
        when 'Spirits' then 'Bar'
        when 'Syrups & Purées' then 'Bar'
        when 'Beverages' then 'Main Storage'
        when 'Wine' then 'Wine Storage'
        when 'Fresh' then 'Fridge'
        when 'Consumables' then 'Main Storage'
        else 'Main Storage'
      end;

      insert into public.stock_items (
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
      ) values (
        locked.workspace_id,
        v_name,
        v_category,
        v_item_type,
        v_supplier,
        v_unit,
        v_qty,
        0,
        nullif(v_par, 0),
        null,
        v_cost,
        v_location,
        true
      )
      returning id into v_new_stock_id;

      update public.inventory_stock_item_map m
      set
        stock_item_id = v_new_stock_id,
        status = 'created'
      where m.id = locked.id
        and m.status = 'classified'
        and m.resolution_type = 'auto_create'
        and m.stock_item_id is null;

      if not found then
        raise exception 'map row % lost eligibility after insert', locked.id;
      end if;

      v_created := v_created + 1;

    exception
      when others then
        v_errors := v_errors + 1;
        raise notice 'P7.4.5a row failed map_id=% error=%', cand.map_id, sqlerrm;
        -- subtransaction rolls back orphan stock insert
    end;
  end loop;

  raise notice 'P7.4.5a auto-create complete';
  raise notice 'eligible=%', v_eligible;
  raise notice 'created=%', v_created;
  raise notice 'skipped=%', v_skipped;
  raise notice 'invalid_snapshot=%', v_invalid_snapshot;
  raise notice 'invalid_name=%', v_invalid_name;
  raise notice 'already_had_stock_item_id=%', v_already_has_stock_id;
  raise notice 'race_skipped=%', v_race_skipped;
  raise notice 'errors=%', v_errors;
end $$;

-- =============================================================================
-- VERIFICATION (commented)
-- =============================================================================

-- Created migration-map rows
-- select count(*)::bigint as created_rows
-- from public.inventory_stock_item_map
-- where status = 'created' and resolution_type = 'auto_create';

-- Remaining classified auto_create
-- select count(*)::bigint as remaining_classified_auto_create
-- from public.inventory_stock_item_map
-- where status = 'classified' and resolution_type = 'auto_create';

-- Missing / empty snapshots among classified auto_create
-- select count(*)::bigint as missing_or_empty_snapshot
-- from public.inventory_stock_item_map
-- where status = 'classified'
--   and resolution_type = 'auto_create'
--   and (source_snapshot is null or source_snapshot = '{}'::jsonb);

-- stock_item_id set but status not created
-- select id, status, resolution_type, stock_item_id
-- from public.inventory_stock_item_map
-- where stock_item_id is not null
--   and status is distinct from 'created'
--   and status is distinct from 'linked';

-- Duplicate stock_item_id references in the map
-- select stock_item_id, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- where stock_item_id is not null
-- group by stock_item_id
-- having count(*) > 1;

-- Orphan map stock_item_id references
-- select m.id, m.stock_item_id, m.status
-- from public.inventory_stock_item_map m
-- where m.stock_item_id is not null
--   and not exists (select 1 from public.stock_items s where s.id = m.stock_item_id);

-- Created stock items joined through the map
-- select s.id, s.workspace_id, s.name, s.supplier, s.supplier_id, s.current_quantity
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.status = 'created' and m.resolution_type = 'auto_create'
-- order by s.name;

-- Status distribution
-- select status, resolution_type, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- group by status, resolution_type
-- order by status, resolution_type;

-- supplier_id remains null for migrated auto-create rows
-- select count(*)::bigint as created_with_null_supplier_id
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.status = 'created'
--   and m.resolution_type = 'auto_create'
--   and s.supplier_id is null;

-- Legacy inventory counts unchanged
-- select count(*)::bigint as inventory_items_count from public.inventory_items;

-- Protected states unchanged
-- select count(*) from public.inventory_stock_item_map where status = 'linked';
-- select count(*) from public.inventory_stock_item_map where status = 'manual';
-- select count(*) from public.inventory_stock_item_map where status = 'skipped';
-- select count(*) from public.inventory_stock_item_map
-- where status = 'classified' and resolution_type = 'auto_link';

-- =============================================================================
-- ROLLBACK (careful)
-- =============================================================================
-- delete from public.stock_items s
-- using public.inventory_stock_item_map m
-- where m.stock_item_id = s.id
--   and m.status = 'created'
--   and m.resolution_type = 'auto_create';
--
-- update public.inventory_stock_item_map
-- set status = 'classified', stock_item_id = null
-- where status = 'created' and resolution_type = 'auto_create';
-- =============================================================================

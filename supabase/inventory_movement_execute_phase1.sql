-- =============================================================================
-- P7.4.9 — Safe inventory movement executor (Phase 1)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Writes ONLY:
--   public.stock_movements  (ledger; there is no inventory_movements table)
--
-- Does NOT:
--   - UPDATE stock_items.current_quantity
--   - UPDATE inventory_stock_item_map
--   - mark migration complete
--   - touch suppliers / orders / Bar Refill / UI
--
-- Direction mapping (preview IN/OUT → stock_movements.type):
--   IN  → type = 'receive'
--   OUT → type = 'usage'
-- Reason:
--   note = 'INITIAL_IMPORT|map_id=<inventory_stock_item_map.id>'
--
-- Idempotency:
--   Deterministic note identity keyed by migration-map row id.
--   Second run finds existing note → duplicate prevented (zero new rows).
--
-- Failure isolation:
--   Per-row nested BEGIN/EXCEPTION (subtransaction rollback).
-- =============================================================================

do $$
declare
  cand record;
  locked record;
  v_stock record;
  v_snapshot_qty numeric;
  v_mapped_unit text;
  v_mapped_category text;
  v_delta numeric;
  v_note text;
  v_type text;
  v_dup_peers bigint;
  v_already boolean;

  v_inserted_in bigint := 0;
  v_inserted_out bigint := 0;
  v_skipped_unchanged bigint := 0;
  v_duplicate_prevented bigint := 0;
  v_blocked bigint := 0;
  v_errors bigint := 0;
begin
  for cand in
    select m.id as map_id
    from public.inventory_stock_item_map m
    where m.status in ('created', 'linked')
    order by m.workspace_id, m.legacy_inventory_item_id, m.id
  loop
    begin
      -- Lock map row (read + serialize); never UPDATE the map in this phase
      select
        m.id,
        m.workspace_id,
        m.legacy_inventory_item_id,
        m.stock_item_id,
        m.status,
        m.resolution_type,
        m.source_snapshot
      into locked
      from public.inventory_stock_item_map m
      where m.id = cand.map_id
      for update;

      if not found then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      if locked.status not in ('created', 'linked') then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Idempotency: one INITIAL_IMPORT per map row (deterministic note)
      v_note := 'INITIAL_IMPORT|map_id=' || locked.id::text;
      select exists (
        select 1
        from public.stock_movements sm
        where sm.note = v_note
      ) into v_already;

      if v_already then
        v_duplicate_prevented := v_duplicate_prevented + 1;
        continue;
      end if;

      -- Re-validate stock reference (A/B/C)
      if locked.stock_item_id is null then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      select
        s.id,
        s.workspace_id,
        s.active,
        coalesce(s.current_quantity, 0)::numeric as current_qty
      into v_stock
      from public.stock_items s
      where s.id = locked.stock_item_id;

      if not found then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      if v_stock.workspace_id is distinct from locked.workspace_id then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      if v_stock.active is distinct from true then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Snapshot + quantity (D/E/F)
      if locked.source_snapshot is null
         or locked.source_snapshot = '{}'::jsonb then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      v_snapshot_qty := case
        when jsonb_typeof(locked.source_snapshot -> 'quantity') = 'number'
          then (locked.source_snapshot ->> 'quantity')::numeric
        when jsonb_typeof(locked.source_snapshot -> 'quantity') = 'string'
          and trim(locked.source_snapshot ->> 'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then trim(locked.source_snapshot ->> 'quantity')::numeric
        else null
      end;

      if v_snapshot_qty is null or v_snapshot_qty < 0 then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Unit / category after normalization (G/H) — same rules as P7.4.7
      v_mapped_category := case trim(coalesce(locked.source_snapshot ->> 'category', ''))
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
      end;

      v_mapped_unit := case trim(coalesce(locked.source_snapshot ->> 'unit', ''))
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
        when 'Bag' then trim(coalesce(locked.source_snapshot ->> 'unit', ''))
        when '' then null
        else nullif(trim(coalesce(locked.source_snapshot ->> 'unit', '')), '')
      end;

      if v_mapped_unit is null or trim(v_mapped_unit) = ''
         or v_mapped_category is null or trim(v_mapped_category) = '' then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Duplicate stock_item among other created/linked peers (I)
      select count(*)::bigint into v_dup_peers
      from public.inventory_stock_item_map m2
      where m2.stock_item_id = locked.stock_item_id
        and m2.status in ('created', 'linked')
        and m2.id is distinct from locked.id;

      if v_dup_peers > 0 then
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Delta
      v_delta := v_snapshot_qty - v_stock.current_qty;

      if v_delta = 0 then
        v_skipped_unchanged := v_skipped_unchanged + 1;
        continue;
      end if;

      if v_delta > 0 then
        v_type := 'receive';  -- IN
      else
        v_type := 'usage';    -- OUT
      end if;

      -- Movement creation ONLY — no stock quantity / map updates
      insert into public.stock_movements (
        workspace_id,
        item_id,
        type,
        quantity,
        note,
        created_by
      ) values (
        locked.workspace_id,
        locked.stock_item_id,
        v_type,
        abs(v_delta),
        v_note,
        null
      );

      if v_delta > 0 then
        v_inserted_in := v_inserted_in + 1;
      else
        v_inserted_out := v_inserted_out + 1;
      end if;

    exception
      when others then
        v_errors := v_errors + 1;
        raise notice 'P7.4.9 row failed map_id=% error=%', cand.map_id, sqlerrm;
    end;
  end loop;

  raise notice '========== P7.4.9 EXECUTION PHASE 1 ==========';
  raise notice 'inserted_IN=%', v_inserted_in;
  raise notice 'inserted_OUT=%', v_inserted_out;
  raise notice 'skipped_unchanged=%', v_skipped_unchanged;
  raise notice 'duplicate_prevented=%', v_duplicate_prevented;
  raise notice 'blocked=%', v_blocked;
  raise notice 'errors=%', v_errors;
  raise notice 'EXECUTION PHASE 1 COMPLETE';
end $$;

-- =============================================================================
-- VERIFICATION QUERIES (commented)
-- =============================================================================

-- Created INITIAL_IMPORT movements
-- select id, workspace_id, item_id, type, quantity, note, created_at
-- from public.stock_movements
-- where note like 'INITIAL_IMPORT|map_id=%'
-- order by created_at desc;

-- Duplicate protection (each map_id appears at most once)
-- select note, count(*)::bigint as n
-- from public.stock_movements
-- where note like 'INITIAL_IMPORT|map_id=%'
-- group by note
-- having count(*) > 1;

-- Movement totals
-- select
--   count(*) filter (where type = 'receive')::bigint as in_receive,
--   count(*) filter (where type = 'usage')::bigint as out_usage,
--   coalesce(sum(quantity), 0) as total_qty
-- from public.stock_movements
-- where note like 'INITIAL_IMPORT|map_id=%';

-- Skipped unchanged (eligible, delta 0) — re-run preview / compare manually
-- (no movement note for those map rows)

-- Rows still eligible without an INITIAL_IMPORT movement yet
-- select m.id, m.workspace_id, m.stock_item_id, m.status
-- from public.inventory_stock_item_map m
-- where m.status in ('created', 'linked')
--   and not exists (
--     select 1 from public.stock_movements sm
--     where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
--   );

-- Stock quantities unchanged by this phase (script never UPDATEs stock_items)
-- select count(*) from public.stock_items;

-- Migration map unchanged by this phase (script never UPDATEs the map)
-- select status, count(*) from public.inventory_stock_item_map group by 1 order by 1;

-- Prove only stock_movements grew; map + stock qty fingerprints stable across re-run:
-- select 'map' as t, count(*) from public.inventory_stock_item_map
-- union all select 'stock_items', count(*) from public.stock_items
-- union all select 'stock_qty_sum', coalesce(sum(current_quantity),0)::bigint from public.stock_items
-- union all select 'stock_movements', count(*) from public.stock_movements
-- union all select 'initial_import', count(*) from public.stock_movements
--   where note like 'INITIAL_IMPORT|map_id=%';
-- =============================================================================

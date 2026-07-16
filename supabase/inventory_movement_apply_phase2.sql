-- =============================================================================
-- P7.4.10b — Safe stock quantity apply (Phase 2) using migrated_at
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- ============================================================================
-- MAINTENANCE WINDOW REQUIRED
-- ============================================================================
-- Execute Phase 1 and Phase 2 during a controlled maintenance window.
-- No stock receives, usage, wastage, adjustments, or order receipts may occur
-- between Phase 1 and Phase 2.
-- Review Phase 1 preview and execution results before running Phase 2.
-- Do NOT run Phase 2 if normal stock activity occurred after Phase 1.
--
-- Phase 1 stores a delta computed against stock quantity at Phase 1 time.
-- Applying that delta after intervening stock activity yields the wrong result.
-- ============================================================================
--
-- Writes ONLY (explicit):
--   public.stock_items.current_quantity
--   public.inventory_stock_item_map.migrated_at
-- Repository updated_at triggers may fire naturally.
--
-- Does NOT:
--   - INSERT / UPDATE / DELETE stock_movements
--   - change map.status / stock_item_id / resolution_type
--   - touch suppliers / inventory_items / orders / Bar Refill / UI
--
-- Idempotency marker: inventory_stock_item_map.migrated_at
-- Movement identity: note = 'INITIAL_IMPORT|map_id=<map.id>'
--
-- Lock order (do not change):
--   1) migration-map row
--   2) matching movement row
--   3) stock item row
-- =============================================================================

do $$
declare
  -- SAFETY INTERLOCK (not idempotency): operator must set true for a
  -- controlled maintenance window before any quantity writes occur.
  v_confirm_maintenance_window boolean := false;

  cand record;
  locked record;
  v_mov record;
  v_stock record;
  v_note text;
  v_mov_count bigint;
  v_new_qty numeric;

  v_applied_receive bigint := 0;
  v_applied_usage bigint := 0;
  v_already_applied bigint := 0;
  v_missing_movement bigint := 0;
  v_duplicate_movement bigint := 0;
  v_missing_stock bigint := 0;
  v_workspace_mismatch bigint := 0;
  v_inactive_stock bigint := 0;
  v_invalid_movement_type bigint := 0;
  v_invalid_movement_qty bigint := 0;
  v_negative_result_blocked bigint := 0;
  v_revalidation_skipped bigint := 0;
  v_errors bigint := 0;
  v_total_applied bigint := 0;
  v_total_blocked bigint := 0;
begin
  raise notice '========== P7.4.10b PHASE 2 QUANTITY APPLY ==========';
  raise notice 'Maintenance window required between Phase 1 and Phase 2.';
  raise notice 'No stock activity may occur between Phase 1 and Phase 2.';
  raise notice 'v_confirm_maintenance_window=%', v_confirm_maintenance_window;

  if not v_confirm_maintenance_window then
    raise notice 'REFUSED: set v_confirm_maintenance_window := true only after confirming a controlled maintenance window.';
    raise exception
      'P7.4.10b refused: maintenance-window confirmation is false; no quantity writes performed';
  end if;

  raise notice 'maintenance_window_confirmation=enabled';

  for cand in
    select m.id as map_id
    from public.inventory_stock_item_map m
    where m.status in ('created', 'linked')
      and m.stock_item_id is not null
      and m.migrated_at is null
    order by m.workspace_id, m.legacy_inventory_item_id, m.id
  loop
    begin
      -- 1) Lock map row first
      select
        m.id,
        m.workspace_id,
        m.legacy_inventory_item_id,
        m.stock_item_id,
        m.status,
        m.migrated_at
      into locked
      from public.inventory_stock_item_map m
      where m.id = cand.map_id
      for update;

      if not found then
        v_revalidation_skipped := v_revalidation_skipped + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 2) Re-check eligibility under lock
      if locked.migrated_at is not null then
        v_already_applied := v_already_applied + 1;
        continue;
      end if;

      if locked.status not in ('created', 'linked')
         or locked.stock_item_id is null then
        v_revalidation_skipped := v_revalidation_skipped + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      v_note := 'INITIAL_IMPORT|map_id=' || locked.id::text;

      select count(*)::bigint into v_mov_count
      from public.stock_movements sm
      where sm.note = v_note;

      if v_mov_count = 0 then
        v_missing_movement := v_missing_movement + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov_count > 1 then
        v_duplicate_movement := v_duplicate_movement + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 3) Lock the exact matching movement
      select
        sm.id,
        sm.workspace_id,
        sm.item_id,
        sm.type,
        sm.quantity,
        sm.note
      into v_mov
      from public.stock_movements sm
      where sm.note = v_note
      for update;

      if not found then
        v_missing_movement := v_missing_movement + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 4) Validate movement identity / payload
      if v_mov.workspace_id is distinct from locked.workspace_id then
        v_workspace_mismatch := v_workspace_mismatch + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov.item_id is distinct from locked.stock_item_id then
        -- Item identity mismatch (not in dedicated NOTICE list → revalidation_skipped)
        v_revalidation_skipped := v_revalidation_skipped + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov.type is distinct from 'receive'
         and v_mov.type is distinct from 'usage' then
        v_invalid_movement_type := v_invalid_movement_type + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_mov.quantity is null or v_mov.quantity <= 0 then
        v_invalid_movement_qty := v_invalid_movement_qty + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 5) Lock stock item
      select
        s.id,
        s.workspace_id,
        s.active,
        s.current_quantity
      into v_stock
      from public.stock_items s
      where s.id = locked.stock_item_id
      for update;

      if not found then
        v_missing_stock := v_missing_stock + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_stock.workspace_id is distinct from locked.workspace_id then
        v_workspace_mismatch := v_workspace_mismatch + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      if v_stock.active is distinct from true then
        v_inactive_stock := v_inactive_stock + 1;
        v_total_blocked := v_total_blocked + 1;
        continue;
      end if;

      -- 6) Calculate new quantity (no silent clamp)
      if v_mov.type = 'receive' then
        v_new_qty := coalesce(v_stock.current_quantity, 0) + v_mov.quantity;
      else
        -- usage
        v_new_qty := coalesce(v_stock.current_quantity, 0) - v_mov.quantity;
        if v_new_qty < 0 then
          v_negative_result_blocked := v_negative_result_blocked + 1;
          v_total_blocked := v_total_blocked + 1;
          continue;
        end if;
      end if;

      -- 7) Atomic writes: quantity + migrated_at (same exception block)
      update public.stock_items s
      set current_quantity = v_new_qty
      where s.id = v_stock.id
        and s.workspace_id = locked.workspace_id;

      if not found then
        raise exception 'stock update missed id=%', v_stock.id;
      end if;

      update public.inventory_stock_item_map m
      set migrated_at = now()
      where m.id = locked.id
        and m.migrated_at is null;

      if not found then
        raise exception 'map migrated_at race map_id=%', locked.id;
      end if;

      if v_mov.type = 'receive' then
        v_applied_receive := v_applied_receive + 1;
      else
        v_applied_usage := v_applied_usage + 1;
      end if;
      v_total_applied := v_total_applied + 1;

    exception
      when others then
        v_errors := v_errors + 1;
        v_total_blocked := v_total_blocked + 1;
        raise notice 'P7.4.10b row failed map_id=% error=%', cand.map_id, sqlerrm;
    end;
  end loop;

  raise notice '--- counters ---';
  raise notice 'applied_receive=%', v_applied_receive;
  raise notice 'applied_usage=%', v_applied_usage;
  raise notice 'already_applied=%', v_already_applied;
  raise notice 'missing_movement=%', v_missing_movement;
  raise notice 'duplicate_movement=%', v_duplicate_movement;
  raise notice 'missing_stock_item=%', v_missing_stock;
  raise notice 'workspace_mismatch=%', v_workspace_mismatch;
  raise notice 'inactive_stock_item=%', v_inactive_stock;
  raise notice 'invalid_movement_type=%', v_invalid_movement_type;
  raise notice 'invalid_movement_quantity=%', v_invalid_movement_qty;
  raise notice 'negative_result_blocked=%', v_negative_result_blocked;
  raise notice 'revalidation_skipped=%', v_revalidation_skipped;
  raise notice 'errors=%', v_errors;
  raise notice 'total_applied=%', v_total_applied;
  raise notice 'total_blocked=%', v_total_blocked;
  raise notice 'maintenance_window_confirmation=enabled';
  raise notice 'EXECUTION PHASE 2 COMPLETE';
end $$;

-- =============================================================================
-- VERIFICATION QUERIES (commented — SELECT only)
-- Capture before/after fingerprints before execution.
-- =============================================================================

-- Before/after fingerprints (recommend capture before running Phase 2)
-- select 'map_migrated' as k, count(*) from public.inventory_stock_item_map where migrated_at is not null
-- union all select 'map_unapplied_created_linked', count(*) from public.inventory_stock_item_map
--   where status in ('created','linked') and migrated_at is null
-- union all select 'stock_qty_sum', coalesce(sum(current_quantity),0)::bigint from public.stock_items
-- union all select 'stock_movements', count(*) from public.stock_movements
-- union all select 'initial_import', count(*) from public.stock_movements
--   where note like 'INITIAL_IMPORT|map_id=%';

-- Map rows with migrated_at set
-- select id, workspace_id, stock_item_id, status, migrated_at
-- from public.inventory_stock_item_map
-- where migrated_at is not null
-- order by migrated_at desc;

-- Remaining unapplied created/linked
-- select id, workspace_id, stock_item_id, status, migrated_at
-- from public.inventory_stock_item_map
-- where status in ('created', 'linked')
--   and migrated_at is null;

-- INITIAL_IMPORT movements joined to map rows
-- select m.id as map_id, m.status, m.migrated_at, sm.id as movement_id, sm.type, sm.quantity, sm.note
-- from public.inventory_stock_item_map m
-- left join public.stock_movements sm
--   on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
-- where m.status in ('created', 'linked')
-- order by m.id;

-- Applied receive / usage (map migrated + matching movement type)
-- select m.id, sm.type, sm.quantity, s.current_quantity, m.migrated_at
-- from public.inventory_stock_item_map m
-- join public.stock_movements sm on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.migrated_at is not null and sm.type = 'receive';
--
-- select m.id, sm.type, sm.quantity, s.current_quantity, m.migrated_at
-- from public.inventory_stock_item_map m
-- join public.stock_movements sm on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
-- join public.stock_items s on s.id = m.stock_item_id
-- where m.migrated_at is not null and sm.type = 'usage';

-- Missing movement rows
-- select m.id, m.workspace_id, m.stock_item_id, m.status
-- from public.inventory_stock_item_map m
-- where m.status in ('created', 'linked')
--   and m.migrated_at is null
--   and not exists (
--     select 1 from public.stock_movements sm
--     where sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
--   );

-- Duplicate deterministic movement notes
-- select note, count(*)::bigint as n
-- from public.stock_movements
-- where note like 'INITIAL_IMPORT|map_id=%'
-- group by note
-- having count(*) > 1;

-- Movement/map item mismatches
-- select m.id, m.stock_item_id, sm.item_id, sm.note
-- from public.inventory_stock_item_map m
-- join public.stock_movements sm on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
-- where sm.item_id is distinct from m.stock_item_id;

-- Movement/map workspace mismatches
-- select m.id, m.workspace_id as map_ws, sm.workspace_id as mov_ws
-- from public.inventory_stock_item_map m
-- join public.stock_movements sm on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
-- where sm.workspace_id is distinct from m.workspace_id;

-- Inactive or missing stock references
-- select m.id, m.stock_item_id, s.id as stock_id, s.active
-- from public.inventory_stock_item_map m
-- left join public.stock_items s on s.id = m.stock_item_id
-- where m.status in ('created', 'linked')
--   and (s.id is null or s.active is distinct from true);

-- Negative current quantities
-- select id, workspace_id, name, current_quantity
-- from public.stock_items
-- where current_quantity < 0;

-- Map status distribution
-- select status, count(*)::bigint as n,
--   count(*) filter (where migrated_at is not null)::bigint as with_migrated_at
-- from public.inventory_stock_item_map
-- group by status
-- order by status;

-- Stock quantity results (applied maps)
-- select s.id, s.name, s.current_quantity, m.migrated_at, sm.type, sm.quantity
-- from public.inventory_stock_item_map m
-- join public.stock_items s on s.id = m.stock_item_id
-- left join public.stock_movements sm on sm.note = 'INITIAL_IMPORT|map_id=' || m.id::text
-- where m.migrated_at is not null
-- order by m.migrated_at desc;

-- stock_movements count before/after (must be identical; Phase 2 does not touch ledger)
-- select count(*) from public.stock_movements;
-- select count(*) from public.stock_movements where note like 'INITIAL_IMPORT|map_id=%';

-- Proof: this script explicitly updates only current_quantity and migrated_at
-- (see UPDATE statements above). No INSERT/UPDATE/DELETE on stock_movements.
-- =============================================================================

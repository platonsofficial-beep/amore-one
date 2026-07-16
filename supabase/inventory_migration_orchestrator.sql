-- =============================================================================
-- P7.5.0 — Migration pipeline orchestrator (DRY-RUN / READ-ONLY)
-- =============================================================================
-- Run manually in the Supabase SQL editor when ready.
-- Do NOT auto-run from the app.
--
-- Guarantees (READ-ONLY):
--   - No INSERT / UPDATE / DELETE / MERGE / TRUNCATE
--   - No ALTER / DROP / CREATE TABLE / CREATE INDEX
--   - Does NOT execute any migration step
--   - Does NOT modify data
--   - Completes always (NOTICE only; no RAISE for findings)
--
-- Purpose:
--   Document execution order, verify prerequisite objects, remind operators.
-- =============================================================================
--
-- C) REQUIRED MIGRATION SCRIPT CHECKLIST (run manually, in order)
-- -----------------------------------------------------------------------------
-- Foundation (once):
--   supabase/inventory_stock_item_map.sql
-- Optional dry-run (analysis only):
--   supabase/inventory_stock_dry_run_classifier.sql
--
-- Pipeline sequence:
--   1. supabase/inventory_stock_map_persist.sql          — Persist classifications
--   2. supabase/inventory_stock_map_auto_link.sql        — Auto-link
--   3. supabase/inventory_stock_map_auto_create.sql      — Auto-create
--   4. supabase/inventory_stock_integrity_audit.sql      — Integrity audit
--   5. supabase/inventory_movement_preflight.sql         — Movement preflight
--   6. supabase/inventory_movement_preview.sql           — Movement preview
--   7. supabase/inventory_movement_execute_phase1.sql    — Phase 1 movements
--   8. supabase/inventory_movement_apply_phase2.sql      — Phase 2 quantity apply
--      (requires v_confirm_maintenance_window := true)
--   9. supabase/inventory_post_apply_audit.sql           — Post-apply audit
-- =============================================================================

do $$
declare
  v_has_map boolean := false;
  v_has_stock_items boolean := false;
  v_has_stock_movements boolean := false;
  v_ready boolean := false;
begin
  -- B) Prerequisite object existence (catalog only)
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inventory_stock_item_map'
  ) into v_has_map;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_items'
  ) into v_has_stock_items;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'stock_movements'
  ) into v_has_stock_movements;

  v_ready := v_has_map and v_has_stock_items and v_has_stock_movements;

  -- A) Execution order
  raise notice '========== P7.5.0 MIGRATION ORCHESTRATOR (DRY-RUN) ==========';
  raise notice '--- A. Execution order ---';
  raise notice '1 Persist classifications      → inventory_stock_map_persist.sql';
  raise notice '2 Auto-link                   → inventory_stock_map_auto_link.sql';
  raise notice '3 Auto-create                 → inventory_stock_map_auto_create.sql';
  raise notice '4 Integrity audit             → inventory_stock_integrity_audit.sql';
  raise notice '5 Movement preflight          → inventory_movement_preflight.sql';
  raise notice '6 Movement preview            → inventory_movement_preview.sql';
  raise notice '7 Phase 1 movement creation   → inventory_movement_execute_phase1.sql';
  raise notice '8 Phase 2 quantity apply      → inventory_movement_apply_phase2.sql';
  raise notice '9 Post-apply audit            → inventory_post_apply_audit.sql';

  -- B) Object checks
  raise notice '--- B. Object checks ---';
  raise notice 'public.inventory_stock_item_map present=%', v_has_map;
  raise notice 'public.stock_items present=%', v_has_stock_items;
  raise notice 'public.stock_movements present=%', v_has_stock_movements;

  if not v_has_map then
    raise notice 'MISSING: public.inventory_stock_item_map — apply inventory_stock_item_map.sql first';
  end if;
  if not v_has_stock_items then
    raise notice 'MISSING: public.stock_items — apply stock_items_schema.sql first';
  end if;
  if not v_has_stock_movements then
    raise notice 'MISSING: public.stock_movements — apply stock_movements_schema.sql first';
  end if;

  -- C) Operator reminders
  raise notice '--- C. Operator reminders ---';
  raise notice 'REMINDER: take a backup before any write step';
  raise notice 'REMINDER: Phase 1 + Phase 2 require a controlled maintenance window';
  raise notice 'REMINDER: no stock receives/usage/adjustments/order receipts between Phase 1 and Phase 2';
  raise notice 'REMINDER: review movement preview before running Phase 1';
  raise notice 'REMINDER: set v_confirm_maintenance_window := true only for Phase 2 under maintenance';
  raise notice 'REMINDER: run post-apply audit last and require PASSED before declaring done';
  raise notice 'REMINDER: this orchestrator does NOT execute any migration script';

  -- D) Readiness summary (prerequisite objects only)
  raise notice '--- D. Readiness summary ---';
  if v_ready then
    raise notice 'READY FOR CONTROLLED EXECUTION';
  else
    raise notice 'SETUP REQUIRES ATTENTION';
  end if;
end $$;

-- =============================================================================
-- VERIFICATION QUERIES (commented — SELECT only)
-- =============================================================================

-- Required tables existence
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in (
--     'inventory_stock_item_map',
--     'stock_items',
--     'stock_movements'
--   )
-- order by table_name;

-- Migration map row counts
-- select status, count(*)::bigint as n
-- from public.inventory_stock_item_map
-- group by status
-- order by status;
--
-- select
--   count(*)::bigint as total,
--   count(*) filter (where migrated_at is not null)::bigint as migrated_at_set
-- from public.inventory_stock_item_map;

-- stock_items row counts
-- select count(*)::bigint as stock_items_n from public.stock_items;
-- select count(*) filter (where active)::bigint as active_n from public.stock_items;

-- stock_movements row counts
-- select count(*)::bigint as stock_movements_n from public.stock_movements;
-- select count(*)::bigint as initial_import_n
-- from public.stock_movements
-- where note like 'INITIAL_IMPORT|map_id=%';

-- Prove read-only: re-run twice; notices identical; fingerprints unchanged.
-- select 'map' as t, count(*) from public.inventory_stock_item_map
-- union all select 'stock_items', count(*) from public.stock_items
-- union all select 'stock_movements', count(*) from public.stock_movements;
-- =============================================================================

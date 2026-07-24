-- =============================================================================
-- P8.16.38 — Permanent Delete Historical Snapshot FK Reconciliation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (item_id ON DELETE SET NULL)
--   2. inventory_count_snapshot_at_hardening.sql (freeze trigger exists)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Narrow the freeze trigger so FK-driven preservation works when
--   delete_stock_item_permanently deletes stock_items:
--     inventory_count_session_items.item_id: non-null → NULL
--
-- Preserves:
--   - All other frozen snapshot fields (still raise inventory_count_item_frozen_field)
--   - item_id A → item_id B forbidden
--   - item_id NULL → non-null forbidden
--   - Open-count Permanent Delete blockers (unchanged; live in delete RPC)
--   - Historical session-item rows (never deleted by this patch)
--
-- Does NOT:
--   - Change delete_stock_item_permanently
--   - Delete inventory_count_session_items
--   - Disable/drop the freeze trigger
--   - Mutate existing rows
--   - Alter FK / RLS / auth
-- =============================================================================

create or replace function public.protect_inventory_count_session_item_freeze_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Copied snapshot identity fields remain immutable.
  if new.session_id is distinct from old.session_id
     or new.workspace_id is distinct from old.workspace_id
     or new.item_name is distinct from old.item_name
     or new.category is distinct from old.category
     or new.item_type is distinct from old.item_type
     or new.unit is distinct from old.unit
     or new.storage_location is distinct from old.storage_location
     or new.expected_snapshot is distinct from old.expected_snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'inventory_count_item_frozen_field';
  end if;

  -- item_id: allow only non-null → NULL (stock_items ON DELETE SET NULL).
  -- Forbid NULL → non-null and non-null A → non-null B.
  if new.item_id is distinct from old.item_id
     and not (old.item_id is not null and new.item_id is null) then
    raise exception 'inventory_count_item_frozen_field';
  end if;

  return new;
end;
$$;

comment on function public.protect_inventory_count_session_item_freeze_fields() is
  'P8.3.9c/P8.16.38 BEFORE UPDATE guard for inventory_count_session_items freeze fields. Allows only item_id non-null → NULL for stock_items ON DELETE SET NULL.';

-- Trigger already exists from inventory_count_snapshot_at_hardening.sql.
-- Recreate idempotently so production that somehow lacks it still binds
-- to the replaced function (no DISABLE/ENABLE hack).
drop trigger if exists inventory_count_session_items_protect_freeze_fields
  on public.inventory_count_session_items;

create trigger inventory_count_session_items_protect_freeze_fields
  before update on public.inventory_count_session_items
  for each row
  execute function public.protect_inventory_count_session_item_freeze_fields();

-- =============================================================================
-- Manual verification checklist (run in SQL editor; do not delete production data)
-- =============================================================================
-- 1) Function body contains the narrow nulling exception:
--    select pg_get_functiondef('public.protect_inventory_count_session_item_freeze_fields()'::regprocedure);
--
-- 2) Historical posted/cancelled path (use disposable workspace fixtures only):
--    - session status posted|cancelled with session_items.item_id = stock item
--    - call delete_stock_item_permanently(workspace, stock_item)
--    - expect success; session_items row remains; item_id IS NULL;
--      item_name/category/unit/storage_location/expected_snapshot unchanged
--
-- 3) Open count still blocked:
--    - session status in_progress|paused|counting_complete referencing item
--    - delete_stock_item_permanently raises stock_item_permanent_delete_blocked_open_count
--
-- 4) Frozen regressions (direct UPDATE should still fail):
--    update inventory_count_session_items set item_id = '<other-uuid>' where id = '...';
--    update inventory_count_session_items set item_id = '<uuid>' where item_id is null and id = '...';
--    update inventory_count_session_items set item_name = 'x' where id = '...';
-- =============================================================================

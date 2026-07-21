-- =============================================================================
-- P8.3.9c — Immutable Snapshot Boundary Hardening
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
-- Then run BEFORE redeploying the updated build/preview RPCs:
--   3. inventory_count_build_snapshot_rpc.sql (P8.3.9c)
--   4. inventory_count_preview_finish_rpc.sql (P8.3.9c)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   1. Add inventory_count_sessions.snapshot_at
--   2. Backfill from MIN(session_items.created_at) where items exist
--   3. Revoke authenticated INSERT/UPDATE/DELETE on session items
--   4. Protect frozen item snapshot fields and session.snapshot_at
--
-- Does NOT:
--   - Mutate stock_items / stock_movements
--   - Change session status values
--   - Implement posting
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Additive session column
-- -----------------------------------------------------------------------------
alter table public.inventory_count_sessions
  add column if not exists snapshot_at timestamptz;

comment on column public.inventory_count_sessions.snapshot_at is
  'P8.3.9c Authoritative inventory count freeze timestamp. Set once by build_inventory_count_snapshot.';

-- -----------------------------------------------------------------------------
-- 2. Backfill existing development sessions that already have snapshot rows
-- -----------------------------------------------------------------------------
update public.inventory_count_sessions s
set snapshot_at = boundary.min_created_at
from (
  select
    i.session_id,
    i.workspace_id,
    min(i.created_at) as min_created_at
  from public.inventory_count_session_items i
  group by i.session_id, i.workspace_id
) boundary
where s.id = boundary.session_id
  and s.workspace_id = boundary.workspace_id
  and s.snapshot_at is null;

-- -----------------------------------------------------------------------------
-- 3. Direct DML lockdown on session items (SELECT retained)
-- -----------------------------------------------------------------------------
revoke insert, update, delete on table public.inventory_count_session_items from authenticated;
-- Keep SELECT for workspace members via existing grant + RLS.
grant select on table public.inventory_count_session_items to authenticated;

-- Remove obsolete write policies (privilege already revoked; keep SELECT policy).
drop policy if exists inventory_count_session_items_insert_managers
  on public.inventory_count_session_items;
drop policy if exists inventory_count_session_items_update_managers
  on public.inventory_count_session_items;
drop policy if exists inventory_count_session_items_delete_managers
  on public.inventory_count_session_items;

-- -----------------------------------------------------------------------------
-- 4. Immutable session item freeze fields
-- -----------------------------------------------------------------------------
create or replace function public.protect_inventory_count_session_item_freeze_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.session_id is distinct from old.session_id
     or new.workspace_id is distinct from old.workspace_id
     or new.item_id is distinct from old.item_id
     or new.item_name is distinct from old.item_name
     or new.category is distinct from old.category
     or new.item_type is distinct from old.item_type
     or new.unit is distinct from old.unit
     or new.storage_location is distinct from old.storage_location
     or new.expected_snapshot is distinct from old.expected_snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'inventory_count_item_frozen_field';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_count_session_items_protect_freeze_fields
  on public.inventory_count_session_items;

create trigger inventory_count_session_items_protect_freeze_fields
  before update on public.inventory_count_session_items
  for each row
  execute function public.protect_inventory_count_session_item_freeze_fields();

-- -----------------------------------------------------------------------------
-- 5. Immutable session.snapshot_at once set
-- -----------------------------------------------------------------------------
create or replace function public.protect_inventory_count_session_snapshot_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.snapshot_at is not null
     and new.snapshot_at is distinct from old.snapshot_at then
    raise exception 'inventory_count_session_snapshot_at_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_count_sessions_protect_snapshot_at
  on public.inventory_count_sessions;

create trigger inventory_count_sessions_protect_snapshot_at
  before update on public.inventory_count_sessions
  for each row
  execute function public.protect_inventory_count_session_snapshot_at();

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop trigger if exists inventory_count_sessions_protect_snapshot_at on public.inventory_count_sessions;
-- drop function if exists public.protect_inventory_count_session_snapshot_at();
-- drop trigger if exists inventory_count_session_items_protect_freeze_fields on public.inventory_count_session_items;
-- drop function if exists public.protect_inventory_count_session_item_freeze_fields();
-- alter table public.inventory_count_sessions drop column if exists snapshot_at;
-- Then re-apply inventory_count_rls_policies.sql write grants/policies for session items.

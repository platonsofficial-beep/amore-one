-- =============================================================================
-- P8.26.3 — Workspace Storage Create & Archive RPCs
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. supabase/workspace_storages_schema.sql (P8.26.1)
--   2. public.stock_items / inventory_count_sessions / inventory_count_session_locations
--   3. public.can_manage_workspace_stock(uuid) / public.is_workspace_member(uuid)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   SECURITY DEFINER write entry points for workspace_storages:
--     - create_workspace_storage
--     - archive_workspace_storage
--
-- Does NOT:
--   - Rename / delete / reorder storages
--   - Mutate stock_items or add storage_id
--   - Touch Inventory Count snapshot RPCs
--   - Seed / backfill storages
--   - Wire UI
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Architecture:
--   location_key remains the exact operational string for
--   stock_items.storage_location and Inventory Count matching.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_workspace_storage
-- -----------------------------------------------------------------------------
drop function if exists public.create_workspace_storage(uuid, text);

create or replace function public.create_workspace_storage(
  p_workspace_id uuid,
  p_location_key text
)
returns public.workspace_storages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_location_key text := '';
  v_sort_order integer := 0;
  v_row public.workspace_storages%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'workspace_storage_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_storage_workspace_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'workspace_storage_workspace_not_found';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_storage_forbidden';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'workspace_storage_forbidden';
  end if;

  v_location_key := btrim(coalesce(p_location_key, ''));

  if length(v_location_key) = 0 then
    raise exception 'workspace_storage_location_key_required';
  end if;

  if char_length(v_location_key) > 80 then
    raise exception 'workspace_storage_location_key_too_long';
  end if;

  -- Reject outer-padded input explicitly (must equal trimmed form).
  if p_location_key is distinct from v_location_key then
    raise exception 'workspace_storage_location_key_invalid';
  end if;

  select coalesce(max(ws.sort_order), -1) + 1
  into v_sort_order
  from public.workspace_storages ws
  where ws.workspace_id = p_workspace_id;

  begin
    insert into public.workspace_storages (
      workspace_id,
      location_key,
      name,
      sort_order,
      active,
      created_by,
      updated_by
    )
    values (
      p_workspace_id,
      v_location_key,
      v_location_key, -- V1: name == location_key
      v_sort_order,
      true,
      v_auth_user_id,
      v_auth_user_id
    )
    returning * into v_row;
  exception
    when unique_violation then
      raise exception 'workspace_storage_duplicate';
  end;

  return v_row;
end;
$$;

comment on function public.create_workspace_storage(uuid, text) is
  'P8.26.3 SECURITY DEFINER create workspace storage. name=location_key; active=true; append sort_order; manager-only. Duplicate → workspace_storage_duplicate.';

revoke all on function public.create_workspace_storage(uuid, text) from public;
revoke all on function public.create_workspace_storage(uuid, text) from anon;
grant execute on function public.create_workspace_storage(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- archive_workspace_storage
-- -----------------------------------------------------------------------------
drop function if exists public.archive_workspace_storage(uuid, uuid);

create or replace function public.archive_workspace_storage(
  p_workspace_id uuid,
  p_storage_id uuid
)
returns public.workspace_storages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_row public.workspace_storages%rowtype;
  v_active_item_count integer := 0;
  v_open_count_refs integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'workspace_storage_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_storage_workspace_required';
  end if;

  if p_storage_id is null then
    raise exception 'workspace_storage_storage_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'workspace_storage_workspace_not_found';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_storage_forbidden';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'workspace_storage_forbidden';
  end if;

  select ws.*
  into v_row
  from public.workspace_storages ws
  where ws.id = p_storage_id
    and ws.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'workspace_storage_not_found';
  end if;

  -- Idempotent: already archived
  if v_row.active is not true then
    return v_row;
  end if;

  -- Block when active stock items still use this exact operational key.
  select count(*)::integer
  into v_active_item_count
  from public.stock_items si
  where si.workspace_id = p_workspace_id
    and si.storage_location = v_row.location_key
    and si.active is true;

  if coalesce(v_active_item_count, 0) > 0 then
    raise exception 'workspace_storage_blocked_active_items'
      using detail = format('active_item_refs=%s', v_active_item_count);
  end if;

  -- Block when an open Inventory Count session includes this location_key.
  -- Open statuses match permanent-delete / Count lifecycle:
  --   in_progress | paused | counting_complete
  -- posted / cancelled historical sessions do NOT block.
  select count(*)::integer
  into v_open_count_refs
  from public.inventory_count_session_locations loc
  inner join public.inventory_count_sessions cs
    on cs.id = loc.session_id
  where loc.workspace_id = p_workspace_id
    and cs.workspace_id = p_workspace_id
    and loc.location_key = v_row.location_key
    and cs.status in ('in_progress', 'paused', 'counting_complete');

  if coalesce(v_open_count_refs, 0) > 0 then
    raise exception 'workspace_storage_blocked_open_count'
      using detail = format('open_count_refs=%s', v_open_count_refs);
  end if;

  update public.workspace_storages ws
  set
    active = false,
    updated_by = v_auth_user_id
    -- updated_at via workspace_storages_set_updated_at trigger
  where ws.id = v_row.id
    and ws.workspace_id = p_workspace_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.archive_workspace_storage(uuid, uuid) is
  'P8.26.3 SECURITY DEFINER archive workspace storage (active=false). Blocks active stock_items refs and open Count sessions using exact location_key. No delete/rename.';

revoke all on function public.archive_workspace_storage(uuid, uuid) from public;
revoke all on function public.archive_workspace_storage(uuid, uuid) from anon;
grant execute on function public.archive_workspace_storage(uuid, uuid) to authenticated;

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================
-- select pg_get_functiondef('public.create_workspace_storage(uuid, text)'::regprocedure);
-- select pg_get_functiondef('public.archive_workspace_storage(uuid, uuid)'::regprocedure);
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.create_workspace_storage(uuid, text);
-- drop function if exists public.archive_workspace_storage(uuid, uuid);

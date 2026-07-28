-- =============================================================================
-- P8.3.2 / P8.3.9c — Build Inventory Count Snapshot RPC
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
--   3. inventory_count_create_session_rpc.sql (P8.3.1)
--   4. inventory_count_snapshot_at_hardening.sql (P8.3.9c) — adds sessions.snapshot_at
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point that freezes eligible stock_items into
--   inventory_count_session_items and sets inventory_count_sessions.snapshot_at
--   to one authoritative freeze timestamp.
--   P8.21.2: rejects empty snapshots (zero items) before writing snapshot_at.
--
-- Does NOT:
--   - Accept snapshot values / quantities / items from the client
--   - Set counted_quantity / counted_at
--   - Write posting fields
--   - Mutate stock_items or stock_movements
--   - Wire UI / services
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
-- =============================================================================

drop function if exists public.build_inventory_count_snapshot(uuid, uuid);

create or replace function public.build_inventory_count_snapshot(
  p_workspace_id uuid,
  p_session_id uuid
)
returns table (
  session_id uuid,
  items_created integer,
  snapshot_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_existing_item_count integer := 0;
  v_location_count integer := 0;
  v_items_created integer := 0;
  v_snapshot_created_at timestamptz := now();
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_snapshot_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_count_snapshot_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_snapshot_session_required';
  end if;

  -- Authorization (owner / general_manager / manager)
  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_count_snapshot_forbidden';
  end if;

  -- Session must exist and belong to workspace
  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'inventory_count_snapshot_session_not_found';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_snapshot_workspace_mismatch';
  end if;

  if v_session.status is distinct from 'in_progress' then
    raise exception 'inventory_count_snapshot_session_not_in_progress';
  end if;

  -- Duplicate snapshot prevention (authoritative timestamp or existing rows)
  if v_session.snapshot_at is not null then
    raise exception 'inventory_count_snapshot_already_exists';
  end if;

  select count(*)::integer
  into v_existing_item_count
  from public.inventory_count_session_items i
  where i.session_id = p_session_id;

  if v_existing_item_count > 0 then
    raise exception 'inventory_count_snapshot_already_exists';
  end if;

  -- Session must have at least one location (created by create RPC)
  select count(*)::integer
  into v_location_count
  from public.inventory_count_session_locations l
  where l.session_id = p_session_id
    and l.workspace_id = p_workspace_id;

  if v_location_count < 1 then
    raise exception 'inventory_count_snapshot_locations_required';
  end if;

  -- Atomic snapshot insert from live stock_items (never from client)
  insert into public.inventory_count_session_items (
    session_id,
    workspace_id,
    item_id,
    item_name,
    category,
    item_type,
    unit,
    storage_location,
    expected_snapshot,
    counted_quantity,
    counted_at,
    expected_at_count,
    variance_quantity,
    live_quantity_at_post,
    posted_movement_id,
    line_status,
    note,
    created_at,
    updated_at
  )
  select
    p_session_id,
    p_workspace_id,
    si.id,
    si.name,
    si.category,
    si.item_type,
    si.unit,
    si.storage_location,
    coalesce(si.current_quantity, 0),
    null,
    null,
    null,
    null,
    null,
    null,
    'pending',
    '',
    v_snapshot_created_at,
    v_snapshot_created_at
  from public.stock_items si
  where si.workspace_id = p_workspace_id
    and si.storage_location in (
      select l.location_key
      from public.inventory_count_session_locations l
      where l.session_id = p_session_id
        and l.workspace_id = p_workspace_id
    )
    and (
      v_session.include_inactive
      or si.active is true
    )
    and (
      v_session.include_zero_stock
      or coalesce(si.current_quantity, 0) <> 0
    );

  get diagnostics v_items_created = row_count;

  -- P8.21.2: never freeze an empty inventory count. Raising here rolls back the
  -- insert above and leaves sessions.snapshot_at unset.
  if v_items_created < 1 then
    raise exception 'inventory_count_snapshot_empty';
  end if;

  -- Authoritative freeze timestamp (same transaction; null → timestamp allowed)
  update public.inventory_count_sessions s
  set
    snapshot_at = v_snapshot_created_at,
    updated_at = v_snapshot_created_at
  where s.id = p_session_id
    and s.workspace_id = p_workspace_id
    and s.snapshot_at is null;

  if not found then
    raise exception 'inventory_count_snapshot_already_exists';
  end if;

  return query
  select
    p_session_id,
    v_items_created,
    v_snapshot_created_at;
end;
$$;

revoke all on function public.build_inventory_count_snapshot(uuid, uuid) from public;
grant execute on function public.build_inventory_count_snapshot(uuid, uuid) to authenticated;

comment on function public.build_inventory_count_snapshot(uuid, uuid) is
  'P8.3.2/P8.3.9c/P8.21.2 SECURITY DEFINER freeze stock_items into session items and set sessions.snapshot_at. Rejects empty snapshots. No counting, posting, or stock mutations.';

-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.build_inventory_count_snapshot(uuid, uuid);

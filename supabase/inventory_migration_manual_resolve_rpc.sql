-- =============================================================================
-- P8.6.2 — Inventory Migration Manual Resolution RPC foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_migration_sessions.sql
--   2. inventory_migration_activity.sql
--   3. inventory_stock_item_map.sql
--   4. inventory_migration_persist_rpc.sql (produces manual/classified rows)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Operator resolves a single map row classified as manual (or classified)
--   without inventing a new session step. Ad-hoc SECURITY DEFINER RPC.
--
-- Supported actions:
--   approve_candidate → linked + manual_link + validated stock_item_id
--   force_create      → classified + manual_create + stock_item_id null
--                       (queues for Auto-create; does NOT insert stock_items)
--   skip              → skipped + skip + stock_item_id null
--   reset_manual      → manual + null resolution + stock_item_id null
--
-- Does NOT:
--   - Create/update stock_items (including quantities)
--   - Create stock_movements
--   - Write migrated_at / source_snapshot / source_hash
--   - Write step_results or invent a new step_name
--   - Bulk-update map rows
--   - Modify Persist / Auto-link / Auto-create / Phase 1 / Phase 2
--
-- Map rows have no session_id; ownership uses workspace + running session
-- (same boundary as Persist stage RPCs).
-- =============================================================================

drop function if exists public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid);

create or replace function public.run_inventory_migration_manual_resolve(
  p_workspace_id uuid,
  p_session_id uuid,
  p_map_id uuid,
  p_action text,
  p_stock_item_id uuid default null
)
returns table (
  success boolean,
  changed boolean,
  idempotent boolean,
  action text,
  map_id uuid,
  legacy_inventory_item_id uuid,
  workspace_id uuid,
  session_id uuid,
  previous_status text,
  status text,
  previous_resolution_type text,
  resolution_type text,
  previous_stock_item_id uuid,
  stock_item_id uuid,
  activity_written boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_operator_display_name text := '';
  v_session public.inventory_migration_sessions%rowtype;
  v_map public.inventory_stock_item_map%rowtype;

  v_action text := lower(btrim(coalesce(p_action, '')));
  v_target_status text;
  v_target_resolution text;
  v_target_stock_item_id uuid;
  v_resolved_stock_item_id uuid;
  v_stock_ok boolean := false;

  v_changed boolean := false;
  v_idempotent boolean := false;
  v_activity_written boolean := false;
  v_activity_text text;
  v_message text;
begin
  if v_auth_user_id is null then
    raise exception 'inventory_migration_manual_resolve_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'inventory_migration_manual_resolve_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_migration_manual_resolve_session_required';
  end if;

  if p_map_id is null then
    raise exception 'inventory_migration_manual_resolve_map_required';
  end if;

  if v_action not in ('approve_candidate', 'force_create', 'skip', 'reset_manual') then
    raise exception 'inventory_migration_manual_resolve_unsupported_action';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_migration_manual_resolve_workspace_not_found';
  end if;

  if not public.can_manage_workspace_stock(p_workspace_id) then
    raise exception 'inventory_migration_manual_resolve_forbidden';
  end if;

  select coalesce(nullif(btrim(wm.display_name), ''), '')
  into v_operator_display_name
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.auth_user_id = v_auth_user_id
  limit 1;

  if v_operator_display_name is null then
    v_operator_display_name := '';
  end if;

  -- Lock order 1: running session (workspace boundary; map has no session_id).
  select s.*
  into v_session
  from public.inventory_migration_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'inventory_migration_manual_resolve_session_not_found';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_migration_manual_resolve_session_workspace_mismatch';
  end if;

  if v_session.status is distinct from 'running' then
    raise exception 'inventory_migration_manual_resolve_session_not_running';
  end if;

  -- Lock order 2: selected map row only.
  select m.*
  into v_map
  from public.inventory_stock_item_map m
  where m.id = p_map_id
    and m.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'inventory_migration_manual_resolve_map_not_found';
  end if;

  if v_map.migrated_at is not null then
    raise exception 'inventory_migration_manual_resolve_migrated_protected';
  end if;

  -- Resolve approve_candidate stock identity before transition checks.
  if v_action = 'approve_candidate' then
    v_resolved_stock_item_id := coalesce(p_stock_item_id, v_map.stock_item_id);

    if v_resolved_stock_item_id is null then
      raise exception 'inventory_migration_manual_resolve_stock_item_required';
    end if;

    if p_stock_item_id is not null
       and v_map.stock_item_id is not null
       and p_stock_item_id is distinct from v_map.stock_item_id then
      raise exception 'inventory_migration_manual_resolve_stock_item_conflict';
    end if;

    select exists (
      select 1
      from public.stock_items s
      where s.id = v_resolved_stock_item_id
        and s.workspace_id = p_workspace_id
    )
    into v_stock_ok;

    if not v_stock_ok then
      raise exception 'inventory_migration_manual_resolve_stock_item_invalid';
    end if;
  end if;

  -- Target state per action.
  if v_action = 'approve_candidate' then
    v_target_status := 'linked';
    v_target_resolution := 'manual_link';
    v_target_stock_item_id := v_resolved_stock_item_id;
  elsif v_action = 'force_create' then
    v_target_status := 'classified';
    v_target_resolution := 'manual_create';
    v_target_stock_item_id := null;
  elsif v_action = 'skip' then
    v_target_status := 'skipped';
    v_target_resolution := 'skip';
    v_target_stock_item_id := null;
  else
    -- reset_manual
    v_target_status := 'manual';
    v_target_resolution := null;
    v_target_stock_item_id := null;
  end if;

  -- Exact effective-state retry → idempotent success (no activity).
  if v_map.status is not distinct from v_target_status
     and v_map.resolution_type is not distinct from v_target_resolution
     and v_map.stock_item_id is not distinct from v_target_stock_item_id then
    v_idempotent := true;
    v_changed := false;
    v_activity_written := false;
    v_message := format(
      'Manual resolve idempotent: action=%s map_id=%s already at %s/%s',
      v_action,
      v_map.id,
      v_map.status,
      coalesce(v_map.resolution_type, 'null')
    );

    success := true;
    changed := v_changed;
    idempotent := v_idempotent;
    action := v_action;
    map_id := v_map.id;
    legacy_inventory_item_id := v_map.legacy_inventory_item_id;
    workspace_id := p_workspace_id;
    session_id := v_session.id;
    previous_status := v_map.status;
    status := v_map.status;
    previous_resolution_type := v_map.resolution_type;
    resolution_type := v_map.resolution_type;
    previous_stock_item_id := v_map.stock_item_id;
    stock_item_id := v_map.stock_item_id;
    activity_written := v_activity_written;
    message := v_message;
    return next;
    return;
  end if;

  -- Finalized mapping states: no mutation to a different action/identity.
  if v_map.status in ('created', 'linked') then
    raise exception 'inventory_migration_manual_resolve_finalized_protected';
  end if;

  -- reset_manual must not reopen skipped.
  if v_action = 'reset_manual' and v_map.status = 'skipped' then
    raise exception 'inventory_migration_manual_resolve_reset_from_skipped';
  end if;

  -- Transition sources: manual or classified only.
  if v_map.status not in ('manual', 'classified') then
    raise exception 'inventory_migration_manual_resolve_invalid_source_status';
  end if;

  update public.inventory_stock_item_map m
  set
    status = v_target_status,
    resolution_type = v_target_resolution,
    stock_item_id = v_target_stock_item_id,
    updated_at = now()
  where m.id = v_map.id
    and m.workspace_id = p_workspace_id;

  if not found then
    raise exception 'inventory_migration_manual_resolve_update_failed';
  end if;

  v_changed := true;
  v_idempotent := false;

  v_activity_text := format(
    'Manual resolve: action=%s map_id=%s legacy=%s %s/%s/%s → %s/%s/%s',
    v_action,
    v_map.id,
    v_map.legacy_inventory_item_id,
    v_map.status,
    coalesce(v_map.resolution_type, 'null'),
    coalesce(v_map.stock_item_id::text, 'null'),
    v_target_status,
    coalesce(v_target_resolution, 'null'),
    coalesce(v_target_stock_item_id::text, 'null')
  );

  insert into public.inventory_migration_activity (
    session_id,
    workspace_id,
    activity_type,
    activity_text,
    created_by,
    operator_display_name
  )
  values (
    v_session.id,
    p_workspace_id,
    'note',
    v_activity_text,
    v_auth_user_id,
    v_operator_display_name
  );

  v_activity_written := true;
  v_message := format(
    'Manual resolve applied: action=%s map_id=%s → %s/%s',
    v_action,
    v_map.id,
    v_target_status,
    coalesce(v_target_resolution, 'null')
  );

  success := true;
  changed := v_changed;
  idempotent := v_idempotent;
  action := v_action;
  map_id := v_map.id;
  legacy_inventory_item_id := v_map.legacy_inventory_item_id;
  workspace_id := p_workspace_id;
  session_id := v_session.id;
  previous_status := v_map.status;
  status := v_target_status;
  previous_resolution_type := v_map.resolution_type;
  resolution_type := v_target_resolution;
  previous_stock_item_id := v_map.stock_item_id;
  stock_item_id := v_target_stock_item_id;
  activity_written := v_activity_written;
  message := v_message;
  return next;
end;
$$;

revoke all on function public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid) from public;
revoke all on function public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid) from anon;
grant execute on function public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid) to authenticated;

comment on function public.run_inventory_migration_manual_resolve(uuid, uuid, uuid, text, uuid) is
  'P8.6.2 Manual Resolution: single-row map transitions (approve_candidate/force_create/skip/reset_manual) under a running migration session. No stock create, quantities, movements, step_results, or step_name. Idempotent exact retries write no activity.';

-- =============================================================================
-- Staff shelf count (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Staff can start and fill a count for exactly one shelf. Hosts stay blocked.
-- Managers are unchanged. Posting, deleting, reversing, and multi-location
-- counts stay manager-only. Completing the single shelf does not change stock.
--
-- Does NOT:
--   - Grant staff stock receive, transfer, adjustment, or post
--   - Change count keyboard, scroll, or runway behavior
--
-- Prerequisite: inventory count session, snapshot, item, and complete-location
-- functions already applied.
-- Verify: supabase/inventory_count_staff_shelf_verify.sql
-- Rollback: supabase/inventory_count_staff_shelf_rollback.sql
-- =============================================================================

begin;

create or replace function public.is_workspace_staff_counter(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role = 'staff'
  );
$$;

revoke all on function public.is_workspace_staff_counter(uuid) from public;
grant execute on function public.is_workspace_staff_counter(uuid) to authenticated;

create or replace function public.can_staff_edit_shelf_count(
  target_workspace_id uuid,
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_staff_counter(target_workspace_id)
    and exists (
      select 1
      from public.inventory_count_sessions s
      where s.id = target_session_id
        and s.workspace_id = target_workspace_id
        and lower(s.count_type) = 'partial'
        and s.status in ('in_progress', 'paused')
        and (
          select count(*)
          from public.inventory_count_session_locations l
          where l.session_id = s.id
            and l.workspace_id = s.workspace_id
        ) = 1
    );
$$;

revoke all on function public.can_staff_edit_shelf_count(uuid, uuid) from public;
grant execute on function public.can_staff_edit_shelf_count(uuid, uuid) to authenticated;

create or replace function public.create_inventory_count_session(
  p_workspace_id uuid,
  p_count_type text,
  p_visibility text,
  p_include_zero_stock boolean,
  p_include_inactive boolean,
  p_note text,
  p_locations text[]
)
returns table (
  id uuid,
  workspace_id uuid,
  status text,
  count_type text,
  visibility text,
  include_zero_stock boolean,
  include_inactive boolean,
  note text,
  started_by uuid,
  started_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace_exists boolean := false;
  v_is_member boolean := false;
  v_normalized_note text := '';
  v_normalized_count_type text := '';
  v_normalized_visibility text := '';
  v_include_zero_stock boolean := coalesce(p_include_zero_stock, true);
  v_include_inactive boolean := coalesce(p_include_inactive, false);
  v_location_count integer := 0;
  v_duplicate_count integer := 0;
  v_empty_location_count integer := 0;
  v_session public.inventory_count_sessions%rowtype;
  v_note_max_length constant integer := 250;
  v_current_location_count integer := 0;
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_session_unauthenticated';
  end if;

  -- Required workspace
  if p_workspace_id is null then
    raise exception 'inventory_count_session_workspace_required';
  end if;

  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  )
  into v_workspace_exists;

  if not v_workspace_exists then
    raise exception 'inventory_count_session_workspace_not_found';
  end if;

  -- Membership
  v_is_member := public.is_workspace_member(p_workspace_id);
  if not v_is_member then
    raise exception 'inventory_count_session_forbidden';
  end if;


  -- count_type
  v_normalized_count_type := lower(btrim(coalesce(p_count_type, '')));
  if v_normalized_count_type not in (
    'new',
    'quick',
    'partial',
    'scheduled',
    'emergency'
  ) then
    raise exception 'inventory_count_session_invalid_count_type';
  end if;

  -- visibility
  v_normalized_visibility := lower(btrim(coalesce(p_visibility, '')));
  if v_normalized_visibility not in ('blind', 'open') then
    raise exception 'inventory_count_session_invalid_visibility';
  end if;

  -- note
  v_normalized_note := coalesce(p_note, '');
  if char_length(v_normalized_note) > v_note_max_length then
    raise exception 'inventory_count_session_note_too_long';
  end if;

  -- locations required + non-empty keys
  if p_locations is null or coalesce(array_length(p_locations, 1), 0) = 0 then
    raise exception 'inventory_count_session_locations_required';
  end if;

  select count(*)::integer
  into v_empty_location_count
  from unnest(p_locations) as loc(location_key)
  where btrim(coalesce(loc.location_key, '')) = '';

  if v_empty_location_count > 0 then
    raise exception 'inventory_count_session_invalid_location';
  end if;

  -- duplicate locations rejected (trimmed exact match)
  select count(*)::integer
  into v_location_count
  from (
    select btrim(loc.location_key) as location_key
    from unnest(p_locations) as loc(location_key)
  ) normalized;

  select count(*)::integer
  into v_duplicate_count
  from (
    select btrim(loc.location_key) as location_key
    from unnest(p_locations) as loc(location_key)
    group by btrim(loc.location_key)
    having count(*) > 1
  ) duplicates;

  if v_duplicate_count > 0 then
    raise exception 'inventory_count_session_duplicate_locations';
  end if;

  if v_location_count < 1 then
    raise exception 'inventory_count_session_locations_required';
  end if;

  -- Managers count any session. Staff may count exactly one shelf.
  if not public.can_manage_workspace_stock(p_workspace_id) then
    if not public.is_workspace_staff_counter(p_workspace_id)
      or v_normalized_count_type <> 'partial'
      or v_location_count <> 1
    then
      raise exception 'inventory_count_session_forbidden';
    end if;
  end if;

  -- Atomic session + locations inserts (same function transaction)
  insert into public.inventory_count_sessions (
    workspace_id,
    status,
    count_type,
    visibility,
    include_zero_stock,
    include_inactive,
    note,
    started_by,
    started_at,
    post_idempotency_key
  )
  values (
    p_workspace_id,
    'in_progress',
    v_normalized_count_type,
    v_normalized_visibility,
    v_include_zero_stock,
    v_include_inactive,
    v_normalized_note,
    v_auth_user_id,
    now(),
    null
  )
  returning * into v_session;

  insert into public.inventory_count_session_locations (
    session_id,
    workspace_id,
    location_key,
    sort_order,
    status
  )
  select
    v_session.id,
    p_workspace_id,
    btrim(loc.location_key),
    (ordinality - 1)::integer,
    case
      when ordinality = 1 then 'current'
      else 'not_started'
    end
  from unnest(p_locations) with ordinality as loc(location_key, ordinality);

  -- P8.16.34: in_progress create must leave exactly one current location.
  select count(*)::integer
  into v_current_location_count
  from public.inventory_count_session_locations l
  where l.session_id = v_session.id
    and l.workspace_id = p_workspace_id
    and l.status = 'current';

  if v_current_location_count is distinct from 1 then
    raise exception 'inventory_count_session_current_invariant'
      using hint = 'Created in_progress session must have exactly one current location.';
  end if;

  return query
  select
    v_session.id,
    v_session.workspace_id,
    v_session.status,
    v_session.count_type,
    v_session.visibility,
    v_session.include_zero_stock,
    v_session.include_inactive,
    v_session.note,
    v_session.started_by,
    v_session.started_at,
    v_session.created_at;
end;
$$;

revoke all on function public.create_inventory_count_session(
  uuid,
  text,
  text,
  boolean,
  boolean,
  text,
  text[]
) from public;

grant execute on function public.create_inventory_count_session(
  uuid,
  text,
  text,
  boolean,
  boolean,
  text,
  text[]
) to authenticated;

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
  if not public.can_manage_workspace_stock(p_workspace_id)
    and not public.can_staff_edit_shelf_count(p_workspace_id, p_session_id)
  then
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

  -- Atomic snapshot insert from live location balances (never from client).
  -- One session line per (item, location_key) balance in selected session locations.
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
    b.location_key,
    coalesce(b.quantity, 0),
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
  from public.stock_item_location_balances b
  inner join public.stock_items si
    on si.id = b.stock_item_id
   and si.workspace_id = b.workspace_id
  where b.workspace_id = p_workspace_id
    and b.location_key in (
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
      or coalesce(b.quantity, 0) <> 0
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

create or replace function public.update_inventory_count_session_item(
  p_workspace_id uuid,
  p_session_id uuid,
  p_session_item_id uuid,
  p_counted_quantity numeric
)
returns table (
  id uuid,
  session_id uuid,
  workspace_id uuid,
  item_id uuid,
  counted_quantity numeric,
  counted_at timestamptz,
  line_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_item public.inventory_count_session_items%rowtype;
  v_now timestamptz := now();
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_item_unauthenticated';
  end if;

  -- Required ids
  if p_workspace_id is null then
    raise exception 'inventory_count_item_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_item_session_required';
  end if;

  if p_session_item_id is null then
    raise exception 'inventory_count_item_session_item_required';
  end if;

  -- Authorization (owner / general_manager / manager)
  -- Operator identity is never accepted from the client.
  if not public.can_manage_workspace_stock(p_workspace_id)
    and not public.can_staff_edit_shelf_count(p_workspace_id, p_session_id)
  then
    raise exception 'inventory_count_item_forbidden';
  end if;

  -- Quantity validation (NULL clears the count)
  if p_counted_quantity is not null and p_counted_quantity < 0 then
    raise exception 'inventory_count_item_invalid_quantity';
  end if;

  -- Lock parent session and enforce lifecycle
  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'inventory_count_item_session_not_found';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_item_workspace_mismatch';
  end if;

  if v_session.status is distinct from 'in_progress' then
    raise exception 'inventory_count_item_session_not_in_progress';
  end if;

  -- Lock target session-item line (identity is session item row id)
  select i.*
  into v_item
  from public.inventory_count_session_items i
  where i.id = p_session_item_id
  for update;

  if not found then
    raise exception 'inventory_count_item_not_found';
  end if;

  if v_item.session_id is distinct from p_session_id
     or v_item.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_item_session_mismatch';
  end if;

  if p_counted_quantity is null then
    return query
    update public.inventory_count_session_items i
    set
      counted_quantity = null,
      counted_at = null,
      line_status = 'pending',
      updated_at = v_now
    where i.id = p_session_item_id
    returning
      i.id,
      i.session_id,
      i.workspace_id,
      i.item_id,
      i.counted_quantity,
      i.counted_at,
      i.line_status,
      i.updated_at;
  else
    return query
    update public.inventory_count_session_items i
    set
      counted_quantity = p_counted_quantity,
      counted_at = v_now,
      line_status = 'counted',
      updated_at = v_now
    where i.id = p_session_item_id
    returning
      i.id,
      i.session_id,
      i.workspace_id,
      i.item_id,
      i.counted_quantity,
      i.counted_at,
      i.line_status,
      i.updated_at;
  end if;
end;
$$;

revoke all on function public.update_inventory_count_session_item(
  uuid,
  uuid,
  uuid,
  numeric
) from public;

grant execute on function public.update_inventory_count_session_item(
  uuid,
  uuid,
  uuid,
  numeric
) to authenticated;

create or replace function public.complete_inventory_count_location(
  p_workspace_id uuid,
  p_session_id uuid,
  p_location_id uuid
)
returns table (
  session_id uuid,
  completed_location_id uuid,
  next_location_id uuid,
  session_status text,
  all_locations_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_session public.inventory_count_sessions%rowtype;
  v_location public.inventory_count_session_locations%rowtype;
  v_next_location public.inventory_count_session_locations%rowtype;
  v_pending_item_count integer := 0;
  v_now timestamptz := now();
begin
  -- Authentication
  if v_auth_user_id is null then
    raise exception 'inventory_count_location_unauthenticated';
  end if;

  -- Required ids
  if p_workspace_id is null then
    raise exception 'inventory_count_location_workspace_required';
  end if;

  if p_session_id is null then
    raise exception 'inventory_count_location_session_required';
  end if;

  if p_location_id is null then
    raise exception 'inventory_count_location_location_required';
  end if;

  -- Authorization (owner / general_manager / manager)
  -- Operator identity is never accepted from the client.
  if not public.can_manage_workspace_stock(p_workspace_id)
    and not public.can_staff_edit_shelf_count(p_workspace_id, p_session_id)
  then
    raise exception 'inventory_count_location_forbidden';
  end if;

  -- Lock parent session and enforce lifecycle
  select s.*
  into v_session
  from public.inventory_count_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'inventory_count_location_session_not_found';
  end if;

  if v_session.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_location_workspace_mismatch';
  end if;

  if v_session.status is distinct from 'in_progress' then
    raise exception 'inventory_count_location_session_not_in_progress';
  end if;

  -- Lock target location (identity is session location row id)
  select l.*
  into v_location
  from public.inventory_count_session_locations l
  where l.id = p_location_id
  for update;

  if not found then
    raise exception 'inventory_count_location_not_found';
  end if;

  if v_location.session_id is distinct from p_session_id
     or v_location.workspace_id is distinct from p_workspace_id then
    raise exception 'inventory_count_location_session_mismatch';
  end if;

  if v_location.status is distinct from 'current' then
    raise exception 'inventory_count_location_not_current';
  end if;

  -- All items for this location must be counted or skipped
  select count(*)::integer
  into v_pending_item_count
  from public.inventory_count_session_items i
  where i.session_id = p_session_id
    and i.workspace_id = p_workspace_id
    and i.storage_location = v_location.location_key
    and i.line_status not in ('counted', 'skipped');

  if v_pending_item_count > 0 then
    raise exception 'inventory_count_location_items_pending';
  end if;

  -- Mark current location completed
  update public.inventory_count_session_locations l
  set status = 'completed'
  where l.id = p_location_id;

  -- Find next not_started location by sort_order
  select l.*
  into v_next_location
  from public.inventory_count_session_locations l
  where l.session_id = p_session_id
    and l.workspace_id = p_workspace_id
    and l.status = 'not_started'
  order by l.sort_order asc, l.created_at asc, l.id asc
  limit 1
  for update;

  if found then
    update public.inventory_count_session_locations l
    set status = 'current'
    where l.id = v_next_location.id;

    return query
    select
      p_session_id,
      p_location_id,
      v_next_location.id,
      v_session.status,
      false;
    return;
  end if;

  -- No remaining locations: mark session counting_complete
  update public.inventory_count_sessions s
  set
    status = 'counting_complete',
    updated_at = v_now
  where s.id = p_session_id;

  return query
  select
    p_session_id,
    p_location_id,
    null::uuid,
    'counting_complete'::text,
    true;
end;
$$;

revoke all on function public.complete_inventory_count_location(
  uuid,
  uuid,
  uuid
) from public;

grant execute on function public.complete_inventory_count_location(
  uuid,
  uuid,
  uuid
) to authenticated;

commit;

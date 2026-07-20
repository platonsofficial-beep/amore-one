-- =============================================================================
-- P8.3.1 — Create Inventory Count Session RPC foundation
-- =============================================================================
-- Run manually in the Supabase SQL editor after:
--   1. inventory_count_schema.sql (P8.3.0)
--   2. inventory_count_rls_policies.sql (P8.3.0)
-- Do NOT auto-run from the app.
--
-- Purpose:
--   Atomic SECURITY DEFINER entry point that creates one inventory_count_sessions
--   row and its inventory_count_session_locations rows in a single transaction.
--   The first validated location (input array order / sort_order 0) is inserted
--   as status = current; every remaining location is not_started.
--
-- Does NOT:
--   - Create inventory_count_session_items / snapshot lines
--   - Mutate stock_items or stock_movements
--   - Post counts
--   - Wire UI / services
--   - Repair or rewrite existing sessions
--
-- Authorization:
--   owner / general_manager / manager via public.can_manage_workspace_stock
--
-- Prerequisites:
--   1. public.inventory_count_sessions exists
--   2. public.inventory_count_session_locations exists
--   3. public.can_manage_workspace_stock(uuid) exists
--   4. public.is_workspace_member(uuid) exists
--   5. public.workspaces / public.workspace_members exist
-- =============================================================================

drop function if exists public.create_inventory_count_session(
  uuid,
  text,
  text,
  boolean,
  boolean,
  text,
  text[]
);

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

  -- Authorization (owner / general_manager / manager)
  if not public.can_manage_workspace_stock(p_workspace_id) then
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

comment on function public.create_inventory_count_session(
  uuid,
  text,
  text,
  boolean,
  boolean,
  text,
  text[]
) is
  'P8.3.1/P8.3.7a SECURITY DEFINER create inventory count session + locations. First location (input order / sort_order 0) is current; remaining are not_started. No snapshot items, stock mutations, or posting.';

-- =============================================================================
-- Verification (commented — run after apply; do not auto-execute)
-- =============================================================================

-- Function present
-- select pg_get_functiondef(
--   'public.create_inventory_count_session(uuid, text, text, boolean, boolean, text, text[])'::regprocedure
-- );

-- Expect SECURITY DEFINER
-- select prosecdef
-- from pg_proc
-- where oid = 'public.create_inventory_count_session(uuid, text, text, boolean, boolean, text, text[])'::regprocedure;

-- Grants (expect authenticated EXECUTE; no public)
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name = 'create_inventory_count_session';

-- Manual role matrix (authenticated client / SQL as that role):
--   unauthenticated              → inventory_count_session_unauthenticated
--   non-member                   → inventory_count_session_forbidden
--   host / staff member          → inventory_count_session_forbidden
--   owner / general_manager /
--     manager                    → success (session + location rows)
--   empty locations              → inventory_count_session_locations_required
--   duplicate locations          → inventory_count_session_duplicate_locations
--   invalid count_type           → inventory_count_session_invalid_count_type
--   invalid visibility           → inventory_count_session_invalid_visibility
--   note > 250 chars             → inventory_count_session_note_too_long
-- Atomicity: failed location insert rolls back the session row (same transaction).
-- Location bootstrap (P8.3.7a):
--   first p_locations element (ordinality 1 / sort_order 0) → status = current
--   remaining locations → status = not_started
--   exactly one current location per newly created session

-- Example:
--   select * from public.create_inventory_count_session(
--     '<workspace_uuid>',
--     'new',
--     'blind',
--     true,
--     false,
--     'Month-end bar audit',
--     array['Main Storage', 'Bar', 'Kitchen']
--   );
-- =============================================================================
-- Rollback (emergency only)
-- =============================================================================
-- drop function if exists public.create_inventory_count_session(
--   uuid, text, text, boolean, boolean, text, text[]
-- );

-- Run with explicit owner approval
-- =============================================================================
-- Staff shelf count (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Staff submit the quantities on one shelf. This writes a partial Inventory
-- Count session in counting_complete and does not change balances.
-- A manager approves it with the existing post_inventory_count_finish
-- (Inventory Count → Post Count). That function stays manager-only.
--
-- Does NOT:
--   - Replace create, snapshot, complete-location, or post functions
--   - Grant staff receive, transfer, adjustment, or post
--   - Read or return cost
--   - Change count keyboard, scroll, or runway behavior
--
-- Prerequisite: inventory count sessions, snapshot_at, location balances,
-- and workspace_storages.is_supply are already applied.
-- Verify: supabase/inventory_count_staff_shelf_submit_verify.sql
-- Rollback: supabase/inventory_count_staff_shelf_submit_rollback.sql
-- =============================================================================

begin;

create or replace function public.submit_staff_shelf_count(
  p_workspace_id uuid,
  p_workspace_storage_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_storage public.workspace_storages%rowtype;
  v_line jsonb;
  v_item_id uuid;
  v_qty_text text;
  v_qty numeric(12, 3);
  v_submitted jsonb := '{}'::jsonb;
  v_expected jsonb := '{}'::jsonb;
  v_submitted_keys jsonb;
  v_expected_keys jsonb;
  v_session_id uuid;
  v_line_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'staff_shelf_count_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'staff_shelf_count_workspace_required';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
  ) then
    raise exception 'staff_shelf_count_workspace_not_found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.auth_user_id = v_auth_user_id
      and wm.role = 'staff'
  ) then
    raise exception 'staff_shelf_count_forbidden';
  end if;

  if p_workspace_storage_id is null then
    raise exception 'staff_shelf_count_storage_required';
  end if;

  select s.*
  into v_storage
  from public.workspace_storages s
  where s.id = p_workspace_storage_id
    and s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'staff_shelf_count_storage_not_found';
  end if;

  if v_storage.active is distinct from true then
    raise exception 'staff_shelf_count_storage_inactive';
  end if;

  if v_storage.is_supply is true then
    raise exception 'staff_shelf_count_not_a_shelf';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1 then
    raise exception 'staff_shelf_count_lines_required';
  end if;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'staff_shelf_count_line_invalid';
    end if;

    begin
      v_item_id := (v_line ->> 'stock_item_id')::uuid;
    exception
      when others then
        raise exception 'staff_shelf_count_line_invalid';
    end;

    if v_item_id is null then
      raise exception 'staff_shelf_count_line_invalid';
    end if;

    if v_submitted ? v_item_id::text then
      raise exception 'staff_shelf_count_line_invalid';
    end if;

    v_qty_text := btrim(coalesce(v_line ->> 'counted_quantity', ''));
    if v_qty_text !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' then
      raise exception 'staff_shelf_count_quantity_invalid';
    end if;

    v_qty := round(v_qty_text::numeric, 3);
    if v_qty < 0 or v_qty > 999999999.999 then
      raise exception 'staff_shelf_count_quantity_invalid';
    end if;

    v_submitted := v_submitted || jsonb_build_object(v_item_id::text, v_qty);
  end loop;

  if exists (
    select 1
    from public.inventory_count_sessions session_row
    inner join public.inventory_count_session_locations location_row
      on location_row.session_id = session_row.id
     and location_row.workspace_id = session_row.workspace_id
    where session_row.workspace_id = p_workspace_id
      and session_row.note = 'Staff shelf count'
      and session_row.status in ('in_progress', 'paused', 'counting_complete')
      and location_row.location_key = v_storage.location_key
  ) then
    raise exception 'staff_shelf_count_already_waiting';
  end if;

  select coalesce(
    jsonb_object_agg(b.stock_item_id::text, coalesce(b.quantity, 0)),
    '{}'::jsonb
  )
  into v_expected
  from public.stock_item_location_balances b
  inner join public.stock_items si
    on si.id = b.stock_item_id
   and si.workspace_id = b.workspace_id
  where b.workspace_id = p_workspace_id
    and b.location_key = v_storage.location_key
    and si.active is true;

  if v_expected = '{}'::jsonb then
    raise exception 'staff_shelf_count_empty';
  end if;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into v_submitted_keys
  from jsonb_object_keys(v_submitted) as key;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into v_expected_keys
  from jsonb_object_keys(v_expected) as key;

  if v_submitted_keys is distinct from v_expected_keys then
    raise exception 'staff_shelf_count_lines_mismatch';
  end if;

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
    completed_at,
    snapshot_at,
    created_at,
    updated_at
  ) values (
    p_workspace_id,
    'counting_complete',
    'partial',
    'open',
    true,
    false,
    'Staff shelf count',
    v_auth_user_id,
    v_now,
    v_now,
    v_now,
    v_now,
    v_now
  )
  returning id into v_session_id;

  insert into public.inventory_count_session_locations (
    session_id,
    workspace_id,
    location_key,
    sort_order,
    status,
    created_at
  ) values (
    v_session_id,
    p_workspace_id,
    v_storage.location_key,
    0,
    'completed',
    v_now
  );

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
    line_status,
    note,
    created_at,
    updated_at
  )
  select
    v_session_id,
    p_workspace_id,
    si.id,
    si.name,
    coalesce(si.category, 'Other'),
    coalesce(si.item_type, 'Other'),
    coalesce(si.unit, ''),
    b.location_key,
    coalesce(b.quantity, 0),
    (v_submitted ->> si.id::text)::numeric(12, 3),
    v_now,
    'counted',
    '',
    v_now,
    v_now
  from public.stock_item_location_balances b
  inner join public.stock_items si
    on si.id = b.stock_item_id
   and si.workspace_id = b.workspace_id
  where b.workspace_id = p_workspace_id
    and b.location_key = v_storage.location_key
    and si.active is true;

  get diagnostics v_line_count = row_count;

  if v_line_count < 1 then
    raise exception 'staff_shelf_count_empty';
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'storage_name', v_storage.name,
    'location_key', v_storage.location_key,
    'line_count', v_line_count,
    'status', 'counting_complete',
    'submitted_at', v_now
  );
end;
$$;

revoke all on function public.submit_staff_shelf_count(uuid, uuid, jsonb) from public;
revoke all on function public.submit_staff_shelf_count(uuid, uuid, jsonb) from anon;
grant execute on function public.submit_staff_shelf_count(uuid, uuid, jsonb) to authenticated;

comment on function public.submit_staff_shelf_count(uuid, uuid, jsonb) is
  'Staff submit one shelf count. Creates a counting_complete partial Inventory Count session. Does not change balances or read cost. Does not post.';

commit;

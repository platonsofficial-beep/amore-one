-- Staff leave request RPC.
-- Prerequisite: leave_requests_schema.sql and leave_requests_rls_policies.sql applied.
-- Run in the Supabase SQL editor after the Leave foundation files.
--
-- Secure write entry point for staff/host self-service Leave requests.
-- Authenticated clients must not insert directly into public.leave_requests.
-- Actor identity and workspace membership are derived from auth.uid().
-- p_workspace_id is routing context only; employee_id and created_by are never
-- accepted from the client.
--
-- Workspace timezone (v1):
--   public.workspace_profiles has no FK to public.workspaces.id.
--   The application loads timezone from workspace_profiles.workspace_key.
--   Resolution order for a target workspace:
--     1) workspace_profiles.workspace_key = workspaces.slug
--     2) v1 singleton fallback: workspace_profiles.workspace_key = 'default'
--   This matches workspaceProfileService.js (WORKSPACE_KEY = 'default') and
--   App.jsx workspaceTimeZone until per-workspace profile rows exist.

drop function if exists public.request_leave(text, date, date, text);

create or replace function public.request_leave(
  p_workspace_id uuid,
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_note text default ''
)
returns table (
  id uuid,
  workspace_id uuid,
  employee_id uuid,
  status text,
  leave_type text,
  start_date date,
  end_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_workspace public.workspaces%rowtype;
  v_member public.workspace_members%rowtype;
  v_employee public.employees%rowtype;
  v_membership_count integer := 0;
  v_leave_type text;
  v_note text;
  v_timezone text;
  v_workspace_today date;
  v_inclusive_duration integer;
  v_allowed_leave_types constant text[] := array[
    'vacation',
    'sick',
    'personal',
    'unpaid',
    'training',
    'emergency',
    'bereavement',
    'other'
  ];
begin
  if v_auth_user_id is null then
    raise exception 'leave_request_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'leave_request_workspace_required';
  end if;

  select w.*
  into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found then
    raise exception 'leave_request_workspace_not_found';
  end if;

  select count(*)
  into v_membership_count
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_membership_count = 0 then
    raise exception 'leave_request_membership_not_found';
  end if;

  if v_membership_count > 1 then
    raise exception 'leave_request_duplicate_workspace_membership';
  end if;

  select wm.*
  into v_member
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_member.employee_id is null then
    raise exception 'leave_request_employee_not_linked';
  end if;

  select e.*
  into v_employee
  from public.employees e
  where e.id = v_member.employee_id
  for update;

  if not found then
    raise exception 'leave_request_employee_not_found';
  end if;

  if v_employee.workspace_id is distinct from p_workspace_id then
    raise exception 'leave_request_workspace_mismatch';
  end if;

  v_leave_type := lower(btrim(coalesce(p_leave_type, '')));

  if v_leave_type = '' then
    raise exception 'leave_request_invalid_leave_type';
  end if;

  if not (v_leave_type = any (v_allowed_leave_types)) then
    raise exception 'leave_request_invalid_leave_type';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'leave_request_invalid_date_range';
  end if;

  if p_end_date < p_start_date then
    raise exception 'leave_request_invalid_date_range';
  end if;

  v_inclusive_duration := (p_end_date - p_start_date) + 1;

  if v_inclusive_duration > 365 then
    raise exception 'leave_request_duration_exceeds_limit';
  end if;

  select coalesce(
    (
      select wp.timezone
      from public.workspace_profiles wp
      where wp.workspace_key = v_workspace.slug
      limit 1
    ),
    (
      select wp.timezone
      from public.workspace_profiles wp
      where wp.workspace_key = 'default'
      limit 1
    )
  )
  into v_timezone;

  if v_timezone is null or btrim(v_timezone) = '' then
    raise exception 'leave_request_workspace_timezone_missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names tz
    where tz.name = v_timezone
  ) then
    raise exception 'leave_request_workspace_timezone_invalid';
  end if;

  v_workspace_today := (timezone(v_timezone, now()))::date;

  if p_end_date < v_workspace_today then
    raise exception 'leave_request_past_date_range';
  end if;

  v_note := coalesce(btrim(p_note), '');

  if exists (
    select 1
    from public.leave_requests lr
    where lr.workspace_id = p_workspace_id
      and lr.employee_id = v_member.employee_id
      and lr.status in ('pending', 'approved')
      and lr.start_date <= p_end_date
      and lr.end_date >= p_start_date
  ) then
    raise exception 'leave_request_overlap';
  end if;

  return query
  insert into public.leave_requests (
    workspace_id,
    employee_id,
    leave_type,
    status,
    start_date,
    end_date,
    note,
    created_by,
    decided_by,
    decided_at,
    decision_note
  )
  values (
    p_workspace_id,
    v_member.employee_id,
    v_leave_type,
    'pending',
    p_start_date,
    p_end_date,
    v_note,
    v_member.id,
    null,
    null,
    ''
  )
  returning
    leave_requests.id,
    leave_requests.workspace_id,
    leave_requests.employee_id,
    leave_requests.status,
    leave_requests.leave_type,
    leave_requests.start_date,
    leave_requests.end_date;
end;
$$;

revoke all on function public.request_leave(uuid, text, date, date, text) from public;
revoke all on function public.request_leave(uuid, text, date, date, text) from anon;
grant execute on function public.request_leave(uuid, text, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual RPC verification matrix (comments only — run in Supabase test env)
-- ---------------------------------------------------------------------------
-- Replace placeholders with real workspace, employee, and member IDs.
--
-- 1) Unauthenticated
--    Expected: leave_request_unauthenticated
--
-- 2) Null workspace
--    select * from public.request_leave(null, 'vacation', current_date, current_date, '');
--    Expected: leave_request_workspace_required
--
-- 3) Workspace not found
--    select * from public.request_leave('00000000-0000-0000-0000-000000000099', 'vacation', current_date, current_date, '');
--    Expected: leave_request_workspace_not_found
--
-- 4) Caller not a member of target workspace
--    Expected: leave_request_membership_not_found
--
-- 5) Multi-workspace caller requesting in Workspace A
--    select * from public.request_leave('<workspace_a_id>', 'vacation', <today_a>, <today_a>, 'A');
--    Expected: success when linked employee exists in Workspace A
--
-- 6) Same caller requesting in Workspace B
--    select * from public.request_leave('<workspace_b_id>', 'sick', <today_b>, <today_b>, 'B');
--    Expected: success; Workspace A membership must not interfere
--
-- 7) Missing linked employee
--    Expected: leave_request_employee_not_linked
--
-- 8) Employee/workspace mismatch
--    Expected: leave_request_workspace_mismatch
--
-- 9) Invalid leave type
--    Expected: leave_request_invalid_leave_type
--
-- 10) Null dates
--     Expected: leave_request_invalid_date_range
--
-- 11) End before start
--     Expected: leave_request_invalid_date_range
--
-- 12) Fully past range (end < workspace today)
--     Expected: leave_request_past_date_range
--
-- 13) Range crossing from past into today (start < today, end >= today)
--     Expected: success
--
-- 14) Exactly 365 inclusive days
--     Expected: success
--
-- 15) 366 inclusive days
--     Expected: leave_request_duration_exceeds_limit
--
-- 16) Overlap with pending existing row
--     Expected: leave_request_overlap
--
-- 17) Overlap with approved existing row
--     Expected: leave_request_overlap
--
-- 18) Adjacent to rejected/cancelled row (touching boundary)
--     Expected: success
--
-- 19) Successful insert
--     select * from public.request_leave('<workspace_id>', 'vacation', <today>, <today>, 'P6.9.7b QA');
--     Expected: pending row; derived workspace_id, employee_id, created_by
--
-- 20) Post-insert verification
--     select created_by, decided_by, decided_at, decision_note, status
--     from public.leave_requests where id = '<returned_id>';
--     Expected: created_by = caller membership id; decision fields empty; status pending
--
-- 21) Timezone missing/invalid
--     Expected: leave_request_workspace_timezone_missing or leave_request_workspace_timezone_invalid
--
-- Example authenticated client call (future service sprint):
--   supabase.rpc('request_leave', {
--     p_workspace_id: '<active_workspace_id>',
--     p_leave_type: 'vacation',
--     p_start_date: '2026-07-15',
--     p_end_date: '2026-07-17',
--     p_note: 'Family trip',
--   })

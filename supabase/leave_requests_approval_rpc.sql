-- Manager leave approval RPC.
-- Prerequisite: leave_requests_schema.sql, leave_requests_rls_policies.sql,
--   and leave_requests_rpc.sql applied.
-- Run in the Supabase SQL editor after the Leave foundation files.
--
-- Secure approval entry point for manager leave decisions.
-- Authenticated clients must not update leave_requests directly.
-- Actor identity, manager role, and decision metadata are derived from auth.uid().
-- p_workspace_id is routing context only; decided_by and decided_at are never
-- accepted from the client.

create or replace function public.approve_leave_request(
  p_workspace_id uuid,
  p_leave_request_id uuid
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
  v_leave_request public.leave_requests%rowtype;
  v_membership_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'leave_approval_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'leave_approval_workspace_required';
  end if;

  if p_leave_request_id is null then
    raise exception 'leave_approval_request_required';
  end if;

  select w.*
  into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found then
    raise exception 'leave_approval_workspace_not_found';
  end if;

  select count(*)
  into v_membership_count
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_membership_count = 0 then
    raise exception 'leave_approval_membership_not_found';
  end if;

  if v_membership_count > 1 then
    raise exception 'leave_approval_duplicate_workspace_membership';
  end if;

  select wm.*
  into v_member
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_member.role not in ('owner', 'general_manager', 'manager') then
    raise exception 'leave_approval_forbidden';
  end if;

  select lr.*
  into v_leave_request
  from public.leave_requests lr
  where lr.id = p_leave_request_id
  for update;

  if not found then
    raise exception 'leave_approval_request_not_found';
  end if;

  if v_leave_request.workspace_id is distinct from p_workspace_id then
    raise exception 'leave_approval_workspace_mismatch';
  end if;

  if v_leave_request.status = 'approved' then
    raise exception 'leave_approval_already_approved';
  end if;

  if v_leave_request.status = 'rejected' then
    raise exception 'leave_approval_already_rejected';
  end if;

  if v_leave_request.status = 'cancelled' then
    raise exception 'leave_approval_already_cancelled';
  end if;

  if v_leave_request.status <> 'pending' then
    raise exception 'leave_approval_invalid_status';
  end if;

  return query
  update public.leave_requests lr
  set
    status = 'approved',
    decided_by = v_member.id,
    decided_at = now()
  where lr.id = p_leave_request_id
  returning
    lr.id,
    lr.workspace_id,
    lr.employee_id,
    lr.status,
    lr.leave_type,
    lr.start_date,
    lr.end_date;
end;
$$;

revoke all on function public.approve_leave_request(uuid, uuid) from public;
revoke all on function public.approve_leave_request(uuid, uuid) from anon;
grant execute on function public.approve_leave_request(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual RPC verification matrix (comments only — run in Supabase test env)
-- ---------------------------------------------------------------------------
-- Replace placeholders with real workspace, leave request, and member IDs.
--
-- 1) Unauthenticated
--    Expected: leave_approval_unauthenticated
--
-- 2) Null workspace
--    select * from public.approve_leave_request(null, '<leave_request_id>');
--    Expected: leave_approval_workspace_required
--
-- 3) Null leave request id
--    select * from public.approve_leave_request('<workspace_id>', null);
--    Expected: leave_approval_request_required
--
-- 4) Workspace not found
--    select * from public.approve_leave_request('00000000-0000-0000-0000-000000000099', '<leave_request_id>');
--    Expected: leave_approval_workspace_not_found
--
-- 5) Caller not a member of target workspace
--    Expected: leave_approval_membership_not_found
--
-- 6) Duplicate workspace membership rows for caller
--    Expected: leave_approval_duplicate_workspace_membership
--
-- 7) Staff or host caller
--    Expected: leave_approval_forbidden
--
-- 8) Leave request not found
--    select * from public.approve_leave_request('<workspace_id>', '00000000-0000-0000-0000-000000000099');
--    Expected: leave_approval_request_not_found
--
-- 9) Leave request belongs to different workspace
--    Expected: leave_approval_workspace_mismatch
--
-- 10) Already approved request
--     Expected: leave_approval_already_approved
--
-- 11) Already rejected request
--     Expected: leave_approval_already_rejected
--
-- 12) Already cancelled request
--     Expected: leave_approval_already_cancelled
--
-- 13) Successful approval of pending request
--     select * from public.approve_leave_request('<workspace_id>', '<pending_leave_request_id>');
--     Expected: status approved; returned row matches request
--
-- 14) Post-approval verification
--     select status, decided_by, decided_at, decision_note
--     from public.leave_requests where id = '<pending_leave_request_id>';
--     Expected: status = approved; decided_by = manager membership id;
--               decided_at populated; decision_note unchanged ('')
--
-- 15) No schedule side effects
--     Verify shifts, published_shifts, and employee_availability unchanged
--     after approval.
--
-- Example authenticated client call (future service sprint):
--   supabase.rpc('approve_leave_request', {
--     p_workspace_id: '<active_workspace_id>',
--     p_leave_request_id: '<pending_leave_request_id>',
--   })

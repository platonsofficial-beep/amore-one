-- Staff leave withdrawal RPC.
-- Prerequisite: leave_requests_schema.sql, leave_requests_rls_policies.sql,
--   leave_requests_rpc.sql, leave_requests_approval_rpc.sql, and
--   leave_requests_rejection_rpc.sql applied.
-- Run in the Supabase SQL editor after the Leave foundation files.
--
-- Secure withdrawal entry point for employee self-service cancellation of
-- pending leave requests.
-- Authenticated clients must not update leave_requests directly.
-- Actor identity and request ownership are derived from auth.uid().
-- p_workspace_id is routing context only; employee_id, status, and decision
-- metadata are never accepted from the client.
--
-- Cancelled-state metadata model (schema-compatible):
--   status = 'cancelled'
--   decided_by = caller's resolved workspace_members.id
--   decided_at = now()
--   decision_note = ''
-- The existing leave_requests_decided_metadata_check applies only to approved
-- and rejected statuses. Cancelled rows may record server-derived decision
-- metadata without violating pending or decided constraints.

create or replace function public.withdraw_leave_request(
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
  v_employee public.employees%rowtype;
  v_leave_request public.leave_requests%rowtype;
  v_membership_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'leave_withdrawal_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'leave_withdrawal_workspace_required';
  end if;

  if p_leave_request_id is null then
    raise exception 'leave_withdrawal_request_required';
  end if;

  select w.*
  into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found then
    raise exception 'leave_withdrawal_workspace_not_found';
  end if;

  select count(*)
  into v_membership_count
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_membership_count = 0 then
    raise exception 'leave_withdrawal_membership_not_found';
  end if;

  if v_membership_count > 1 then
    raise exception 'leave_withdrawal_duplicate_workspace_membership';
  end if;

  select wm.*
  into v_member
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_member.employee_id is null then
    raise exception 'leave_withdrawal_employee_not_linked';
  end if;

  select e.*
  into v_employee
  from public.employees e
  where e.id = v_member.employee_id
  for update;

  if not found then
    raise exception 'leave_withdrawal_employee_not_found';
  end if;

  if v_employee.workspace_id is distinct from p_workspace_id then
    raise exception 'leave_withdrawal_workspace_mismatch';
  end if;

  select lr.*
  into v_leave_request
  from public.leave_requests lr
  where lr.id = p_leave_request_id
  for update;

  if not found then
    raise exception 'leave_withdrawal_request_not_found';
  end if;

  if v_leave_request.workspace_id is distinct from p_workspace_id then
    raise exception 'leave_withdrawal_workspace_mismatch';
  end if;

  if v_leave_request.employee_id is distinct from v_member.employee_id then
    raise exception 'leave_withdrawal_forbidden';
  end if;

  if v_leave_request.status = 'approved' then
    raise exception 'leave_withdrawal_already_approved';
  end if;

  if v_leave_request.status = 'rejected' then
    raise exception 'leave_withdrawal_already_rejected';
  end if;

  if v_leave_request.status = 'cancelled' then
    raise exception 'leave_withdrawal_already_cancelled';
  end if;

  if v_leave_request.status <> 'pending' then
    raise exception 'leave_withdrawal_invalid_status';
  end if;

  return query
  update public.leave_requests lr
  set
    status = 'cancelled',
    decided_by = v_member.id,
    decided_at = now(),
    decision_note = ''
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

revoke all on function public.withdraw_leave_request(uuid, uuid) from public;
revoke all on function public.withdraw_leave_request(uuid, uuid) from anon;
grant execute on function public.withdraw_leave_request(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual RPC verification matrix (comments only — run in Supabase test env)
-- ---------------------------------------------------------------------------
-- Replace placeholders with real workspace, leave request, and member IDs.
--
-- 1) Unauthenticated
--    Expected: leave_withdrawal_unauthenticated
--
-- 2) Null workspace
--    select * from public.withdraw_leave_request(null, '<leave_request_id>');
--    Expected: leave_withdrawal_workspace_required
--
-- 3) Null leave request id
--    select * from public.withdraw_leave_request('<workspace_id>', null);
--    Expected: leave_withdrawal_request_required
--
-- 4) Workspace not found
--    select * from public.withdraw_leave_request('00000000-0000-0000-0000-000000000099', '<leave_request_id>');
--    Expected: leave_withdrawal_workspace_not_found
--
-- 5) Caller not a member of target workspace
--    Expected: leave_withdrawal_membership_not_found
--
-- 6) Duplicate workspace membership rows for caller
--    Expected: leave_withdrawal_duplicate_workspace_membership
--
-- 7) Membership has no linked employee
--    Expected: leave_withdrawal_employee_not_linked
--
-- 8) Linked employee not found in workspace
--    Expected: leave_withdrawal_employee_not_found
--
-- 9) Leave request not found
--    select * from public.withdraw_leave_request('<workspace_id>', '00000000-0000-0000-0000-000000000099');
--    Expected: leave_withdrawal_request_not_found
--
-- 10) Leave request belongs to different workspace
--     Expected: leave_withdrawal_workspace_mismatch
--
-- 11) Request owned by another employee
--     Expected: leave_withdrawal_forbidden
--
-- 12) Staff withdraws own pending request successfully
--     select * from public.withdraw_leave_request('<workspace_id>', '<own_pending_leave_request_id>');
--     Expected: status cancelled; returned seven-field row matches request subset
--
-- 13) Manager withdraws own pending request successfully
--     Manager caller with linked employee matching request owner.
--     Expected: status cancelled; returned seven-field row matches request subset
--
-- 14) Manager attempts another employee's request
--     Expected: leave_withdrawal_forbidden
--
-- 15) Owner attempts another employee's request
--     Expected: leave_withdrawal_forbidden
--
-- 16) Host with linked employee withdraws own pending request
--     Expected: status cancelled when host membership is linked to request owner
--
-- 17) Returned seven-field shape
--     select id, workspace_id, employee_id, status, leave_type, start_date, end_date
--     from public.withdraw_leave_request('<workspace_id>', '<own_pending_leave_request_id>');
--     Expected: exactly the approved subset columns
--
-- 18) Server-derived cancelled status
--     select status from public.leave_requests where id = '<own_pending_leave_request_id>';
--     Expected: cancelled
--
-- 19) Server-derived decided_by
--     select decided_by from public.leave_requests where id = '<own_pending_leave_request_id>';
--     Expected: caller's resolved workspace_members.id
--
-- 20) Server-derived decided_at
--     select decided_at from public.leave_requests where id = '<own_pending_leave_request_id>';
--     Expected: populated server timestamp
--
-- 21) Employee note remains unchanged
--     select note from public.leave_requests where id = '<own_pending_leave_request_id>';
--     Expected: original request note preserved
--
-- 22) Already approved request
--     Expected: leave_withdrawal_already_approved
--
-- 23) Already rejected request
--     Expected: leave_withdrawal_already_rejected
--
-- 24) Already cancelled request
--     Expected: leave_withdrawal_already_cancelled
--
-- 25) Invalid status
--     Expected: leave_withdrawal_invalid_status
--
-- 26) Concurrent withdraw/withdraw race
--     Two sessions withdraw the same pending request simultaneously.
--     Expected: first succeeds; second receives leave_withdrawal_already_cancelled
--
-- 27) Concurrent withdraw/approve race
--     One session withdraws while a manager approves the same pending request.
--     Expected: first decision wins; second receives the correct status exception
--
-- 28) Concurrent withdraw/reject race
--     One session withdraws while a manager rejects the same pending request.
--     Expected: first decision wins; second receives the correct status exception
--
-- 29) Grant/revoke inspection
--     select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--     where routine_schema = 'public'
--       and routine_name = 'withdraw_leave_request';
--     Expected: authenticated has EXECUTE; public and anon do not
--
-- 30) SECURITY DEFINER and search-path inspection
--     select p.prosecdef, p.proconfig
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname = 'withdraw_leave_request';
--     Expected: prosecdef = true; search_path includes public
--
-- 31) Unsafe overload inspection
--     select p.proname, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname = 'withdraw_leave_request';
--     Expected: exactly one signature (uuid, uuid)
--
-- 32) Confirmation no Schedule/shift/availability side effects
--     Verify shifts, published_shifts, and employee_availability unchanged
--     after withdrawal.
--
-- Example authenticated client call (future service sprint):
--   supabase.rpc('withdraw_leave_request', {
--     p_workspace_id: '<active_workspace_id>',
--     p_leave_request_id: '<own_pending_leave_request_id>',
--   })

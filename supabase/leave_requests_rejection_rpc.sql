-- Manager leave rejection RPC.
-- Prerequisite: leave_requests_schema.sql, leave_requests_rls_policies.sql,
--   leave_requests_rpc.sql, and leave_requests_approval_rpc.sql applied.
-- Run in the Supabase SQL editor after the Leave foundation files.
--
-- Secure rejection entry point for manager leave decisions.
-- Authenticated clients must not update leave_requests directly.
-- Actor identity, manager role, and decision metadata are derived from auth.uid().
-- p_workspace_id is routing context only; decided_by, decided_at, and status are
-- never accepted from the client. p_decision_note is the only optional rejection
-- reason supplied by the client and is normalized server-side.

create or replace function public.reject_leave_request(
  p_workspace_id uuid,
  p_leave_request_id uuid,
  p_decision_note text default ''
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
  v_decision_note text := trim(coalesce(p_decision_note, ''));
begin
  if v_auth_user_id is null then
    raise exception 'leave_rejection_unauthenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'leave_rejection_workspace_required';
  end if;

  if p_leave_request_id is null then
    raise exception 'leave_rejection_request_required';
  end if;

  if v_decision_note = '' then
    raise exception 'leave_rejection_reason_required';
  end if;

  select w.*
  into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found then
    raise exception 'leave_rejection_workspace_not_found';
  end if;

  select count(*)
  into v_membership_count
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_membership_count = 0 then
    raise exception 'leave_rejection_membership_not_found';
  end if;

  if v_membership_count > 1 then
    raise exception 'leave_rejection_duplicate_workspace_membership';
  end if;

  select wm.*
  into v_member
  from public.workspace_members wm
  where wm.auth_user_id = v_auth_user_id
    and wm.workspace_id = p_workspace_id;

  if v_member.role not in ('owner', 'general_manager', 'manager') then
    raise exception 'leave_rejection_forbidden';
  end if;

  select lr.*
  into v_leave_request
  from public.leave_requests lr
  where lr.id = p_leave_request_id
  for update;

  if not found then
    raise exception 'leave_rejection_request_not_found';
  end if;

  if v_leave_request.workspace_id is distinct from p_workspace_id then
    raise exception 'leave_rejection_workspace_mismatch';
  end if;

  if v_leave_request.status = 'approved' then
    raise exception 'leave_rejection_already_approved';
  end if;

  if v_leave_request.status = 'rejected' then
    raise exception 'leave_rejection_already_rejected';
  end if;

  if v_leave_request.status = 'cancelled' then
    raise exception 'leave_rejection_already_cancelled';
  end if;

  if v_leave_request.status <> 'pending' then
    raise exception 'leave_rejection_invalid_status';
  end if;

  return query
  update public.leave_requests lr
  set
    status = 'rejected',
    decided_by = v_member.id,
    decided_at = now(),
    decision_note = v_decision_note
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

revoke all on function public.reject_leave_request(uuid, uuid, text) from public;
revoke all on function public.reject_leave_request(uuid, uuid, text) from anon;
grant execute on function public.reject_leave_request(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual RPC verification matrix (comments only — run in Supabase test env)
-- ---------------------------------------------------------------------------
-- Replace placeholders with real workspace, leave request, and member IDs.
--
-- 1) Unauthenticated
--    Expected: leave_rejection_unauthenticated
--
-- 2) Null workspace
--    select * from public.reject_leave_request(null, '<leave_request_id>', 'Reason');
--    Expected: leave_rejection_workspace_required
--
-- 3) Null leave request id
--    select * from public.reject_leave_request('<workspace_id>', null, 'Reason');
--    Expected: leave_rejection_request_required
--
-- 4) Null decision note (default parameter)
--    select * from public.reject_leave_request('<workspace_id>', '<leave_request_id>', null);
--    Expected: leave_rejection_reason_required
--
-- 5) Empty decision note
--    select * from public.reject_leave_request('<workspace_id>', '<leave_request_id>', '');
--    Expected: leave_rejection_reason_required
--
-- 6) Whitespace-only decision note
--    select * from public.reject_leave_request('<workspace_id>', '<leave_request_id>', '   ');
--    Expected: leave_rejection_reason_required
--
-- 7) Workspace not found
--    select * from public.reject_leave_request('00000000-0000-0000-0000-000000000099', '<leave_request_id>', 'Reason');
--    Expected: leave_rejection_workspace_not_found
--
-- 8) Caller not a member of target workspace
--    Expected: leave_rejection_membership_not_found
--
-- 9) Duplicate workspace membership rows for caller
--    Expected: leave_rejection_duplicate_workspace_membership
--
-- 10) Staff caller
--     Expected: leave_rejection_forbidden
--
-- 11) Host caller
--     Expected: leave_rejection_forbidden
--
-- 12) Leave request not found
--     select * from public.reject_leave_request('<workspace_id>', '00000000-0000-0000-0000-000000000099', 'Reason');
--     Expected: leave_rejection_request_not_found
--
-- 13) Leave request belongs to different workspace
--     Expected: leave_rejection_workspace_mismatch
--
-- 14) Successful rejection of pending request
--     select * from public.reject_leave_request('<workspace_id>', '<pending_leave_request_id>', 'Coverage unavailable');
--     Expected: status rejected; returned row matches request subset
--
-- 15) Decision note trimming
--     select * from public.reject_leave_request('<workspace_id>', '<pending_leave_request_id>', '  Coverage unavailable  ');
--     Post-check: decision_note = 'Coverage unavailable' (internal whitespace preserved)
--
-- 16) decided_by server derivation
--     select decided_by from public.leave_requests where id = '<pending_leave_request_id>';
--     Expected: manager membership id for caller
--
-- 17) decided_at server derivation
--     select decided_at from public.leave_requests where id = '<pending_leave_request_id>';
--     Expected: populated server timestamp
--
-- 18) Repeat rejection
--     Expected: leave_rejection_already_rejected
--
-- 19) Already approved request
--     Expected: leave_rejection_already_approved
--
-- 20) Cancelled request
--     Expected: leave_rejection_already_cancelled
--
-- 21) Invalid status
--     Expected: leave_rejection_invalid_status
--
-- 22) Concurrent reject/reject race
--     Two manager sessions reject the same pending request simultaneously.
--     Expected: first succeeds; second receives leave_rejection_already_rejected
--
-- 23) Concurrent approve/reject race
--     One manager approves while another rejects the same pending request.
--     Expected: first decision wins; second receives the correct status exception
--
-- 24) Grant/revoke inspection
--     select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--     where routine_schema = 'public'
--       and routine_name = 'reject_leave_request';
--     Expected: authenticated has EXECUTE; public and anon do not
--
-- 25) Unsafe overload inspection
--     select p.proname, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname = 'reject_leave_request';
--     Expected: exactly one signature (uuid, uuid, text)
--
-- Example authenticated client call (future service sprint):
--   supabase.rpc('reject_leave_request', {
--     p_workspace_id: '<active_workspace_id>',
--     p_leave_request_id: '<pending_leave_request_id>',
--     p_decision_note: 'Coverage unavailable',
--   })

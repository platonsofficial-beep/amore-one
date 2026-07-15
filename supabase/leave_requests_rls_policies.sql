-- RLS policies for leave_requests.
-- Run after leave_requests_schema.sql.
-- Requires public.is_workspace_member from stock_rls_policies.sql.
--
-- Foundation phase: authenticated client access is read-only.
-- Staff requests and manager decisions must be added through dedicated
-- security-definer RPCs in later isolated sprints. Those RPCs must derive
-- actor membership from auth.uid() rather than accept trusted actor IDs
-- from the client.

create or replace function public.can_manage_workspace_leave(target_workspace_id uuid)
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
      and wm.role in ('owner', 'general_manager', 'manager')
  );
$$;

revoke all on function public.can_manage_workspace_leave(uuid) from public;
grant execute on function public.can_manage_workspace_leave(uuid) to authenticated;

grant select on table public.leave_requests to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.leave_requests
  from authenticated;

alter table public.leave_requests enable row level security;

drop policy if exists leave_requests_select_members on public.leave_requests;
create policy leave_requests_select_members
  on public.leave_requests
  for select
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.can_manage_workspace_leave(workspace_id)
      or employee_id = (
        select wm.employee_id
        from public.workspace_members wm
        where wm.workspace_id = leave_requests.workspace_id
          and wm.auth_user_id = auth.uid()
        limit 1
      )
    )
  );

drop policy if exists leave_requests_insert_managers on public.leave_requests;
drop policy if exists leave_requests_insert_self_pending on public.leave_requests;
drop policy if exists leave_requests_update_managers on public.leave_requests;
drop policy if exists leave_requests_delete_managers on public.leave_requests;

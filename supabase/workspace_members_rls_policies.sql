-- RLS policies for workspace_members (authenticated users).
-- Prerequisite: public.workspace_members and public.workspaces exist.
-- Run in the Supabase SQL editor after workspace_members_schema.sql.
--
-- Ownership model:
--   workspace_members.auth_user_id -> auth.users.id
--   Members may update their own row; owners may update rows in the same workspace.

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.auth_user_id = auth.uid()
      and wm.role = 'owner'
  );
end;
$$;

revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

create or replace function public.can_bootstrap_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
  );
$$;

revoke all on function public.can_bootstrap_workspace_owner(uuid) from public;
grant execute on function public.can_bootstrap_workspace_owner(uuid) to authenticated;

create or replace function public.has_any_workspace_membership()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.has_any_workspace_membership() from public;
grant execute on function public.has_any_workspace_membership() to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;

alter table public.workspace_members enable row level security;

drop policy if exists workspace_members_select on public.workspace_members;
drop policy if exists workspace_members_select_own on public.workspace_members;
drop policy if exists workspace_members_select_owner on public.workspace_members;
create policy workspace_members_select
  on public.workspace_members
  for select
  to authenticated
  using (
    auth.uid() = auth_user_id
    or public.is_workspace_owner(workspace_id)
  );

drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert
  on public.workspace_members
  for insert
  to authenticated
  with check (
    public.is_workspace_owner(workspace_id)
    or (
      auth.uid() = auth_user_id
      and role = 'owner'
      and public.can_bootstrap_workspace_owner(workspace_id)
    )
  );

drop policy if exists workspace_members_update on public.workspace_members;
drop policy if exists workspace_members_update_own on public.workspace_members;
drop policy if exists workspace_members_update_owner on public.workspace_members;

-- Own row: required for employee_id self-link updates filtered by auth_user_id.
create policy workspace_members_update_own
  on public.workspace_members
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Owner may update any member row in the same workspace.
create policy workspace_members_update_owner
  on public.workspace_members
  for update
  to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete
  on public.workspace_members
  for delete
  to authenticated
  using (
    auth.uid() = auth_user_id
    or public.is_workspace_owner(workspace_id)
  );

-- RLS policies for workspace_invites.
-- Prerequisite: workspace_invites_schema.sql and stock_rls_policies.sql
-- (uses public.can_manage_workspace_stock for manager permissions).

create or replace function public.can_manage_workspace_invites(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_workspace_stock(target_workspace_id);
$$;

revoke all on function public.can_manage_workspace_invites(uuid) from public;
grant execute on function public.can_manage_workspace_invites(uuid) to authenticated;

grant select, insert, update on table public.workspace_invites to authenticated;

alter table public.workspace_invites enable row level security;

drop policy if exists workspace_invites_select_managers on public.workspace_invites;
create policy workspace_invites_select_managers
  on public.workspace_invites
  for select
  to authenticated
  using (public.can_manage_workspace_invites(workspace_id));

drop policy if exists workspace_invites_insert_managers on public.workspace_invites;
create policy workspace_invites_insert_managers
  on public.workspace_invites
  for insert
  to authenticated
  with check (
    public.can_manage_workspace_invites(workspace_id)
    and invited_by = auth.uid()
  );

drop policy if exists workspace_invites_update_managers on public.workspace_invites;
create policy workspace_invites_update_managers
  on public.workspace_invites
  for update
  to authenticated
  using (public.can_manage_workspace_invites(workspace_id))
  with check (public.can_manage_workspace_invites(workspace_id));

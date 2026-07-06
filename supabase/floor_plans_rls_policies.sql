-- RLS policies for floor_plans (workspace members).
-- Run after floor_plans_schema.sql.
-- Requires public.floor_plans, public.workspace_members, and public.workspaces.

create or replace function public.is_workspace_member(target_workspace_id uuid)
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
  );
$$;

create or replace function public.can_manage_workspace_floor_plans(target_workspace_id uuid)
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

create or replace function public.can_delete_workspace_floor_plans(target_workspace_id uuid)
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
      and wm.role = 'owner'
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_manage_workspace_floor_plans(uuid) from public;
revoke all on function public.can_delete_workspace_floor_plans(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace_floor_plans(uuid) to authenticated;
grant execute on function public.can_delete_workspace_floor_plans(uuid) to authenticated;

grant select, insert, update, delete on table public.floor_plans to authenticated;

alter table public.floor_plans enable row level security;

drop policy if exists floor_plans_select_members on public.floor_plans;
create policy floor_plans_select_members
  on public.floor_plans
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists floor_plans_insert_managers on public.floor_plans;
create policy floor_plans_insert_managers
  on public.floor_plans
  for insert
  to authenticated
  with check (public.can_manage_workspace_floor_plans(workspace_id));

drop policy if exists floor_plans_update_managers on public.floor_plans;
create policy floor_plans_update_managers
  on public.floor_plans
  for update
  to authenticated
  using (public.can_manage_workspace_floor_plans(workspace_id))
  with check (public.can_manage_workspace_floor_plans(workspace_id));

drop policy if exists floor_plans_delete_owner on public.floor_plans;
create policy floor_plans_delete_owner
  on public.floor_plans
  for delete
  to authenticated
  using (public.can_delete_workspace_floor_plans(workspace_id));

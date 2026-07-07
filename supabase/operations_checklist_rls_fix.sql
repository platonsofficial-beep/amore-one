-- Fix RLS for operations checklist templates and items.
-- Run in Supabase SQL editor when checklist template insert fails with RLS errors.
-- Prerequisites: stock_rls_policies.sql (or floor_plans_rls_policies.sql) for is_workspace_member.
--
-- Aligns checklist permissions with Stock:
--   members read, owner / general_manager / manager write.

-- Ensure stock-style helper functions exist and are executable.
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

create or replace function public.can_manage_workspace_stock(target_workspace_id uuid)
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

-- Keep operations helper in sync with stock (operations_tasks/logs use this).
create or replace function public.can_manage_workspace_operations(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_workspace_stock(target_workspace_id);
$$;

-- Resolve template workspace without RLS chicken-and-egg on nested item writes.
create or replace function public.can_manage_operations_checklist_template(target_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operations_checklist_templates t
    where t.id = target_template_id
      and public.can_manage_workspace_stock(t.workspace_id)
  );
$$;

create or replace function public.is_operations_checklist_template_member(target_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operations_checklist_templates t
    where t.id = target_template_id
      and public.is_workspace_member(t.workspace_id)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_manage_workspace_stock(uuid) from public;
revoke all on function public.can_manage_workspace_operations(uuid) from public;
revoke all on function public.can_manage_operations_checklist_template(uuid) from public;
revoke all on function public.is_operations_checklist_template_member(uuid) from public;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace_stock(uuid) to authenticated;
grant execute on function public.can_manage_workspace_operations(uuid) to authenticated;
grant execute on function public.can_manage_operations_checklist_template(uuid) to authenticated;
grant execute on function public.is_operations_checklist_template_member(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.operations_checklist_templates to authenticated;
grant select, insert, update, delete on table public.operations_checklist_items to authenticated;

alter table public.operations_checklist_templates enable row level security;
alter table public.operations_checklist_items enable row level security;

-- operations_checklist_templates

drop policy if exists operations_checklist_templates_select_members on public.operations_checklist_templates;
create policy operations_checklist_templates_select_members
  on public.operations_checklist_templates
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists operations_checklist_templates_insert_managers on public.operations_checklist_templates;
create policy operations_checklist_templates_insert_managers
  on public.operations_checklist_templates
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists operations_checklist_templates_update_managers on public.operations_checklist_templates;
create policy operations_checklist_templates_update_managers
  on public.operations_checklist_templates
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists operations_checklist_templates_delete_managers on public.operations_checklist_templates;
create policy operations_checklist_templates_delete_managers
  on public.operations_checklist_templates
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

-- operations_checklist_items

drop policy if exists operations_checklist_items_select_members on public.operations_checklist_items;
create policy operations_checklist_items_select_members
  on public.operations_checklist_items
  for select
  to authenticated
  using (public.is_operations_checklist_template_member(template_id));

drop policy if exists operations_checklist_items_insert_managers on public.operations_checklist_items;
create policy operations_checklist_items_insert_managers
  on public.operations_checklist_items
  for insert
  to authenticated
  with check (public.can_manage_operations_checklist_template(template_id));

drop policy if exists operations_checklist_items_update_managers on public.operations_checklist_items;
create policy operations_checklist_items_update_managers
  on public.operations_checklist_items
  for update
  to authenticated
  using (public.can_manage_operations_checklist_template(template_id))
  with check (public.can_manage_operations_checklist_template(template_id));

drop policy if exists operations_checklist_items_delete_managers on public.operations_checklist_items;
create policy operations_checklist_items_delete_managers
  on public.operations_checklist_items
  for delete
  to authenticated
  using (public.can_manage_operations_checklist_template(template_id));

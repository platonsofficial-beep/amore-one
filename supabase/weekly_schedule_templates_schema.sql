-- Reusable weekly schedule templates (workspace-scoped).
-- Prerequisite: public.workspaces, public.employees, stock_rls_policies.sql
-- (is_workspace_member, can_manage_workspace_stock).

create table if not exists public.weekly_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  department text null,
  shift_start time null,
  shift_end time null,
  required_staff integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_schedule_templates_required_staff_check check (required_staff >= 0)
);

create index if not exists weekly_schedule_templates_workspace_idx
  on public.weekly_schedule_templates (workspace_id);

create index if not exists weekly_schedule_templates_workspace_updated_idx
  on public.weekly_schedule_templates (workspace_id, updated_at desc);

create table if not exists public.weekly_schedule_template_shifts (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.weekly_schedule_templates(id) on delete cascade,
  day_index integer not null check (day_index between 0 and 6),
  employee_id uuid null references public.employees(id) on delete set null,
  role text not null default '',
  area text not null default '',
  start_time time not null,
  end_time time not null,
  shift_template_id uuid null,
  status text not null default 'Scheduled',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists weekly_schedule_template_shifts_template_idx
  on public.weekly_schedule_template_shifts (template_id);

create index if not exists weekly_schedule_template_shifts_day_idx
  on public.weekly_schedule_template_shifts (template_id, day_index);

create or replace function public.set_weekly_schedule_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_schedule_templates_set_updated_at on public.weekly_schedule_templates;

create trigger weekly_schedule_templates_set_updated_at
  before update on public.weekly_schedule_templates
  for each row
  execute function public.set_weekly_schedule_templates_updated_at();

grant select, insert, update, delete on table public.weekly_schedule_templates to authenticated;
grant select, insert, update, delete on table public.weekly_schedule_template_shifts to authenticated;

alter table public.weekly_schedule_templates enable row level security;
alter table public.weekly_schedule_template_shifts enable row level security;

drop policy if exists weekly_schedule_templates_select_members on public.weekly_schedule_templates;
create policy weekly_schedule_templates_select_members
  on public.weekly_schedule_templates
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists weekly_schedule_templates_insert_managers on public.weekly_schedule_templates;
create policy weekly_schedule_templates_insert_managers
  on public.weekly_schedule_templates
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists weekly_schedule_templates_update_managers on public.weekly_schedule_templates;
create policy weekly_schedule_templates_update_managers
  on public.weekly_schedule_templates
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists weekly_schedule_templates_delete_managers on public.weekly_schedule_templates;
create policy weekly_schedule_templates_delete_managers
  on public.weekly_schedule_templates
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

drop policy if exists weekly_schedule_template_shifts_select_members on public.weekly_schedule_template_shifts;
create policy weekly_schedule_template_shifts_select_members
  on public.weekly_schedule_template_shifts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.weekly_schedule_templates t
      where t.id = template_id
        and public.is_workspace_member(t.workspace_id)
    )
  );

drop policy if exists weekly_schedule_template_shifts_insert_managers on public.weekly_schedule_template_shifts;
create policy weekly_schedule_template_shifts_insert_managers
  on public.weekly_schedule_template_shifts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  );

drop policy if exists weekly_schedule_template_shifts_update_managers on public.weekly_schedule_template_shifts;
create policy weekly_schedule_template_shifts_update_managers
  on public.weekly_schedule_template_shifts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  );

drop policy if exists weekly_schedule_template_shifts_delete_managers on public.weekly_schedule_template_shifts;
create policy weekly_schedule_template_shifts_delete_managers
  on public.weekly_schedule_template_shifts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.weekly_schedule_templates t
      where t.id = template_id
        and public.can_manage_workspace_stock(t.workspace_id)
    )
  );

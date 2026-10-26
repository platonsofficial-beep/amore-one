-- Run with explicit owner approval
-- =============================================================================
-- weekly_schedule_templates workspace RLS (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Save as weekly template inserts public.weekly_schedule_templates. A missing
-- workspace_id, or an insert policy that does not accept the workspace, is
-- reported by Postgres as:
--   new row violates row-level security policy for table "weekly_schedule_templates"
-- The app now sends workspace_id. This script makes production match that
-- contract even if an older table or policy is installed.
--
-- Contract:
--   workspace_id uuid not null, references public.workspaces
--   SELECT  workspace members (authenticated)
--   INSERT / UPDATE / DELETE  managers via can_manage_workspace_stock(workspace_id)
--   child weekly_schedule_template_shifts follow the parent workspace
--   no USING (true), no anon, no public policies
--
-- Backfill: rows with a null workspace_id are filled only when the database
-- has exactly one workspace. If any row is still null, the transaction raises
-- weekly_schedule_templates_workspace_backfill_required and changes nothing.
-- Existing template rows are not deleted.
--
-- Prerequisites: public.workspaces, public.is_workspace_member(uuid),
-- public.can_manage_workspace_stock(uuid).
-- =============================================================================

begin;

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

alter table public.weekly_schedule_templates
  add column if not exists workspace_id uuid;

do $$
declare
  workspace_count integer;
  lone_workspace uuid;
  missing_count integer;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_schedule_templates'
      and column_name = 'workspace_id'
  ) then
    select count(*) into workspace_count from public.workspaces;
    if workspace_count = 1 then
      select id into lone_workspace from public.workspaces limit 1;
      update public.weekly_schedule_templates
        set workspace_id = lone_workspace
        where workspace_id is null;
    end if;

    select count(*) into missing_count
    from public.weekly_schedule_templates
    where workspace_id is null;
    if missing_count > 0 then
      raise exception 'weekly_schedule_templates_workspace_backfill_required';
    end if;
  end if;
end $$;

alter table public.weekly_schedule_templates
  alter column workspace_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weekly_schedule_templates_workspace_id_fkey'
      and conrelid = 'public.weekly_schedule_templates'::regclass
  ) then
    alter table public.weekly_schedule_templates
      add constraint weekly_schedule_templates_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete cascade;
  end if;
end $$;

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

alter table public.weekly_schedule_template_shifts
  add column if not exists shift_template_id uuid;

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

alter table public.weekly_schedule_templates enable row level security;
alter table public.weekly_schedule_template_shifts enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_schedule_templates'
  loop
    execute format('drop policy if exists %I on public.weekly_schedule_templates', policy_row.policyname);
  end loop;

  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_schedule_template_shifts'
  loop
    execute format('drop policy if exists %I on public.weekly_schedule_template_shifts', policy_row.policyname);
  end loop;
end $$;

create policy weekly_schedule_templates_select_members
  on public.weekly_schedule_templates
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy weekly_schedule_templates_insert_managers
  on public.weekly_schedule_templates
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

create policy weekly_schedule_templates_update_managers
  on public.weekly_schedule_templates
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

create policy weekly_schedule_templates_delete_managers
  on public.weekly_schedule_templates
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

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

revoke all on table public.weekly_schedule_templates from public, anon;
revoke all on table public.weekly_schedule_template_shifts from public, anon;
grant select, insert, update, delete on table public.weekly_schedule_templates to authenticated;
grant select, insert, update, delete on table public.weekly_schedule_template_shifts to authenticated;

notify pgrst, 'reload schema';
commit;

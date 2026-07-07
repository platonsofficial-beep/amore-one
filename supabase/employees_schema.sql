-- Workspace-scoped employees for the Team module.
-- Prerequisite: public.workspaces, auth.users.
-- Run before employees_rls_policies.sql (requires stock_rls_policies.sql helpers).

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null default '',
  position text not null default '',
  primary_position text not null default '',
  additional_positions text[] not null default '{}',
  phone text not null default '',
  email text not null default '',
  hire_date date null,
  salary numeric null,
  emergency_contact text not null default '',
  weekly_hours numeric null,
  notes text not null default '',
  shift text not null default 'Evening',
  status text not null default 'Working',
  department text not null default 'Service',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.employees add column if not exists full_name text not null default '';
alter table public.employees add column if not exists position text not null default '';
alter table public.employees add column if not exists primary_position text not null default '';
alter table public.employees add column if not exists additional_positions text[] not null default '{}';
alter table public.employees add column if not exists phone text not null default '';
alter table public.employees add column if not exists email text not null default '';
alter table public.employees add column if not exists hire_date date;
alter table public.employees add column if not exists salary numeric;
alter table public.employees add column if not exists emergency_contact text not null default '';
alter table public.employees add column if not exists weekly_hours numeric;
alter table public.employees add column if not exists notes text not null default '';
alter table public.employees add column if not exists shift text not null default 'Evening';
alter table public.employees add column if not exists status text not null default 'Working';
alter table public.employees add column if not exists department text not null default 'Service';
alter table public.employees add column if not exists created_at timestamptz not null default now();
alter table public.employees add column if not exists updated_at timestamptz not null default now();

create index if not exists employees_workspace_name_idx
  on public.employees (workspace_id, full_name);

create index if not exists employees_workspace_department_idx
  on public.employees (workspace_id, department);

create or replace function public.set_employees_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employees_set_updated_at on public.employees;

create trigger employees_set_updated_at
  before update on public.employees
  for each row
  execute function public.set_employees_updated_at();

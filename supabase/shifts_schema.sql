-- Workspace-scoped draft shifts for the Team schedule.
-- Prerequisite: public.workspaces, public.employees.
-- Run before shifts_rls_policies.sql (requires stock_rls_policies.sql helpers).

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid null references public.employees(id) on delete set null,
  role text not null default '',
  area text not null default '',
  shift_date date not null,
  start_time text not null default '',
  end_time text not null default '',
  shift_template_id uuid null,
  status text not null default 'Scheduled',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shifts add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.shifts add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.shifts add column if not exists role text not null default '';
alter table public.shifts add column if not exists area text not null default '';
alter table public.shifts add column if not exists shift_date date;
alter table public.shifts add column if not exists start_time text not null default '';
alter table public.shifts add column if not exists end_time text not null default '';
alter table public.shifts add column if not exists shift_template_id uuid;
alter table public.shifts add column if not exists status text not null default 'Scheduled';
alter table public.shifts add column if not exists notes text not null default '';
alter table public.shifts add column if not exists created_at timestamptz not null default now();
alter table public.shifts add column if not exists updated_at timestamptz not null default now();

create index if not exists shifts_workspace_date_idx
  on public.shifts (workspace_id, shift_date);

create index if not exists shifts_workspace_employee_idx
  on public.shifts (workspace_id, employee_id);

create index if not exists shifts_workspace_template_idx
  on public.shifts (workspace_id, shift_template_id);

create or replace function public.set_shifts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shifts_set_updated_at on public.shifts;

create trigger shifts_set_updated_at
  before update on public.shifts
  for each row
  execute function public.set_shifts_updated_at();

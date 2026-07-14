-- Weekly employee availability rows for the Team module.
-- Prerequisite: public.workspaces and public.employees must exist.
-- Run before employee_availability_policies.sql.

create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start_date date not null,
  day_of_week text not null,
  status text not null,
  start_time time null,
  end_time time null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_availability_status_check check (
    status in ('AVAILABLE', 'UNAVAILABLE', 'PREFERRED')
  ),
  constraint employee_availability_day_of_week_check check (
    day_of_week in (
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    )
  ),
  constraint employee_availability_unique_employee_day unique (
    workspace_id,
    employee_id,
    week_start_date,
    day_of_week
  )
);

create index if not exists employee_availability_workspace_idx
  on public.employee_availability (workspace_id);

create index if not exists employee_availability_employee_idx
  on public.employee_availability (employee_id);

create index if not exists employee_availability_week_start_idx
  on public.employee_availability (week_start_date);

create index if not exists employee_availability_status_idx
  on public.employee_availability (status);

create or replace function public.set_employee_availability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employee_availability_set_updated_at on public.employee_availability;

create trigger employee_availability_set_updated_at
  before update on public.employee_availability
  for each row
  execute function public.set_employee_availability_updated_at();

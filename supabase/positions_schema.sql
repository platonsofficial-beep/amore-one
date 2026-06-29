-- Optional schema for scalable multi-position staffing.
-- Run this in Supabase SQL editor only if these tables do not already exist.

create table if not exists public.positions (
  id bigint generated always as identity primary key,
  name text not null,
  department text not null default 'Other',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists positions_name_department_unique
  on public.positions (lower(name), lower(department));

create table if not exists public.employee_positions (
  employee_id bigint not null references public.employees(id) on delete cascade,
  position_id bigint not null references public.positions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (employee_id, position_id)
);

create index if not exists employee_positions_employee_idx
  on public.employee_positions (employee_id);

create index if not exists employee_positions_position_idx
  on public.employee_positions (position_id);

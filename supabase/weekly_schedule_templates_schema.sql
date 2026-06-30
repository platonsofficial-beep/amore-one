-- Optional schema for reusable weekly schedule templates.
-- Run in Supabase SQL editor if these tables are not present yet.

create table if not exists public.weekly_schedule_templates (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_schedule_template_shifts (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.weekly_schedule_templates(id) on delete cascade,
  day_index integer not null check (day_index between 0 and 6),
  employee_id bigint null references public.employees(id) on delete set null,
  role text not null default '',
  area text not null default '',
  start_time time not null,
  end_time time not null,
  shift_template_id uuid null,
  status text not null default 'Scheduled',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists weekly_template_shifts_template_idx
  on public.weekly_schedule_template_shifts(template_id);

create index if not exists weekly_template_shifts_day_idx
  on public.weekly_schedule_template_shifts(day_index);

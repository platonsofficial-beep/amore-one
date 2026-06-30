-- Published shift snapshots: the employee-visible schedule for a week.
-- Prerequisite: public.schedule_publications and public.employees must exist.
-- Run this entire file in the Supabase SQL editor.

create table if not exists public.published_shifts (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.schedule_publications(id) on delete cascade,
  week_start_date date not null,
  employee_id uuid null references public.employees(id) on delete set null,
  shift_template_id uuid null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  role text not null default '',
  area text not null default '',
  status text not null default 'Scheduled',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists published_shifts_publication_idx
  on public.published_shifts (publication_id);

create index if not exists published_shifts_week_start_idx
  on public.published_shifts (week_start_date);

create index if not exists published_shifts_shift_date_idx
  on public.published_shifts (shift_date);

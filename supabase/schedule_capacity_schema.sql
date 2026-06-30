-- Optional schema for per-template, per-day staffing capacity.
-- Run manually in Supabase SQL editor if you want persistence for required cell capacity.

create table if not exists public.schedule_capacity (
  id uuid primary key default gen_random_uuid(),
  shift_template_id uuid not null references public.shift_templates(id) on delete cascade,
  shift_date date not null,
  required_count integer not null default 1 check (required_count >= 0),
  created_at timestamptz not null default now(),
  unique (shift_template_id, shift_date)
);

create index if not exists schedule_capacity_shift_date_idx on public.schedule_capacity(shift_date);
create index if not exists schedule_capacity_template_idx on public.schedule_capacity(shift_template_id);

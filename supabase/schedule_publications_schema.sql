create table if not exists public.schedule_publications (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  unpublished_at timestamptz,
  published_by text,
  created_at timestamptz not null default now()
);

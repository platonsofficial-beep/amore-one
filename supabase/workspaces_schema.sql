-- ONE workspace records for multi-tenant foundation (Phase 1).
-- Run in Supabase SQL editor if this table does not already exist.
-- RLS is intentionally not enabled here — dev access matches existing module tables.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_slug_unique unique (slug)
);

create index if not exists workspaces_slug_idx
  on public.workspaces (slug);

create or replace function public.set_workspaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspaces_set_updated_at on public.workspaces;

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row
  execute function public.set_workspaces_updated_at();

insert into public.workspaces (name, slug)
values ('AMORE.NICOSIA', 'amore-nicosia')
on conflict (slug) do nothing;

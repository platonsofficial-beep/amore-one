-- Workspace-scoped guest reservations for the host workspace.
-- Prerequisite: public.workspaces, auth.users.
-- Run before reservations_rls_policies.sql (requires stock_rls_policies.sql helpers).

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  guest_name text not null,
  phone text not null default '',
  reservation_date date not null,
  reservation_time text not null default '',
  party_size integer not null default 2,
  table_number text not null default '',
  area text not null default '',
  status text not null default 'Pending',
  notes text not null default '',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_party_size_check check (party_size >= 1)
);

alter table public.reservations add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.reservations add column if not exists guest_name text;
alter table public.reservations add column if not exists phone text not null default '';
alter table public.reservations add column if not exists reservation_date date;
alter table public.reservations add column if not exists reservation_time text not null default '';
alter table public.reservations add column if not exists party_size integer not null default 2;
alter table public.reservations add column if not exists table_number text not null default '';
alter table public.reservations add column if not exists area text not null default '';
alter table public.reservations add column if not exists status text not null default 'Pending';
alter table public.reservations add column if not exists notes text not null default '';
alter table public.reservations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.reservations add column if not exists created_at timestamptz not null default now();
alter table public.reservations add column if not exists updated_at timestamptz not null default now();

create index if not exists reservations_workspace_date_idx
  on public.reservations (workspace_id, reservation_date);

create index if not exists reservations_workspace_status_idx
  on public.reservations (workspace_id, status);

create index if not exists reservations_workspace_time_idx
  on public.reservations (workspace_id, reservation_time);

create or replace function public.set_reservations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reservations_set_updated_at on public.reservations;

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row
  execute function public.set_reservations_updated_at();

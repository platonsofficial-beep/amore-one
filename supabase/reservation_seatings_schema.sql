-- Configurable reservation service seatings per workspace.
-- Prerequisite: public.workspaces, auth.users.
-- Run before reservation_seatings_rls_policies.sql.

create table if not exists public.reservation_seatings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  start_time text not null default '19:00',
  duration_minutes integer not null default 120,
  days_of_week integer[] not null default array[0, 1, 2, 3, 4, 5, 6],
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_seatings_duration_check check (duration_minutes >= 15 and duration_minutes <= 480),
  constraint reservation_seatings_sort_order_check check (sort_order >= 0)
);

alter table public.reservation_seatings add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.reservation_seatings add column if not exists name text;
alter table public.reservation_seatings add column if not exists start_time text not null default '19:00';
alter table public.reservation_seatings add column if not exists duration_minutes integer not null default 120;
alter table public.reservation_seatings add column if not exists days_of_week integer[] not null default array[0, 1, 2, 3, 4, 5, 6];
alter table public.reservation_seatings add column if not exists sort_order integer not null default 0;
alter table public.reservation_seatings add column if not exists is_active boolean not null default true;
alter table public.reservation_seatings add column if not exists created_at timestamptz not null default now();
alter table public.reservation_seatings add column if not exists updated_at timestamptz not null default now();

create index if not exists reservation_seatings_workspace_active_idx
  on public.reservation_seatings (workspace_id, is_active, sort_order);

create index if not exists reservation_seatings_workspace_sort_idx
  on public.reservation_seatings (workspace_id, sort_order);

create or replace function public.set_reservation_seatings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reservation_seatings_set_updated_at on public.reservation_seatings;

create trigger reservation_seatings_set_updated_at
  before update on public.reservation_seatings
  for each row
  execute function public.set_reservation_seatings_updated_at();

-- Link reservations to a configured seating slot (nullable for legacy/custom times).
alter table public.reservations add column if not exists seating_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_seating_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_seating_id_fkey
      foreign key (seating_id)
      references public.reservation_seatings(id)
      on delete set null;
  end if;
end $$;

create index if not exists reservations_workspace_seating_date_idx
  on public.reservations (workspace_id, reservation_date, seating_id);

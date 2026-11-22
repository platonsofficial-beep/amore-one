-- Online guest reservations, step 1.
-- Do not apply from the app. Run in Supabase when an owner approves it.
-- Prerequisite: public.workspaces, public.workspace_members, public.reservation_seatings,
-- public.reservations, and public.can_manage_workspace_floor_plans (owner / GM / manager).
--
-- Area smoking and "visible for online booking" live on each floor inside
-- floor_plans.layout_json and draft_layout_json (smoking, onlineBookingVisible).
-- Those documents are already protected by the floor plan RLS policies.

-- Venue booking settings. The public /book/<slug> page is step 2 and must
-- read this through a security-definer function, not an anonymous policy.
create table if not exists public.workspace_online_booking (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  slug text not null,
  auto_confirm boolean not null default true,
  max_party_size integer not null default 8,
  booking_window_days integer not null default 30,
  min_notice_minutes integer not null default 120,
  venue_phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_online_booking_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint workspace_online_booking_party_check check (max_party_size >= 1 and max_party_size <= 100),
  constraint workspace_online_booking_window_check check (booking_window_days >= 1 and booking_window_days <= 365),
  constraint workspace_online_booking_notice_check check (min_notice_minutes >= 0 and min_notice_minutes <= 4320)
);

alter table public.workspace_online_booking add column if not exists enabled boolean not null default false;
alter table public.workspace_online_booking add column if not exists slug text;
alter table public.workspace_online_booking add column if not exists auto_confirm boolean not null default true;
alter table public.workspace_online_booking add column if not exists max_party_size integer not null default 8;
alter table public.workspace_online_booking add column if not exists booking_window_days integer not null default 30;
alter table public.workspace_online_booking add column if not exists min_notice_minutes integer not null default 120;
alter table public.workspace_online_booking add column if not exists venue_phone text not null default '';
alter table public.workspace_online_booking add column if not exists created_at timestamptz not null default now();
alter table public.workspace_online_booking add column if not exists updated_at timestamptz not null default now();

create unique index if not exists workspace_online_booking_slug_key
  on public.workspace_online_booking (lower(slug));

create or replace function public.set_workspace_online_booking_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_online_booking_set_updated_at on public.workspace_online_booking;
create trigger workspace_online_booking_set_updated_at
  before update on public.workspace_online_booking
  for each row
  execute function public.set_workspace_online_booking_updated_at();

alter table public.workspace_online_booking enable row level security;

grant select, insert, update on table public.workspace_online_booking to authenticated;

drop policy if exists workspace_online_booking_select_managers on public.workspace_online_booking;
create policy workspace_online_booking_select_managers
  on public.workspace_online_booking
  for select
  to authenticated
  using (public.can_manage_workspace_floor_plans(workspace_id));

drop policy if exists workspace_online_booking_insert_managers on public.workspace_online_booking;
create policy workspace_online_booking_insert_managers
  on public.workspace_online_booking
  for insert
  to authenticated
  with check (public.can_manage_workspace_floor_plans(workspace_id));

drop policy if exists workspace_online_booking_update_managers on public.workspace_online_booking;
create policy workspace_online_booking_update_managers
  on public.workspace_online_booking
  for update
  to authenticated
  using (public.can_manage_workspace_floor_plans(workspace_id))
  with check (public.can_manage_workspace_floor_plans(workspace_id));

-- Per seating: online cover cap, plus optional caps per floor-plan area id.
alter table public.reservation_seatings
  add column if not exists online_capacity integer;

alter table public.reservation_seatings
  add column if not exists online_area_caps jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservation_seatings_online_capacity_check'
  ) then
    alter table public.reservation_seatings
      add constraint reservation_seatings_online_capacity_check
      check (online_capacity is null or (online_capacity >= 1 and online_capacity <= 9999));
  end if;
end $$;

-- Ready for step 2. Existing rows stay in-house.
alter table public.reservations
  add column if not exists source text not null default 'staff';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_source_check'
  ) then
    alter table public.reservations
      add constraint reservations_source_check
      check (source in ('staff', 'online'));
  end if;
end $$;

create index if not exists reservations_workspace_source_date_idx
  on public.reservations (workspace_id, source, reservation_date);

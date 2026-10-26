-- Run with explicit owner approval
-- =============================================================================
-- Reservations: auto-close forgotten seated tables (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. The migration section is one transaction, then the cron job.
--
-- At each workspace's cutoff (default 05:00 Europe/Nicosia), every reservation
-- still exactly 'Checked In' from a previous business day becomes 'Checked Out'
-- and reservations.auto_closed_at is set. The app shows
-- "κλείστηκε αυτόματα / Auto-closed" and a manager can undo it.
--
-- The first cron run closes the rows listed by the preview below. Rollback can
-- put those rows back to 'Checked In' only while auto_closed_at is still set.
--
-- pg_cron is available on this project and is not installed yet.
-- This script does not install pg_net. It does not grant the function to anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PREVIEW START (read-only). Run this statement alone before the migration.
-- Uses the default cutoff 05:00 Europe/Nicosia, which is what the first run
-- uses until a manager saves a different reservation_auto_close_time.
-- Does not read auto_closed_at, so it is safe before that column exists.
-- -----------------------------------------------------------------------------
with clock as (
  select (now() at time zone 'Europe/Nicosia') as local_now
),
bounds as (
  select
    time '05:00' as cutoff,
    clock.local_now,
    case
      when clock.local_now::time < time '05:00' then clock.local_now::date - 1
      else clock.local_now::date
    end as business_date,
    case
      when clock.local_now::time < time '05:00'
        then ((clock.local_now::date - 1) + time '05:00') at time zone 'Europe/Nicosia'
      else (clock.local_now::date + time '05:00') at time zone 'Europe/Nicosia'
    end as business_started_at
  from clock
)
select
  r.id,
  r.workspace_id,
  r.guest_name,
  r.reservation_date,
  r.reservation_time,
  r.guests,
  r.party_size,
  r.table_number,
  r.area,
  r.status,
  r.seating_id,
  r.updated_at,
  b.cutoff,
  b.business_date,
  b.business_started_at
from public.reservations r
cross join bounds b
where r.status = 'Checked In'
  and r.reservation_date < b.business_date
  and (r.updated_at is null or r.updated_at < b.business_started_at)
order by r.reservation_date, r.reservation_time, r.guest_name;
-- PREVIEW END

begin;

alter table public.reservations
  add column if not exists auto_closed_at timestamptz;

comment on column public.reservations.auto_closed_at is
  'Set when end-of-day auto-close moves this row from Checked In to Checked Out. Null after a manager undo.';

create index if not exists reservations_auto_close_checked_in_idx
  on public.reservations (reservation_date)
  where status = 'Checked In';

-- Venue setting, same table as Business Profile. One default row (workspace_key).
alter table public.workspace_profiles
  add column if not exists reservation_auto_close_time time not null default time '05:00';

comment on column public.workspace_profiles.reservation_auto_close_time is
  'Europe/Nicosia clock time when Checked In reservations from a previous business day are checked out. Default 05:00.';

create or replace function public.auto_close_stale_seated_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_count integer := 0;
begin
  with clock as (
    select (pg_catalog.now() at time zone 'Europe/Nicosia') as local_now
  ),
  venue as (
    select coalesce(
      (
        select p.reservation_auto_close_time
        from public.workspace_profiles p
        where p.workspace_key = 'default'
        order by p.updated_at desc nulls last
        limit 1
      ),
      time '05:00'
    ) as cutoff
  ),
  bounds as (
    select
      v.cutoff,
      case
        when c.local_now::time < v.cutoff then c.local_now::date - 1
        else c.local_now::date
      end as business_date,
      case
        when c.local_now::time < v.cutoff
          then ((c.local_now::date - 1) + v.cutoff) at time zone 'Europe/Nicosia'
        else (c.local_now::date + v.cutoff) at time zone 'Europe/Nicosia'
      end as business_started_at
    from clock c
    cross join venue v
  )
  update public.reservations r
  set
    status = 'Checked Out',
    auto_closed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  from bounds b
  where r.status = 'Checked In'
    and r.reservation_date < b.business_date
    and (r.updated_at is null or r.updated_at < b.business_started_at);

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

comment on function public.auto_close_stale_seated_reservations() is
  'Idempotent. Checks out Checked In reservations from a previous Europe/Nicosia business day after the venue cutoff. Cron only.';

revoke all on function public.auto_close_stale_seated_reservations() from public;
revoke all on function public.auto_close_stale_seated_reservations() from anon;
revoke all on function public.auto_close_stale_seated_reservations() from authenticated;
revoke all on function public.auto_close_stale_seated_reservations() from service_role;

-- The cron job runs as postgres. Do not grant this function to anon.
grant execute on function public.auto_close_stale_seated_reservations() to postgres;

commit;

-- pg_cron cannot be created inside the transaction above on some hosts.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job bigint;
begin
  select jobid
    into existing_job
  from cron.job
  where jobname = 'auto-close-stale-seated-reservations'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'auto-close-stale-seated-reservations',
    '*/15 * * * *',
    $cron$select public.auto_close_stale_seated_reservations()$cron$
  );
end;
$$;

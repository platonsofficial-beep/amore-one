-- Run with explicit owner approval
-- =============================================================================
-- Reservations: auto-close every in-house status (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor after reservations_auto_close.sql.
-- Idempotent. Does not delete rows.
--
-- The installed function only closes status = 'Checked In'. The app treats
-- these statuses as seated / in-house (isReservationInHouseStatus):
--   Checked In
--   Walk In
--   Checked In (Partial)
-- This replaces auto_close_stale_seated_reservations() so all three are
-- checked out the same way, and records the previous status so undo and
-- rollback can put Walk In and Checked In (Partial) back.
--
-- Existing auto-closed rows stay Checked Out. Their from-status is filled
-- as 'Checked In' only when it is still null.
-- Does not change the cron schedule. Does not grant the function to anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PREVIEW START (read-only). Run this statement alone before the migration.
-- Lists rows the updated function would close that the installed function
-- leaves seated: Walk In and Checked In (Partial) from a previous
-- Europe/Nicosia business day, using the saved cutoff or 05:00.
-- -----------------------------------------------------------------------------
with clock as (
  select (now() at time zone 'Europe/Nicosia') as local_now
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
where r.status in ('Walk In', 'Checked In (Partial)')
  and r.reservation_date < b.business_date
  and (r.updated_at is null or r.updated_at < b.business_started_at)
order by r.reservation_date, r.reservation_time, r.guest_name;
-- PREVIEW END

begin;

alter table public.reservations
  add column if not exists auto_closed_from_status text;

comment on column public.reservations.auto_closed_from_status is
  'In-house status before auto-close (Checked In, Walk In, or Checked In (Partial)). Cleared by manager undo.';

comment on column public.reservations.auto_closed_at is
  'Set when end-of-day auto-close moves an in-house reservation to Checked Out. Null after a manager undo.';

update public.reservations
set auto_closed_from_status = 'Checked In'
where auto_closed_at is not null
  and auto_closed_from_status is null
  and status = 'Checked Out';

drop index if exists public.reservations_auto_close_checked_in_idx;

create index if not exists reservations_auto_close_in_house_idx
  on public.reservations (reservation_date)
  where status in ('Checked In', 'Walk In', 'Checked In (Partial)');

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
    auto_closed_from_status = r.status,
    status = 'Checked Out',
    auto_closed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  from bounds b
  where r.status in ('Checked In', 'Walk In', 'Checked In (Partial)')
    and r.auto_closed_at is null
    and r.reservation_date < b.business_date
    and (r.updated_at is null or r.updated_at < b.business_started_at);

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

comment on function public.auto_close_stale_seated_reservations() is
  'Idempotent. Checks out in-house reservations (Checked In, Walk In, Checked In (Partial)) from a previous Europe/Nicosia business day after the venue cutoff. Cron only.';

revoke all on function public.auto_close_stale_seated_reservations() from public;
revoke all on function public.auto_close_stale_seated_reservations() from anon;
revoke all on function public.auto_close_stale_seated_reservations() from authenticated;
revoke all on function public.auto_close_stale_seated_reservations() from service_role;

grant execute on function public.auto_close_stale_seated_reservations() to postgres;

commit;

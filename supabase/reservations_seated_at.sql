-- Run with explicit owner approval
-- =============================================================================
-- Reservations: seated_at for the floor dining timer (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction. Does not delete or update existing reservation rows.
--
-- Adds reservations.seated_at. A BEFORE INSERT/UPDATE trigger stamps now()
-- when status enters an in-house status and seated_at is still null:
--   Checked In, Walk In, Checked In (Partial)
-- Moving between those in-house statuses keeps the original stamp.
-- The stamp is cleared only when status returns to a pre-arrival status:
--   Pending, Waiting, Not Confirmed, Confirmed, Late Booking
-- Completed (Checked Out), Cancelled, Not Shown, and Rejected keep seated_at.
--
-- Currently in-house rows are left null. The app falls back to the booking
-- time until a later seat action writes seated_at.
-- =============================================================================

begin;

alter table public.reservations
  add column if not exists seated_at timestamptz;

comment on column public.reservations.seated_at is
  'When the guest was marked in house. Null until that status change. Cleared only if status returns to a pre-arrival status.';

create or replace function public.reservations_set_seated_at()
returns trigger
language plpgsql
as $$
declare
  in_house boolean;
  was_in_house boolean;
  pre_arrival boolean;
begin
  in_house := new.status in ('Checked In', 'Walk In', 'Checked In (Partial)');
  was_in_house := tg_op = 'UPDATE'
    and old.status in ('Checked In', 'Walk In', 'Checked In (Partial)');
  pre_arrival := new.status in (
    'Pending',
    'Waiting',
    'Not Confirmed',
    'Confirmed',
    'Late Booking'
  );

  if in_house and new.seated_at is null and not was_in_house then
    new.seated_at := now();
  elsif tg_op = 'UPDATE'
    and pre_arrival
    and was_in_house
    and old.status is distinct from new.status
  then
    new.seated_at := null;
  end if;

  return new;
end;
$$;

comment on function public.reservations_set_seated_at() is
  'Stamps reservations.seated_at on entry to in-house status and clears it on undo to a pre-arrival status.';

revoke all on function public.reservations_set_seated_at() from public;
revoke all on function public.reservations_set_seated_at() from anon, authenticated;

drop trigger if exists reservations_set_seated_at on public.reservations;

create trigger reservations_set_seated_at
  before insert or update of status on public.reservations
  for each row
  execute function public.reservations_set_seated_at();

commit;

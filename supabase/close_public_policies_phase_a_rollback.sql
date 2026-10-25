-- Run with explicit owner approval
-- =============================================================================
-- Close open RLS policies, phase A rollback (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Run only to undo supabase/close_public_policies_phase_a.sql.
-- Idempotent. One transaction.
--
-- Recreates the twelve "Allow public …" policies exactly as they were in the
-- production snapshot: names, role public, commands, and true expressions.
-- Member and manager policies are not dropped and are not rewritten.
-- =============================================================================

begin;

do $close_public_policies_phase_a_rollback$
declare
  v_table text;
begin
  foreach v_table in array array['shifts', 'reservations', 'schedule_publications']
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'phase a rollback: public.% is missing', v_table;
    end if;
  end loop;
end
$close_public_policies_phase_a_rollback$;

drop policy if exists "Allow public delete shifts" on public.shifts;
create policy "Allow public delete shifts"
  on public.shifts
  for delete
  to public
  using (true);

drop policy if exists "Allow public insert shifts" on public.shifts;
create policy "Allow public insert shifts"
  on public.shifts
  for insert
  to public
  with check (true);

drop policy if exists "Allow public read shifts" on public.shifts;
create policy "Allow public read shifts"
  on public.shifts
  for select
  to public
  using (true);

drop policy if exists "Allow public update shifts" on public.shifts;
create policy "Allow public update shifts"
  on public.shifts
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "Allow public delete reservations" on public.reservations;
create policy "Allow public delete reservations"
  on public.reservations
  for delete
  to public
  using (true);

drop policy if exists "Allow public insert reservations" on public.reservations;
create policy "Allow public insert reservations"
  on public.reservations
  for insert
  to public
  with check (true);

drop policy if exists "Allow public read reservations" on public.reservations;
create policy "Allow public read reservations"
  on public.reservations
  for select
  to public
  using (true);

drop policy if exists "Allow public update reservations" on public.reservations;
create policy "Allow public update reservations"
  on public.reservations
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "Allow public delete schedule_publications" on public.schedule_publications;
create policy "Allow public delete schedule_publications"
  on public.schedule_publications
  for delete
  to public
  using (true);

drop policy if exists "Allow public insert schedule_publications" on public.schedule_publications;
create policy "Allow public insert schedule_publications"
  on public.schedule_publications
  for insert
  to public
  with check (true);

drop policy if exists "Allow public read schedule_publications" on public.schedule_publications;
create policy "Allow public read schedule_publications"
  on public.schedule_publications
  for select
  to public
  using (true);

drop policy if exists "Allow public update schedule_publications" on public.schedule_publications;
create policy "Allow public update schedule_publications"
  on public.schedule_publications
  for update
  to public
  using (true)
  with check (true);

commit;

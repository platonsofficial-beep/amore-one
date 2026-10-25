-- Run with explicit owner approval
-- =============================================================================
-- Close open RLS policies, phase A (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Tables: public.shifts, public.reservations, public.schedule_publications.
-- Each already has member/manager policies. This file drops only the four
-- "Allow public …" policies on each table, by name. It does not add columns,
-- change grants, or rewrite the member policies.
--
-- Anon check (repo, before this file was written):
--   The app is behind AuthGate. No public booking page and no public schedule
--   view read or write these tables. reservations and shifts are used only
--   from signed-in services. schedule_publications is written by the
--   security-definer RPCs get_week_schedule_snapshot and
--   set_week_schedule_publication, which already require a workspace member
--   or manager. Nothing legitimate needs the anon role on these tables.
--
-- Policies dropped by name when present (each drop raises a notice):
--   Allow public delete shifts / insert / read / update
--   Allow public delete reservations / insert / read / update
--   Allow public delete schedule_publications / insert / read / update
--
-- Policies left in place:
--   shifts_* using is_workspace_member / can_manage_workspace_stock
--   reservations_* using is_workspace_member / can_manage_workspace_reservations
--   schedule_publications_* using has_any_workspace_membership /
--     can_manage_any_workspace_schedule
--
-- Verify: supabase/close_public_policies_phase_a_verify.sql
-- Rollback: supabase/close_public_policies_phase_a_rollback.sql
-- =============================================================================

begin;

do $close_public_policies_phase_a$
declare
  v_row record;
begin
  for v_row in
    select *
    from (values
      ('shifts', 'Allow public delete shifts'),
      ('shifts', 'Allow public insert shifts'),
      ('shifts', 'Allow public read shifts'),
      ('shifts', 'Allow public update shifts'),
      ('reservations', 'Allow public delete reservations'),
      ('reservations', 'Allow public insert reservations'),
      ('reservations', 'Allow public read reservations'),
      ('reservations', 'Allow public update reservations'),
      ('schedule_publications', 'Allow public delete schedule_publications'),
      ('schedule_publications', 'Allow public insert schedule_publications'),
      ('schedule_publications', 'Allow public read schedule_publications'),
      ('schedule_publications', 'Allow public update schedule_publications')
    ) as listed(table_name, policy_name)
  loop
    if to_regclass('public.' || v_row.table_name) is null then
      raise exception 'phase a: public.% is missing', v_row.table_name;
    end if;

    if exists (
      select 1
      from pg_policy pol
      where pol.polrelid = ('public.' || v_row.table_name)::regclass
        and pol.polname = v_row.policy_name
    ) then
      execute format('drop policy %I on public.%I', v_row.policy_name, v_row.table_name);
      raise notice 'phase a: dropped policy "%" on %', v_row.policy_name, v_row.table_name;
    else
      raise notice 'phase a: policy "%" on % already absent', v_row.policy_name, v_row.table_name;
    end if;
  end loop;
end
$close_public_policies_phase_a$;

commit;

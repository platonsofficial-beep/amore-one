-- Run with explicit owner approval
-- =============================================================================
-- employee_availability rollback (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Production does not have public.employee_availability. This drops the table
-- created by supabase/employee_availability.sql, including its rows, policies,
-- trigger, and the updated_at function. It does not touch workspaces,
-- employees, workspace_members, or the existing helper functions.
-- =============================================================================

begin;

drop trigger if exists employee_availability_set_updated_at on public.employee_availability;
drop table if exists public.employee_availability;
drop function if exists public.set_employee_availability_updated_at();

commit;

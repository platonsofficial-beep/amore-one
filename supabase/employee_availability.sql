-- Run with explicit owner approval
-- =============================================================================
-- employee_availability (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor. Do NOT auto-run from the app.
-- Idempotent. One transaction.
--
-- Creates public.employee_availability for the staff availability week the app
-- already reads and writes. Production does not have this table yet (PostgREST
-- 404 / PGRST205). The client treats a missing table as "not submitted" on
-- read and shows a setup hint on save until this file is applied.
--
-- Prerequisites already in production:
--   public.workspaces, public.employees, public.workspace_members
--   public.is_workspace_member(uuid)
--   public.can_manage_workspace_stock(uuid)
--     owner / general_manager / manager of that workspace.
--     Fits this table because every row has workspace_id.
--     can_manage_any_workspace_schedule is the helper for tables that do
--     not have workspace_id, so it is not used here.
--
-- Columns match availabilityService AVAILABILITY_SELECT and the upsert key
-- workspace_id, employee_id, week_start_date, day_of_week.
--
-- RLS, authenticated only. No anon or public policies. No USING (true).
--   SELECT  any workspace member (including host) sees every row in the workspace
--   INSERT  a member may insert only the row whose employee_id is their own
--           workspace_members.employee_id for auth.uid()
--           a manager may insert any row in a workspace they manage
--   UPDATE  same split: own row, or any row for a manager
--           WITH CHECK keeps a staff member from moving workspace_id or employee_id
--   DELETE  a member may delete only their own rows; a manager may delete any
--           row in a workspace they manage
-- =============================================================================

begin;

create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start_date date not null,
  day_of_week text not null,
  status text not null,
  start_time time null,
  end_time time null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_availability_status_check check (
    status in ('AVAILABLE', 'UNAVAILABLE', 'PREFERRED')
  ),
  constraint employee_availability_day_of_week_check check (
    day_of_week in (
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    )
  ),
  constraint employee_availability_unique_employee_day unique (
    workspace_id,
    employee_id,
    week_start_date,
    day_of_week
  )
);

create index if not exists employee_availability_workspace_idx
  on public.employee_availability (workspace_id);

create index if not exists employee_availability_employee_idx
  on public.employee_availability (employee_id);

create index if not exists employee_availability_week_start_idx
  on public.employee_availability (week_start_date);

create index if not exists employee_availability_status_idx
  on public.employee_availability (status);

create or replace function public.set_employee_availability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employee_availability_set_updated_at on public.employee_availability;

create trigger employee_availability_set_updated_at
  before update on public.employee_availability
  for each row
  execute function public.set_employee_availability_updated_at();

revoke all on function public.set_employee_availability_updated_at() from public;
revoke all on function public.set_employee_availability_updated_at() from anon;
grant execute on function public.set_employee_availability_updated_at() to authenticated;

revoke all on table public.employee_availability from public;
revoke all on table public.employee_availability from anon;
grant select, insert, update, delete on table public.employee_availability to authenticated;

alter table public.employee_availability enable row level security;

drop policy if exists employee_availability_select_members on public.employee_availability;
create policy employee_availability_select_members
  on public.employee_availability
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists employee_availability_insert_managers on public.employee_availability;
create policy employee_availability_insert_managers
  on public.employee_availability
  for insert
  to authenticated
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employee_availability_insert_self on public.employee_availability;
create policy employee_availability_insert_self
  on public.employee_availability
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and employee_id = (
      select wm.employee_id
      from public.workspace_members wm
      where wm.workspace_id = employee_availability.workspace_id
        and wm.auth_user_id = auth.uid()
        and wm.employee_id is not null
      limit 1
    )
  );

drop policy if exists employee_availability_update_managers on public.employee_availability;
create policy employee_availability_update_managers
  on public.employee_availability
  for update
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id))
  with check (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employee_availability_update_self on public.employee_availability;
create policy employee_availability_update_self
  on public.employee_availability
  for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and employee_id = (
      select wm.employee_id
      from public.workspace_members wm
      where wm.workspace_id = employee_availability.workspace_id
        and wm.auth_user_id = auth.uid()
        and wm.employee_id is not null
      limit 1
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and employee_id = (
      select wm.employee_id
      from public.workspace_members wm
      where wm.workspace_id = employee_availability.workspace_id
        and wm.auth_user_id = auth.uid()
        and wm.employee_id is not null
      limit 1
    )
  );

drop policy if exists employee_availability_delete_managers on public.employee_availability;
create policy employee_availability_delete_managers
  on public.employee_availability
  for delete
  to authenticated
  using (public.can_manage_workspace_stock(workspace_id));

drop policy if exists employee_availability_delete_self on public.employee_availability;
create policy employee_availability_delete_self
  on public.employee_availability
  for delete
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and employee_id = (
      select wm.employee_id
      from public.workspace_members wm
      where wm.workspace_id = employee_availability.workspace_id
        and wm.auth_user_id = auth.uid()
        and wm.employee_id is not null
      limit 1
    )
  );

commit;

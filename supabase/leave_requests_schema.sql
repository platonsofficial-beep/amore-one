-- Workspace-scoped leave / time off requests for the Team module.
-- Prerequisite: public.workspaces, public.employees, public.workspace_members.
-- Run before leave_requests_rls_policies.sql.

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null,
  status text not null default 'pending',
  start_date date not null,
  end_date date not null,
  note text not null default '',
  created_by uuid null references public.workspace_members(id) on delete set null,
  decided_by uuid null references public.workspace_members(id) on delete set null,
  decided_at timestamptz null,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'cancelled')
  ),
  constraint leave_requests_leave_type_check check (
    leave_type in (
      'vacation',
      'sick',
      'personal',
      'unpaid',
      'training',
      'emergency',
      'bereavement',
      'other'
    )
  ),
  constraint leave_requests_date_range_check check (end_date >= start_date),
  constraint leave_requests_pending_decision_check check (
    status <> 'pending'
    or (
      decided_by is null
      and decided_at is null
      and decision_note = ''
    )
  ),
  constraint leave_requests_decided_metadata_check check (
    status not in ('approved', 'rejected')
    or (
      decided_by is not null
      and decided_at is not null
    )
  )
);

create index if not exists leave_requests_workspace_idx
  on public.leave_requests (workspace_id);

create index if not exists leave_requests_employee_idx
  on public.leave_requests (employee_id);

create index if not exists leave_requests_status_idx
  on public.leave_requests (status);

create index if not exists leave_requests_workspace_start_date_idx
  on public.leave_requests (workspace_id, start_date);

create index if not exists leave_requests_workspace_end_date_idx
  on public.leave_requests (workspace_id, end_date);

create or replace function public.set_leave_requests_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leave_requests_set_updated_at on public.leave_requests;

create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row
  execute function public.set_leave_requests_updated_at();

create or replace function public.validate_leave_requests_workspace_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_employee_workspace_id uuid;
  v_created_by_workspace_id uuid;
  v_decided_by_workspace_id uuid;
begin
  select e.workspace_id
  into v_employee_workspace_id
  from public.employees e
  where e.id = new.employee_id;

  if v_employee_workspace_id is null then
    raise exception 'leave_requests_employee_not_found';
  end if;

  if v_employee_workspace_id <> new.workspace_id then
    raise exception 'leave_requests_employee_workspace_mismatch';
  end if;

  if new.created_by is not null then
    select wm.workspace_id
    into v_created_by_workspace_id
    from public.workspace_members wm
    where wm.id = new.created_by;

    if v_created_by_workspace_id is null then
      raise exception 'leave_requests_created_by_not_found';
    end if;

    if v_created_by_workspace_id <> new.workspace_id then
      raise exception 'leave_requests_created_by_workspace_mismatch';
    end if;
  end if;

  if new.decided_by is not null then
    select wm.workspace_id
    into v_decided_by_workspace_id
    from public.workspace_members wm
    where wm.id = new.decided_by;

    if v_decided_by_workspace_id is null then
      raise exception 'leave_requests_decided_by_not_found';
    end if;

    if v_decided_by_workspace_id <> new.workspace_id then
      raise exception 'leave_requests_decided_by_workspace_mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists leave_requests_validate_workspace_integrity on public.leave_requests;

create trigger leave_requests_validate_workspace_integrity
  before insert or update on public.leave_requests
  for each row
  execute function public.validate_leave_requests_workspace_integrity();

create or replace function public.preserve_leave_requests_creation_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'leave_requests_id_immutable';
  end if;

  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'leave_requests_workspace_id_immutable';
  end if;

  if new.employee_id is distinct from old.employee_id then
    raise exception 'leave_requests_employee_id_immutable';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'leave_requests_created_by_immutable';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'leave_requests_created_at_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists leave_requests_preserve_creation_metadata on public.leave_requests;

create trigger leave_requests_preserve_creation_metadata
  before update on public.leave_requests
  for each row
  execute function public.preserve_leave_requests_creation_metadata();

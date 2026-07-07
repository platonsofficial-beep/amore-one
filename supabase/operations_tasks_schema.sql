-- Workspace-scoped operational tasks for the Operations dashboard.
-- Prerequisite: public.workspaces, public.employees, auth.users.
-- Run before operations_logs_schema.sql and operations_rls_policies.sql.

create table if not exists public.operations_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'other',
  priority text not null default 'normal',
  status text not null default 'pending',
  assigned_to uuid null references public.employees(id) on delete set null,
  due_date date null,
  due_time time null,
  completion_note text not null default '',
  repeat_rule text not null default '',
  completed_at timestamptz null,
  completed_by uuid null references auth.users(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_tasks_category_check check (
    category in (
      'opening',
      'closing',
      'cleaning',
      'maintenance',
      'service',
      'bar',
      'kitchen',
      'other'
    )
  ),
  constraint operations_tasks_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint operations_tasks_status_check check (
    status in ('pending', 'completed', 'skipped')
  )
);

create index if not exists operations_tasks_workspace_idx
  on public.operations_tasks (workspace_id);

create index if not exists operations_tasks_due_date_idx
  on public.operations_tasks (workspace_id, due_date);

create index if not exists operations_tasks_status_idx
  on public.operations_tasks (workspace_id, status);

create index if not exists operations_tasks_assigned_to_idx
  on public.operations_tasks (assigned_to);

create or replace function public.set_operations_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists operations_tasks_set_updated_at on public.operations_tasks;

create trigger operations_tasks_set_updated_at
  before update on public.operations_tasks
  for each row
  execute function public.set_operations_tasks_updated_at();

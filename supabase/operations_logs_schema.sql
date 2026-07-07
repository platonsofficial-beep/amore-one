-- Shift logbook entries for manager handovers, incidents, and notes.
-- Prerequisite: public.workspaces, auth.users.
-- Run before operations_rls_policies.sql.

create table if not exists public.operations_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null default '',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operations_logs_type_check check (
    type in ('handover', 'incident', 'note')
  )
);

create index if not exists operations_logs_workspace_idx
  on public.operations_logs (workspace_id);

create index if not exists operations_logs_created_at_idx
  on public.operations_logs (workspace_id, created_at desc);

create index if not exists operations_logs_type_idx
  on public.operations_logs (workspace_id, type);

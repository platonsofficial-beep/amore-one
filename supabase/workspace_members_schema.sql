-- Workspace membership linking Supabase Auth users to ONE workspaces.
-- Prerequisite: public.workspaces and public.employees should exist.
-- Run in Supabase SQL editor if this table does not already exist.
-- After creating the table, run workspace_members_rls_policies.sql.

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid null references public.employees(id) on delete set null,
  display_name text not null default '',
  email text not null default '',
  role text not null default 'staff',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz null,
  constraint workspace_members_role_check check (
    role in ('owner', 'general_manager', 'manager', 'staff')
  ),
  constraint workspace_members_workspace_auth_user_unique unique (workspace_id, auth_user_id)
);

create index if not exists workspace_members_workspace_idx
  on public.workspace_members (workspace_id);

create index if not exists workspace_members_auth_user_idx
  on public.workspace_members (auth_user_id);

create index if not exists workspace_members_employee_idx
  on public.workspace_members (employee_id);

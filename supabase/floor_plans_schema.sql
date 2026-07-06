-- Workspace-scoped floor plan layouts for ONE Reservations.
-- Prerequisite: public.workspaces exists.
-- Run in the Supabase SQL editor, then floor_plans_rls_policies.sql.

create table if not exists public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Main Floor Plan',
  layout_json jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists floor_plans_workspace_idx
  on public.floor_plans (workspace_id);

create unique index if not exists floor_plans_one_active_per_workspace
  on public.floor_plans (workspace_id)
  where is_active = true;

create or replace function public.set_floor_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists floor_plans_set_updated_at on public.floor_plans;

create trigger floor_plans_set_updated_at
  before update on public.floor_plans
  for each row
  execute function public.set_floor_plans_updated_at();

-- Reusable checklist templates for daily operational task generation.
-- Prerequisite: public.workspaces, auth.users.
-- Run before operations_checklist_items_schema.sql.

create table if not exists public.operations_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  department text not null default 'service',
  active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_checklist_templates_department_check check (
    department in ('bar', 'service', 'kitchen', 'management')
  )
);

create index if not exists operations_checklist_templates_workspace_idx
  on public.operations_checklist_templates (workspace_id);

create index if not exists operations_checklist_templates_active_idx
  on public.operations_checklist_templates (workspace_id, active);

create or replace function public.set_operations_checklist_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists operations_checklist_templates_set_updated_at on public.operations_checklist_templates;

create trigger operations_checklist_templates_set_updated_at
  before update on public.operations_checklist_templates
  for each row
  execute function public.set_operations_checklist_templates_updated_at();

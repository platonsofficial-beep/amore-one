-- Run with explicit owner approval
-- =============================================================================
-- One task per checklist run, with steps (SQL NOT APPLIED)
-- =============================================================================
-- SQL NOT APPLIED. Review only. Do not run until the owner explicitly approves.
-- Run manually in the Supabase SQL editor.
--
-- Copies existing checklist-generated operations_tasks into a parent run and
-- step rows. Does not update or delete operations_tasks, templates, items,
-- board tasks, or task_checklist_items.
--
-- A run is one (workspace, template, due date). Steps point back at the
-- source operations_tasks row so completion history stays where it is.
-- Re-running this script does not duplicate runs or steps.
-- =============================================================================

begin;

create table if not exists public.operations_checklist_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null references public.operations_checklist_templates(id) on delete cascade,
  due_date date not null,
  title text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_checklist_runs_status_check check (
    status in ('pending', 'completed')
  ),
  constraint operations_checklist_runs_identity unique (workspace_id, template_id, due_date)
);

create index if not exists operations_checklist_runs_workspace_due_idx
  on public.operations_checklist_runs (workspace_id, due_date);

create table if not exists public.operations_checklist_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.operations_checklist_runs(id) on delete cascade,
  source_task_id uuid not null references public.operations_tasks(id) on delete cascade,
  checklist_item_id uuid null references public.operations_checklist_items(id) on delete set null,
  title text not null,
  description text not null default '',
  order_index integer not null default 0,
  status text not null,
  assigned_to uuid null references public.employees(id) on delete set null,
  completion_note text not null default '',
  completed_at timestamptz null,
  completed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operations_checklist_run_steps_source_unique unique (source_task_id)
);

create index if not exists operations_checklist_run_steps_run_idx
  on public.operations_checklist_run_steps (run_id, order_index);

-- The app does not read these tables yet. Lock them until that follow-up
-- adds the same workspace policies as operations_tasks.
alter table public.operations_checklist_runs enable row level security;
alter table public.operations_checklist_run_steps enable row level security;
revoke all on table public.operations_checklist_runs from public, anon, authenticated;
revoke all on table public.operations_checklist_run_steps from public, anon, authenticated;

insert into public.operations_checklist_runs (
  workspace_id,
  template_id,
  due_date,
  title,
  status
)
select
  grouped.workspace_id,
  grouped.template_id,
  grouped.due_date,
  grouped.title,
  grouped.status
from (
  select
    ot.workspace_id,
    ot.checklist_template_id as template_id,
    ot.due_date,
    coalesce(nullif(trim(tpl.name), ''), 'Checklist') as title,
    case
      when bool_and(ot.status in ('completed', 'skipped'))
        and bool_or(ot.status = 'completed') then 'completed'
      else 'pending'
    end as status
  from public.operations_tasks ot
  left join public.operations_checklist_templates tpl
    on tpl.id = ot.checklist_template_id
  where ot.checklist_template_id is not null
    and ot.due_date is not null
  group by ot.workspace_id, ot.checklist_template_id, ot.due_date, tpl.name
) grouped
where not exists (
  select 1
  from public.operations_checklist_runs existing
  where existing.workspace_id = grouped.workspace_id
    and existing.template_id = grouped.template_id
    and existing.due_date = grouped.due_date
);

insert into public.operations_checklist_run_steps (
  run_id,
  source_task_id,
  checklist_item_id,
  title,
  description,
  order_index,
  status,
  assigned_to,
  completion_note,
  completed_at,
  completed_by
)
select
  run.id,
  ot.id,
  ot.checklist_item_id,
  ot.title,
  coalesce(ot.description, ''),
  coalesce(ot.checklist_order_index, 0),
  ot.status,
  ot.assigned_to,
  coalesce(ot.completion_note, ''),
  ot.completed_at,
  ot.completed_by
from public.operations_tasks ot
join public.operations_checklist_runs run
  on run.workspace_id = ot.workspace_id
 and run.template_id = ot.checklist_template_id
 and run.due_date = ot.due_date
where ot.checklist_template_id is not null
  and ot.due_date is not null
  and not exists (
    select 1
    from public.operations_checklist_run_steps step
    where step.source_task_id = ot.id
  );

commit;

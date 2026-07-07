-- Link generated operational tasks back to checklist templates and items.
-- Prerequisite: operations_tasks_schema.sql, operations_checklist_items_schema.sql.

alter table public.operations_tasks
  add column if not exists checklist_template_id uuid null
    references public.operations_checklist_templates(id) on delete set null;

alter table public.operations_tasks
  add column if not exists checklist_item_id uuid null
    references public.operations_checklist_items(id) on delete set null;

alter table public.operations_tasks
  add column if not exists checklist_order_index integer null;

create index if not exists operations_tasks_checklist_template_idx
  on public.operations_tasks (workspace_id, checklist_template_id, due_date);

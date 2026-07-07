-- Checklist line items belonging to an operations checklist template.
-- Prerequisite: operations_checklist_templates_schema.sql.

create table if not exists public.operations_checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.operations_checklist_templates(id) on delete cascade,
  title text not null,
  description text not null default '',
  order_index integer not null default 0,
  required boolean not null default true,
  estimated_minutes integer null,
  constraint operations_checklist_items_estimated_minutes_check check (
    estimated_minutes is null or estimated_minutes >= 0
  )
);

create index if not exists operations_checklist_items_template_idx
  on public.operations_checklist_items (template_id, order_index);

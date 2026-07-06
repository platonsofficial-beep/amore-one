-- Shift template defaults for Schedule staffing.
-- Run manually in Supabase SQL editor.

alter table public.shift_templates
  add column if not exists default_required_count integer not null default 1
  check (default_required_count >= 0 and default_required_count <= 99);

alter table public.shift_templates
  add column if not exists is_active boolean not null default true;

create index if not exists shift_templates_is_active_idx
  on public.shift_templates (is_active);

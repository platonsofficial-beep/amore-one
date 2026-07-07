-- Workspace announcements for staff communication.
-- Prerequisite: public.workspaces, auth.users.
-- Run before operations_announcement_reads_schema.sql.

create table if not exists public.operations_announcements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  message text not null default '',
  priority text not null default 'normal',
  audience text not null default 'all',
  active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_announcements_priority_check check (
    priority in ('normal', 'important', 'urgent')
  ),
  constraint operations_announcements_audience_check check (
    audience in ('all', 'bar', 'service', 'kitchen', 'managers')
  )
);

create index if not exists operations_announcements_workspace_idx
  on public.operations_announcements (workspace_id);

create index if not exists operations_announcements_active_idx
  on public.operations_announcements (workspace_id, active);

create index if not exists operations_announcements_schedule_idx
  on public.operations_announcements (workspace_id, starts_at, ends_at);

create or replace function public.set_operations_announcements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists operations_announcements_set_updated_at on public.operations_announcements;

create trigger operations_announcements_set_updated_at
  before update on public.operations_announcements
  for each row
  execute function public.set_operations_announcements_updated_at();

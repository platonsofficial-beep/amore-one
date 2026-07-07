-- Per-user read tracking for operations announcements.
-- Prerequisite: operations_announcements_schema.sql.

create table if not exists public.operations_announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.operations_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  constraint operations_announcement_reads_unique unique (announcement_id, user_id)
);

create index if not exists operations_announcement_reads_announcement_idx
  on public.operations_announcement_reads (announcement_id);

create index if not exists operations_announcement_reads_user_idx
  on public.operations_announcement_reads (user_id);

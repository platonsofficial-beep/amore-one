-- RLS policies for published_shifts (authenticated users, own snapshots only).
-- Prerequisite: public.published_shifts and public.schedule_publications exist.
-- Run in the Supabase SQL editor after published_shifts_schema.sql.
--
-- Ownership model:
--   published_shifts.publication_id -> schedule_publications.id
--   schedule_publications.published_by stores auth.uid() as text
--
-- The trigger below stamps published_by on publication upsert so publish works
-- without application code changes.

create or replace function public.set_schedule_publication_published_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.published_by := auth.uid()::text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_schedule_publications_set_published_by on public.schedule_publications;

create trigger trg_schedule_publications_set_published_by
  before insert or update on public.schedule_publications
  for each row
  execute function public.set_schedule_publication_published_by();

create or replace function public.is_own_schedule_publication(target_publication_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_publications sp
    where sp.id = target_publication_id
      and sp.published_by = auth.uid()::text
  );
$$;

revoke all on function public.is_own_schedule_publication(uuid) from public;
grant execute on function public.is_own_schedule_publication(uuid) to authenticated;

alter table public.published_shifts enable row level security;

drop policy if exists published_shifts_select_own on public.published_shifts;
create policy published_shifts_select_own
  on public.published_shifts
  for select
  to authenticated
  using (public.is_own_schedule_publication(publication_id));

drop policy if exists published_shifts_insert_own on public.published_shifts;
create policy published_shifts_insert_own
  on public.published_shifts
  for insert
  to authenticated
  with check (public.is_own_schedule_publication(publication_id));

drop policy if exists published_shifts_update_own on public.published_shifts;
create policy published_shifts_update_own
  on public.published_shifts
  for update
  to authenticated
  using (public.is_own_schedule_publication(publication_id))
  with check (public.is_own_schedule_publication(publication_id));

drop policy if exists published_shifts_delete_own on public.published_shifts;
create policy published_shifts_delete_own
  on public.published_shifts
  for delete
  to authenticated
  using (public.is_own_schedule_publication(publication_id));

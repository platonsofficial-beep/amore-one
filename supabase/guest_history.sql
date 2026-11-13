-- Guest history notes and blacklist. NOT APPLIED.
-- Platon approves this file before anyone runs it. Do not apply it to the live project.
-- History counts (visits, no-shows, cancellations) stay on existing reservations.
-- This table stores the venue's notes and blacklist, keyed by phone in E.164.
-- Hosts may edit notes. Only owner, general manager, and manager may blacklist.

create table if not exists public.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone_e164 text not null,
  display_name text not null default '',
  notes text not null default '',
  blacklisted boolean not null default false,
  blacklist_reason text not null default '',
  updated_at timestamptz not null default now(),
  unique (workspace_id, phone_e164)
);

create index if not exists guest_profiles_workspace_idx
  on public.guest_profiles (workspace_id);

create or replace function public.can_view_guest_history(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and auth_user_id = auth.uid()
      and role in ('owner', 'general_manager', 'manager', 'host')
  );
$$;

create or replace function public.can_blacklist_guest(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and auth_user_id = auth.uid()
      and role in ('owner', 'general_manager', 'manager')
  );
$$;

create or replace function public.guard_guest_blacklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if tg_op = 'UPDATE' then
    if new.blacklisted is distinct from old.blacklisted
       or new.blacklist_reason is distinct from old.blacklist_reason then
      if not public.can_blacklist_guest(new.workspace_id) then
        raise exception 'guest_blacklist_forbidden' using errcode = '42501';
      end if;
    end if;
  elsif new.blacklisted or coalesce(new.blacklist_reason, '') <> '' then
    if not public.can_blacklist_guest(new.workspace_id) then
      raise exception 'guest_blacklist_forbidden' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$guard$;

drop trigger if exists guest_profiles_blacklist_guard on public.guest_profiles;
create trigger guest_profiles_blacklist_guard
  before insert or update on public.guest_profiles
  for each row execute function public.guard_guest_blacklist();

alter table public.guest_profiles enable row level security;
revoke all on public.guest_profiles from public, anon;
grant select, insert, update, delete on public.guest_profiles to authenticated;

drop policy if exists guest_profiles_select on public.guest_profiles;
create policy guest_profiles_select
  on public.guest_profiles
  for select
  to authenticated
  using (public.can_view_guest_history(workspace_id));

drop policy if exists guest_profiles_insert on public.guest_profiles;
create policy guest_profiles_insert
  on public.guest_profiles
  for insert
  to authenticated
  with check (public.can_view_guest_history(workspace_id));

drop policy if exists guest_profiles_update on public.guest_profiles;
create policy guest_profiles_update
  on public.guest_profiles
  for update
  to authenticated
  using (public.can_view_guest_history(workspace_id))
  with check (public.can_view_guest_history(workspace_id));

drop policy if exists guest_profiles_delete on public.guest_profiles;
create policy guest_profiles_delete
  on public.guest_profiles
  for delete
  to authenticated
  using (public.can_blacklist_guest(workspace_id));

revoke all on function public.can_view_guest_history(uuid) from public, anon;
revoke all on function public.can_blacklist_guest(uuid) from public, anon;
grant execute on function public.can_view_guest_history(uuid) to authenticated;
grant execute on function public.can_blacklist_guest(uuid) to authenticated;

-- Singleton workspace profile for the current ONE workspace.
-- Run in Supabase SQL editor if this table does not already exist.
-- Existing databases that predate venue location fields must also run
-- workspace_profiles_venue_location.sql (idempotent ALTER).

create table if not exists public.workspace_profiles (
  id bigint generated always as identity primary key,
  workspace_key text not null default 'default',
  business_name text not null default '',
  manager_name text not null default '',
  manager_role text not null default '',
  timezone text not null default '',
  currency text not null default '',
  logo_url text not null default '',
  country_code text not null default '',
  country_name text not null default '',
  city text not null default '',
  default_phone_country_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_profiles_workspace_key_unique
  on public.workspace_profiles (workspace_key);

create or replace function public.set_workspace_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_profiles_set_updated_at on public.workspace_profiles;

create trigger workspace_profiles_set_updated_at
  before update on public.workspace_profiles
  for each row
  execute function public.set_workspace_profiles_updated_at();
